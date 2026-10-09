import { File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { Platform } from 'react-native';
import { client } from './supabase';
import { escapeHtml, normalizeUploadMime } from '../domain/utils';
export async function uploadFile(
  uri: string,
  name: string,
  mime: string,
  scope: { equipment_id?: string; conversation_id?: string; is_avatar?: boolean },
  webSource?: Blob,
) {
  let uploadBody: Blob | ArrayBuffer;
  let fileSize: number;
  if (Platform.OS === 'web') {
    let browserFile = webSource;
    if (!browserFile) {
      const response = await fetch(uri);
      if (!response.ok) throw new Error('ไม่สามารถอ่านไฟล์ที่เลือกได้');
      browserFile = await response.blob();
    }
    fileSize = browserFile.size;
    uploadBody = browserFile;
  } else {
    const nativeFile = new File(uri);
    fileSize = nativeFile.size;
    uploadBody = await nativeFile.arrayBuffer();
  }
  if (fileSize > 10 * 1024 * 1024) throw new Error('ไฟล์ต้องไม่เกิน 10 MB');
  const contentType = normalizeUploadMime(name, mime);
  const {
    data: { user },
    error,
  } = await client().auth.getUser();
  if (error || !user) throw new Error('กรุณาเข้าสู่ระบบใหม่');
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${user.id}/${Crypto.randomUUID()}/${safe || 'attachment'}`;
  const { error: uploadError } = await client()
    .storage.from('medlink-files')
    .upload(path, uploadBody, { contentType, upsert: false });
  if (uploadError) throw uploadError;
  const { data, error: registerError } = await client().rpc('medlink_action', {
    p_action: 'register_attachment',
    p_payload: { path, name, mime_type: contentType, ...scope },
    p_request_id: Crypto.randomUUID(),
  });
  if (registerError) {
    await client().storage.from('medlink-files').remove([path]);
    throw registerError;
  }
  return { id: data.id as string, path };
}
export async function signedUrl(path: string) {
  const { data, error } = await client().storage.from('medlink-files').createSignedUrl(path, 900);
  if (error) throw error;
  return data.signedUrl;
}
export async function shareFile(path: string, name: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const tab = window.open('about:blank', '_blank');
    try {
      const url = await signedUrl(path);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (error) {
      tab?.close();
      throw error;
    }
    return;
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('อุปกรณ์นี้ไม่รองรับการแชร์ไฟล์');
  const dirName = Crypto.randomUUID() + '-' + name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const file = await File.downloadFileAsync(await signedUrl(path), new File(Paths.cache, dirName));
  try {
    await Sharing.shareAsync(file.uri);
  } finally {
    if (file.exists) file.delete();
  }
}
export async function shareTextFile(name: string, text: string) {
  const file = new File(Paths.cache, Crypto.randomUUID() + '-' + name);
  file.write(text);
  try {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      UTI: 'public.comma-separated-values-text',
    });
  } finally {
    if (file.exists) file.delete();
  }
}
export async function printReport(title: string, rows: [string, unknown][]) {
  const html = `<html><head><meta charset="utf-8"/></head><body><h1>${escapeHtml(title)}</h1><table>${rows.map(([label, value]) => `<tr><th style="text-align:left;padding:8px">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</table></body></html>`;
  const { uri } = await Print.printToFileAsync({ html });
  try {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  } finally {
    const file = new File(uri);
    if (file.exists) file.delete();
  }
}
