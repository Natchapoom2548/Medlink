import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, Sub, T } from '../../src/components/ui';
import { useApp } from '../../src/state/AppProvider';
import { actionLabels, statusLabels } from '../../src/domain/models';
import { csv, thaiDate } from '../../src/domain/utils';
import { shareTextFile } from '../../src/lib/files';

const filters = [{ id: 'all', label: 'ทั้งหมด' }, { id: 'borrow', label: 'การยืม' }, { id: 'return', label: 'การคืน' }, { id: 'approve', label: 'อนุมัติ BME' }, { id: 'pm', label: 'งาน PM' }];
export default function History() {
  const { data, profile, loading, refresh } = useApp();
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  const pm = profile?.role === 'bme' || profile?.role === 'technician';
  const items = useMemo(() => [...data.activities].filter((a) => {
    const name = actionLabels[a.action] ?? a.action;
    const code = data.equipment.find((e) => e.id === a.equipment_id)?.code ?? '';
    const group = filter === 'all' || (filter === 'borrow' && a.action.includes('borrow')) || (filter === 'return' && a.action.includes('return')) || (filter === 'approve' && a.action.startsWith('approve')) || (filter === 'pm' && a.action.includes('pm'));
    return group && `${code} ${a.notes} ${name}`.toLowerCase().includes(query.toLowerCase());
  }).sort((a, b) => b.created_at.localeCompare(a.created_at)), [data, filter, query]);
  const exportCsv = () => shareTextFile('medlink-history.csv', csv(['วันเวลา', 'เครื่องมือ', 'รายการ', 'รายละเอียด'], items.map((a) => [thaiDate(a.created_at, true), data.equipment.find((e) => e.id === a.equipment_id)?.code, actionLabels[a.action] ?? a.action, a.notes])));
  const exportEquipment = () => shareTextFile('medlink-equipment.csv', csv(['รหัส', 'ชื่อ', 'สถานะ', 'สถานที่', 'กำหนด PM'], data.equipment.map((e) => [e.code, e.name_th || e.name, statusLabels[e.status], e.location, thaiDate(e.due_date)])));
  return <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
    <ScrollView contentContainerStyle={s.page} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={C.green} />}>
      <View style={s.heading}><View style={{ flex: 1 }}><T style={s.title}>ประวัติการใช้งาน</T><T style={s.subtitle}>บันทึกการยืม-คืน งาน PM และรายงานสถานะเครื่อง</T></View><Pressable onPress={() => void exportCsv()} style={s.export}><Ionicons name="download-outline" size={15} color="#fff" /><T style={s.exportLabel}>ส่งออก CSV</T>{pm && <View style={s.bmePill}><T style={s.bmeText}>BME</T></View>}</Pressable></View>
      {pm && <View style={s.ribbon}><T style={s.ribbonTitle}>ส่งออกด่วนสำหรับ BME:</T><Pressable onPress={() => void exportEquipment()} style={s.ribbonButton}><T style={s.ribbonText}>📋 รายการเครื่อง ({data.equipment.length})</T></Pressable><Pressable onPress={() => void exportCsv()} style={[s.ribbonButton, s.ribbonDark]}><T style={[s.ribbonText, { color: '#fff' }]}>📑 ประวัติ ({items.length})</T></Pressable></View>}
      <View style={s.search}><Ionicons name="search-outline" size={17} color={C.muted} /><TextInput value={query} onChangeText={setQuery} placeholder="ค้นหาประวัติ หรือชื่อเจ้าหน้าที่" placeholderTextColor={C.muted} style={s.searchInput} /></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>{filters.map((f) => <Pressable key={f.id} onPress={() => setFilter(f.id)} style={[s.filter, filter === f.id && s.filterOn]}><T style={[s.filterText, filter === f.id && s.filterTextOn]}>{f.label}</T></Pressable>)}</ScrollView>
      <View style={s.timeline}>{items.map((a) => {
        const eq = data.equipment.find((e) => e.id === a.equipment_id);
        const icon = a.action.startsWith('approve') ? 'shield-checkmark-outline' : a.action.startsWith('request') ? 'hourglass-outline' : a.action.includes('borrow') ? 'arrow-up-circle-outline' : a.action.includes('return') ? 'arrow-down-circle-outline' : a.action.includes('pm') ? 'construct-outline' : 'location-outline';
        return <Pressable key={a.id} onPress={() => eq && router.push({ pathname: '/equipment/[id]', params: { id: eq.id } })} style={({ pressed }) => [s.card, pressed && { opacity: .8 }]}>
          <View style={s.cardHead}><View style={s.eventIcon}><Ionicons name={icon} size={18} color={C.green} /></View><View style={s.headText}><T style={s.deviceName} numberOfLines={1}>{eq?.name_th || eq?.name || 'เครื่องมือ'} <T style={s.code}>({eq?.code || '—'})</T></T><T style={s.action} numberOfLines={2}>{actionLabels[a.action] ?? a.action}</T></View><T style={s.time}>{thaiDate(a.created_at)}</T></View>
          <View style={s.divider} /><View style={s.meta}><T style={s.metaText}>ผู้บันทึก: <T style={s.metaStrong}>{data.profiles.find((p) => p.id === a.actor_id)?.name || 'เจ้าหน้าที่'}</T></T><T style={s.metaText}>{eq?.department || eq?.location || ''}</T></View>
          {!!a.notes && <T style={s.notes} numberOfLines={3}>“{a.notes}”</T>}
        </Pressable>;
      })}</View>
      {!items.length && <View style={s.empty}><Ionicons name="time-outline" size={28} color="#8F7C68" /><T style={s.emptyTitle}>ไม่พบประวัติการทำรายการ</T></View>}
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg }, page: { paddingHorizontal: 16, paddingTop: 7, paddingBottom: 28, gap: 11 }, heading: { flexDirection: 'row', alignItems: 'center', gap: 8 }, title: { fontFamily: 'PromptBold', fontSize: 23, lineHeight: 32 }, subtitle: { color: C.muted, fontSize: 9.5, lineHeight: 15 }, export: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.ink, paddingHorizontal: 9, paddingVertical: 8, borderRadius: 11 }, exportLabel: { color: '#fff', fontSize: 9, fontFamily: 'PromptBold' }, bmePill: { backgroundColor: C.accent, paddingHorizontal: 5, borderRadius: 8 }, bmeText: { fontSize: 7, fontFamily: 'PromptBold' }, ribbon: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 8, borderRadius: 13, backgroundColor: '#FAF8F5', borderWidth: 1, borderColor: C.border }, ribbonTitle: { fontSize: 8, fontFamily: 'PromptBold', flex: 1 }, ribbonButton: { paddingHorizontal: 7, paddingVertical: 5, backgroundColor: C.card, borderRadius: 8, borderWidth: 1, borderColor: C.border }, ribbonDark: { backgroundColor: C.ink }, ribbonText: { fontSize: 8, fontFamily: 'PromptBold' }, search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 42, paddingHorizontal: 11, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.border }, searchInput: { flex: 1, fontFamily: 'Prompt', color: C.ink, fontSize: 11, padding: 0 }, filters: { gap: 7, paddingVertical: 2 }, filter: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.border }, filterOn: { backgroundColor: C.accent, borderColor: C.accent }, filterText: { fontSize: 9.5, color: C.muted }, filterTextOn: { color: C.ink, fontFamily: 'PromptBold' }, timeline: { gap: 9, paddingTop: 1 }, card: { padding: 11, backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, gap: 7 }, cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, eventIcon: { width: 32, height: 32, borderRadius: 11, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border }, headText: { flex: 1 }, deviceName: { fontSize: 10.5, fontFamily: 'PromptBold' }, code: { color: '#8F7C68', fontSize: 9 }, action: { color: '#504841', fontSize: 9.5, fontFamily: 'PromptBold', marginTop: 1 }, time: { color: C.muted, fontSize: 8 }, divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border }, meta: { flexDirection: 'row', justifyContent: 'space-between', gap: 4 }, metaText: { color: C.muted, fontSize: 8.5 }, metaStrong: { color: C.ink, fontFamily: 'PromptBold' }, notes: { color: '#7A7067', backgroundColor: C.bg, padding: 7, borderRadius: 8, borderWidth: 1, borderColor: '#D9CFC7', fontSize: 9 }, empty: { paddingVertical: 40, alignItems: 'center', gap: 8 }, emptyTitle: { color: C.muted, fontSize: 11, fontFamily: 'PromptBold' },
});
