import React, { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Button, Card, Empty, Field, FileImage, Page, Sub, T, C } from '../../src/components/ui';
import { useApp } from '../../src/state/AppProvider';
import { client } from '../../src/lib/supabase';
import { uploadFile } from '../../src/lib/files';
import { errorMessage, thaiDate } from '../../src/domain/utils';
export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, profile, mutate } = useApp();
  const [text, setText] = useState(''),
    [image, setImage] = useState<{ id: string; path: string } | null>(null),
    [readError, setReadError] = useState('');
  const room = data.conversations.find((c) => c.id === id);
  const messages = data.messages
    .filter((m) => m.conversation_id === id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const latest = messages.at(-1)?.id;
  useEffect(() => {
    if (!room || !profile) return;
    let alive = true;
    client()
      .from('conversation_reads')
      .upsert({ conversation_id: room.id, user_id: profile.id, read_at: new Date().toISOString() })
      .then(({ error }) => {
        if (alive) setReadError(error ? error.message : '');
      });
    return () => {
      alive = false;
    };
  }, [room?.id, profile?.id, latest]);
  if (!profile) return null;
  if (id === 'inbox' && profile.role === 'bme')
    return (
      <Page title="กล่องข้อความ BME" back>
        {data.conversations.map((c) => {
          const count = data.messages.filter((m) => m.conversation_id === c.id).length;
          return (
            <Card key={c.id}>
              <T>{c.owner_name}</T>
              <Sub>{count} ข้อความ</Sub>
              <Button
                title="เปิดแชต"
                onPress={() => router.push({ pathname: '/chat/[id]', params: { id: c.id } })}
              />
            </Card>
          );
        })}
        {!data.conversations.length && <Empty text="ยังไม่มีผู้ใช้ติดต่อฝ่าย BME" />}
      </Page>
    );
  if (!room) return <Page title="ไม่พบห้องสนทนา" back />;
  return (
    <Page title={profile.role === 'bme' ? room.owner_name : 'แชตกับฝ่าย BME'} back>
      <Sub>ข้อความถึงเจ้าหน้าที่ BME • ยังไม่รองรับการโทรเสียงหรือวิดีโอ</Sub>
      {!!readError && <Sub>อัปเดตสถานะอ่านไม่สำเร็จ: {readError}</Sub>}
      {messages.map((m) => {
        const own = m.sender_id === profile.id,
          attachment = data.attachments.find((a) => a.id === m.attachment_id),
          seen = data.conversation_reads.some(
            (r) =>
              r.conversation_id === id && r.user_id !== profile.id && r.read_at >= m.created_at,
          );
        return (
          <Card
            key={m.id}
            style={{
              backgroundColor: own ? '#E4EEE8' : C.card,
              marginLeft: own ? 24 : 0,
              marginRight: own ? 0 : 24,
            }}
          >
            <Sub>{m.sender_name}</Sub>
            {!!m.body && <T>{m.body}</T>}
            {attachment && <FileImage path={attachment.path} />}
            <Sub>
              {thaiDate(m.created_at, true)}
              {own ? (seen ? ' • อ่านแล้ว' : ' • ส่งแล้ว') : ''}
            </Sub>
          </Card>
        );
      })}
      {!messages.length && <Empty text="เริ่มสนทนาโดยพิมพ์ข้อความด้านล่าง" />}
      {image && (
        <Card>
          <FileImage path={image.path} />
          <Button secondary title="นำรูปออกจากข้อความ" onPress={() => setImage(null)} />
        </Card>
      )}
      <Field label="ข้อความ" value={text} onChangeText={setText} multiline maxLength={5000} />
      <Button
        secondary
        title="แนบรูปภาพ"
        onPress={async () => {
          const picked = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
          });
          if (picked.canceled) return;
          const a = picked.assets[0];
          setImage(
            await uploadFile(a.uri, a.fileName ?? 'chat.jpg', a.mimeType ?? 'image/jpeg', {
              conversation_id: id,
            }),
          );
        }}
      />
      <Button
        title="ส่งข้อความ"
        disabled={!text.trim() && !image}
        onPress={async () => {
          try {
            await mutate('send_message', {
              conversation_id: id,
              body: text.trim(),
              attachment_id: image?.id ?? null,
            });
            setText('');
            setImage(null);
          } catch (e) {
            throw new Error(errorMessage(e));
          }
        }}
      />
    </Page>
  );
}
