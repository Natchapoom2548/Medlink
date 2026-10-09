import React, { useState } from 'react';
import { Alert } from 'react-native';
import { Button, Card, Choice, Field, Page, Sub, T } from '../src/components/ui';
import { useApp } from '../src/state/AppProvider';
import { client } from '../src/lib/supabase';
import { Profile, Role, roleLabels } from '../src/domain/models';
export default function Users() {
  const { data, profile, refresh } = useApp();
  const [selected, setSelected] = useState<Profile | null>(null),
    [form, setForm] = useState(false),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [staff, setStaff] = useState(''),
    [department, setDepartment] = useState(''),
    [role, setRole] = useState<Role>('nurse'),
    [password, setPassword] = useState(''),
    [query, setQuery] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  if (profile?.role !== 'bme') return <Page title="เฉพาะ BME" back />;
  function edit(p: Profile | null) {
    setNotice(null);
    setSelected(p);
    setName(p?.name ?? '');
    setEmail(p?.email ?? '');
    setStaff(p?.staff_id ?? '');
    setDepartment(p?.department ?? '');
    setRole(p?.role ?? 'nurse');
    setPassword('');
    setForm(true);
  }
  async function call(body: Record<string, unknown>) {
    const { data, error } = await client().functions.invoke('manage-users', { body });
    if (error) {
      let message = error.message;
      try {
        const response = await error.context?.json();
        message = response?.error ?? message;
      } catch {
        /* network error has no response */
      }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    await refresh();
  }
  return (
    <Page title="จัดการบัญชีผู้ใช้" back>
      <Sub>บัญชีที่ระงับจะเข้าถึงข้อมูลไม่ได้ ประวัติเดิมจะยังอยู่</Sub>
      {notice && (
        <Card
          style={{
            backgroundColor: notice.type === 'success' ? '#E8F3EE' : '#FCE8E8',
            borderColor: notice.type === 'success' ? '#A9CDBB' : '#E6B7B7',
          }}
        >
          <T style={{ color: notice.type === 'success' ? '#185343' : '#A62E30' }}>
            {notice.text}
          </T>
        </Card>
      )}
      <Button title="สร้างบัญชีใหม่" onPress={() => edit(null)} />
      {form && (
        <Card>
          <T>{selected ? 'แก้ไขผู้ใช้' : 'บัญชีใหม่'}</T>
          <Field label="ชื่อ *" value={name} onChangeText={setName} />
          <Field label="รหัสพนักงาน *" value={staff} onChangeText={setStaff} />
          <Field
            label="อีเมลสำหรับเข้าสู่ระบบ *"
            value={email}
            onChangeText={setEmail}
            editable={!selected}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />
          {!selected && (
            <Sub>กรอกอีเมลที่ถูกต้อง เช่น name@hospital.go.th — รหัสพนักงานกรอกแยกในช่องด้านบน</Sub>
          )}
          <Field label="แผนก" value={department} onChangeText={setDepartment} />
          <Choice
            label="บทบาท"
            value={role}
            onChange={(v) => setRole(v as Role)}
            options={Object.entries(roleLabels).map(([value, label]) => ({ value, label }))}
          />
          <Field
            label={
              selected
                ? 'รหัสผ่านใหม่ (เฉพาะเมื่อต้องการเปลี่ยน)'
                : 'รหัสผ่านอย่างน้อย 10 ตัวอักษร *'
            }
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <Button
            title="บันทึกข้อมูลผู้ใช้"
            onPress={async () => {
              setNotice(null);
              if (!name.trim() || !staff.trim()) {
                setNotice({ type: 'error', text: 'กรอกชื่อและรหัสพนักงานให้ครบ' });
                return;
              }
              if (!selected && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
                setNotice({ type: 'error', text: 'กรอกอีเมลให้ถูกต้อง' });
                return;
              }
              if (!selected && password.length < 10) {
                setNotice({ type: 'error', text: 'รหัสผ่านต้องมีอย่างน้อย 10 ตัวอักษร' });
                return;
              }
              try {
                await call({
                  action: selected ? 'update' : 'create',
                  id: selected?.id,
                  name,
                  staff_id: staff,
                  email,
                  department,
                  role,
                  password,
                  active: selected?.active ?? true,
                });
                if (!selected) setPassword('');
                setForm(false);
                setNotice({
                  type: 'success',
                  text: selected ? 'บันทึกข้อมูลผู้ใช้แล้ว' : 'สร้างบัญชีผู้ใช้เรียบร้อยแล้ว',
                });
              } catch (error) {
                const message = error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ';
                const duplicate = /already registered|already exists|duplicate key|unique constraint/i.test(
                  message,
                );
                const invalidEmail = /Unable to validate email address:\s*invalid format/i.test(
                  message,
                );
                setNotice({
                  type: 'error',
                  text: duplicate
                    ? 'อีเมลหรือรหัสพนักงานนี้ถูกใช้แล้ว กรุณาตรวจสอบข้อมูล'
                    : invalidEmail
                      ? 'รูปแบบอีเมลไม่ถูกต้อง กรุณากรอกเช่น name@hospital.go.th และใส่รหัสพนักงานแยกอีกช่อง'
                    : `สร้างบัญชีไม่สำเร็จ: ${message}`,
                });
              }
            }}
          />
          {selected && (
            <Button
              secondary
              title="ตั้งรหัสผ่านใหม่"
              disabled={password.length < 10}
              onPress={async () => {
                setNotice(null);
                try {
                  await call({ action: 'password', id: selected.id, password });
                  setPassword('');
                  setNotice({ type: 'success', text: 'ตั้งรหัสผ่านใหม่แล้ว' });
                } catch (error) {
                  const message = error instanceof Error ? error.message : 'ดำเนินการไม่สำเร็จ';
                  setNotice({ type: 'error', text: `ตั้งรหัสผ่านไม่สำเร็จ: ${message}` });
                }
              }}
            />
          )}
          <Button
            secondary
            title="ปิดแบบฟอร์ม"
            onPress={() => {
              setForm(false);
              setPassword('');
            }}
          />
        </Card>
      )}
      <Field label="ค้นหาผู้ใช้" value={query} onChangeText={setQuery} />
      {data.profiles
        .filter((p) =>
          [p.name, p.email, p.staff_id].join(' ').toLowerCase().includes(query.toLowerCase()),
        )
        .map((p) => (
          <Card key={p.id}>
            <T>
              {p.name} {p.id === profile.id ? '(คุณ)' : ''}
            </T>
            <Sub>
              {roleLabels[p.role]} • {p.staff_id} • {p.active ? 'ใช้งานอยู่' : 'ระงับ'}
            </Sub>
            <Sub>{p.email}</Sub>
            <Button secondary title="แก้ไข / ตั้งรหัสผ่าน" onPress={() => edit(p)} />
            <Button
              danger={p.active}
              secondary={!p.active}
              title={p.active ? 'ระงับบัญชี' : 'เปิดใช้งานบัญชี'}
              onPress={() =>
                new Promise<void>((resolve, reject) =>
                  Alert.alert(p.active ? 'ระงับบัญชี' : 'เปิดใช้งานบัญชี', p.name, [
                    { text: 'ยกเลิก', style: 'cancel', onPress: () => resolve() },
                    {
                      text: 'ยืนยัน',
                      onPress: () => {
                        call({
                          action: 'update',
                          id: p.id,
                          name: p.name,
                          staff_id: p.staff_id,
                          email: p.email,
                          department: p.department,
                          role: p.role,
                          active: !p.active,
                        })
                          .then(() => resolve())
                          .catch(reject);
                      },
                    },
                  ]),
                )
              }
            />
          </Card>
        ))}
    </Page>
  );
}
