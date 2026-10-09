import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Tabs, router } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, T } from '../../src/components/ui';
import { useApp } from '../../src/state/AppProvider';

const tabMeta: Record<string, { title: string; icon: React.ComponentProps<typeof Ionicons>['name']; active: React.ComponentProps<typeof Ionicons>['name'] }> = {
  index: { title: 'หน้าหลัก', icon: 'home-outline', active: 'home' },
  equipment: { title: 'เครื่องมือ', icon: 'file-tray-full-outline', active: 'file-tray-full' },
  history: { title: 'ประวัติ', icon: 'document-text-outline', active: 'document-text' },
  profile: { title: 'โปรไฟล์', icon: 'person-outline', active: 'person' },
};
function MedLinkTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { profile } = useApp();
  const showScan = profile?.role !== 'nurse';
  return <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 9) }]}>
    {state.routes.map((route, index) => {
      if (!tabMeta[route.name]) return null;
      const focused = state.index === index;
      const meta = tabMeta[route.name];
      const onPress = () => {
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
      };
      return <Pressable key={route.key} accessibilityRole="button" accessibilityState={focused ? { selected: true } : {}} onPress={onPress} style={styles.item}>
        <Ionicons name={focused ? meta.active : meta.icon} size={21} color={focused ? C.ink : C.muted} />
        <T style={[styles.label, focused && styles.activeLabel]}>{meta.title}</T>
      </Pressable>;
    }).reduce<React.ReactNode[]>((children, item, index) => {
      if (showScan && index === 2) children.push(<Pressable key="scan" accessibilityRole="button" accessibilityLabel="สแกน QR Code" onPress={() => router.push('/scanner')} style={styles.item}><View style={styles.scan}><Ionicons name="scan-outline" size={24} color={C.ink} /></View></Pressable>);
      children.push(item);
      return children;
    }, [])}
  </View>;
}
export default function TabLayout() {
  return <Tabs tabBar={(props) => <MedLinkTabBar {...props} />} screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true }}>
    <Tabs.Screen name="index" options={{ title: 'หน้าหลัก' }} />
    <Tabs.Screen name="equipment" options={{ title: 'เครื่องมือ' }} />
    <Tabs.Screen name="scan" options={{ href: null }} />
    <Tabs.Screen name="history" options={{ title: 'ประวัติ' }} />
    <Tabs.Screen name="profile" options={{ title: 'โปรไฟล์' }} />
  </Tabs>;
}
const styles = StyleSheet.create({
  bar: { minHeight: 59, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: 'rgba(239,233,227,0.98)', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border, paddingHorizontal: 8, paddingTop: 7, elevation: 10 },
  item: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', gap: 1 }, label: { color: C.muted, fontSize: 9.5 }, activeLabel: { color: C.ink, fontFamily: 'PromptBold' }, scan: { width: 48, height: 48, marginTop: -24, borderRadius: 16, backgroundColor: C.accent, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', elevation: 5 },
});
