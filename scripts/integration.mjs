import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
const {
  SUPABASE_TEST_URL: url,
  SUPABASE_TEST_PUBLISHABLE_KEY: key,
  SUPABASE_TEST_SERVICE_ROLE_KEY: secret,
  MEDLINK_INTEGRATION_TEST,
} = process.env;
if (MEDLINK_INTEGRATION_TEST !== '1' || !url || !key || !secret || url.includes('YOUR_'))
  throw new Error('Configure .env.test for a dedicated Supabase test project');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, options),
  users = [],
  equipment = [],
  files = [];
let channel;
function ok(result) {
  if (result.error) throw result.error;
  return result.data;
}
const action = (user, name, payload, request = randomUUID()) =>
  user.client.rpc('medlink_action', { p_action: name, p_payload: payload, p_request_id: request });
try {
  const suffix = randomUUID().slice(0, 8);
  for (const role of ['bme', 'nurse', 'nurse', 'technician']) {
    const email = `medlink-test-${suffix}-${users.length}@example.com`,
      password = `Test-${randomUUID()}!`;
    const auth = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
    const user = { id: auth.user.id, role, client: createClient(url, key, options) };
    users.push(user);
    ok(
      await admin
        .from('profiles')
        .insert({
          id: user.id,
          email,
          staff_id: `TEST-${suffix}-${users.length}`,
          name: `Integration ${role}`,
          role,
          department: 'TEST',
        }),
    );
    ok(await user.client.auth.signInWithPassword({ email, password }));
  }
  const [bme, nurse, other, tech] = users;
  for (let i = 0; i < 2; i++) {
    const e = ok(
      await admin
        .from('equipment')
        .insert({
          code: `EQ-TEST-${suffix.toUpperCase()}-${i}`,
          name: 'Integration test inventory',
        })
        .select()
        .single(),
    );
    equipment.push(e);
  }
  const d = new Date();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  d.setDate(d.getDate() + 3);
  const due = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const borrow = {
    equipment_id: equipment[0].id,
    department: 'TEST',
    borrow_date: today,
    return_date: due,
  };
  const races = await Promise.all([
    action(nurse, 'request_borrow', borrow),
    action(other, 'request_borrow', borrow),
  ]);
  assert.equal(
    races.filter((r) => !r.error).length,
    1,
    'Exactly one concurrent borrower must succeed',
  );
  const winner = races[0].error ? other : nurse,
    loser = winner === nurse ? other : nurse;
  assert.equal(
    ok(await loser.client.from('loans').select('*').eq('equipment_id', equipment[0].id)).length,
    0,
    'RLS must hide another user’s loan',
  );
  assert.ok(
    (await action(loser, 'approve_borrow', { equipment_id: equipment[0].id })).error,
    'Nurse cannot approve',
  );
  ok(await action(bme, 'approve_borrow', { equipment_id: equipment[0].id }));
  const request = randomUUID(),
    returnPayload = {
      equipment_id: equipment[0].id,
      scanned_code: equipment[0].code,
      location: 'MEU',
      checks: { cleaned: true, accessories: true, battery: true },
    };
  assert.ok(
    (await action(bme, 'return_equipment', { ...returnPayload, scanned_code: equipment[1].code }))
      .error,
    'Wrong QR must fail',
  );
  const returns = await Promise.all([
    action(bme, 'return_equipment', returnPayload, request),
    action(bme, 'return_equipment', returnPayload, request),
  ]);
  returns.forEach(ok);
  assert.equal(
    ok(
      await admin
        .from('activities')
        .select('*')
        .eq('equipment_id', equipment[0].id)
        .eq('action', 'return_equipment'),
    ).length,
    1,
    'Retry must not duplicate history',
  );
  const pm = ok(
    await action(bme, 'dispatch_pm', {
      equipment_id: equipment[1].id,
      assigned_to: tech.id,
      mode: 'onsite',
      target_date: today,
    }),
  );
  ok(
    await action(tech, 'complete_pm', {
      equipment_id: equipment[1].id,
      task_id: pm.id,
      inspection_date: today,
      due_date: due,
      checks: { cleaned: true, cables: true, electrical: true, calibration: true, battery: true },
    }),
  );
  assert.equal(
    ok(await admin.from('equipment').select('status').eq('id', equipment[1].id).single()).status,
    'ready',
  );
  const room = ok(await action(winner, 'open_chat', {}));
  let resolveEvent;
  const received = new Promise((resolve) => {
    resolveEvent = resolve;
  });
  channel = bme.client
    .channel(`integration-${suffix}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${room.id}`,
      },
      () => resolveEvent(true),
    );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscription timed out')), 15000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      }
      if (status === 'CHANNEL_ERROR') {
        clearTimeout(timer);
        reject(new Error('Realtime channel error'));
      }
    });
  });
  ok(
    await action(winner, 'send_message', {
      conversation_id: room.id,
      body: 'Realtime integration message',
    }),
  );
  let timeout;
  try {
    assert.equal(
      await Promise.race([
        received,
        new Promise((resolve) => {
          timeout = setTimeout(() => resolve(false), 15000);
        }),
      ]),
      true,
      'BME must receive Realtime message',
    );
  } finally {
    clearTimeout(timeout);
  }
  assert.equal(
    ok(await loser.client.from('messages').select('*').eq('conversation_id', room.id)).length,
    0,
  );
  const image = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=',
    'base64',
  );
  const path = `${winner.id}/${randomUUID()}/test.png`;
  files.push(path);
  ok(
    await winner.client.storage
      .from('medlink-files')
      .upload(path, image, { contentType: 'image/png' }),
  );
  const attachment = ok(
    await action(winner, 'register_attachment', {
      path,
      name: 'test.png',
      mime_type: 'image/png',
      conversation_id: room.id,
    }),
  );
  ok(
    await action(winner, 'send_message', {
      conversation_id: room.id,
      body: '',
      attachment_id: attachment.id,
    }),
  );
  assert.ok(
    (await loser.client.storage.from('medlink-files').createSignedUrl(path, 60)).error,
    'Other nurse cannot get file URL',
  );
  ok(await bme.client.storage.from('medlink-files').createSignedUrl(path, 60));
  console.log(
    'PASS: concurrent loans, idempotent returns, RBAC, PM, Realtime chat and private Storage',
  );
} finally {
  if (channel && users[0]) await users[0].client.removeChannel(channel);
  const ids = users.map((u) => u.id),
    eqIds = equipment.map((e) => e.id);
  const cleanup = [];
  async function remove(table, column, values) {
    if (values.length) {
      const result = await admin.from(table).delete().in(column, values);
      if (result.error) cleanup.push(`${table}: ${result.error.message}`);
    }
  }
  await remove('notifications', 'recipient_id', ids);
  await remove('conversation_reads', 'user_id', ids);
  await remove('messages', 'sender_id', ids);
  await remove('attachments', 'owner_id', ids);
  if (files.length) {
    const result = await admin.storage.from('medlink-files').remove(files);
    if (result.error) cleanup.push(result.error.message);
  }
  await remove('conversations', 'owner_id', ids);
  await remove('favorites', 'user_id', ids);
  await remove('activities', 'actor_id', ids);
  await remove('pm_tasks', 'equipment_id', eqIds);
  await remove('loans', 'equipment_id', eqIds);
  await remove('equipment', 'id', eqIds);
  await remove('profiles', 'id', ids);
  for (const u of users) {
    const result = await admin.auth.admin.deleteUser(u.id);
    if (result.error) cleanup.push(result.error.message);
    await u.client.auth.signOut();
  }
  if (cleanup.length) {
    console.error('Test fixture cleanup needs attention:', cleanup.join('\n'));
    process.exitCode = 1;
  }
}
