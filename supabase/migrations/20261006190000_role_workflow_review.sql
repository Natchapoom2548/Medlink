alter table public.loans
  add column issue_reported_at timestamptz,
  add column issue_received_at timestamptz;

update public.loans l
set issue_reported_at = (
  select max(a.created_at)
  from public.activities a
  where a.equipment_id=l.equipment_id
    and a.action='report_equipment'
    and a.created_at>=l.created_at
)
where l.status='approved'
  and exists (
    select 1 from public.activities a
    where a.equipment_id=l.equipment_id
      and a.action='report_equipment'
      and a.created_at>=l.created_at
  );

alter table public.pm_tasks
  add column accepted_at timestamptz,
  add column submitted_at timestamptz,
  add column reviewed_by uuid references public.profiles,
  add column reviewed_at timestamptz,
  add column review_notes text not null default '';

alter table public.pm_tasks drop constraint pm_tasks_status_check;
alter table public.pm_tasks add constraint pm_tasks_status_check
  check (status in ('assigned','accepted','submitted','rejected','completed'));

drop index public.one_open_pm;
create unique index one_open_pm on public.pm_tasks(equipment_id) where status <> 'completed';

alter function public.medlink_action(text,jsonb,uuid) rename to medlink_action_before_review;
revoke all on function public.medlink_action_before_review(text,jsonb,uuid) from public,anon,authenticated;

