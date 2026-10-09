# SDK 57 validation

สมาชิก: อรุชา Front-end/UI Design/App Tester; ณัชภูมิ Back-end/UI Design/App Tester; พัชราวดี UI Design/สไลด์/App Tester; ณัฐพัชร์ Back-end/App Tester.

วิดีโอสาธิต: รอลิงก์จากทีมงาน (จะเพิ่มหลังการอัดคลิป)

APK SDK57 (EAS preview, versionCode 10): [ดาวน์โหลดจาก Expo](https://expo.dev/artifacts/eas/nDucvGyLHjjldB3lpFsCPzTXYU9oeTorUWur8B_S8h8.apk)  
SHA-256: `1c8b9f0b284b009cfc95c536880df730ccb6dfbfa5d2af1bf07dc2ab21ff9635`

Last verified: 2026-09-27. Project: Expo SDK 57.0.25 / React Native 0.86.3 / React 19.2.3.

## Passed

- `npm run typecheck` — TypeScript passed after adapting the scanner focus check to Expo Router's SDK 57 navigation API.
- `npm test` — all 17 tests passed.
- `npx expo install --check` — all installed modules match Expo SDK 57's local compatibility map.
- `npx expo-doctor` — 21/21 checks passed after removing SDK 54-only app config properties.
- `npm run build` — JavaScript bundles exported for iOS and Android. This verifies Metro bundling, not an interactive Expo Go session.
- Expo resolves the public URL and publishable key from `.env.local` and `.env`; both match the SDK 54 project configuration.
- Supabase Auth health endpoint returned HTTP 200 using the resolved publishable key. This confirms API connectivity, not an in-app user sign-in.
- `.env.admin` was not copied into this folder.

## Pending

- Expo Go SDK 57 was not launched on a device or simulator here, and the camera, uploads, Realtime, and role workflows need a live-device check.
- The SDK 54 app remains available separately in `../App`. This SDK 57 copy uses a separate slug, URL scheme, and iOS/Android bundle identifiers.
- `npm install` reports 16 moderate dependency advisories. Review with `npm audit` before a production release.
