import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
const ids = { bme: randomUUID(), nurse: randomUUID(), other: randomUUID(), tech: randomUUID() };
test('PostgreSQL migrations, role policies and atomic equipment workflows', async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;
 create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text,metadata jsonb);
 alter table storage.objects enable row level security;
 grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;`);
    await db.exec(await readFile('supabase/migrations/202609250001_core.sql', 'utf8'));
    await db.exec(await readFile('supabase/migrations/202609250002_services.sql', 'utf8'));
    await db.exec(
      await readFile('supabase/migrations/20261003013951_nurse_return_requests.sql', 'utf8'),
    );
    await db.exec(
      await readFile(
        'supabase/migrations/20261006134415_fix_current_loan_issue_report.sql',
        'utf8',
      ),
    );
    await db.exec(
      await readFile('supabase/migrations/20261006190000_role_workflow_review.sql', 'utf8'),
    );
    await db.exec(
      await readFile(
        'supabase/migrations/20261006193000_enforce_reported_equipment_receipt.sql',
        'utf8',
      ),
    );
    await db.exec(await readFile('supabase/seed.sql', 'utf8'));
    for (const [name, id] of Object.entries(ids)) {
      await db.query('insert into auth.users values($1)', [id]);
      await db.query(
        'insert into public.profiles(id,email,staff_id,name,role) values($1,$2,$3,$3,$4)',
        [
          id,
          `${name}@example.com`,
          name,
          name === 'other' ? 'nurse' : name === 'tech' ? 'technician' : name,
        ],
      );
    }
    const eq = (
      await db.query<{ id: string; code: string }>(
        'select id,code from equipment order by code limit 1',
      )
    ).rows[0];
    const eq2 = (
      await db.query<{ id: string; code: string }>(
        'select id,code from equipment order by code offset 1 limit 1',
      )
    ).rows[0];
    const eq3 = (
      await db.query<{ id: string; code: string }>(
        'select id,code from equipment order by code offset 2 limit 1',
      )
    ).rows[0];
    const date = (
      await db.query<{ day: string }>(
        "select to_char(now() at time zone 'Asia/Bangkok','YYYY-MM-DD') as day",
      )
    ).rows[0].day;
    const tomorrow = (
      await db.query<{ day: string }>(
        "select to_char((now() at time zone 'Asia/Bangkok')+interval '1 day','YYYY-MM-DD') as day",
      )
    ).rows[0].day;
    async function as<T>(uid: string, fn: () => Promise<T>): Promise<T> {
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
      try {
        return await fn();
      } finally {
        await db.exec('reset role');
      }
    }
    async function action(
      uid: string,
      kind: string,
      payload: Record<string, unknown>,
      request = randomUUID(),
    ) {
      return as(uid, () =>
        db.query<{ result: { id: string } }>(
          'select public.medlink_action($1,$2::jsonb,$3::uuid) as result',
          [kind, JSON.stringify(payload), request],
        ),
      );
    }
    const borrow = {
      equipment_id: eq.id,
      department: 'ICU',
      borrow_date: date,
      return_date: tomorrow,
    };
    await t.test('unauthenticated and direct client state writes are denied', async () => {
      await db.exec('set role anon');
      try {
        await assert.rejects(db.query('select * from equipment'));
      } finally {
        await db.exec('reset role');
      }
      await as(ids.nurse, async () => {
        await assert.rejects(
          db.query("update equipment set status='borrowed' where id=$1", [eq.id]),
        );
        await assert.rejects(db.query("update profiles set role='bme' where id=$1", [ids.nurse]));
      });
    });
    await t.test('borrowing is idempotent and refuses a second borrower', async () => {
      const request = randomUUID();
      const first = await action(ids.nurse, 'request_borrow', borrow, request);
      const second = await action(ids.nurse, 'request_borrow', borrow, request);
      assert.equal(first.rows[0].result.id, second.rows[0].result.id);
      await assert.rejects(action(ids.other, 'request_borrow', borrow), /ไม่พร้อม/);
      assert.equal((await db.query('select * from loans')).rows.length, 1);
      assert.equal(
        (await db.query("select * from activities where action='request_borrow'")).rows.length,
        1,
      );
    });
    await t.test('only BME approves; unrelated nurses cannot read the loan', async () => {
      await assert.rejects(
        action(ids.nurse, 'approve_borrow', { equipment_id: eq.id }),
        /เฉพาะ BME/,
      );
      assert.equal((await as(ids.other, () => db.query('select * from loans'))).rows.length, 0);
      await action(ids.bme, 'approve_borrow', { equipment_id: eq.id });
      assert.equal(
        (await db.query<{ status: string }>('select status from equipment where id=$1', [eq.id]))
          .rows[0].status,
        'borrowed',
      );
    });
    await t.test(
      'nurse return request only notifies BME and leaves loan and equipment borrowed',
      async () => {
        const before = (
          await db.query<{ status: string }>('select status from equipment where id=$1', [eq.id])
        ).rows[0].status;
        await action(ids.nurse, 'request_return', { equipment_id: eq.id });
        assert.equal(
          (await db.query<{ status: string }>('select status from equipment where id=$1', [eq.id]))
            .rows[0].status,
          before,
        );
        assert.equal(
          (
            await db.query<{ status: string; requested: boolean }>(
              'select status, return_requested_at is not null as requested from loans where equipment_id=$1',
              [eq.id],
            )
          ).rows[0].requested,
          true,
        );
        assert.ok(
          (await db.query("select * from notifications where title='แจ้งขอคืนเครื่อง'")).rows
            .length > 0,
        );
      },
    );
    await t.test(
      'PM cannot overwrite a borrowed machine; mismatched return scan rolls back',
      async () => {
        await assert.rejects(
          action(ids.bme, 'dispatch_pm', {
            equipment_id: eq.id,
            assigned_to: ids.tech,
            mode: 'onsite',
            target_date: date,
          }),
          /ไม่พร้อม/,
        );
        await assert.rejects(
          action(ids.bme, 'return_equipment', {
            equipment_id: eq.id,
            scanned_code: eq2.code,
            checks: { cleaned: true, accessories: true, battery: true },
            location: 'MEU',
          }),
          /ไม่ตรง/,
        );
        await assert.rejects(
          action(ids.bme, 'return_equipment', {
            equipment_id: eq.id,
            scanned_code: eq.code,
            checks: { cleaned: true },
            location: 'MEU',
          }),
          /ครบ/,
        );
        assert.equal(
          (await db.query<{ status: string }>('select status from equipment where id=$1', [eq.id]))
            .rows[0].status,
          'borrowed',
        );
        await action(ids.bme, 'return_equipment', {
          equipment_id: eq.id,
          scanned_code: eq.code,
          checks: { cleaned: true, accessories: true, battery: true },
          location: 'MEU',
        });
        assert.equal(
          (await db.query<{ status: string }>('select status from equipment where id=$1', [eq.id]))
            .rows[0].status,
          'ready',
        );
      },
    );
    await t.test(
      'nurse issue report waits for BME to scan and receive the machine as unavailable',
      async () => {
        await action(ids.nurse, 'request_borrow', borrow);
        await action(ids.bme, 'approve_borrow', { equipment_id: eq.id });
        await action(ids.nurse, 'report_equipment', {
          equipment_id: eq.id,
          notes: 'เครื่องมีเสียงเตือนผิดปกติ',
        });
        assert.ok(
          (await db.query("select * from notifications where title='รายงานปัญหาเครื่องมือ'")).rows
            .length > 0,
        );
        assert.ok(
          (
            await db.query<{ reported: boolean }>(
              "select issue_reported_at is not null as reported from loans where equipment_id=$1 and status='approved'",
              [eq.id],
            )
          ).rows[0].reported,
        );
        await assert.rejects(
          action(ids.nurse, 'receive_reported_equipment', {
            equipment_id: eq.id,
            scanned_code: eq.code,
          }),
          /เฉพาะ BME/,
        );
        await assert.rejects(
          action(ids.bme, 'receive_reported_equipment', {
            equipment_id: eq.id,
            scanned_code: eq2.code,
          }),
          /ไม่ตรง/,
        );
        await assert.rejects(
          action(ids.bme, 'return_equipment', {
            equipment_id: eq.id,
            scanned_code: eq.code,
            checks: { cleaned: true, accessories: true, battery: true },
            location: 'MEU',
          }),
          /คิวรายงานปัญหา/,
        );
        await action(ids.bme, 'receive_reported_equipment', {
          equipment_id: eq.id,
          scanned_code: eq.code,
          location: 'MEU',
        });
        assert.equal(
          (await db.query<{ status: string }>('select status from equipment where id=$1', [eq.id]))
            .rows[0].status,
          'repair',
        );
        assert.equal(
          (
            await db.query<{ status: string }>(
              "select status from loans where equipment_id=$1 and status <> 'rejected' order by created_at desc limit 1",
              [eq.id],
            )
          ).rows[0].status,
          'returned',
        );
        await action(ids.bme, 'set_status', {
          equipment_id: eq.id,
          status: 'ready',
          notes: 'ตรวจสอบและแก้ไขแล้ว',
        });
      },
    );
    await t.test(
      'an issue report from an earlier loan cannot dispatch repair for the current loan',
      async () => {
        const loan = { ...borrow, equipment_id: eq3.id };
        await action(ids.nurse, 'request_borrow', loan);
        await action(ids.bme, 'approve_borrow', { equipment_id: eq3.id });
        await action(ids.nurse, 'report_equipment', {
          equipment_id: eq3.id,
          notes: 'รายงานจากรอบก่อน',
        });
        await action(ids.bme, 'receive_reported_equipment', {
          equipment_id: eq3.id,
          scanned_code: eq3.code,
          location: 'MEU',
        });
        await action(ids.bme, 'set_status', {
          equipment_id: eq3.id,
          status: 'ready',
          notes: 'แก้ไขปัญหาจากรอบก่อนแล้ว',
        });
        await action(ids.nurse, 'request_borrow', loan);
        await action(ids.bme, 'approve_borrow', { equipment_id: eq3.id });
        await assert.rejects(
          action(ids.bme, 'dispatch_repair_pickup', {
            equipment_id: eq3.id,
            assigned_to: ids.tech,
          }),
          /รอบยืมปัจจุบัน/,
        );
        await action(ids.bme, 'return_equipment', {
          equipment_id: eq3.id,
          scanned_code: eq3.code,
          checks: { cleaned: true, accessories: true, battery: true },
          location: 'MEU',
        });
      },
    );
    await t.test('notifications and read state belong to individual recipients', async () => {
      assert.ok(
        (await as(ids.nurse, () => db.query('select * from notifications'))).rows.length >= 2,
      );
      assert.equal(
        (await as(ids.other, () => db.query('select * from notifications'))).rows.length,
        0,
      );
      const result = await as(ids.other, () =>
        db.query('update notifications set read_at=now() returning id'),
      );
      assert.equal(result.rows.length, 0);
    });
    await t.test(
      'PM completion requires assigned technician and records failing checks as repair',
      async () => {
        const response = await action(ids.bme, 'dispatch_pm', {
          equipment_id: eq2.id,
          assigned_to: ids.tech,
          mode: 'onsite',
          target_date: date,
        });
        const task = response.rows[0].result.id;
        const payload = {
          equipment_id: eq2.id,
          task_id: task,
          inspection_date: date,
          due_date: tomorrow,
          checks: {
            cleaned: true,
            cables: true,
            electrical: false,
            calibration: true,
            battery: true,
          },
        };
        await assert.rejects(action(ids.nurse, 'submit_pm', payload), /ช่างเทคนิค/);
        await assert.rejects(action(ids.tech, 'submit_pm', payload), /ต้องรับงาน/);
        await action(ids.tech, 'accept_pm', { equipment_id: eq2.id, task_id: task });
        await assert.rejects(
          action(ids.tech, 'submit_pm', { ...payload, inspection_date: null }),
          /วันที่/,
        );
        const path = `${ids.tech}/ipm/failing-report.pdf`;
        await db.query(
          "insert into storage.objects(bucket_id,name,owner_id) values('medlink-files',$1,$2)",
          [path, ids.tech],
        );
        const file = await action(ids.tech, 'register_attachment', {
          path,
          name: 'failing-report.pdf',
          mime_type: 'application/pdf',
          equipment_id: eq2.id,
        });
        const submission = { ...payload, attachment_id: file.rows[0].result.id };
        await action(ids.tech, 'submit_pm', submission);
        assert.equal(
          (await db.query<{ status: string }>('select status from equipment where id=$1', [eq2.id]))
            .rows[0].status,
          'pm_due',
        );
        await action(ids.bme, 'reject_pm', {
          equipment_id: eq2.id,
          task_id: task,
          notes: 'กรุณาตรวจสอบค่าความปลอดภัยอีกครั้ง',
        });
        assert.equal(
          (await db.query<{ status: string }>('select status from pm_tasks where id=$1', [task]))
            .rows[0].status,
          'rejected',
        );
        await action(ids.tech, 'submit_pm', submission);
        await action(ids.bme, 'approve_pm', { equipment_id: eq2.id, task_id: task });
        assert.equal(
          (await db.query<{ status: string }>('select status from equipment where id=$1', [eq2.id]))
            .rows[0].status,
          'repair',
        );
      },
    );
    await t.test('chat and file metadata cannot cross conversation boundaries', async () => {
      const result = await action(ids.nurse, 'open_chat', {});
      const conversation = result.rows[0].result.id;
      await action(ids.nurse, 'send_message', {
        conversation_id: conversation,
        body: 'ขอยืมเครื่อง',
      });
      await action(ids.bme, 'send_message', { conversation_id: conversation, body: 'รับทราบ' });
      assert.equal((await as(ids.other, () => db.query('select * from messages'))).rows.length, 0);
      await assert.rejects(
        action(ids.other, 'send_message', { conversation_id: conversation, body: 'บุกรุก' }),
        /ไม่มีสิทธิ์/,
      );
      const path = `${ids.nurse}/asset/photo.jpg`;
      await db.query(
        "insert into storage.objects(bucket_id,name,owner_id) values('medlink-files',$1,$2)",
        [path, ids.nurse],
      );
      await action(ids.nurse, 'register_attachment', {
        path,
        name: 'photo.jpg',
        mime_type: 'image/jpeg',
        conversation_id: conversation,
      });
      assert.equal(
        (
          await as(ids.other, () =>
            db.query('select * from attachments where conversation_id=$1', [conversation]),
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (await as(ids.other, () => db.query('select * from storage.objects where name=$1', [path])))
          .rows.length,
        0,
      );
      assert.equal(
        (await as(ids.bme, () => db.query('select * from storage.objects where name=$1', [path])))
          .rows.length,
        1,
      );
    });
    await t.test(
      'last BME cannot be disabled and service admin function is not callable by users',
      async () => {
        await assert.rejects(
          db.query('select public.admin_save_profile($1,$1,$2,$3,$3,$4,false,$5)', [
            ids.bme,
            'bme@example.com',
            'bme',
            'bme',
            'BME',
          ]),
          /คนสุดท้าย/,
        );
        await as(ids.nurse, async () => {
          await assert.rejects(
            db.query('select public.admin_save_profile($1,$1,$2,$3,$3,$4,true,$5)', [
              ids.nurse,
              'nurse@example.com',
              'nurse',
              'bme',
              'ICU',
            ]),
          );
        });
      },
    );
    await t.test(
      'inventory creation, status changes and profile edits enforce server rules',
      async () => {
        const created = await action(ids.bme, 'add_equipment', {
          code: 'EQ-NEW-TEST',
          name: 'New device',
        });
        const equipmentId = created.rows[0].result.id;
        await assert.rejects(
          action(ids.nurse, 'add_equipment', { code: 'EQ-FORBIDDEN', name: 'No' }),
          /เฉพาะ BME/,
        );
        await assert.rejects(
          action(ids.bme, 'add_equipment', { code: 'EQ-NEW-TEST', name: 'Duplicate' }),
          /unique/,
        );
        await action(ids.bme, 'set_status', {
          equipment_id: equipmentId,
          status: 'repair',
          notes: 'รอซ่อม',
        });
        await action(ids.tech, 'report_equipment', {
          equipment_id: equipmentId,
          notes: 'เครื่องมีเสียงดัง',
        });
        await action(ids.nurse, 'edit_profile', {
          name: 'New nurse name',
          phone: '0123456789',
          department: 'ER',
          role: 'bme',
        });
        const p = (
          await db.query<{ role: string; name: string }>(
            'select role,name from profiles where id=$1',
            [ids.nurse],
          )
        ).rows[0];
        assert.equal(p.role, 'nurse');
        assert.equal(p.name, 'New nurse name');
        const path = `${ids.bme}/equipment/image.png`;
        await db.query(
          "insert into storage.objects(bucket_id,name,owner_id) values('medlink-files',$1,$2)",
          [path, ids.bme],
        );
        const attachment = await action(ids.bme, 'register_attachment', {
          path,
          name: 'image.png',
          mime_type: 'image/png',
          equipment_id: equipmentId,
        });
        await action(ids.bme, 'equipment_image', {
          equipment_id: equipmentId,
          attachment_id: attachment.rows[0].result.id,
        });
        assert.equal(
          (
            await db.query<{ image_path: string }>('select image_path from equipment where id=$1', [
              equipmentId,
            ])
          ).rows[0].image_path,
          path,
        );
      },
    );
    await t.test(
      'rejection releases inventory and successful PM restores ready with a real document',
      async () => {
        await action(ids.other, 'request_borrow', borrow);
        await action(ids.bme, 'reject_borrow', { equipment_id: eq.id, notes: 'ไม่ตรงประเภท' });
        assert.equal(
          (await db.query<{ status: string }>('select status from equipment where id=$1', [eq.id]))
            .rows[0].status,
          'ready',
        );
        const job = await action(ids.bme, 'dispatch_pm', {
          equipment_id: eq2.id,
          assigned_to: ids.tech,
          mode: 'pickup',
          target_date: date,
        });
        await assert.rejects(
          action(ids.bme, 'set_status', { equipment_id: eq2.id, status: 'ready', notes: 'bypass' }),
          /PM/,
        );
        await action(ids.tech, 'accept_pm', {
          equipment_id: eq2.id,
          task_id: job.rows[0].result.id,
        });
        const path = `${ids.tech}/ipm/report.pdf`;
        await db.query(
          "insert into storage.objects(bucket_id,name,owner_id) values('medlink-files',$1,$2)",
          [path, ids.tech],
        );
        const file = await action(ids.tech, 'register_attachment', {
          path,
          name: 'report.pdf',
          mime_type: 'application/pdf',
          equipment_id: eq2.id,
        });
        assert.equal(
          (
            await as(ids.bme, () =>
              db.query('select id from attachments where id=$1', [file.rows[0].result.id]),
            )
          ).rows.length,
          1,
        );
        assert.equal(
          (
            await as(ids.bme, () =>
              db.query('select name from storage.objects where name=$1', [path]),
            )
          ).rows.length,
          1,
        );
        await action(ids.tech, 'submit_pm', {
          equipment_id: eq2.id,
          task_id: job.rows[0].result.id,
          inspection_date: date,
          due_date: tomorrow,
          attachment_id: file.rows[0].result.id,
          checks: {
            cleaned: true,
            cables: true,
            electrical: true,
            calibration: true,
            battery: true,
          },
        });
        assert.equal(
          (await db.query<{ status: string }>('select status from equipment where id=$1', [eq2.id]))
            .rows[0].status,
          'pm_due',
        );
        await action(ids.bme, 'approve_pm', {
          equipment_id: eq2.id,
          task_id: job.rows[0].result.id,
        });
        assert.equal(
          (await db.query<{ status: string }>('select status from equipment where id=$1', [eq2.id]))
            .rows[0].status,
          'ready',
        );
        assert.equal(
          (
            await db.query<{ document_path: string }>(
              'select document_path from pm_tasks where id=$1',
              [job.rows[0].result.id],
            )
          ).rows[0].document_path,
          path,
        );
      },
    );
    await t.test('daily reminder SQL is idempotent and only reaches the borrower', async () => {
      const reminderSql = (await readFile('supabase/migrations/202609250003_reminders.sql', 'utf8'))
        .replace(/^create extension[^\n]*\n/, '')
        .split('-- 01:00 UTC')[0];
      await db.exec(reminderSql);
      await action(ids.other, 'request_borrow', borrow);
      await action(ids.bme, 'approve_borrow', { equipment_id: eq.id });
      await db.exec('select private.send_due_reminders(); select private.send_due_reminders();');
      const reminders = (
        await db.query<{ recipient_id: string }>(
          "select recipient_id from notifications where dedup_key like 'due:%'",
        )
      ).rows;
      assert.equal(reminders.length, 1);
      assert.equal(reminders[0].recipient_id, ids.other);
    });
    await t.test(
      'suspended accounts cannot mutate, read inventory or re-use a successful request',
      async () => {
        await db.query('update profiles set active=false where id=$1', [ids.nurse]);
        assert.equal(
          (await as(ids.nurse, () => db.query('select * from equipment'))).rows.length,
          0,
        );
        await assert.rejects(action(ids.nurse, 'open_chat', {}), /ถูกระงับ/);
      },
    );
  } finally {
    await db.close();
  }
});
