import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Redirect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { C, T } from '../src/components/ui';
import { configured, client } from '../src/lib/supabase';
import { errorMessage } from '../src/domain/utils';
import { useApp } from '../src/state/AppProvider';
import { BrandLogo } from '../src/components/BrandLogo';

export default function Login() {
  const { session, profile, initializing } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState('');

  if (session && profile?.active) return <Redirect href="/(tabs)" />;

  const signIn = async () => {
    setLoginError('');
    setBusy(true);
    try {
      const { error } = await client().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      setPassword('');
    } catch (error) {
      setLoginError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id="loginBackground" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FAF8F5" />
            <Stop offset="0.52" stopColor="#F3EDE6" />
            <Stop offset="1" stopColor="#E9DFD5" />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#loginBackground)" />
      </Svg>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.topBar}>
              <View style={styles.securityLabel}>
                <View style={styles.liveDot} />
                <T style={styles.securityText}>ระบบความปลอดภัยชีวภาพสูง</T>
              </View>
              <View style={styles.versionPill}>
                <T style={styles.versionText}>v2.4.0 (Hospital Secure)</T>
              </View>
            </View>

            <View style={styles.brand}>
              <BrandLogo width={210} />
              <T style={styles.brandSubtitle}>
                ระบบบริหารจัดการเครื่องมือแพทย์ประจำโรงพยาบาล
              </T>
            </View>

            <View style={styles.formCard}>
              {!configured ? (
                <View style={styles.setupNotice}>
                  <T style={styles.setupTitle}>ตั้งค่าการเชื่อมต่อก่อนเริ่มใช้งาน</T>
                  <T style={styles.setupText}>
                    ยังไม่มีโปรเจกต์ Supabase เชื่อมต่อ กรุณาตรวจค่า Project URL และ publishable key ในไฟล์ .env
                  </T>
                </View>
              ) : initializing ? (
                <View style={styles.loading}>
                  <ActivityIndicator color={C.green} />
                  <T style={styles.loadingText}>กำลังตรวจสอบบัญชี…</T>
                </View>
              ) : session ? (
                <View style={styles.setupNotice}>
                  <T style={styles.setupTitle}>
                    {profile && !profile.active ? 'บัญชีนี้ถูกระงับ' : 'ยังไม่พบโปรไฟล์ผู้ใช้'}
                  </T>
                  <T style={styles.setupText}>กรุณาติดต่อฝ่าย BME เพื่อตรวจสอบสิทธิ์บัญชี</T>
                </View>
              ) : (
                <>
                  <View style={styles.fieldGroup}>
                    <T style={styles.fieldLabel}>รหัสบุคลากร / อีเมลโรงพยาบาล</T>
                    <View style={styles.inputWrap}>
                      <Ionicons name="person-outline" size={19} color="#8F7C68" />
                      <TextInput
                        accessibilityLabel="อีเมลโรงพยาบาล"
                        value={email}
                        onChangeText={setEmail}
                        placeholder="ระบุอีเมลโรงพยาบาล"
                        placeholderTextColor="#93877B"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        keyboardType="email-address"
                        returnKeyType="next"
                        style={styles.input}
                      />
                    </View>
                  </View>

                  <View style={styles.fieldGroup}>
                    <T style={styles.fieldLabel}>รหัสผ่านความปลอดภัย</T>
                    <View style={styles.inputWrap}>
                      <Ionicons name="lock-closed-outline" size={19} color="#8F7C68" />
                      <TextInput
                        accessibilityLabel="รหัสผ่าน"
                        value={password}
                        onChangeText={setPassword}
                        placeholder="รหัสผ่าน"
                        placeholderTextColor="#93877B"
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoComplete="current-password"
                        returnKeyType="go"
                        onSubmitEditing={() => void signIn()}
                        style={styles.input}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                        onPress={() => setShowPassword((value) => !value)}
                        hitSlop={10}
                      >
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={19}
                          color="#8F7C68"
                        />
                      </Pressable>
                    </View>
                  </View>

                  {!!loginError && (
                    <View style={styles.errorNotice}>
                      <Ionicons name="alert-circle-outline" size={17} color="#A62E30" />
                      <T style={styles.errorText}>{loginError}</T>
                    </View>
                  )}

                  <Pressable
                    accessibilityRole="button"
                    disabled={!email.trim() || !password || busy}
                    onPress={() => void signIn()}
                    style={({ pressed }) => [
                      styles.submitButton,
                      (!email.trim() || !password || busy) && styles.submitDisabled,
                      pressed && { backgroundColor: '#3D352E' },
                    ]}
                  >
                    {busy ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <T style={styles.submitText}>เข้าสู่ระบบ MedLink</T>
                        <Ionicons name="arrow-forward" size={17} color="#fff" />
                      </>
                    )}
                  </Pressable>

                  <View style={styles.divider}>
                    <View style={styles.dividerLine} />
                    <T style={styles.dividerText}>หรือยืนยันตัวตนชีวภาพ</T>
                    <View style={styles.dividerLine} />
                  </View>

                  <View style={styles.bioRow}>
                    <View style={[styles.bioButton, styles.faceButton]}>
                      <Ionicons name="scan-outline" size={21} color="#fff" />
                      <View style={styles.bioCopy}>
                        <T style={styles.bioTitle}>สแกนใบหน้า</T>
                        <T style={styles.bioSubtitle}>Face Recognition · เร็ว ๆ นี้</T>
                      </View>
                    </View>
                    <View style={[styles.bioButton, styles.fingerprintButton]}>
                      <Ionicons name="finger-print-outline" size={22} color={C.ink} />
                      <View style={styles.bioCopy}>
                        <T style={styles.fingerprintTitle}>สแกนนิ้วมือ</T>
                        <T style={styles.fingerprintSubtitle}>Fingerprint ID · เร็ว ๆ นี้</T>
                      </View>
                    </View>
                  </View>
                </>
              )}
            </View>

            <T style={styles.footer}>
              🏥 โรงพยาบาลศูนย์การแพทย์ MedLink — ความปลอดภัยข้อมูลบุคลากรทางการแพทย์
            </T>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3EDE6' },
  safe: { flex: 1 },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 13,
  },
  topBar: {
    width: '100%',
    maxWidth: 460,
    minHeight: 25,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  securityLabel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.green },
  securityText: { fontSize: 10, fontFamily: 'PromptBold', color: C.green },
  versionPill: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 20,
    backgroundColor: '#EFE9E3',
    borderWidth: 1,
    borderColor: C.border,
  },
  versionText: { fontSize: 8, color: '#8F7C68' },
  brand: { alignItems: 'center', width: '100%', marginTop: 1, marginBottom: 2 },
  logoWrap: { width: 91, height: 91, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  logoGlow: {
    position: 'absolute',
    width: 84,
    height: 84,
    borderRadius: 28,
    backgroundColor: C.accent,
    opacity: 0.62,
    transform: [{ rotate: '8deg' }],
  },
  logoBadge: {
    width: 78,
    height: 78,
    borderRadius: 25,
    backgroundColor: C.ink,
    borderWidth: 2,
    borderColor: '#C9B59C99',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2B2621',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  faceBadge: {
    position: 'absolute',
    right: -7,
    bottom: -5,
    width: 27,
    height: 27,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.green,
    borderWidth: 2,
    borderColor: '#fff',
  },
  brandTitle: { fontSize: 25, lineHeight: 34, fontFamily: 'PromptBold', letterSpacing: -0.4 },
  brandSubtitle: { fontSize: 10, color: C.muted, letterSpacing: 0.15, textAlign: 'center' },
  formCard: {
    width: '100%',
    maxWidth: 460,
    padding: 17,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: '#FFFFFFE8',
    gap: 11,
    shadowColor: '#2B2621',
    shadowOpacity: 0.09,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  fieldGroup: { gap: 5 },
  fieldLabel: { fontSize: 10, fontFamily: 'PromptBold', color: C.ink },
  inputWrap: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.bg,
  },
  input: { flex: 1, minWidth: 0, height: 46, paddingVertical: 8, fontFamily: 'Prompt', fontSize: 11, color: C.ink },
  errorNotice: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'center',
    padding: 9,
    backgroundColor: '#FCE8E8',
    borderWidth: 1,
    borderColor: '#E6B7B7',
    borderRadius: 12,
  },
  errorText: { flex: 1, color: '#A62E30', fontSize: 10 },
  submitButton: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: C.ink,
    borderRadius: 15,
    marginTop: 1,
  },
  submitDisabled: { opacity: 0.55 },
  submitText: { fontSize: 11, fontFamily: 'PromptBold', color: '#fff' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 1 },
  dividerLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.border },
  dividerText: { color: '#8F7C68', fontSize: 9, fontFamily: 'PromptBold' },
  bioRow: { flexDirection: 'row', gap: 8 },
  bioButton: {
    flex: 1,
    minHeight: 53,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 6,
    paddingVertical: 7,
    opacity: 0.82,
  },
  faceButton: { backgroundColor: C.green, borderColor: '#FFFFFF55' },
  fingerprintButton: { backgroundColor: '#EFE9E3', borderColor: C.border },
  bioCopy: { gap: 1 },
  bioTitle: { color: '#fff', fontSize: 10, fontFamily: 'PromptBold', lineHeight: 15 },
  bioSubtitle: { color: '#E3F0E9', fontSize: 7 },
  fingerprintTitle: { color: C.ink, fontSize: 10, fontFamily: 'PromptBold', lineHeight: 15 },
  fingerprintSubtitle: { color: C.muted, fontSize: 7 },
  loading: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 9 },
  loadingText: { color: C.muted, fontSize: 11 },
  setupNotice: { gap: 7, paddingVertical: 18 },
  setupTitle: { fontSize: 14, fontFamily: 'PromptBold' },
  setupText: { color: C.muted, fontSize: 10, lineHeight: 17 },
  footer: {
    width: '100%',
    maxWidth: 460,
    color: '#8F7C68',
    fontSize: 8,
    lineHeight: 14,
    textAlign: 'center',
  },
});
