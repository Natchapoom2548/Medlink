import React, { useEffect, useRef, useState } from 'react';
import { AppState, Linking, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { useIsFocused } from 'expo-router/react-navigation';
import { router, useLocalSearchParams } from 'expo-router';
import { Button, Card, Field, Page, Sub, T } from '../src/components/ui';
import { normalizeCode, scanMatches } from '../src/domain/utils';
import { useApp } from '../src/state/AppProvider';
export default function Scanner() {
  const { data } = useApp();
  const { id, purpose } = useLocalSearchParams<{ id?: string; purpose?: string }>();
  const target = data.equipment.find((e) => e.id === id);
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false),
    [manual, setManual] = useState(''),
    [error, setError] = useState(''),
    [active, setActive] = useState(AppState.currentState === 'active'),
    [cameraError, setCameraError] = useState('');
  const lock = useRef(false);
  const focused = useIsFocused();
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    lock.current = false;
    setError('');
    setTorch(false);
  }, [focused, id]);
  function foundCode(raw: string, fromCamera: boolean) {
    if (lock.current) return;
    lock.current = true;
    const code = normalizeCode(raw),
      eq = data.equipment.find((e) => e.code === code);
    if (!eq) {
      setError(`ไม่พบเครื่องรหัส ${code.slice(0, 80)}`);
      return;
    }
    if (purpose === 'return') {
      if (!fromCamera || !target || !scanMatches(code, target.code)) {
        setError('รหัสไม่ตรงกับเครื่องที่จะรับคืน');
        return;
      }
      router.replace({
        pathname: '/workflow',
        params: { kind: 'return', id: target.id, scanned: code },
      });
    } else if (purpose === 'issue-return') {
      if (!fromCamera || !target || !scanMatches(code, target.code)) {
        setError('รหัสไม่ตรงกับเครื่องที่ถูกรายงาน');
        return;
      }
      router.replace({
        pathname: '/workflow',
        params: { kind: 'receive_issue', id: target.id, scanned: code },
      });
    } else if (purpose === 'repair-pickup') {
      if (!fromCamera || !target || !scanMatches(code, target.code)) {
        setError('รหัสไม่ตรงกับเครื่องที่ได้รับมอบหมาย');
        return;
      }
      router.replace({
        pathname: '/workflow',
        params: { kind: 'confirm_pickup', id: target.id, scanned: code },
      });
    } else router.push({ pathname: '/equipment/[id]', params: { id: eq.id } });
  }
  return (
    <Page
      title={
        purpose === 'return'
          ? 'สแกนรับคืนเครื่อง'
          : purpose === 'issue-return'
            ? 'สแกนรับเครื่องที่มีปัญหา'
            : purpose === 'repair-pickup'
              ? 'สแกนรับเครื่องไปซ่อม'
              : 'สแกนเครื่องมือ'
      }
      back
    >
      {target && (
        <Card>
          <T>เครื่องที่ต้องสแกน: {target.code}</T>
          <Sub>{target.name_th || target.name}</Sub>
        </Card>
      )}
      {!permission?.granted ? (
        <Card>
          <T>ต้องอนุญาตกล้องเพื่อสแกน QR / บาร์โค้ด</T>
          <Button
            title={permission?.canAskAgain === false ? 'เปิดการตั้งค่า' : 'อนุญาตกล้อง'}
            onPress={() =>
              permission?.canAskAgain === false ? Linking.openSettings() : requestPermission()
            }
          />
        </Card>
      ) : (
        <>
          {!!cameraError && (
            <Card>
              <T>{cameraError}</T>
              <Button title="เปิดกล้องใหม่" onPress={() => setCameraError('')} secondary />
            </Card>
          )}
          <View
            style={{
              height: 330,
              borderRadius: 20,
              overflow: 'hidden',
              backgroundColor: '#201C18',
            }}
          >
            {focused && active && !cameraError && (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                enableTorch={torch}
                barcodeScannerSettings={{
                  barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8'],
                }}
                onBarcodeScanned={(result: BarcodeScanningResult) => foundCode(result.data, true)}
                onMountError={() => setCameraError('เปิดกล้องไม่สำเร็จ กรุณาลองใหม่')}
              />
            )}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: 65,
                left: '15%',
                width: '70%',
                height: 200,
                borderWidth: 2,
                borderColor: '#C9B59C',
                borderRadius: 20,
              }}
            />
          </View>
          <Button
            secondary
            title={torch ? 'ปิดแฟลช' : 'เปิดแฟลช'}
            onPress={() => setTorch((v) => !v)}
          />
        </>
      )}
      {!!error && (
        <Card>
          <T>{error}</T>
          <Button
            title="สแกนใหม่"
            onPress={() => {
              lock.current = false;
              setError('');
            }}
          />
        </Card>
      )}
      {!['return', 'issue-return', 'repair-pickup'].includes(purpose ?? '') && (
        <>
          <Field
            label="หรือค้นหาด้วยรหัสเครื่อง เช่น EQ-00092"
            value={manual}
            onChangeText={setManual}
            autoCapitalize="characters"
          />
          <Button
            secondary
            title="ค้นหารหัส"
            disabled={!manual.trim()}
            onPress={() => {
              lock.current = false;
              foundCode(manual, false);
            }}
          />
        </>
      )}
      <Sub>
        {purpose === 'return'
          ? 'การรับคืนต้องสแกนด้วยกล้องให้ตรงกับเครื่องที่เลือก'
          : purpose === 'issue-return'
            ? 'BME ต้องสแกนเครื่องจริงก่อนรับเครื่องเข้าสถานะส่งซ่อม'
            : 'สแกน QR ที่สร้างจากหน้าเครื่องมือเพื่อเปิดรายละเอียด'}
      </Sub>
    </Page>
  );
}
