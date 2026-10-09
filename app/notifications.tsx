import React from 'react';
import { router } from 'expo-router';
import { Button, Card, Empty, Page, Sub, T } from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { client } from '../src/lib/supabase';
import { thaiDate } from '../src/domain/utils';
export default function Notifications() {
  const { data, profile, refresh } = useApp();
  return (
    <Page title="การแจ้งเตือน" back>
      <Button
        secondary
        title="อ่านทั้งหมด"
        onPress={async () => {
          const { error } = await client()
            .from('notifications')
            .update({ read_at: new Date().toISOString() })
            .eq('recipient_id', profile!.id)
            .is('read_at', null);
          if (error) throw error;
          await refresh();
        }}
      />
      {[...data.notifications]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .map((n) => (
          <Card key={n.id}>
            <T>
              {!n.read_at ? '● ' : ''}
              {n.title}
            </T>
            <Sub>{n.body}</Sub>
            <Sub>{thaiDate(n.created_at, true)}</Sub>
            <Button
              secondary
              title="เปิดรายการ"
              onPress={async () => {
                const { error } = await client()
                  .from('notifications')
                  .update({ read_at: new Date().toISOString() })
                  .eq('id', n.id);
                if (error) throw error;
                await refresh();
                if (n.conversation_id)
                  router.push({ pathname: '/chat/[id]', params: { id: n.conversation_id } });
                else if (n.equipment_id)
                  router.push({ pathname: '/equipment/[id]', params: { id: n.equipment_id } });
              }}
            />
          </Card>
        ))}
      {!data.notifications.length && <Empty text="ยังไม่มีการแจ้งเตือน" />}
      <Sub>แจ้งเตือนก่อนครบกำหนดคืนหนึ่งวันปรากฏที่หน้านี้ โดยระบบตรวจทุกวันเวลา 08:00 น.</Sub>
    </Page>
  );
}
