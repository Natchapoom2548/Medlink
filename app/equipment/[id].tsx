import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import * as ImagePicker from 'expo-image-picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { File } from 'expo-file-system';
import { Button, Card, C, FileImage, Page, Row, Sub, T } from '../../src/components/ui';
import { useApp } from '../../src/state/AppProvider';
import { client } from '../../src/lib/supabase';
import { uploadFile, shareFile, printReport } from '../../src/lib/files';
import { thaiDate } from '../../src/domain/utils';
import { actionLabels, statusLabels } from '../../src/domain/models';
export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, profile, refresh, mutate } = useApp();
  const eq = data.equipment.find((e) => e.id === id);
  const qrRef = useRef<View>(null);
  const [showQr, setShowQr] = useState(false),
    [showLocation, setShowLocation] = useState(false);
  if (!eq || !profile) return <Page title="ไม่พบเครื่องมือ" back />;
  const favorite = data.favorites.some((f) => f.equipment_id === id),
    loan = data.loans.find(
      (l) => l.equipment_id === id && ['pending', 'approved'].includes(l.status),
    ),
    pm = data.pm_tasks.filter((t) => t.equipment_id === id),
    openPm = pm.find((t) => t.status !== 'completed'),
    issueReport =
      loan &&
      (loan.issue_reported_at ||
        data.activities.find(
          (a) =>
            a.equipment_id === id &&
            a.action === 'report_equipment' &&
            a.created_at >= loan.created_at,
        ));
  const go = (kind: string) => router.push({ pathname: '/workflow', params: { kind, id } });
  return (
    <Page title={eq.code} back>
      <View style={detailStyles.hero}>
        <FileImage path={eq.image_path} height={184} />
        <View style={detailStyles.heroCaption}>
          <Ionicons name="medical-outline" size={14} color={C.green} />
          <T style={detailStyles.heroCaptionText}>
            {eq.brand || 'MedLink'}
            {eq.model ? ` • ${eq.model}` : ''}
          </T>
        </View>
      </View>
      <View style={detailStyles.titleBlock}>
        <View style={detailStyles.titleRow}>
          <T style={detailStyles.equipmentTitle}>{eq.name_th || eq.name}</T>
          <View
            style={[
              detailStyles.statusBadge,
              {
                backgroundColor:
                  eq.status === 'ready'
                    ? C.green
                    : eq.status === 'borrowed'
                      ? '#9A6500'
                      : eq.status === 'pending_borrow'
                        ? '#7E22CE'
                        : C.red,
              },
            ]}
          >
            <T style={detailStyles.statusText}>{statusLabels[eq.status]}</T>
          </View>
        </View>
        <T style={detailStyles.subtitle}>
          {eq.name} • {eq.category}
        </T>
      </View>
      <Card style={detailStyles.infoCard}>
        <View style={detailStyles.infoHead}>
          <Ionicons name="clipboard-outline" size={17} color={C.green} />
          <T style={detailStyles.infoTitle}>ข้อมูลเครื่องมือ</T>
        </View>
        <View style={detailStyles.infoGrid}>
          <View style={detailStyles.infoItem}>
            <Sub>รหัสเครื่องมือ</Sub>
            <T style={detailStyles.infoValue}>{eq.code}</T>
          </View>
          <View style={detailStyles.infoItem}>
            <Sub>Serial Number</Sub>
            <T style={detailStyles.infoValue}>{eq.serial_number || '—'}</T>
          </View>
          <View style={detailStyles.infoItem}>
            <Sub>ยี่ห้อ / รุ่น</Sub>
            <T style={detailStyles.infoValue}>
              {[eq.brand, eq.model].filter(Boolean).join(' ') || '—'}
            </T>
          </View>
          <View style={detailStyles.infoItem}>
            <Sub>ตำแหน่ง</Sub>
            <T style={detailStyles.infoValue}>{eq.location || eq.department || '—'}</T>
          </View>
          <View style={detailStyles.infoItem}>
            <Sub>PM ล่าสุด</Sub>
            <T style={detailStyles.infoValue}>{thaiDate(eq.last_pm_date)}</T>
          </View>
          <View style={detailStyles.infoItem}>
            <Sub>กำหนด PM</Sub>
            <T style={detailStyles.infoValue}>{thaiDate(eq.due_date)}</T>
          </View>
        </View>
        {!!eq.notes && (
          <View style={detailStyles.note}>
            <T style={detailStyles.noteText}>{eq.notes}</T>
          </View>
        )}
      </Card>
      <Row>
        <Button
          secondary
          title={favorite ? '★ นำออกจากรายการโปรด' : '☆ เพิ่มรายการโปรด'}
          onPress={async () => {
            const q = client().from('favorites');
            const { error } = favorite
              ? await q.delete().eq('user_id', profile.id).eq('equipment_id', id)
              : await q.insert({ user_id: profile.id, equipment_id: id });
            if (error) throw error;
            await refresh();
          }}
        />
        <Button secondary title="QR เครื่องมือ" onPress={() => setShowQr((v) => !v)} />
        <Button secondary title="ที่ตั้งเครื่องมือ" onPress={() => setShowLocation((v) => !v)} />
      </Row>
      {showLocation && (
        <Card>
          <T>
            {eq.building || 'อาคารไม่ได้ระบุ'} • ชั้น {eq.floor || '—'}
          </T>
          <Sub>
            {eq.department} • {eq.bay || eq.location}
          </Sub>
          <Sub>ตำแหน่งตามข้อมูลที่ฝ่าย BME บันทึก</Sub>
        </Card>
      )}
      {showQr && (
        <Card>
          <View
            ref={qrRef}
            collapsable={false}
            style={{ backgroundColor: '#fff', padding: 24, alignItems: 'center', gap: 15 }}
          >
            <T>MedLink • Biomedical Asset</T>
            <QRCode value={eq.code} size={200} color="#000" backgroundColor="#fff" />
            <T>{eq.code}</T>
            <Sub>{eq.name_th || eq.name}</Sub>
          </View>
          <Button
            title="แชร์ / บันทึก QR"
            onPress={async () => {
              const uri = await captureRef(qrRef, { format: 'png', quality: 1 });
              try {
                await Sharing.shareAsync(uri, { mimeType: 'image/png' });
              } finally {
                const f = new File(uri);
                if (f.exists) f.delete();
              }
            }}
          />
        </Card>
      )}
      {profile.role === 'nurse' && eq.status === 'ready' && (
        <Button title="ส่งคำขอยืมเครื่อง" onPress={() => go('borrow')} />
      )}
      {loan && (
        <Card>
          <T>{loan.status === 'pending' ? 'รออนุมัติคำขอ' : 'อยู่ระหว่างยืม'}</T>
          <Sub>
            {data.profiles.find((p) => p.id === loan.borrower_id)?.name || 'ผู้ยืม'} •{' '}
            {loan.department} {loan.bed_room}
          </Sub>
          <Sub>
            {thaiDate(loan.borrow_date)} → {thaiDate(loan.return_date)}
          </Sub>
          <Sub>{loan.notes}</Sub>
          {loan.return_requested_at && <Sub>พยาบาลแจ้ง BME ขอคืนเครื่องแล้ว</Sub>}
        </Card>
      )}
      {profile.role === 'nurse' &&
        loan?.borrower_id === profile.id &&
        loan.status === 'approved' && (
          <Row>
            <Button
              title={loan.return_requested_at ? 'แจ้งขอคืนแล้ว' : 'แจ้ง BME ขอคืนเครื่อง'}
              disabled={!!loan.return_requested_at}
              secondary={!!loan.return_requested_at}
              onPress={() => go('request_return')}
            />
            <Button danger title="รายงานปัญหา" onPress={() => go('report')} />
          </Row>
        )}
      {profile.role === 'bme' && (
        <>
          {eq.status === 'pending_borrow' && (
            <Row>
              <Button title="อนุมัติและนำส่ง" onPress={() => go('approve')} />
              <Button danger title="ปฏิเสธ" onPress={() => go('reject')} />
            </Row>
          )}
          {eq.status === 'borrowed' && issueReport && (
            <Button
              danger
              title="สแกนรับเครื่องที่มีปัญหา"
              onPress={() =>
                router.push({ pathname: '/scanner', params: { id, purpose: 'issue-return' } })
              }
            />
          )}
          {eq.status === 'borrowed' && !issueReport && loan?.return_requested_at && (
            <Button
              title="สแกนเพื่อรับคืนเครื่อง"
              onPress={() =>
                router.push({ pathname: '/scanner', params: { id, purpose: 'return' } })
              }
            />
          )}
          {['ready', 'pm_due', 'repair'].includes(eq.status) && !openPm && (
            <Button title="มอบหมายงาน PM" onPress={() => go('dispatch')} />
          )}
          {!['borrowed', 'pending_borrow'].includes(eq.status) && !openPm && (
            <Button secondary title="เปลี่ยนสถานะ" onPress={() => go('status')} />
          )}
          <Button
            secondary
            title="เปลี่ยนภาพเครื่องมือ"
            onPress={async () => {
              const picked = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.8,
              });
              if (picked.canceled) return;
              const a = picked.assets[0];
              const f = await uploadFile(
                a.uri,
                a.fileName ?? 'equipment.jpg',
                a.mimeType ?? 'image/jpeg',
                { equipment_id: id },
              );
              await mutate('equipment_image', { equipment_id: id, attachment_id: f.id });
            }}
          />
        </>
      )}
      {profile.role === 'bme' && (
        <Card>
          <T>ใบ IPM จากฝ่ายช่าง</T>
          {data.attachments.filter((a) => a.equipment_id === id && a.name.startsWith('IPM - '))
            .length ? (
            data.attachments
              .filter((a) => a.equipment_id === id && a.name.startsWith('IPM - '))
              .map((a) => (
                <Button
                  key={`bme-ipm-${a.id}`}
                  secondary
                  title={`เปิด / แชร์: ${a.name.slice(6)}`}
                  onPress={() => shareFile(a.path, a.name)}
                />
              ))
          ) : (
            <Sub>ยังไม่มีใบ IPM ที่ช่างอัปโหลดสำหรับเครื่องนี้</Sub>
          )}
        </Card>
      )}
      {profile.role === 'technician' && (
        <>
          <Button secondary title="รายงานเครื่องขัดข้อง" onPress={() => go('report')} />
          <Button secondary title="อัปโหลดใบ IPM" onPress={() => go('ipm_upload')} />
          {!openPm && ['pm_due', 'repair'].includes(eq.status) && (
            <Card>
              <T>ยังไม่มีงาน PM ที่มอบหมาย</T>
              <Sub>BME ต้องมอบหมายงานให้ช่างก่อน จึงจะกดรับงานและส่งผล IPM ได้</Sub>
            </Card>
          )}
          {openPm &&
            openPm.assigned_to === profile.id &&
            openPm.mode === 'pickup' &&
            eq.status === 'borrowed' && (
              <Button
                title="สแกนยืนยันรับเครื่องไปซ่อม"
                onPress={() =>
                  router.push({ pathname: '/scanner', params: { id, purpose: 'repair-pickup' } })
                }
              />
            )}
          {openPm && openPm.assigned_to === profile.id && (
            <>
              {openPm.status === 'assigned' && (
                <Button
                  title="รับงาน PM"
                  onPress={() => mutate('accept_pm', { equipment_id: id, task_id: openPm.id })}
                />
              )}
              {['accepted', 'rejected'].includes(openPm.status) && (
                <Button
                  title={
                    openPm.status === 'rejected' ? 'แก้ไขและส่งผล IPM ใหม่' : 'ส่งงานพร้อมใบ IPM'
                  }
                  onPress={() =>
                    router.push({
                      pathname: '/workflow',
                      params: { kind: 'complete_pm', id, task: openPm.id },
                    })
                  }
                />
              )}
              {openPm.status === 'submitted' && (
                <Card>
                  <T>ส่งผล IPM แล้ว</T>
                  <Sub>กำลังรอ BME ตรวจสอบและอนุมัติ</Sub>
                </Card>
              )}
              {openPm.status === 'rejected' && !!openPm.review_notes && (
                <Card>
                  <T>เหตุผลที่ BME ส่งกลับ</T>
                  <Sub>{openPm.review_notes}</Sub>
                </Card>
              )}
            </>
          )}
        </>
      )}
      {pm.map((task) => (
        <Card key={task.id}>
          <T>
            PM •{' '}
            {task.status === 'assigned'
              ? 'รอช่างรับงาน'
              : task.status === 'accepted'
                ? 'ช่างรับงานแล้ว'
                : task.status === 'submitted'
                  ? 'รอ BME อนุมัติ'
                  : task.status === 'rejected'
                    ? 'ส่งกลับให้ช่างแก้ไข'
                    : task.result}
          </T>
          <Sub>
            นัดหมาย {thaiDate(task.target_date)} • {task.location}
          </Sub>
          <Sub>{task.notes}</Sub>
          {!!task.review_notes && <Sub>ความเห็น BME: {task.review_notes}</Sub>}
          {profile.role === 'bme' && task.status === 'submitted' && task.document_path && (
            <>
              <Button
                secondary
                title="เปิดใบ IPM ที่ช่างส่ง"
                onPress={() => shareFile(task.document_path!, `IPM-${eq.code}.pdf`)}
              />
              <Row>
                <Button
                  title="อนุมัติผล IPM"
                  onPress={() =>
                    router.push({
                      pathname: '/workflow',
                      params: { kind: 'approve_pm', id, task: task.id },
                    })
                  }
                />
                <Button
                  danger
                  title="ปัดตก"
                  onPress={() =>
                    router.push({
                      pathname: '/workflow',
                      params: { kind: 'reject_pm', id, task: task.id },
                    })
                  }
                />
              </Row>
            </>
          )}
          {task.status === 'completed' && (
            <Button
              secondary
              title="สร้างรายงาน IPM เป็น PDF"
              onPress={() =>
                printReport(`IPM • ${eq.code}`, [
                  ['เครื่องมือ', eq.name_th || eq.name],
                  [
                    'ผู้ตรวจ',
                    data.profiles.find((p) => p.id === task.assigned_to)?.name ?? task.assigned_to,
                  ],
                  ['วันที่ตรวจ', thaiDate(task.inspection_date)],
                  ['กำหนดครั้งต่อไป', thaiDate(task.due_date)],
                  ['ผลตรวจ', task.result],
                  ...Object.entries(task.checks ?? {}).map(
                    ([k, v]) => [k, v ? 'ผ่าน' : 'ไม่ผ่าน'] as [string, unknown],
                  ),
                  ['หมายเหตุ', task.notes],
                ])
              }
            />
          )}
        </Card>
      ))}
      {data.attachments
        .filter((a) => a.equipment_id === id)
        .map((a) => (
          <Button
            key={a.id}
            title={`เปิด / แชร์: ${a.name}`}
            secondary
            onPress={() => shareFile(a.path, a.name)}
          />
        ))}
      <View style={detailStyles.historyHeading}>
        <Ionicons name="time-outline" size={17} color={C.green} />
        <T style={detailStyles.infoTitle}>ประวัติเครื่องมือ</T>
      </View>
      {data.activities
        .filter((a) => a.equipment_id === id)
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 10)
        .map((a) => (
          <Card key={a.id} style={detailStyles.historyCard}>
            <T style={detailStyles.historyTitle}>{actionLabels[a.action] ?? a.action}</T>
            <Sub>{thaiDate(a.created_at, true)}</Sub>
            {!!a.notes && <Sub>{a.notes}</Sub>}
          </Card>
        ))}
    </Page>
  );
}
const detailStyles = StyleSheet.create({
  hero: {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    height: 214,
    padding: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    overflow: 'hidden',
  },
  heroCaption: {
    position: 'absolute',
    left: 13,
    bottom: 11,
    right: 13,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 9,
    backgroundColor: 'rgba(249,248,246,0.94)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  heroCaptionText: { fontSize: 9, color: C.muted },
  titleBlock: { gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  equipmentTitle: { flex: 1, fontSize: 21, lineHeight: 30, fontFamily: 'PromptBold' },
  statusBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { color: '#fff', fontFamily: 'PromptBold', fontSize: 8.5 },
  subtitle: { fontSize: 10, color: C.muted },
  infoCard: { gap: 10 },
  infoHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  infoTitle: { fontSize: 12, fontFamily: 'PromptBold' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  infoItem: { width: '50%', gap: 1 },
  infoValue: { fontSize: 10.5, fontFamily: 'PromptBold' },
  note: {
    padding: 9,
    borderRadius: 10,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
  },
  noteText: { fontSize: 10, color: C.muted },
  historyHeading: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 2 },
  historyCard: { paddingVertical: 11, gap: 3 },
  historyTitle: { fontSize: 11, fontFamily: 'PromptBold' },
});
