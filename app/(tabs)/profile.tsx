import React, { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Button, Card, C, Field, FileImage, Page, Sub, T } from '../../src/components/ui';
import { useApp } from '../../src/state/AppProvider';
import { roleLabels } from '../../src/domain/models';
import { uploadFile } from '../../src/lib/files';
export default function Profile() {
  const { profile, mutate, logout } = useApp();
  const [editing, setEditing] = useState(false),
    [name, setName] = useState(profile?.name ?? ''),
    [phone, setPhone] = useState(profile?.phone ?? ''),
    [department, setDepartment] = useState(profile?.department ?? '');
  const performLogout = async () => {
    try {
      await logout();
    } catch {
      if (Platform.OS === 'web' && typeof window !== 'undefined')
        window.alert('ออกจากระบบไม่สำเร็จ กรุณาลองใหม่');
      else Alert.alert('ออกจากระบบไม่สำเร็จ', 'กรุณาลองใหม่');
    }
  };
  const requestLogout = async () => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && !window.confirm('ต้องการออกจากบัญชีนี้หรือไม่?')) return;
      await performLogout();
      return;
    }
    Alert.alert('ออกจากระบบ', 'ต้องการออกจากบัญชีนี้หรือไม่?', [
      { text: 'ยกเลิก', style: 'cancel' },
      { text: 'ออกจากระบบ', style: 'destructive', onPress: () => void performLogout() },
    ]);
  };
  if (!profile) return null;
  return (
    <Page title="โปรไฟล์ผู้ใช้">
      <Card style={profileStyles.userCard}>
        <View style={profileStyles.avatar}><FileImage path={profile.avatar_path} height={64} /></View>
        <View style={profileStyles.userInfo}>
          <View style={profileStyles.nameLine}><T style={profileStyles.name}>{profile.name}</T><T style={profileStyles.roleBadge}>{roleLabels[profile.role]}</T></View>
          <T style={profileStyles.role}>{roleLabels[profile.role]}</T>
          <View style={profileStyles.identity}><T style={profileStyles.staff}>{profile.staff_id}</T><T style={profileStyles.department}>{profile.role === 'bme' ? 'แผนก' : 'วอร์ด'}: {profile.department}</T></View>
        </View>
      </Card>
      <View style={profileStyles.sectionTitle}><Ionicons name="person-circle-outline" size={17} color={C.green} /><T style={profileStyles.sectionLabel}>ข้อมูลส่วนตัวและหน่วยงาน</T></View>
      <Card style={profileStyles.detailsCard}>
        <View style={profileStyles.detailRow}><Ionicons name="mail-outline" size={16} color="#8F7C68" /><View style={{ flex: 1 }}><Sub>อีเมลโรงพยาบาล</Sub><T style={profileStyles.detailValue}>{profile.email}</T></View></View>
        <View style={profileStyles.detailRow}><Ionicons name="call-outline" size={16} color="#8F7C68" /><View style={{ flex: 1 }}><Sub>เบอร์โทรศัพท์</Sub><T style={profileStyles.detailValue}>{profile.phone || 'ยังไม่มีเบอร์โทร'}</T></View></View>
        <View style={profileStyles.detailRow}><Ionicons name="business-outline" size={16} color="#8F7C68" /><View style={{ flex: 1 }}><Sub>หน่วยงาน</Sub><T style={profileStyles.detailValue}>{profile.department}</T></View></View>
      </Card>
      <Button
        secondary
        title={editing ? 'ปิดการแก้ไข' : 'แก้ไขข้อมูลส่วนตัว'}
        onPress={() => {
          setName(profile.name);
          setPhone(profile.phone);
          setDepartment(profile.department);
          setEditing((v) => !v);
        }}
      />
      {editing && (
        <>
          <Field label="ชื่อ" value={name} onChangeText={setName} />
          <Field label="แผนก" value={department} onChangeText={setDepartment} />
          <Field label="โทรศัพท์" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Button
            title="บันทึกโปรไฟล์"
            onPress={async () => {
              await mutate('edit_profile', { name, phone, department });
              setEditing(false);
            }}
          />
        </>
      )}
      <Button
        secondary
        title="เปลี่ยนรูปโปรไฟล์"
        onPress={async () => {
          const pick = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.8,
          });
          if (pick.canceled) return;
          const a = pick.assets[0];
          const file = await uploadFile(
            a.uri,
            a.fileName ?? 'avatar.jpg',
            a.mimeType ?? 'image/jpeg',
            { is_avatar: true },
          );
          await mutate('edit_profile', {
            name: profile.name,
            phone: profile.phone,
            department: profile.department,
            attachment_id: file.id,
          });
        }}
      />
      {profile.role === 'bme' && <Pressable onPress={() => router.push('/users')} style={profileStyles.menuCard}><View style={profileStyles.menuIcon}><Ionicons name="people-outline" size={19} color="#6B21A8" /></View><View style={{ flex: 1 }}><T style={profileStyles.menuTitle}>ระบบจัดการบัญชีผู้ใช้งาน</T><Sub>เพิ่มบัญชี เปลี่ยนสิทธิ์ และจัดการผู้ใช้งาน</Sub></View><Ionicons name="chevron-forward" size={17} color="#8F7C68" /></Pressable>}
      <Card style={profileStyles.aboutCard}>
        <T>MedLink BME 1.0</T>
        <Sub>ข้อมูลยืม–คืนและแชตเชื่อมต่อกับ Supabase การแจ้งเตือนอยู่ในแอป</Sub>
        <Sub>วิดีโอคอลและ Face ID ยังไม่เปิดใช้งานในรุ่น Expo Go</Sub>
      </Card>
      <Button
        danger
        title="ออกจากระบบ"
        onPress={requestLogout}
      />
    </Page>
  );
}
const profileStyles = StyleSheet.create({
  userCard: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 13, borderRadius: 22 },
  avatar: { width: 64, height: 64, borderRadius: 17, borderWidth: 2, borderColor: C.accent, overflow: 'hidden', backgroundColor: C.bg },
  userInfo: { flex: 1, gap: 2 }, nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 }, name: { fontSize: 15, fontFamily: 'PromptBold', flexShrink: 1 }, roleBadge: { overflow: 'hidden', color: '#FAF8F5', backgroundColor: C.ink, fontSize: 8, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 }, role: { fontSize: 10, color: C.muted }, identity: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 3 }, staff: { color: '#8F7C68', fontSize: 9, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }, department: { color: C.ink, fontSize: 9 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: -8 }, sectionLabel: { fontFamily: 'PromptBold', fontSize: 12 }, detailsCard: { paddingVertical: 8, gap: 0 }, detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border }, detailValue: { fontSize: 11, fontFamily: 'PromptBold' }, menuCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border, borderRadius: 16 }, menuIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#F3E8FF', alignItems: 'center', justifyContent: 'center' }, menuTitle: { fontSize: 11, fontFamily: 'PromptBold' }, aboutCard: { backgroundColor: '#FAF8F5' },
});
