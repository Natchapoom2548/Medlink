import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
export const configured =
  /^https?:\/\//.test(url) && key.length > 20 && !url.includes('YOUR_') && !key.includes('YOUR_');
// Chunk sessions so large JWTs do not exceed SecureStore's per-value size limits.
const storage = {
  async getItem(name: string) {
    const meta = await SecureStore.getItemAsync(name);
    if (!meta) return null;
    try {
      const { id, count } = JSON.parse(meta);
      const parts = await Promise.all(
        Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${name}.${id}.${i}`)),
      );
      return parts.some((x) => x === null) ? null : parts.join('');
    } catch {
      return null;
    }
  },
  async setItem(name: string, value: string) {
    const old = await SecureStore.getItemAsync(name);
    const id = Crypto.randomUUID();
    const parts = value.match(/[\s\S]{1,600}/g) ?? [''];
    await Promise.all(parts.map((part, i) => SecureStore.setItemAsync(`${name}.${id}.${i}`, part)));
    await SecureStore.setItemAsync(name, JSON.stringify({ id, count: parts.length }));
    if (old) {
      try {
        const meta = JSON.parse(old);
        await Promise.all(
          Array.from({ length: meta.count }, (_, i) =>
            SecureStore.deleteItemAsync(`${name}.${meta.id}.${i}`),
          ),
        );
      } catch {
        /* previous orphan chunks never invalidate the new session */
      }
    }
  },
  async removeItem(name: string) {
    const old = await SecureStore.getItemAsync(name);
    await SecureStore.deleteItemAsync(name);
    if (old) {
      try {
        const meta = JSON.parse(old);
        await Promise.all(
          Array.from({ length: meta.count }, (_, i) =>
            SecureStore.deleteItemAsync(`${name}.${meta.id}.${i}`),
          ),
        );
      } catch {
        /* absent metadata */
      }
    }
  },
};
export const supabase = configured
  ? createClient(url, key, {
      auth: {
        // On web, Supabase uses localStorage (or memory when storage is unavailable).
        // SecureStore's native methods are not implemented on web.
        ...(Platform.OS !== 'web' ? { storage } : {}),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
export function client() {
  if (!supabase) throw new Error('ยังไม่ได้ตั้งค่า Supabase');
  return supabase;
}
