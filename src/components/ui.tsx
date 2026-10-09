import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  TextProps,
  TextInputProps,
  ViewStyle,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useApp } from '../state/AppProvider';
import { Equipment, statusLabels } from '../domain/models';
import { errorMessage } from '../domain/utils';
import { signedUrl } from '../lib/files';
export const C = {
  bg: '#F9F8F6',
  card: '#EFE9E3',
  border: '#D9CFC7',
  ink: '#2B2621',
  muted: '#6B625B',
  green: '#185343',
  accent: '#C9B59C',
  red: '#A62E30',
};
export function T({ style, ...props }: TextProps) {
  return <Text {...props} style={[{ fontFamily: 'Prompt', color: C.ink, fontSize: 13 }, style]} />;
}
export function Title({ children }: { children: React.ReactNode }) {
  return <T style={s.title}>{children}</T>;
}
export function Sub({ children }: { children: React.ReactNode }) {
  return <T style={s.sub}>{children}</T>;
}
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}
export function Row({ children }: { children: React.ReactNode }) {
  return <View style={s.row}>{children}</View>;
}
export function Button({
  title,
  onPress,
  secondary = false,
  danger = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void | Promise<unknown>;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={async () => {
        setBusy(true);
        try {
          await onPress();
        } catch (e) {
          Alert.alert('ดำเนินการไม่สำเร็จ', errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor: danger ? C.red : secondary ? C.card : C.green,
          opacity: disabled || busy ? 0.45 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={secondary ? C.ink : '#fff'} />
      ) : (
        <T style={{ color: secondary ? C.ink : '#fff', textAlign: 'center' }}>{title}</T>
      )}
    </Pressable>
  );
}
export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Sub>{label}</Sub>
      <TextInput
        placeholderTextColor="#93877B"
        {...props}
        style={[s.input, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, style]}
      />
    </View>
  );
}
export function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Sub>{label}</Sub>
      <View style={s.row}>
        {options.map((o) => (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: o.value === value }}
            onPress={() => onChange(o.value)}
            style={[
              s.chip,
              o.value === value && { backgroundColor: C.green, borderColor: C.green },
            ]}
          >
            <T style={{ color: o.value === value ? 'white' : C.ink, fontSize: 12 }}>{o.label}</T>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
export function Check({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={[s.row, { paddingVertical: 8 }]}
    >
      <T style={{ fontSize: 22, color: C.green }}>{value ? '☑' : '☐'}</T>
      <T style={{ flex: 1 }}>{label}</T>
    </Pressable>
  );
}
export function Empty({ text = 'ยังไม่มีรายการ' }: { text?: string }) {
  return (
    <Card>
      <Sub>{text}</Sub>
    </Card>
  );
}
export function Page({
  title,
  children,
  back = false,
}: {
  title: string;
  children?: React.ReactNode;
  back?: boolean;
}) {
  const { refresh, loading, error } = useApp();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.page}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={() => void refresh()}
              tintColor={C.green}
            />
          }
        >
          {back && (
            <Pressable
              accessibilityRole="button"
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            >
              <T style={{ color: C.green }}>← กลับ</T>
            </Pressable>
          )}
          <Title>{title}</Title>
          {!!error && (
            <Card>
              <T style={{ color: C.red }}>โหลดข้อมูลไม่สำเร็จ: {error}</T>
              <Button title="ลองโหลดใหม่" onPress={refresh} secondary />
            </Card>
          )}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function FileImage({
  path,
  height = 180,
}: {
  path: string | null | undefined;
  height?: number;
}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let alive = true;
    setUrl(undefined);
    const load = () => {
      if (path)
        signedUrl(path)
          .then((u) => {
            if (alive) setUrl(u);
          })
          .catch(() => {
            if (alive) setUrl(undefined);
          });
    };
    load();
    const timer = setInterval(load, 600000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [path]);
  return url ? (
    <Image
      source={{ uri: url }}
      style={{ width: '100%', height, borderRadius: 14, backgroundColor: C.card }}
      resizeMode="contain"
      onError={() => setUrl(undefined)}
    />
  ) : (
    <View
      style={{
        height: height / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: C.card,
        borderRadius: 14,
      }}
    >
      <Sub>{path ? 'ไม่สามารถแสดงรูปภาพ' : 'MedLink • เครื่องมือแพทย์'}</Sub>
    </View>
  );
}
export function EquipmentCard({ item }: { item: Equipment }) {
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/equipment/[id]', params: { id: item.id } })}
      accessibilityRole="button"
    >
      <Card>
        <Row>
          <T style={{ fontSize: 12, color: C.green }}>{item.code}</T>
          <T style={[s.badge, { color: item.status === 'ready' ? C.green : C.muted }]}>
            {statusLabels[item.status]}
          </T>
        </Row>
        <T style={{ fontSize: 17 }}>{item.name_th || item.name}</T>
        <Sub>
          {item.brand} {item.model} • {item.location}
        </Sub>
      </Card>
    </Pressable>
  );
}
export const s = StyleSheet.create({
  page: {
    paddingHorizontal: 16,
    paddingTop: 7,
    gap: 12,
    paddingBottom: 42,
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontSize: 24, fontFamily: 'PromptBold', lineHeight: 34 },
  sub: { fontSize: 11, color: C.muted, lineHeight: 18 },
  card: {
    backgroundColor: C.card,
    padding: 14,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: C.border,
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  button: {
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 14,
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontFamily: 'Prompt',
    fontSize: 12,
    color: C.ink,
    backgroundColor: '#fff',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  badge: { marginLeft: 'auto', fontSize: 11 },
});
