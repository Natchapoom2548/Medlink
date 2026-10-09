import React from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { C, FileImage, Sub, T } from '../../src/components/ui';
import { useApp } from '../../src/state/AppProvider';
import { actionLabels, roleLabels, statusLabels, Status } from '../../src/domain/models';
import { thaiDate } from '../../src/domain/utils';
import { BrandLogo } from '../../src/components/BrandLogo';

function SectionTitle({
  title,
  action,
  onPress,
  tag,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
  tag?: string;
}) {
  return (
    <View style={s.sectionHead}>
      <View style={s.sectionLeft}>
        <T style={s.sectionTitle}>{title}</T>
        {tag && (
          <View style={s.rolePill}>
            <T style={s.rolePillText}>{tag}</T>
          </View>
        )}
      </View>
      {action && (
        <Pressable onPress={onPress}>
          <T style={s.sectionAction}>{action} ›</T>
        </Pressable>
      )}
    </View>
  );
}
function Stat({
  icon,
  count,
  label,
  onPress,
  color = C.ink,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  count: number;
  label: string;
  onPress: () => void;
  color?: string;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.stat, pressed && { opacity: 0.8 }]}>
      <View style={s.statIcon}>
        <Ionicons name={icon} size={23} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <T style={s.statCount}>{count}</T>
        <T style={s.statLabel} numberOfLines={2}>
          {label}
        </T>
      </View>
    </Pressable>
  );
}
function QuickAction({
  icon,
  label,
  hint,
  tint,
  onPress,
  badge,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  hint: string;
  tint: string;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.quickAction, pressed && { opacity: 0.78 }]}
    >
      <View style={[s.quickIcon, { backgroundColor: tint }]}>
        <Ionicons name={icon} size={22} color={C.ink} />
        {!!badge && (
          <View style={s.badge}>
            <T style={s.badgeText}>{badge}</T>
          </View>
        )}
      </View>
      <T style={s.quickLabel} numberOfLines={1}>
        {label}
      </T>
      <T style={s.quickHint} numberOfLines={1}>
        {hint}
      </T>
    </Pressable>
  );
}
export default function Home() {
  const { profile, data, loading, refresh, mutate } = useApp();
  if (!profile) return null;
  const role = profile.role;
  const unread = data.notifications.filter((n) => !n.read_at).length;
  const pending = data.equipment.filter((e) => e.status === 'pending_borrow').length;
  const returnRequests = data.loans.filter(
    (loan) => loan.status === 'approved' && !!loan.return_requested_at,
  ).length;
  const issueReports = data.loans.filter(
    (loan) => loan.status === 'approved' && !!loan.issue_reported_at && !loan.issue_received_at,
  ).length;
  const pmCount = data.equipment.filter(
    (e) => e.status === 'pm_due' || e.status === 'repair',
  ).length;
  const goList = (status: Status | 'all' | 'return_requested' | 'reported') =>
    router.push({ pathname: '/(tabs)/equipment', params: { status } });
  const equipment = data.equipment
    .filter((e) => role !== 'nurse' || e.status === 'ready')
    .slice(0, 4);
  const activity = [...data.activities]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .filter((a) => role !== 'nurse' || a.action !== 'complete_pm')
    .slice(0, 3);
  const chat = async () => {
    if (role === 'bme') router.push({ pathname: '/chat/[id]', params: { id: 'inbox' } });
    else {
      const result = await mutate('open_chat', {});
      router.push({ pathname: '/chat/[id]', params: { id: result.id } });
    }
  };
  return (
    <SafeAreaView style={s.safe} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={s.page}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void refresh()}
            tintColor={C.green}
          />
        }
      >
        <View style={s.topbar}>
          <View style={s.brand}>
            <BrandLogo width={128} />
          </View>
          <View style={s.topActions}>
            <Pressable
              accessibilityLabel="แจ้งเตือน"
              onPress={() => router.push('/notifications')}
              style={s.bell}
            >
              <Ionicons name="notifications-outline" size={24} color={C.ink} />
              {unread > 0 && (
                <View style={s.unread}>
                  <T style={s.unreadText}>{unread > 9 ? '9+' : unread}</T>
                </View>
              )}
            </Pressable>
            <Pressable onPress={() => router.push('/(tabs)/profile')} style={s.avatar}>
              <FileImage path={profile.avatar_path} height={40} />
            </Pressable>
          </View>
        </View>
        <View style={s.greeting}>
          <T style={s.hello}>สวัสดี, {profile.name}</T>
          <T style={s.role}>
            {roleLabels[role]} <T style={{ color: C.accent }}>•</T> {profile.department}
          </T>
        </View>

        <View style={s.stats}>
          <Stat
            icon="cube-outline"
            count={data.equipment.length}
            label="เครื่องมือทั้งหมด"
            onPress={() => goList('all')}
          />
          <Stat
            icon="checkmark-circle-outline"
            count={data.equipment.filter((e) => e.status === 'ready').length}
            label="พร้อมใช้งาน"
            onPress={() => goList('ready')}
          />
          <Stat
            icon="person-outline"
            count={data.equipment.filter((e) => e.status === 'borrowed').length}
            label="กำลังใช้งานที่วอร์ด"
            onPress={() => goList('borrowed')}
          />
          {role === 'bme' || role === 'technician' ? (
            <Stat
              icon="construct-outline"
              count={pmCount}
              label="PM / ซ่อมบำรุง"
              onPress={() => goList('pm_due')}
              color="#664D03"
            />
          ) : (
            <Stat
              icon="business-outline"
              count={
                data.equipment.filter((e) =>
                  `${e.department} ${e.location}`.toLowerCase().includes('icu'),
                ).length
              }
              label="เครื่องในวอร์ด"
              onPress={() => goList('all')}
              color={C.green}
            />
          )}
        </View>

        <View style={s.section}>
          <SectionTitle
            title="เมนูด่วน"
            action="ดูทั้งหมด"
            onPress={() => goList('all')}
            tag={
              role === 'bme' ? 'โหมด BME' : role === 'technician' ? 'โหมดช่างเทคนิค' : 'โหมดพยาบาล'
            }
          />
          {role === 'nurse' && (
            <View style={s.quickGrid}>
              <QuickAction
                icon="clipboard-outline"
                label="ส่งคำขอยืมเครื่อง"
                hint="BME นำส่งวอร์ด"
                tint="#FFFBEB"
                onPress={() => goList('ready')}
              />
              <QuickAction
                icon="medkit-outline"
                label="เครื่องมือพร้อมใช้"
                hint="ตรวจเช็คสถานะคลัง"
                tint={C.card}
                onPress={() => goList('ready')}
              />
              <QuickAction
                icon="return-down-back-outline"
                label="แจ้งขอคืนเครื่อง"
                hint="ส่งคำแจ้งให้ BME"
                tint="#E0F2FE"
                onPress={() =>
                  router.push({ pathname: '/nurse-actions', params: { kind: 'request_return' } })
                }
              />
              <QuickAction
                icon="warning-outline"
                label="รายงานเครื่องมีปัญหา"
                hint="แจ้ง BME ตรวจสอบ"
                tint="#FCE8E6"
                onPress={() =>
                  router.push({ pathname: '/nurse-actions', params: { kind: 'report_equipment' } })
                }
              />
            </View>
          )}
          {role === 'technician' && (
            <View style={s.quickGrid}>
              <QuickAction
                icon="construct-outline"
                label="งาน PM"
                hint="ตรวจเช็ค IPM"
                tint="#FFF3CD"
                onPress={() => goList('pm_due')}
              />
              <QuickAction
                icon="warning-outline"
                label="รายงานอุปกรณ์"
                hint="แจ้งซ่อม / ปัญหา"
                tint="#FCE8E6"
                onPress={() => goList('repair')}
              />
            </View>
          )}
          {role === 'bme' && (
            <View style={s.quickGrid}>
              <QuickAction
                icon="shield-checkmark-outline"
                label="อนุมัติยืม"
                hint={pending ? `รอ ${pending} คำขอ` : 'ไม่มีคำขอใหม่'}
                tint="#2B2621"
                badge={pending}
                onPress={() => goList('pending_borrow')}
              />
              <QuickAction
                icon="return-down-back-outline"
                label="คำขอคืนเครื่อง"
                hint={returnRequests ? `รอรับ ${returnRequests} เครื่อง` : 'ไม่มีคำขอคืน'}
                tint="#E0F2FE"
                badge={returnRequests}
                onPress={() => goList('return_requested')}
              />
              <QuickAction
                icon="warning-outline"
                label="รายงานปัญหา"
                hint={issueReports ? `รอรับ ${issueReports} เครื่อง` : 'ไม่มีรายงานใหม่'}
                tint="#FCE8E6"
                badge={issueReports}
                onPress={() => goList('reported')}
              />
              <QuickAction
                icon="construct-outline"
                label="งาน PM"
                hint="ส่งงานให้ช่าง"
                tint="#FFF3CD"
                onPress={() => goList('pm_due')}
              />
              <QuickAction
                icon="add-outline"
                label="เพิ่มเครื่อง"
                hint="ลงทะเบียน"
                tint="#DCFCE7"
                onPress={() => router.push({ pathname: '/workflow', params: { kind: 'add' } })}
              />
              <QuickAction
                icon="people-outline"
                label="จัดการบัญชี"
                hint="สิทธิ์ผู้ใช้"
                tint="#F3E8FF"
                onPress={() => router.push('/users')}
              />
              <QuickAction
                icon="qr-code-outline"
                label="สแกนเครื่อง"
                hint="ค้นหาด้วย QR"
                tint="#F5EBE1"
                onPress={() => router.push('/scanner')}
              />
              <QuickAction
                icon="sync-outline"
                label="เปลี่ยนสถานะ"
                hint="ซ่อม / พร้อม"
                tint="#E0F2FE"
                onPress={() => goList('all')}
              />
            </View>
          )}
        </View>

        <View style={s.section}>
          <SectionTitle
            title="เครื่องมือแพทย์แนะนำ"
            action={`ดูทั้งหมด (${role === 'nurse' ? data.equipment.filter((e) => e.status === 'ready').length : data.equipment.length})`}
            onPress={() => goList(role === 'nurse' ? 'ready' : 'all')}
          />
          <View style={s.equipmentGrid}>
            {equipment.map((eq) => {
              const statusColor =
                eq.status === 'ready'
                  ? C.green
                  : eq.status === 'borrowed'
                    ? '#9A6500'
                    : eq.status === 'pending_borrow'
                      ? '#7E22CE'
                      : C.red;
              return (
                <Pressable
                  key={eq.id}
                  onPress={() =>
                    router.push({ pathname: '/equipment/[id]', params: { id: eq.id } })
                  }
                  style={({ pressed }) => [s.equipment, pressed && { opacity: 0.8 }]}
                >
                  <View style={s.equipmentTop}>
                    <View style={s.equipmentIcon}>
                      <Ionicons name="medkit-outline" size={20} color={C.green} />
                    </View>
                    <View style={[s.statusBadge, { backgroundColor: statusColor }]}>
                      <T style={s.statusText}>
                        {eq.status === 'ready'
                          ? 'พร้อมใช้'
                          : eq.status === 'borrowed'
                            ? 'ถูกยืม'
                            : eq.status === 'pending_borrow'
                              ? 'รอ BME อนุมัติ'
                              : statusLabels[eq.status]}
                      </T>
                    </View>
                  </View>
                  <T style={s.equipmentCode}>{eq.code}</T>
                  <T style={s.equipmentName} numberOfLines={1}>
                    {eq.name_th || eq.name}
                  </T>
                  <T style={s.equipmentLocation} numberOfLines={1}>
                    {eq.location || eq.department}
                  </T>
                </Pressable>
              );
            })}
          </View>
          {!equipment.length && (
            <View style={s.empty}>
              <Sub>ยังไม่มีรายการเครื่องมือ</Sub>
            </View>
          )}
        </View>

        <View style={s.section}>
          <SectionTitle
            title="ประวัติกิจกรรมล่าสุด"
            action="ดูประวัติทั้งหมด"
            onPress={() => router.push('/(tabs)/history')}
          />
          {activity.map((a) => {
            const eq = data.equipment.find((e) => e.id === a.equipment_id);
            return (
              <Pressable
                key={a.id}
                onPress={() =>
                  eq && router.push({ pathname: '/equipment/[id]', params: { id: eq.id } })
                }
                style={s.activity}
              >
                <View style={s.activityDot}>
                  <Ionicons name="time-outline" size={17} color={C.green} />
                </View>
                <View style={{ flex: 1 }}>
                  <T style={s.activityTitle} numberOfLines={1}>
                    {actionLabels[a.action] || a.action}
                  </T>
                  <T style={s.activityDetail} numberOfLines={1}>
                    {eq?.code || 'เครื่องมือ'}
                    {a.notes ? ` • ${a.notes}` : ''}
                  </T>
                </View>
                <T style={s.activityDate}>{thaiDate(a.created_at)}</T>
              </Pressable>
            );
          })}
          {!activity.length && (
            <View style={s.empty}>
              <Sub>ยังไม่มีกิจกรรมล่าสุด</Sub>
            </View>
          )}
        </View>
        <Pressable onPress={() => void chat()} style={s.chatButton}>
          <Ionicons name="chatbubble-ellipses-outline" size={19} color="#fff" />
          <T style={s.chatText}>{role === 'bme' ? 'กล่องข้อความ BME' : 'แชตกับฝ่าย BME'}</T>
        </Pressable>
        <T style={s.syncText}>
          ดึงหน้าจอลงเพื่อโหลดข้อมูลใหม่ • ข้อมูลซิงก์เมื่อเชื่อมต่ออินเทอร์เน็ต
        </T>
      </ScrollView>
    </SafeAreaView>
  );
}
const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  page: { paddingHorizontal: 20, paddingTop: 5, paddingBottom: 28, gap: 15 },
  topbar: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  brandName: { fontFamily: 'PromptBold', fontSize: 20, letterSpacing: -0.4 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bell: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },
  unread: {
    position: 'absolute',
    top: 2,
    right: 1,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 9,
    backgroundColor: '#DC2626',
    borderWidth: 1.5,
    borderColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadText: { color: '#fff', fontSize: 8, lineHeight: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: C.accent,
    overflow: 'hidden',
    backgroundColor: C.card,
  },
  greeting: { gap: 1 },
  hello: { fontFamily: 'PromptBold', fontSize: 24, lineHeight: 34, letterSpacing: -0.35 },
  role: { fontSize: 12, color: C.muted, fontFamily: 'PromptBold' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: {
    width: '48.3%',
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 11,
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 17,
  },
  statIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCount: { fontFamily: 'PromptBold', fontSize: 20, lineHeight: 24 },
  statLabel: { color: C.muted, fontSize: 10.5, lineHeight: 15 },
  section: { gap: 9, paddingTop: 1 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 22,
  },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: { fontFamily: 'PromptBold', fontSize: 14 },
  sectionAction: { color: '#8F7C68', fontFamily: 'PromptBold', fontSize: 10.5 },
  rolePill: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.card,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  rolePillText: { color: '#8F7C68', fontSize: 9 },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    rowGap: 12,
    columnGap: 4,
  },
  quickAction: {
    width: '30.5%',
    minHeight: 91,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  quickIcon: {
    width: 52,
    height: 52,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { marginTop: 5, fontFamily: 'PromptBold', fontSize: 10, maxWidth: '100%' },
  quickHint: { color: C.muted, fontSize: 9, lineHeight: 14 },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9 },
  equipmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  equipment: {
    width: '48.5%',
    minHeight: 116,
    padding: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 16,
    gap: 2,
  },
  equipmentTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  equipmentIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: { borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, maxWidth: '67%' },
  statusText: { color: '#fff', fontSize: 8, fontFamily: 'PromptBold' },
  equipmentCode: { color: C.muted, fontSize: 9, fontFamily: 'PromptBold' },
  equipmentName: { fontSize: 11, lineHeight: 16, fontFamily: 'PromptBold' },
  equipmentLocation: { color: '#8F7C68', fontSize: 9 },
  activity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    padding: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 13,
  },
  activityDot: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityTitle: { fontFamily: 'PromptBold', fontSize: 10.5 },
  activityDetail: { color: C.muted, fontSize: 9 },
  activityDate: { color: '#8F7C68', fontSize: 8 },
  empty: {
    padding: 15,
    borderRadius: 15,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
  },
  chatButton: {
    minHeight: 45,
    borderRadius: 14,
    backgroundColor: C.green,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  chatText: { color: '#fff', fontFamily: 'PromptBold' },
  syncText: { color: C.muted, fontSize: 9, textAlign: 'center' },
});
