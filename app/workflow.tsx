import React, { useState } from 'react';
import { Alert, Platform } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Button, Card, Check, Choice, Field, Page, Sub, T } from '../src/components/ui';
import { DateField } from '../src/components/DateField';
import { useApp } from '../src/state/AppProvider';
import { Action, statusLabels } from '../src/domain/models';
import { addDays, errorMessage, scanMatches, todayISO } from '../src/domain/utils';
import { uploadFile } from '../src/lib/files';
const titles: Record<string, string> = {
  borrow: 'ส่งคำขอยืม',
  approve: 'อนุมัติและนำส่ง',
  reject: 'ปฏิเสธคำขอ',
  return: 'ตรวจรับคืนเครื่อง',
  request_return: 'แจ้งขอคืนเครื่อง',
  dispatch: 'มอบหมายงาน PM',
  complete_pm: 'ส่งผล IPM ให้ BME ตรวจสอบ',
  status: 'เปลี่ยนสถานะเครื่อง',
  report: 'รายงานเครื่องขัดข้อง',
  ipm_upload: 'อัปโหลดใบ IPM',
  dispatch_repair: 'มอบหมายช่างรับเครื่อง',
  confirm_pickup: 'ยืนยันรับเครื่องไปซ่อม',
  receive_issue: 'สแกนรับเครื่องที่มีปัญหา',
  approve_pm: 'อนุมัติผล IPM',
  reject_pm: 'ส่งผล IPM กลับแก้ไข',
  add: 'เพิ่มเครื่องมือ',
};
export default function Workflow() {
  const {
    kind = 'borrow',
    id,
    task: taskId,
    scanned,
  } = useLocalSearchParams<{ kind: string; id?: string; task?: string; scanned?: string }>();
  const { data, profile, mutate, refresh } = useApp();
  const eq = data.equipment.find((e) => e.id === id),
    task = data.pm_tasks.find((t) => t.id === taskId);
  const [values, setValues] = useState<Record<string, string>>({
    department: profile?.department ?? '',
    borrow_date: todayISO(),
    return_date: addDays(todayISO(), 3),
    location: kind === 'return' ? 'หน่วยเครื่องมือแพทย์กลาง (MEU ชั้น 2)' : (eq?.location ?? ''),
    target_date: todayISO(),
    inspection_date: todayISO(),
    due_date: addDays(todayISO(), 180),
    mode: 'onsite',
    priority: 'normal',
    status: 'repair',
    category: 'Monitoring',
    notes: '',
    assigned_to: '',
    name: '',
    code: '',
  });
  const [checks, setChecks] = useState<Record<string, boolean>>({}),
    [attachment, setAttachment] = useState<{ id: string; name: string } | null>(null),
    [ipmFile, setIpmFile] = useState<{
      uri: string;
      name: string;
      mimeType?: string;
      file?: Blob;
    } | null>(null),
    [ipmNotice, setIpmNotice] = useState(''),
    [saving, setSaving] = useState(false);
  const set = (key: string, value: string) => setValues((v) => ({ ...v, [key]: value }));
  const field = (key: string, label: string, multiline = false) => (
    <Field
      key={key}
      label={label}
      value={values[key] ?? ''}
      onChangeText={(v) => set(key, v)}
      multiline={multiline}
    />
  );
  const date = (key: string, label: string) => (
    <DateField key={key} label={label} value={values[key]} onChange={(v) => set(key, v)} />
  );
  const checklist = (list: [string, string][]) =>
    list.map(([key, label]) => (
      <Check
        key={key}
        label={label}
        value={!!checks[key]}
        onChange={(v) => setChecks((c) => ({ ...c, [key]: v }))}
      />
    ));
  if (!profile) return null;
  if (!titles[kind] || (!eq && kind !== 'add'))
    return (
      <Page title="ไม่พบรายการ" back>
        <Sub>กลับไปเลือกรายการเครื่องมือใหม่</Sub>
      </Page>
    );
  const bmeKinds = [
    'add',
    'approve',
    'reject',
    'return',
    'receive_issue',
    'dispatch',
    'dispatch_repair',
    'status',
    'approve_pm',
    'reject_pm',
  ];
  const allowed = bmeKinds.includes(kind)
    ? profile.role === 'bme'
    : kind === 'report'
      ? profile.role === 'nurse' || profile.role === 'technician'
      : ['borrow', 'request_return'].includes(kind)
        ? profile.role === 'nurse'
        : ['confirm_pickup', 'complete_pm', 'ipm_upload'].includes(kind)
          ? profile.role === 'technician'
          : false;
  if (!allowed) return <Page title="ไม่มีสิทธิ์ทำรายการ" back />;
  async function submit() {
    if (saving) return;
    setIpmNotice('');
    setSaving(true);
    try {
      if (kind === 'ipm_upload') {
        if (!id || !ipmFile) throw new Error('กรุณาเลือกไฟล์ใบ IPM');
        await uploadFile(
          ipmFile.uri,
          `IPM - ${ipmFile.name}`,
          ipmFile.mimeType ?? 'application/octet-stream',
          { equipment_id: id },
          ipmFile.file,
        );
        await refresh();
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert('บันทึกใบ IPM เรียบร้อยแล้ว');
          router.back();
        } else {
          Alert.alert('บันทึกสำเร็จ', 'บันทึกใบ IPM เรียบร้อยแล้ว', [
            { text: 'ตกลง', onPress: () => router.back() },
          ]);
        }
        return;
      }
      let action: Action;
      let payload: Record<string, unknown> = { equipment_id: id, ...values };
      switch (kind) {
        case 'borrow':
          action = 'request_borrow';
          if (!values.department.trim()) throw new Error('กรุณาระบุแผนก');
          break;
        case 'approve':
          action = 'approve_borrow';
          break;
        case 'reject':
          action = 'reject_borrow';
          break;
        case 'return':
          action = 'return_equipment';
          if (!eq || !scanned || !scanMatches(scanned, eq.code))
            throw new Error('ต้องสแกนเครื่องให้ตรงก่อนรับคืน');
          payload = { ...payload, scanned_code: scanned, checks };
          break;
        case 'receive_issue':
          action = 'receive_reported_equipment';
          if (!eq || !scanned || !scanMatches(scanned, eq.code))
            throw new Error('ต้องสแกนเครื่องที่ถูกรายงานให้ตรงก่อนรับเครื่อง');
          payload = { ...payload, scanned_code: scanned };
          break;
        case 'request_return':
          action = 'request_return';
          break;
        case 'dispatch':
          action = 'dispatch_pm';
          if (!values.assigned_to) throw new Error('กรุณาเลือกช่างผู้รับผิดชอบ');
          break;
        case 'dispatch_repair':
          action = 'dispatch_repair_pickup';
          if (!values.assigned_to) throw new Error('กรุณาเลือกช่างผู้รับผิดชอบ');
          break;
        case 'confirm_pickup':
          action = 'confirm_repair_pickup';
          if (!eq || !scanned || !scanMatches(scanned, eq.code))
            throw new Error('ต้องสแกน QR เครื่องให้ตรงก่อนยืนยันรับเครื่อง');
          payload = { ...payload, scanned_code: scanned };
          break;
        case 'complete_pm':
          action = 'submit_pm';
          if (!attachment) throw new Error('กรุณาแนบใบ IPM ก่อนส่งงาน');
          payload = { ...payload, task_id: taskId, checks, attachment_id: attachment?.id ?? null };
          break;
        case 'approve_pm':
          action = 'approve_pm';
          payload = { ...payload, task_id: taskId };
          break;
        case 'reject_pm':
          action = 'reject_pm';
          if (!values.notes.trim()) throw new Error('กรุณาระบุเหตุผลที่ปัดตก');
          payload = { ...payload, task_id: taskId };
          break;
        case 'status':
          action = 'set_status';
          payload = {
            ...payload,
            notes:
              values.notes.trim() ||
              `BME เปลี่ยนสถานะเป็น ${statusLabels[values.status as keyof typeof statusLabels]}`,
          };
          break;
        case 'report':
          action = 'report_equipment';
          break;
        case 'add':
          action = 'add_equipment';
          if (!/^EQ-[A-Z0-9-]+$/.test(values.code.trim().toUpperCase()) || !values.name.trim())
            throw new Error('กรอกรหัส EQ-… และชื่อเครื่อง');
          break;
        default:
          throw new Error('ไม่รองรับรายการนี้');
      }
      const result = await mutate(action, payload);
      if (kind === 'add')
        router.replace({ pathname: '/equipment/[id]', params: { id: result.id } });
      else router.back();
    } catch (error) {
      if (kind === 'ipm_upload') {
        setIpmNotice(errorMessage(error));
        return;
      }
      throw error;
    } finally {
      setSaving(false);
    }
  }
  return (
    <Page title={titles[kind]} back>
      {eq && (
        <Card>
          <T>
            {eq.code} • {eq.name_th || eq.name}
          </T>
          <Sub>สถานะปัจจุบัน: {statusLabels[eq.status]}</Sub>
        </Card>
      )}
      {kind === 'borrow' && (
        <>
          {field('department', 'แผนกปลายทาง *')}
          {field('bed_room', 'ห้อง / เตียง')}
          {date('borrow_date', 'วันยืม')}
          {date('return_date', 'กำหนดคืน')}
          <Sub>รายการจะรอ BME อนุมัติและนำส่งเครื่อง</Sub>
        </>
      )}
      {kind === 'return' && (
        <>
          {!scanned && (
            <Button
              title="สแกน QR เพื่อยืนยัน"
              onPress={() =>
                router.replace({ pathname: '/scanner', params: { id, purpose: 'return' } })
              }
            />
          )}
          <Sub>{scanned ? `สแกนแล้ว: ${scanned}` : 'ยังไม่ได้สแกนเครื่อง'}</Sub>
          {field('location', 'สถานที่รับคืน *')}
          {checklist([
            ['cleaned', 'ทำความสะอาดแล้ว'],
            ['accessories', 'อุปกรณ์และสายครบ'],
            ['battery', 'ตรวจแบตเตอรี่เรียบร้อย'],
          ])}
        </>
      )}
      {kind === 'receive_issue' && (
        <>
          <Card>
            <T>รับเครื่องจากรายงานปัญหา</T>
            <Sub>
              เมื่อยืนยันแล้ว รายการยืมจะปิดและเครื่องจะเปลี่ยนเป็น “ไม่พร้อมใช้งาน” จนกว่า BME
              จะตรวจสอบและเปลี่ยนสถานะอีกครั้ง
            </Sub>
          </Card>
          <Sub>{scanned ? `สแกนแล้ว: ${scanned}` : 'ยังไม่ได้สแกนเครื่อง'}</Sub>
          {field('location', 'สถานที่รับเครื่อง *')}
        </>
      )}
      {kind === 'request_return' && (
        <Sub>
          การทำรายการนี้จะแจ้ง BME เพื่อประสานรับคืนเท่านั้น สถานะเครื่องจะยังเป็น “กำลังยืม” จนกว่า
          BME จะตรวจรับเครื่องจริง
        </Sub>
      )}
      {kind === 'report' && (
        <>
          {field('notes', 'อาการหรือปัญหาที่พบ *', true)}
          <Sub>ระบบจะแจ้ง BME ให้ประสานงานตรวจสอบและรับเครื่อง</Sub>
        </>
      )}
      {kind === 'ipm_upload' && (
        <>
          <Card>
            <T>เอกสาร IPM ของเครื่องนี้</T>
            <Sub>
              เลือกใบ IPM เพื่อบันทึกไว้ในเอกสารประจำเครื่อง รองรับ PDF, รูปภาพ และไฟล์ Word
              ขนาดไม่เกิน 10 MB
            </Sub>
          </Card>
          <Button
            secondary
            title={ipmFile ? `ไฟล์ที่เลือก: ${ipmFile.name}` : 'เลือกไฟล์ใบ IPM'}
            onPress={async () => {
              const picked = await DocumentPicker.getDocumentAsync({
                type: [
                  'application/pdf',
                  'image/*',
                  'application/msword',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                ],
                copyToCacheDirectory: true,
              });
              if (picked.canceled) return;
              const file = picked.assets[0];
              setIpmNotice('');
              setIpmFile({
                uri: file.uri,
                name: file.name,
                mimeType: file.mimeType ?? undefined,
                file: file.file,
              });
            }}
          />
          {!!ipmNotice && (
            <Card style={{ backgroundColor: '#FCE8E8', borderColor: '#E6B7B7' }}>
              <T style={{ color: '#A62E30' }}>บันทึกไม่สำเร็จ: {ipmNotice}</T>
            </Card>
          )}
        </>
      )}
      {kind === 'confirm_pickup' && (
        <>
          <Button
            title="สแกน QR ยืนยันรับเครื่อง"
            onPress={() =>
              router.replace({ pathname: '/scanner', params: { id, purpose: 'repair-pickup' } })
            }
          />
          <Sub>
            {scanned
              ? `สแกนแล้ว: ${scanned}`
              : 'ช่างต้องสแกนเครื่องที่ได้รับมอบหมายก่อนยืนยันรับเครื่อง'}
          </Sub>
        </>
      )}
      {kind === 'dispatch' && (
        <>
          <Choice
            label="ช่างผู้รับผิดชอบ *"
            value={values.assigned_to}
            onChange={(v) => set('assigned_to', v)}
            options={data.profiles
              .filter((p) => p.active && p.role === 'technician')
              .map((p) => ({ value: p.id, label: p.name }))}
          />
          {!data.profiles.some((p) => p.active && p.role === 'technician') && (
            <Sub>ต้องสร้างบัญชีช่างก่อนมอบหมายงาน</Sub>
          )}
          <Choice
            label="รูปแบบงาน"
            value={values.mode}
            onChange={(v) => set('mode', v)}
            options={[
              { label: 'ตรวจหน้างาน', value: 'onsite' },
              { label: 'รับเครื่องไป PM', value: 'pickup' },
            ]}
          />
          <Choice
            label="ความสำคัญ"
            value={values.priority}
            onChange={(v) => set('priority', v)}
            options={[
              { label: 'ปกติ', value: 'normal' },
              { label: 'เร่งด่วน', value: 'urgent' },
            ]}
          />
          {date('target_date', 'วันนัดหมาย')}
          {field('location', 'สถานที่')}
        </>
      )}
      {kind === 'dispatch_repair' && (
        <>
          <Choice
            label="ช่างผู้รับเครื่อง *"
            value={values.assigned_to}
            onChange={(v) => set('assigned_to', v)}
            options={data.profiles
              .filter((p) => p.active && p.role === 'technician')
              .map((p) => ({ value: p.id, label: p.name }))}
          />
          {!data.profiles.some((p) => p.active && p.role === 'technician') && (
            <Sub>ต้องสร้างบัญชีช่างก่อนมอบหมายงาน</Sub>
          )}
          {date('target_date', 'วันที่นัดรับเครื่อง')}
          {field('location', 'จุดรับเครื่อง')}
          {field('notes', 'รายละเอียดสำหรับช่าง', true)}
          <Sub>
            การมอบหมายนี้ยังไม่เปลี่ยนสถานะเครื่อง ช่างต้องรับเครื่องและสแกน QR
            ก่อนระบบจึงบันทึกการคืน
          </Sub>
        </>
      )}
      {kind === 'complete_pm' && (
        <>
          <Card>
            <Sub>งานที่ได้รับ: {task?.notes || 'ตรวจตามรายการ IPM'}</Sub>
            <Sub>หากรายการตรวจไม่ผ่านครบ เครื่องจะถูกส่งซ่อม</Sub>
          </Card>
          {date('inspection_date', 'วันที่ตรวจ IPM')}
          {date('due_date', 'วันครบกำหนดครั้งต่อไป')}
          {checklist([
            ['cleaned', 'ความสะอาดผ่าน'],
            ['cables', 'สายและอุปกรณ์ครบ'],
            ['electrical', 'ความปลอดภัยทางไฟฟ้าผ่าน'],
            ['calibration', 'การสอบเทียบผ่าน'],
            ['battery', 'แบตเตอรี่ผ่าน'],
          ])}
          <Button
            secondary
            title={attachment ? `แนบแล้ว: ${attachment.name}` : 'แนบเอกสาร IPM (ไม่เกิน 10 MB)'}
            onPress={async () => {
              const picked = await DocumentPicker.getDocumentAsync({
                type: [
                  'application/pdf',
                  'image/*',
                  'application/msword',
                  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                ],
                copyToCacheDirectory: true,
              });
              if (picked.canceled) return;
              const f = picked.assets[0];
              const uploaded = await uploadFile(
                f.uri,
                f.name,
                f.mimeType ?? 'application/pdf',
                {
                  equipment_id: id,
                },
                f.file,
              );
              setAttachment({ id: uploaded.id, name: f.name });
            }}
          />
          <Sub>
            ต้องแนบใบ IPM และส่งให้ BME ตรวจสอบก่อน สถานะเครื่องจะยังเป็นรอ PM จนกว่า BME จะอนุมัติ
          </Sub>
        </>
      )}
      {kind === 'approve_pm' && (
        <Card>
          <T>ยืนยันอนุมัติผล IPM</T>
          <Sub>
            ผลตรวจ: {task?.result ?? '—'} เมื่ออนุมัติแล้ว เครื่องที่ผ่านจะเปลี่ยนเป็นพร้อมใช้งาน
            ส่วนเครื่องที่มีข้อไม่ผ่านจะอยู่ในสถานะไม่พร้อมใช้งาน
          </Sub>
        </Card>
      )}
      {kind === 'reject_pm' && (
        <Card>
          <T>ส่งผลกลับให้ช่างแก้ไข</T>
          <Sub>งานจะกลับไปยังช่างเพื่อแก้ไขรายละเอียดและแนบใบ IPM ใหม่</Sub>
        </Card>
      )}
      {kind === 'status' && (
        <Choice
          label="สถานะใหม่"
          value={values.status}
          onChange={(v) => set('status', v)}
          options={['ready', 'pm_due', 'repair', 'reject'].map((value) => ({
            value,
            label: statusLabels[value as keyof typeof statusLabels],
          }))}
        />
      )}
      {kind === 'add' && (
        <>
          {field('code', 'รหัสเครื่อง EQ-… *')}
          {field('name', 'ชื่อภาษาอังกฤษ *')}
          {field('name_th', 'ชื่อภาษาไทย')}
          <Choice
            label="หมวดหมู่"
            value={values.category}
            onChange={(v) => set('category', v)}
            options={[
              'Life Support',
              'Infusion System',
              'Monitoring',
              'Emergency & Defibrillator',
              'Surgical & OR',
              'Diagnostic',
            ].map((value) => ({ value, label: value }))}
          />
          {field('brand', 'ยี่ห้อ')}
          {field('model', 'รุ่น')}
          {field('serial_number', 'Serial number')}
          {field('department', 'แผนก')}
          {field('location', 'ตำแหน่งจัดเก็บ')}
          {field('building', 'อาคาร')}
          {field('floor', 'ชั้น')}
          {field('bay', 'ห้อง / จุดติดตั้ง')}
          {date('due_date', 'กำหนด PM')}
        </>
      )}
      {kind !== 'report' &&
        field(
          'notes',
          ['reject', 'reject_pm'].includes(kind)
            ? 'เหตุผล / รายละเอียด *'
            : kind === 'status'
              ? 'หมายเหตุ (ไม่บังคับ)'
              : 'หมายเหตุ',
          true,
        )}
      <Button
        title={
          saving
            ? 'กำลังบันทึก…'
            : kind === 'ipm_upload'
              ? 'บันทึกใบ IPM'
              : kind === 'complete_pm'
                ? 'ส่งงานให้ BME ตรวจสอบ'
                : kind === 'approve_pm'
                  ? 'อนุมัติผล IPM'
                  : kind === 'reject_pm'
                    ? 'ปัดตกและส่งกลับให้ช่าง'
                    : 'ยืนยันรายการ'
        }
        disabled={
          saving ||
          (kind === 'return' &&
            (!scanned || !checks.cleaned || !checks.accessories || !checks.battery)) ||
          (kind === 'ipm_upload' && !ipmFile) ||
          (kind === 'complete_pm' && !attachment)
        }
        onPress={submit}
      />
      <Sub>ข้อมูลจะเปลี่ยนเมื่อเซิร์ฟเวอร์บันทึกสำเร็จเท่านั้น</Sub>
    </Page>
  );
}
