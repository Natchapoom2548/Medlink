import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, Sub, T } from '../../src/components/ui';
import { useApp } from '../../src/state/AppProvider';
import { Status, statusLabels } from '../../src/domain/models';

const statuses: { label: string; value: Status | 'all' }[] = [
  { label: 'ทั้งหมด', value: 'all' },
  { label: 'พร้อมใช้', value: 'ready' },
  { label: 'ถูกยืม', value: 'borrowed' },
  { label: 'PM / ซ่อม', value: 'pm_due' },
];
type EquipmentFilter = Status | 'all' | 'return_requested' | 'reported';
export default function EquipmentList() {
  const { data, profile, loading, refresh } = useApp();
  const params = useLocalSearchParams<{ status?: string }>();
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState<EquipmentFilter>('all'),
    [department, setDepartment] = useState('all'),
    [showDepartments, setShowDepartments] = useState(false),
    [sort, setSort] = useState<'recent' | 'name' | 'code'>('recent'),
    [favoritesOnly, setFavoritesOnly] = useState(false);
  useEffect(() => {
    if (
      params.status &&
      [
        'ready',
        'borrowed',
        'pending_borrow',
        'pm_due',
        'repair',
        'reject',
        'return_requested',
        'reported',
      ].includes(params.status)
    )
      setFilter(params.status as EquipmentFilter);
    else if (params.status === 'all') setFilter('all');
  }, [params.status]);
  const isPmRole = profile?.role === 'bme' || profile?.role === 'technician';
  const departments = useMemo(
    () => [
      'all',
      ...new Set(data.equipment.map((e) => e.department || e.location).filter(Boolean)),
    ],
    [data.equipment],
  );
  const items = useMemo(
    () =>
      data.equipment
        .filter((e) => {
          const q = query.trim().toLowerCase();
          const activeLoan = data.loans.find(
            (loan) => loan.equipment_id === e.id && loan.status === 'approved',
          );
          const matchesStatus =
            filter === 'all' ||
            (filter === 'pm_due'
              ? e.status === 'pm_due' || e.status === 'repair'
              : filter === 'return_requested'
                ? !!activeLoan?.return_requested_at
                : filter === 'reported'
                  ? !!activeLoan?.issue_reported_at && !activeLoan.issue_received_at
                  : e.status === filter);
          const matchesDept =
            department === 'all' || e.department === department || e.location === department;
          const matchesFav = !favoritesOnly || data.favorites.some((f) => f.equipment_id === e.id);
          const matchesText =
            !q ||
            [
              e.code,
              e.name,
              e.name_th,
              e.serial_number,
              e.location,
              e.department,
              e.brand,
              e.category,
            ]
              .join(' ')
              .toLowerCase()
              .includes(q);
          return matchesStatus && matchesDept && matchesFav && matchesText;
        })
        .sort((a, b) =>
          sort === 'name'
            ? (a.name_th || a.name).localeCompare(b.name_th || b.name)
            : sort === 'code'
              ? a.code.localeCompare(b.code)
              : 0,
        ),
    [data, query, filter, department, favoritesOnly, sort],
  );
  const statusOptions: { label: string; value: EquipmentFilter }[] = [
    ...statuses.filter((x) => x.value !== 'pm_due' || isPmRole),
    ...(profile?.role === 'bme'
      ? [
          { label: 'คำขอคืน', value: 'return_requested' as const },
          { label: 'รายงานปัญหา', value: 'reported' as const },
        ]
      : []),
  ];
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={s.page}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refresh()}
            tintColor={C.green}
          />
        }
      >
        <T style={s.title}>เครื่องมือแพทย์</T>
        <View style={s.searchRow}>
          <View style={s.searchBox}>
            <Ionicons name="search-outline" size={17} color={C.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="ค้นหาชื่อ รหัส หรือ Serial Number"
              placeholderTextColor={C.muted}
              style={s.searchInput}
              returnKeyType="search"
            />
          </View>
          <Pressable
            accessibilityLabel="กรองข้อมูล"
            onPress={() => setShowDepartments((v) => !v)}
            style={[s.filterButton, department !== 'all' && s.filterSelected]}
          >
            <Ionicons name="options-outline" size={20} color={C.ink} />
          </Pressable>
        </View>
        {showDepartments && (
          <View style={s.departmentPanel}>
            <View style={s.panelHead}>
              <T style={s.panelTitle}>กรองตามแผนก / หอผู้ป่วย:</T>
              <Pressable onPress={() => setDepartment('all')}>
                <T style={s.clear}>ล้างตัวกรอง</T>
              </Pressable>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.deptRow}
            >
              {departments.map((d) => (
                <Pressable
                  key={d}
                  onPress={() => setDepartment(d)}
                  style={[s.deptChip, department === d && s.deptSelected]}
                >
                  <T style={[s.deptLabel, department === d && { color: '#fff' }]}>
                    {d === 'all' ? 'ทุกแผนก' : d}
                  </T>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
        >
          {statusOptions.map((x) => (
            <Pressable
              key={x.value}
              onPress={() => setFilter(x.value)}
              style={[s.chip, filter === x.value && s.chipActive]}
            >
              <T style={[s.chipLabel, filter === x.value && s.chipLabelActive]}>{x.label}</T>
            </Pressable>
          ))}
        </ScrollView>
        <View style={s.meta}>
          <T style={s.result}>พบ {items.length} รายการ</T>
          <Pressable
            onPress={() =>
              setSort((v) => (v === 'recent' ? 'name' : v === 'name' ? 'code' : 'recent'))
            }
            style={s.sort}
          >
            <T style={s.sortText}>
              {sort === 'recent' ? 'ล่าสุด' : sort === 'name' ? 'เรียงตามชื่อ' : 'เรียงตามรหัส'}
            </T>
            <Ionicons name="swap-vertical-outline" size={15} color={C.ink} />
          </Pressable>
        </View>
        <Pressable onPress={() => setFavoritesOnly((v) => !v)} style={s.favToggle}>
          <Ionicons
            name={favoritesOnly ? 'star' : 'star-outline'}
            size={16}
            color={favoritesOnly ? '#9A6500' : C.muted}
          />
          <T style={s.favText}>{favoritesOnly ? 'แสดงรายการโปรดเท่านั้น' : 'กรองรายการโปรด'}</T>
        </Pressable>
        <View style={s.list}>
          {items.map((e) => {
            const color =
              e.status === 'ready'
                ? C.green
                : e.status === 'borrowed'
                  ? '#9A6500'
                  : e.status === 'pending_borrow'
                    ? '#7E22CE'
                    : C.red;
            const label =
              e.status === 'ready'
                ? 'พร้อมใช้'
                : e.status === 'borrowed'
                  ? 'ถูกยืม'
                  : e.status === 'pending_borrow'
                    ? 'รอ BME อนุมัติ'
                    : statusLabels[e.status];
            return (
              <Pressable
                key={e.id}
                onPress={() => router.push({ pathname: '/equipment/[id]', params: { id: e.id } })}
                style={({ pressed }) => [s.item, pressed && { opacity: 0.8 }]}
              >
                <View style={s.deviceIcon}>
                  <Ionicons name="medkit-outline" size={24} color={C.green} />
                </View>
                <View style={s.itemBody}>
                  <View style={s.itemHead}>
                    <T style={s.code}>{e.code}</T>
                    <View style={[s.status, { backgroundColor: color }]}>
                      <T style={s.statusLabel}>{label}</T>
                    </View>
                  </View>
                  <T style={s.name} numberOfLines={1}>
                    {e.name_th || e.name}
                  </T>
                  <T style={s.detail} numberOfLines={1}>
                    {[e.brand, e.model].filter(Boolean).join(' ')}
                    {e.brand || e.model ? ' • ' : ''}
                    {e.location || e.department}
                  </T>
                </View>
                <Ionicons name="chevron-forward" size={17} color="#8F7C68" />
              </Pressable>
            );
          })}
        </View>
        {!items.length && (
          <View style={s.empty}>
            <Ionicons name="search-outline" size={25} color="#8F7C68" />
            <Sub>ไม่พบเครื่องมือที่ตรงกับการค้นหา</Sub>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  page: { paddingHorizontal: 16, paddingTop: 7, paddingBottom: 28, gap: 12 },
  title: { fontFamily: 'PromptBold', fontSize: 24, lineHeight: 34, paddingHorizontal: 4 },
  searchRow: { flexDirection: 'row', gap: 9, alignItems: 'center' },
  searchBox: {
    height: 43,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 13,
    backgroundColor: C.card,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, color: C.ink, fontFamily: 'Prompt', fontSize: 11, paddingVertical: 0 },
  filterButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  filterSelected: { backgroundColor: C.accent },
  departmentPanel: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 15,
    padding: 11,
    gap: 8,
  },
  panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  panelTitle: { fontFamily: 'PromptBold', fontSize: 11 },
  clear: { color: '#8F7C68', fontSize: 10 },
  deptRow: { gap: 6 },
  deptChip: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
  },
  deptSelected: { backgroundColor: C.ink, borderColor: C.ink },
  deptLabel: { fontSize: 10, color: C.muted },
  chips: { gap: 7, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 15,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipLabel: { fontSize: 10.5, color: '#3D352E' },
  chipLabelActive: { color: C.ink, fontFamily: 'PromptBold' },
  meta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 1,
  },
  result: { color: C.ink, fontSize: 11 },
  sort: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sortText: { fontSize: 10.5, fontFamily: 'PromptBold' },
  favToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 2,
  },
  favText: { fontSize: 10, color: C.muted },
  list: { gap: 9 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
  deviceIcon: {
    width: 46,
    height: 46,
    borderRadius: 13,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: { flex: 1, gap: 1 },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  code: { fontFamily: 'PromptBold', fontSize: 10, color: C.muted },
  status: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10, maxWidth: '62%' },
  statusLabel: { color: '#fff', fontSize: 8.5, fontFamily: 'PromptBold' },
  name: { fontSize: 12, fontFamily: 'PromptBold' },
  detail: { fontSize: 9, color: '#8F7C68' },
  empty: {
    padding: 28,
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
  },
});
