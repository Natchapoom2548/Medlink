export function thaiDate(value?: string | null, time = false): string {
  if (!value) return '—';
  const d = new Date(value.length === 10 ? `${value}T12:00:00+07:00` : value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('th-TH', {
        timeZone: 'Asia/Bangkok',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...(time ? { hour: '2-digit' as const, minute: '2-digit' as const } : {}),
      });
}
export function todayISO(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function addDays(date: string, count: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + count);
  return d.toISOString().slice(0, 10);
}
export function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}
export function scanMatches(scanned: string, expected: string): boolean {
  return normalizeCode(scanned) === normalizeCode(expected) && !!normalizeCode(expected);
}
const uploadMimeByExtension: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const allowedUploadMimes = new Set(Object.values(uploadMimeByExtension));
export function normalizeUploadMime(name: string, mime?: string | null): string {
  const normalized = (mime ?? '').split(';', 1)[0].trim().toLowerCase();
  if (allowedUploadMimes.has(normalized)) return normalized;
  const extension = name.toLowerCase().split('.').pop() ?? '';
  const inferred = uploadMimeByExtension[extension];
  if (inferred) return inferred;
  throw new Error('รองรับเฉพาะไฟล์ JPG, PNG, WebP, PDF, DOC และ DOCX');
}
export function csv(headers: string[], rows: unknown[][]): string {
  const cell = (value: unknown) => {
    let s = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'ดำเนินการไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อและลองใหม่';
}
