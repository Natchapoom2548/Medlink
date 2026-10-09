# Security and build audit

ตรวจเมื่อ 2026-10-10 สำหรับ `App-sdk57` เท่านั้น

## ผ่าน

- TypeScript typecheck ผ่าน
- ชุดทดสอบ database/workflow และ utility ผ่าน 21 tests
- `.gitignore` กัน `.env*`, build cache, logs และไฟล์ลับ
- APK ที่สร้างรอบส่งมอบไม่พบไฟล์ `.env`, private key หรือ keystore จากรายการ ZIP (`MedLink-BME-SDK57-v1.0.0-logo-sdk57.apk`)
- Android ขอ CAMERA สำหรับสแกน QR; ไฟล์และคีย์ฝั่ง server ไม่ถูกฝังใน source client
- RLS ปิดการเขียนตารางหลักโดยตรง และ action สำคัญใช้ RPC ตรวจ role, สถานะ, row lock และ request id
- Storage เป็น private bucket และมี policy แยกสิทธิ์ upload/download/delete

## ต้องติดตาม

- `npm audit --omit=dev` พบ 33 รายการจาก dependency tree (critical 1, high 20, moderate 12) โดยส่วนใหญ่เป็นเครื่องมือ Expo/Metro ที่ใช้ตอน build; ต้องทบทวนแพตช์ที่รองรับ SDK 57 ก่อนอัปเกรด ห้ามใช้ `npm audit fix` อัตโนมัติเพราะอาจเปลี่ยน SDK
- Supabase Advisor เตือน `medlink_action` เป็น SECURITY DEFINER ที่ authenticated เรียกได้ ฟังก์ชันนี้ตั้งใจเป็น boundary ของ workflow แต่ควรทบทวนสิทธิ์และ `search_path` ก่อน production
- Supabase Advisor เตือน leaked password protection ปิดอยู่ ควรเปิดใน Auth settings ก่อนใช้งานจริง
- การตรวจ APK แบบลงอุปกรณ์จริงและการทดสอบ flow ผ่าน Expo Go ยังต้องทำบนเครื่อง Android ที่เชื่อมต่อได้

## การตรวจ APK รอบนี้

EAS Build สำเร็จสำหรับ SDK 57 ด้วย build `4bc3a788-cf44-4f03-8d2c-161410a2d47c` (versionCode 10) ผลิตจาก profile `preview`:

- ดาวน์โหลด: https://expo.dev/artifacts/eas/nDucvGyLHjjldB3lpFsCPzTXYU9oeTorUWur8B_S8h8.apk
- SHA-256: `1c8b9f0b284b009cfc95c536880df730ccb6dfbfa5d2af1bf07dc2ab21ff9635`
- ตรวจรายการไฟล์ ZIP และค้นหาชื่อ `service_role`, `SUPABASE_SECRET`, private key และ token แล้วไม่พบข้อมูลลับ
- bundle มีเฉพาะ client configuration ของ Supabase ที่จำเป็นต่อการเชื่อมต่อ แอปไม่ฝัง service-role/secret key

เครื่องพัฒนานี้ไม่มี `aapt`/`apkanalyzer` และไม่มีอุปกรณ์ Android ที่ ADB มองเห็น จึงยังตรวจค่าจาก binary manifest และติดตั้งทดสอบบนเครื่องจริงไม่ได้ ต้องทำสองรายการนี้ก่อนใช้งาน production

## การรับรองผล

ผลนี้เป็น security review ตาม source, tests, Supabase Advisor และ package audit ไม่ใช่ penetration test หรือการรับรองความปลอดภัยทางการแพทย์
