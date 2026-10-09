import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  csv,
  escapeHtml,
  normalizeCode,
  normalizeUploadMime,
  scanMatches,
  todayISO,
  validDate,
} from '../src/domain/utils';
test('Thai calendar boundary uses Bangkok rather than UTC', () => {
  assert.equal(todayISO(new Date('2026-09-24T18:00:00Z')), '2026-09-25');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
test('upload MIME is inferred for IPM files when the picker omits or changes it', () => {
  assert.equal(normalizeUploadMime('ใบตรวจ IPM.PDF'), 'application/pdf');
  assert.equal(normalizeUploadMime('photo.jpg', 'image/jpg'), 'image/jpeg');
  assert.equal(
    normalizeUploadMime('report.docx'),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  assert.throws(() => normalizeUploadMime('malware.exe'), /รองรับเฉพาะไฟล์/);
});
test('scanner normalizes known codes but never verifies another machine', () => {
  assert.equal(normalizeCode(' eq-00092 '), 'EQ-00092');
  assert.equal(scanMatches('eq-00092', 'EQ-00092'), true);
  assert.equal(scanMatches('EQ-00093', 'EQ-00092'), false);
  assert.equal(scanMatches('', ''), false);
});
test('CSV preserves Thai, quotes, newlines and prevents formula execution', () => {
  const output = csv(['ชื่อ'], [['เครื่อง "A"'], ['=HYPERLINK("x")'], [' line\nbreak']]);
  assert.ok(output.startsWith('\uFEFF'));
  assert.ok(output.includes('"เครื่อง ""A"""'));
  assert.ok(output.includes('"\'=HYPERLINK'));
  assert.ok(output.includes('line\nbreak'));
});
test('report text is HTML escaped and dates reject overflow', () => {
  assert.equal(escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;');
  assert.equal(validDate('2026-02-30'), false);
  assert.equal(validDate('2024-02-29'), true);
});