create function public.medlink_action(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=auth.uid(); actor public.profiles; eq public.equipment; loan public.loans; task public.pm_tasks;
  old_req private.action_requests; result jsonb; result_id uuid; note text:=coalesce(p_payload->>'notes','');
  v_checks jsonb; outcome text; file_path text; attachment_id uuid;
  today date:=(now() at time zone 'Asia/Bangkok')::date;
begin
  select * into actor from public.profiles where id=uid and active;
  if actor.id is null then raise exception 'บัญชีไม่มีสิทธิ์หรือถูกระงับ'; end if;

  if p_action='set_status' and exists(
    select 1 from public.pm_tasks
    where equipment_id=(p_payload->>'equipment_id')::uuid and status<>'completed'
  ) then
    raise exception 'ต้องให้งาน PM เสร็จสิ้นก่อนเปลี่ยนสถานะ';
  end if;

  if not (
    (p_action='report_equipment' and actor.role='nurse') or
    p_action in ('receive_reported_equipment','accept_pm','submit_pm','complete_pm','approve_pm','reject_pm')
  ) then
    return public.medlink_action_before_review(p_action,p_payload,p_request_id);
  end if;

  if p_request_id is null then raise exception 'Missing request id'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text||p_request_id::text,0));
  select * into old_req from private.action_requests where user_id=uid and request_id=p_request_id;
  if found then
    if old_req.action<>p_action or old_req.payload<>p_payload then
      raise exception 'Request id reused with different data';
    end if;
    return old_req.result;
  end if;

  select * into eq from public.equipment where id=(p_payload->>'equipment_id')::uuid for update;
  if eq.id is null then raise exception 'ไม่พบเครื่องมือ'; end if;

  if p_action='report_equipment' then
    if nullif(trim(note),'') is null then raise exception 'กรุณาระบุอาการของเครื่อง'; end if;
    select * into loan from public.loans
      where equipment_id=eq.id and borrower_id=uid and status='approved' for update;
    if loan.id is null or eq.status<>'borrowed' then
      raise exception 'รายงานได้เฉพาะเครื่องที่คุณกำลังยืม';
    end if;
    update public.loans set issue_reported_at=coalesce(issue_reported_at,now()),issue_received_at=null
      where id=loan.id;
    insert into public.notifications(recipient_id,title,body,equipment_id)
      select id,'รายงานปัญหาเครื่องมือ',eq.code||' • '||left(note,240)||' (ผู้แจ้ง: '||actor.name||')',eq.id
      from public.profiles where active and role='bme';
    insert into public.activities(equipment_id,actor_id,action,notes)
      values(eq.id,uid,'report_equipment',note);
    result_id:=eq.id;

  elsif p_action='receive_reported_equipment' then
    if actor.role<>'bme' then raise exception 'เฉพาะ BME เท่านั้น'; end if;
    select * into loan from public.loans
      where equipment_id=eq.id and status='approved' and issue_reported_at is not null for update;
    if loan.id is null or eq.status<>'borrowed' then raise exception 'ไม่พบรายงานปัญหาที่ยังรอรับเครื่อง'; end if;
    if upper(trim(coalesce(p_payload->>'scanned_code','')))<>eq.code then
      raise exception 'รหัสที่สแกนไม่ตรงกับเครื่อง';
    end if;
    update public.loans set status='returned',returned_by=uid,returned_at=now(),issue_received_at=now()
      where id=loan.id;
    update public.equipment set status='repair',department='หน่วยเครื่องมือแพทย์กลาง',
      location=coalesce(nullif(p_payload->>'location',''),'หน่วยเครื่องมือแพทย์กลาง (รอตรวจสอบ)'),
      notes=coalesce(nullif(note,''),'รับเครื่องจากรายงานปัญหา') where id=eq.id;
    insert into public.notifications(recipient_id,title,body,equipment_id)
      values(loan.borrower_id,'BME รับเครื่องที่มีปัญหาแล้ว',eq.code||' อยู่ระหว่างตรวจสอบ',eq.id);
    insert into public.activities(equipment_id,actor_id,subject_id,action,notes)
      values(eq.id,uid,loan.borrower_id,'receive_reported_equipment',coalesce(nullif(note,''),'สแกนรับเครื่องที่มีปัญหา'));
    result_id:=loan.id;

  elsif p_action='accept_pm' then
    if actor.role<>'technician' then raise exception 'เฉพาะช่างเทคนิคเท่านั้น'; end if;
    select * into task from public.pm_tasks
      where id=(p_payload->>'task_id')::uuid and equipment_id=eq.id for update;
    if task.id is null or task.assigned_to<>uid or task.status<>'assigned' then
      raise exception 'ไม่มีสิทธิ์รับงานนี้หรืองานถูกรับแล้ว';
    end if;
    update public.pm_tasks set status='accepted',accepted_at=now() where id=task.id;
    insert into public.activities(equipment_id,actor_id,action,notes)
      values(eq.id,uid,'accept_pm','รับงาน PM');
    perform private.notify_role('bme','ช่างรับงาน PM แล้ว',eq.code,eq.id);
    result_id:=task.id;

  elsif p_action in ('submit_pm','complete_pm') then
    if actor.role<>'technician' then raise exception 'เฉพาะช่างเทคนิคเท่านั้น'; end if;
    select * into task from public.pm_tasks
      where id=(p_payload->>'task_id')::uuid and equipment_id=eq.id for update;
    if task.id is null or task.assigned_to<>uid or task.status not in ('accepted','rejected') or eq.status<>'pm_due' then
      raise exception 'ต้องรับงานก่อนส่งผล IPM หรือรายการนี้ถูกปิดแล้ว';
    end if;
    if nullif(p_payload->>'inspection_date','') is null or nullif(p_payload->>'due_date','') is null
      or (p_payload->>'inspection_date')::date>today
      or (p_payload->>'due_date')::date<=(p_payload->>'inspection_date')::date then
      raise exception 'วันที่ IPM หรือวันครบกำหนดไม่ถูกต้อง';
    end if;
    attachment_id:=nullif(p_payload->>'attachment_id','')::uuid;
    if attachment_id is null then raise exception 'กรุณาแนบใบ IPM ก่อนส่งงาน'; end if;
    select path into file_path from public.attachments
      where id=attachment_id and equipment_id=eq.id and owner_id=uid;
    if file_path is null then raise exception 'เอกสาร IPM ไม่ตรงกับเครื่อง'; end if;
    v_checks:=p_payload->'checks';
    outcome:=case when coalesce(
      (v_checks->>'cleaned')::boolean and (v_checks->>'cables')::boolean and
      (v_checks->>'electrical')::boolean and (v_checks->>'calibration')::boolean and
      (v_checks->>'battery')::boolean,false
    ) then 'PASS' else 'CONDITIONAL' end;
    update public.pm_tasks set status='submitted',result=outcome,checks=v_checks,
      inspection_date=(p_payload->>'inspection_date')::date,due_date=(p_payload->>'due_date')::date,
      document_path=file_path,notes=note,submitted_at=now(),reviewed_by=null,reviewed_at=null,review_notes=''
      where id=task.id;
    insert into public.activities(equipment_id,actor_id,action,notes)
      values(eq.id,uid,'submit_pm',coalesce(nullif(note,''),'ส่งผล IPM ให้ BME ตรวจสอบ'));
    perform private.notify_role('bme','รออนุมัติผล IPM',eq.code||' • '||outcome,eq.id);
    result_id:=task.id;

  elsif p_action='approve_pm' then
    if actor.role<>'bme' then raise exception 'เฉพาะ BME เท่านั้น'; end if;
    select * into task from public.pm_tasks
      where id=(p_payload->>'task_id')::uuid and equipment_id=eq.id for update;
    if task.id is null or task.status<>'submitted' then raise exception 'ไม่มีผล IPM ที่รออนุมัติ'; end if;
    update public.pm_tasks set status='completed',reviewed_by=uid,reviewed_at=now(),
      review_notes=note,completed_at=now() where id=task.id;
    update public.equipment set status=case when task.result='PASS' then 'ready' else 'repair' end,
      last_pm_date=task.inspection_date,due_date=task.due_date,
      notes=case when task.result='PASS' then notes else coalesce(nullif(note,''),'ผล IPM มีรายการไม่ผ่าน') end
      where id=eq.id;
    insert into public.notifications(recipient_id,title,body,equipment_id)
      values(task.assigned_to,'BME อนุมัติผล IPM แล้ว',eq.code||' • '||task.result,eq.id);
    insert into public.activities(equipment_id,actor_id,subject_id,action,notes)
      values(eq.id,uid,task.assigned_to,'approve_pm',note);
    result_id:=task.id;

  else
    if actor.role<>'bme' then raise exception 'เฉพาะ BME เท่านั้น'; end if;
    if nullif(trim(note),'') is null then raise exception 'กรุณาระบุเหตุผลที่ปัดตก'; end if;
    select * into task from public.pm_tasks
      where id=(p_payload->>'task_id')::uuid and equipment_id=eq.id for update;
    if task.id is null or task.status<>'submitted' then raise exception 'ไม่มีผล IPM ที่รอตรวจสอบ'; end if;
    update public.pm_tasks set status='rejected',reviewed_by=uid,reviewed_at=now(),review_notes=note
      where id=task.id;
    insert into public.notifications(recipient_id,title,body,equipment_id)
      values(task.assigned_to,'ผล IPM ถูกส่งกลับให้แก้ไข',eq.code||' • '||left(note,240),eq.id);
    insert into public.activities(equipment_id,actor_id,subject_id,action,notes)
      values(eq.id,uid,task.assigned_to,'reject_pm',note);
    result_id:=task.id;
  end if;

  update public.equipment set revision=revision+1,updated_at=now() where id=eq.id;
  result:=jsonb_build_object('id',coalesce(result_id,eq.id));
  insert into private.action_requests values(uid,p_request_id,p_action,p_payload,result);
  return result;
end;
$$;

revoke all on function public.medlink_action(text,jsonb,uuid) from public,anon;
grant execute on function public.medlink_action(text,jsonb,uuid) to authenticated;
