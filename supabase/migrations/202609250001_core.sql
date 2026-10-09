create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id), email text not null unique,
 staff_id text not null unique, name text not null, role text not null check(role in ('nurse','bme','technician')),
 department text not null default '', hospital text not null default 'MedLink', phone text not null default '',
 active boolean not null default true, avatar_path text, created_at timestamptz not null default now()
);
create table public.equipment (
 id uuid primary key default gen_random_uuid(), code text not null unique check(code ~ '^EQ-[A-Z0-9-]+$'),
 name text not null check(length(trim(name))>0), name_th text not null default '', category text not null default 'Monitoring',
 brand text not null default '', model text not null default '', serial_number text not null default '',
 department text not null default 'หน่วยเครื่องมือแพทย์กลาง', location text not null default 'MEU ชั้น 2',
 building text not null default '', floor text not null default '', bay text not null default '',
 status text not null default 'ready' check(status in ('ready','pending_borrow','borrowed','pm_due','repair','reject')),
 last_pm_date date, due_date date, image_path text, notes text not null default '', revision integer not null default 0,
 updated_at timestamptz not null default now()
);
create table public.loans (
 id uuid primary key default gen_random_uuid(), equipment_id uuid not null references public.equipment,
 borrower_id uuid not null references public.profiles, department text not null, bed_room text not null default '',
 borrow_date date not null, return_date date not null check(return_date>=borrow_date), notes text not null default '',
 status text not null default 'pending' check(status in ('pending','approved','rejected','returned')),
 approved_by uuid references public.profiles, returned_by uuid references public.profiles,
 returned_at timestamptz, created_at timestamptz not null default now()
);
create unique index one_active_loan on public.loans(equipment_id) where status in ('pending','approved');
create table public.pm_tasks (
 id uuid primary key default gen_random_uuid(), equipment_id uuid not null references public.equipment,
 assigned_by uuid not null references public.profiles, assigned_to uuid not null references public.profiles,
 mode text not null check(mode in ('onsite','pickup')), target_date date not null, location text not null,
 priority text not null default 'normal' check(priority in ('normal','urgent')), notes text not null default '',
 status text not null default 'assigned' check(status in ('assigned','completed')),
 result text check(result in ('PASS','CONDITIONAL')), checks jsonb, inspection_date date, due_date date,
 document_path text, created_at timestamptz not null default now(), completed_at timestamptz
);
create unique index one_open_pm on public.pm_tasks(equipment_id) where status='assigned';
create table public.activities (
 id uuid primary key default gen_random_uuid(), equipment_id uuid not null references public.equipment,
 actor_id uuid not null references public.profiles, subject_id uuid references public.profiles,
 action text not null, notes text not null default '', created_at timestamptz not null default now()
);
create table public.favorites (
 user_id uuid not null references public.profiles, equipment_id uuid not null references public.equipment,
 primary key(user_id,equipment_id)
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles,
 title text not null, body text not null, equipment_id uuid references public.equipment,
 conversation_id uuid, dedup_key text, read_at timestamptz, created_at timestamptz not null default now(),
 unique(recipient_id,dedup_key)
);
create table public.conversations (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null unique references public.profiles,
 owner_name text not null, created_at timestamptz not null default now()
);
alter table public.notifications add foreign key(conversation_id) references public.conversations;
create table public.attachments (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles,
 path text not null unique, name text not null, mime_type text not null,
 equipment_id uuid references public.equipment, conversation_id uuid references public.conversations,
 is_avatar boolean not null default false, created_at timestamptz not null default now(),
 check(num_nonnulls(equipment_id,conversation_id) + is_avatar::integer = 1)
);
create table public.messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations,
 sender_id uuid not null references public.profiles, sender_name text not null, body text not null default '',
 attachment_id uuid references public.attachments, created_at timestamptz not null default now(),
 check(length(trim(body))>0 or attachment_id is not null)
);
create table public.conversation_reads (
 conversation_id uuid not null references public.conversations, user_id uuid not null references public.profiles,
 read_at timestamptz not null default now(), primary key(conversation_id,user_id)
);
create table private.action_requests (
 user_id uuid not null references auth.users(id) on delete cascade, request_id uuid not null, action text not null, payload jsonb not null,
 result jsonb not null, primary key(user_id,request_id)
);
create index messages_thread_date on public.messages(conversation_id,created_at);
create index notifications_recipient_date on public.notifications(recipient_id,created_at);
create index activity_equipment_date on public.activities(equipment_id,created_at);

create function private.current_role() returns text language sql stable security definer set search_path='' as $$
 select role from public.profiles where id=auth.uid() and active;
$$;
create function private.can_chat(cid uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.current_role() is not null and exists(select 1 from public.conversations where id=cid and (owner_id=auth.uid() or private.current_role()='bme'));
$$;
create function private.can_read_file(file_path text) returns boolean language sql stable security definer set search_path='' as $$
 select private.current_role() is not null and exists(select 1 from public.attachments a where a.path=file_path and
 (a.equipment_id is not null or a.is_avatar or private.can_chat(a.conversation_id)));
$$;
revoke all on all functions in schema private from public;
grant execute on function private.current_role(), private.can_chat(uuid), private.can_read_file(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.equipment enable row level security;
alter table public.loans enable row level security;
alter table public.pm_tasks enable row level security;
alter table public.activities enable row level security;
alter table public.favorites enable row level security;
alter table public.notifications enable row level security;
alter table public.conversations enable row level security;
alter table public.attachments enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;

create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or private.current_role()='bme');
create policy equipment_read on public.equipment for select to authenticated using(private.current_role() is not null);
create policy loan_read on public.loans for select to authenticated using(private.current_role()='bme' or (private.current_role() is not null and borrower_id=auth.uid()));
create policy pm_read on public.pm_tasks for select to authenticated using(private.current_role()='bme' or (private.current_role()='technician' and assigned_to=auth.uid()));
create policy activity_read on public.activities for select to authenticated using(private.current_role()='bme' or (private.current_role() is not null and (actor_id=auth.uid() or subject_id=auth.uid())));
create policy favorite_access on public.favorites for all to authenticated using(user_id=auth.uid() and private.current_role() is not null) with check(user_id=auth.uid() and private.current_role() is not null);
create policy notification_read on public.notifications for select to authenticated using(recipient_id=auth.uid() and private.current_role() is not null);
create policy notification_update on public.notifications for update to authenticated using(recipient_id=auth.uid() and private.current_role() is not null) with check(recipient_id=auth.uid());
create policy conversation_read on public.conversations for select to authenticated using(private.can_chat(id));
create policy attachment_read on public.attachments for select to authenticated using(private.can_read_file(path));
create policy message_read on public.messages for select to authenticated using(private.can_chat(conversation_id));
create policy receipt_read on public.conversation_reads for select to authenticated using(private.can_chat(conversation_id));
create policy receipt_write on public.conversation_reads for insert to authenticated with check(user_id=auth.uid() and private.can_chat(conversation_id));
create policy receipt_update on public.conversation_reads for update to authenticated using(user_id=auth.uid() and private.can_chat(conversation_id)) with check(user_id=auth.uid() and private.can_chat(conversation_id));

revoke all on all tables in schema public from anon,authenticated;
grant select on public.profiles,public.equipment,public.loans,public.pm_tasks,public.activities,public.favorites,public.notifications,public.conversations,public.attachments,public.messages,public.conversation_reads to authenticated;
grant insert,delete on public.favorites to authenticated;
grant update(read_at) on public.notifications to authenticated;
grant insert on public.conversation_reads to authenticated;
grant update(read_at) on public.conversation_reads to authenticated;

create function private.notify_role(target_role text, title text, body text, equipment_id uuid, excluded uuid default null) returns void language sql set search_path='' as $$
 insert into public.notifications(recipient_id,title,body,equipment_id)
 select id,title,body,equipment_id from public.profiles where active and role=target_role and id is distinct from excluded;
$$;

create function private.perform_action(p_action text,p_payload jsonb,p_request_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); role_name text; actor public.profiles; eq public.equipment; loan public.loans; task public.pm_tasks;
 cid uuid; aid uuid; result_id uuid; result jsonb; old_req private.action_requests; target_uid uuid;
 note text:=coalesce(p_payload->>'notes',''); v_checks jsonb; outcome text; file_path text;
 today date:=(now() at time zone 'Asia/Bangkok')::date;
begin
 select * into actor from public.profiles where id=uid and active;
 if actor.id is null then raise exception 'บัญชีไม่มีสิทธิ์หรือถูกระงับ'; end if;
 role_name:=actor.role;
 if p_request_id is null then raise exception 'Missing request id'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||p_request_id::text,0));
 select * into old_req from private.action_requests where user_id=uid and request_id=p_request_id;
 if found then
   if old_req.action<>p_action or old_req.payload<>p_payload then raise exception 'Request id reused with different data'; end if;
   return old_req.result;
 end if;
 if p_action in ('request_borrow','approve_borrow','reject_borrow','return_equipment','set_status','dispatch_pm','complete_pm','report_equipment','equipment_image') then
   select * into eq from public.equipment where id=(p_payload->>'equipment_id')::uuid for update;
   if eq.id is null then raise exception 'ไม่พบเครื่องมือ'; end if;
 end if;
 if p_action in ('add_equipment','approve_borrow','reject_borrow','return_equipment','set_status','dispatch_pm','equipment_image') and role_name<>'bme' then
   raise exception 'เฉพาะ BME เท่านั้น';
 end if;
 case p_action
 when 'request_borrow' then
   if role_name<>'nurse' or eq.status<>'ready' then raise exception 'เครื่องไม่พร้อมให้ยืมหรือไม่มีสิทธิ์'; end if;
   if nullif(trim(p_payload->>'department'),'') is null or (p_payload->>'borrow_date')::date<today or (p_payload->>'return_date')::date<(p_payload->>'borrow_date')::date then raise exception 'ตรวจสอบแผนกและวันที่ยืม–คืน'; end if;
   insert into public.loans(equipment_id,borrower_id,department,bed_room,borrow_date,return_date,notes)
   values(eq.id,uid,p_payload->>'department',coalesce(p_payload->>'bed_room',''),(p_payload->>'borrow_date')::date,(p_payload->>'return_date')::date,note) returning id into result_id;
   update public.equipment set status='pending_borrow' where id=eq.id;
   perform private.notify_role('bme','คำขอยืมเครื่องใหม่',actor.name||' ขอ '||eq.code,eq.id);
 when 'approve_borrow','reject_borrow' then
   if eq.status<>'pending_borrow' then raise exception 'คำขอนี้ดำเนินการแล้ว'; end if;
   select * into loan from public.loans where equipment_id=eq.id and status='pending' for update;
   if loan.id is null then raise exception 'ไม่พบคำขอที่รออนุมัติ'; end if;
   if p_action='reject_borrow' and length(trim(note))=0 then raise exception 'กรุณาระบุเหตุผล'; end if;
   update public.loans set status=case when p_action='approve_borrow' then 'approved' else 'rejected' end,approved_by=uid where id=loan.id;
   update public.equipment set status=case when p_action='approve_borrow' then 'borrowed' else 'ready' end,
   location=case when p_action='approve_borrow' then loan.department||' '||loan.bed_room else location end,
   department=case when p_action='approve_borrow' then loan.department else department end where id=eq.id;
   insert into public.notifications(recipient_id,title,body,equipment_id) values(loan.borrower_id,case when p_action='approve_borrow' then 'อนุมัติคำขอยืมแล้ว' else 'คำขอยืมถูกปฏิเสธ' end,eq.code||' '||note,eq.id);
   target_uid:=loan.borrower_id; result_id:=loan.id;
 when 'return_equipment' then
   if eq.status<>'borrowed' then raise exception 'เครื่องไม่ได้อยู่ระหว่างยืม'; end if;
   if upper(trim(coalesce(p_payload->>'scanned_code','')))<>eq.code then raise exception 'รหัสที่สแกนไม่ตรงกับเครื่อง'; end if;
   v_checks:=p_payload->'checks';
   if not coalesce((v_checks->>'cleaned')::boolean and (v_checks->>'accessories')::boolean and (v_checks->>'battery')::boolean,false) then raise exception 'กรุณาตรวจรับให้ครบทุกข้อ'; end if;
   if nullif(trim(p_payload->>'location'),'') is null then raise exception 'กรุณาระบุจุดรับคืน'; end if;
   select * into loan from public.loans where equipment_id=eq.id and status='approved' for update;
   if loan.id is null then raise exception 'ไม่พบรายการยืม'; end if;
   update public.loans set status='returned',returned_by=uid,returned_at=now() where id=loan.id;
   update public.equipment set status='ready',location=p_payload->>'location',department='หน่วยเครื่องมือแพทย์กลาง' where id=eq.id;
   target_uid:=loan.borrower_id; result_id:=loan.id;
   insert into public.notifications(recipient_id,title,body,equipment_id) values(loan.borrower_id,'รับคืนเครื่องแล้ว',eq.code,eq.id);
 when 'set_status' then
   if eq.status in ('borrowed','pending_borrow') or exists(select 1 from public.pm_tasks where equipment_id=eq.id and status='assigned') then raise exception 'ต้องปิดรายการยืมหรืองาน PM ก่อน'; end if;
   if p_payload->>'status' not in ('ready','pm_due','repair','reject') or nullif(trim(note),'') is null then raise exception 'ระบุสถานะและเหตุผล'; end if;
   update public.equipment set status=p_payload->>'status',notes=note where id=eq.id;
 when 'dispatch_pm' then
   if eq.status not in ('ready','pm_due','repair') then raise exception 'เครื่องยังไม่พร้อมสำหรับ PM'; end if;
   target_uid:=(p_payload->>'assigned_to')::uuid;
   if not exists(select 1 from public.profiles where id=target_uid and active and role='technician') then raise exception 'ไม่พบช่างที่ใช้งานอยู่'; end if;
   if (p_payload->>'target_date')::date<today then raise exception 'วันนัดหมายต้องไม่เป็นอดีต'; end if;
   insert into public.pm_tasks(equipment_id,assigned_by,assigned_to,mode,target_date,location,priority,notes)
   values(eq.id,uid,target_uid,p_payload->>'mode',(p_payload->>'target_date')::date,coalesce(nullif(p_payload->>'location',''),eq.location),coalesce(p_payload->>'priority','normal'),note) returning id into result_id;
   update public.equipment set status='pm_due' where id=eq.id;
   insert into public.notifications(recipient_id,title,body,equipment_id) values(target_uid,'ได้รับงาน PM',eq.code||' '||note,eq.id);
 when 'complete_pm' then
   select * into task from public.pm_tasks where id=(p_payload->>'task_id')::uuid and equipment_id=eq.id for update;
   if role_name<>'technician' or task.assigned_to is distinct from uid or task.status is distinct from 'assigned' or eq.status<>'pm_due' then raise exception 'ไม่มีสิทธิ์ปิดงานนี้หรือปิดไปแล้ว'; end if;
   if nullif(p_payload->>'inspection_date','') is null or nullif(p_payload->>'due_date','') is null or (p_payload->>'inspection_date')::date>today or (p_payload->>'due_date')::date<=(p_payload->>'inspection_date')::date then raise exception 'วันที่ IPM หรือวันครบกำหนดไม่ถูกต้อง'; end if;
   v_checks:=p_payload->'checks';
   outcome:=case when coalesce((v_checks->>'cleaned')::boolean and (v_checks->>'cables')::boolean and (v_checks->>'electrical')::boolean and (v_checks->>'calibration')::boolean and (v_checks->>'battery')::boolean,false) then 'PASS' else 'CONDITIONAL' end;
   if nullif(p_payload->>'attachment_id','') is not null then
     select path into file_path from public.attachments where id=(p_payload->>'attachment_id')::uuid and equipment_id=eq.id and owner_id=uid;
     if file_path is null then raise exception 'เอกสารไม่ตรงกับเครื่อง'; end if;
   end if;
   update public.pm_tasks set status='completed',result=outcome,checks=v_checks,inspection_date=(p_payload->>'inspection_date')::date,due_date=(p_payload->>'due_date')::date,document_path=file_path,notes=note,completed_at=now() where id=task.id;
   update public.equipment set status=case when outcome='PASS' then 'ready' else 'repair' end,last_pm_date=(p_payload->>'inspection_date')::date,due_date=(p_payload->>'due_date')::date where id=eq.id;
   perform private.notify_role('bme','ผลตรวจ PM: '||outcome,eq.code,eq.id);
   result_id:=task.id; target_uid:=task.assigned_to;
 when 'report_equipment' then
   if role_name<>'technician' then raise exception 'เฉพาะช่างเทคนิค'; end if;
   if nullif(trim(note),'') is null then raise exception 'กรุณาระบุอาการ'; end if;
   perform private.notify_role('bme','รายงานเครื่องขัดข้อง',eq.code||' '||note,eq.id);
 when 'add_equipment' then
   insert into public.equipment(code,name,name_th,category,brand,model,serial_number,department,location,building,floor,bay,due_date,notes)
   values(upper(trim(p_payload->>'code')),trim(p_payload->>'name'),coalesce(p_payload->>'name_th',''),coalesce(p_payload->>'category','Monitoring'),coalesce(p_payload->>'brand',''),coalesce(p_payload->>'model',''),coalesce(p_payload->>'serial_number',''),coalesce(p_payload->>'department','หน่วยเครื่องมือแพทย์กลาง'),coalesce(p_payload->>'location','MEU ชั้น 2'),coalesce(p_payload->>'building',''),coalesce(p_payload->>'floor',''),coalesce(p_payload->>'bay',''),nullif(p_payload->>'due_date','')::date,note) returning * into eq;
   result_id:=eq.id;
 when 'equipment_image' then
   select path into file_path from public.attachments where id=(p_payload->>'attachment_id')::uuid and equipment_id=eq.id and owner_id=uid and mime_type like 'image/%';
   if file_path is null then raise exception 'ไม่พบภาพของเครื่อง'; end if;
   update public.equipment set image_path=file_path where id=eq.id;
 when 'edit_profile' then
   if nullif(trim(p_payload->>'name'),'') is null then raise exception 'กรุณาระบุชื่อ'; end if;
   update public.profiles set name=trim(p_payload->>'name'),phone=coalesce(p_payload->>'phone',''),department=coalesce(p_payload->>'department','') where id=uid;
   if nullif(p_payload->>'attachment_id','') is not null then
     select path into file_path from public.attachments where id=(p_payload->>'attachment_id')::uuid and owner_id=uid and is_avatar;
     if file_path is null then raise exception 'ไม่พบภาพโปรไฟล์'; end if;
     update public.profiles set avatar_path=file_path where id=uid;
   end if;
   update public.conversations set owner_name=trim(p_payload->>'name') where owner_id=uid;
 when 'open_chat' then
   if role_name='bme' then raise exception 'เลือกห้องจากกล่องข้อความ BME'; end if;
   insert into public.conversations(owner_id,owner_name) values(uid,actor.name) on conflict(owner_id) do update set owner_name=excluded.owner_name returning id into result_id;
 when 'register_attachment' then
   cid:=nullif(p_payload->>'conversation_id','')::uuid;
   if cid is not null then
     if not private.can_chat(cid) then raise exception 'ไม่มีสิทธิ์ในห้องนี้'; end if;
   elsif coalesce((p_payload->>'is_avatar')::boolean,false) then
     if coalesce(p_payload->>'mime_type','') not like 'image/%' then raise exception 'รูปโปรไฟล์ต้องเป็นภาพ'; end if;
   elsif role_name not in ('bme','technician') then raise exception 'ไม่มีสิทธิ์แนบเอกสารเครื่อง';
   end if;
   file_path:=p_payload->>'path';
   if split_part(file_path,'/',1)<>uid::text or not exists(select 1 from storage.objects where bucket_id='medlink-files' and name=file_path and owner_id=uid::text) then raise exception 'ไม่พบไฟล์ที่อัปโหลดโดยผู้ใช้'; end if;
   insert into public.attachments(owner_id,path,name,mime_type,equipment_id,conversation_id,is_avatar)
   values(uid,file_path,p_payload->>'name',p_payload->>'mime_type',nullif(p_payload->>'equipment_id','')::uuid,cid,coalesce((p_payload->>'is_avatar')::boolean,false)) returning id into result_id;
 when 'send_message' then
   cid:=(p_payload->>'conversation_id')::uuid; aid:=nullif(p_payload->>'attachment_id','')::uuid;
   if not private.can_chat(cid) then raise exception 'ไม่มีสิทธิ์ในห้องนี้'; end if;
   if length(coalesce(p_payload->>'body',''))>5000 then raise exception 'ข้อความยาวเกิน 5,000 ตัวอักษร'; end if;
   if aid is not null and not exists(select 1 from public.attachments where id=aid and conversation_id=cid and owner_id=uid and mime_type like 'image/%') then raise exception 'รูปภาพไม่ตรงกับห้อง'; end if;
   insert into public.messages(conversation_id,sender_id,sender_name,body,attachment_id) values(cid,uid,actor.name,coalesce(p_payload->>'body',''),aid) returning id into result_id;
   if role_name='bme' then
     insert into public.notifications(recipient_id,title,body,conversation_id) select owner_id,'ข้อความจาก BME',left(coalesce(p_payload->>'body','รูปภาพ'),120),cid from public.conversations where id=cid;
   else
     insert into public.notifications(recipient_id,title,body,conversation_id) select id,'ข้อความจาก '||actor.name,left(coalesce(p_payload->>'body','รูปภาพ'),120),cid from public.profiles where active and role='bme';
   end if;
 else raise exception 'Unknown action';
 end case;
 if eq.id is not null then
   update public.equipment set revision=revision+1,updated_at=now() where id=eq.id;
   insert into public.activities(equipment_id,actor_id,subject_id,action,notes) values(eq.id,uid,target_uid,p_action,note);
 end if;
 result:=jsonb_build_object('id',coalesce(result_id,eq.id,uid));
 insert into private.action_requests values(uid,p_request_id,p_action,p_payload,result);
 return result;
end;
$$;
revoke all on function private.perform_action(text,jsonb,uuid) from public;
grant execute on function private.perform_action(text,jsonb,uuid) to authenticated;
create function public.medlink_action(p_action text,p_payload jsonb,p_request_id uuid) returns jsonb language sql security invoker set search_path='' as $$
 select private.perform_action(p_action,p_payload,p_request_id);
$$;
revoke all on function public.medlink_action(text,jsonb,uuid) from public,anon;
grant execute on function public.medlink_action(text,jsonb,uuid) to authenticated;
