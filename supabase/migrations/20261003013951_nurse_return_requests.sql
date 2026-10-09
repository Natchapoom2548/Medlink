alter table public.loans add column return_requested_at timestamptz;

create or replace function public.medlink_action(p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); actor public.profiles; eq public.equipment; loan public.loans;
 old_req private.action_requests; result jsonb; note text:=coalesce(p_payload->>'notes','');
 target_uid uuid; task_id uuid;
begin
 if p_action not in ('request_return','report_equipment','dispatch_repair_pickup','confirm_repair_pickup') then
   return private.perform_action(p_action,p_payload,p_request_id);
 end if;
 if p_request_id is null then raise exception 'Missing request id'; end if;
 select * into actor from public.profiles where id=uid and active;
 if actor.id is null then raise exception 'บัญชีไม่มีสิทธิ์หรือถูกระงับ'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text||p_request_id::text,0));
 select * into old_req from private.action_requests where user_id=uid and request_id=p_request_id;
 if found then
   if old_req.action<>p_action or old_req.payload<>p_payload then raise exception 'Request id reused with different data'; end if;
   return old_req.result;
 end if;
 select * into eq from public.equipment where id=(p_payload->>'equipment_id')::uuid for update;
 if eq.id is null then raise exception 'ไม่พบเครื่องมือ'; end if;
 if p_action='request_return' then
   if actor.role<>'nurse' then raise exception 'เฉพาะพยาบาลเท่านั้น'; end if;
   select * into loan from public.loans where equipment_id=eq.id and borrower_id=uid and status='approved' for update;
   if loan.id is null or eq.status<>'borrowed' then raise exception 'ไม่พบรายการยืมที่กำลังใช้งาน'; end if;
   if loan.return_requested_at is null then
     update public.loans set return_requested_at=now() where id=loan.id;
     insert into public.notifications(recipient_id,title,body,equipment_id)
       select id,'แจ้งขอคืนเครื่อง',actor.name||' ขอประสานคืนเครื่อง '||eq.code,eq.id
       from public.profiles where active and role='bme';
     insert into public.activities(equipment_id,actor_id,action,notes)
       values(eq.id,uid,'request_return',coalesce(nullif(note,''),'แจ้ง BME เพื่อประสานการคืนเครื่อง'));
   end if;
   result:=jsonb_build_object('id',loan.id);
 elsif p_action='report_equipment' and actor.role='nurse' then
   if nullif(trim(note),'') is null then raise exception 'กรุณาระบุอาการของเครื่อง'; end if;
   select * into loan from public.loans where equipment_id=eq.id and borrower_id=uid and status='approved' for update;
   if loan.id is null or eq.status<>'borrowed' then raise exception 'รายงานได้เฉพาะเครื่องที่คุณกำลังยืม'; end if;
   insert into public.notifications(recipient_id,title,body,equipment_id)
     select id,'รายงานปัญหาเครื่องมือ',eq.code||' • '||left(note,240)||' (ผู้แจ้ง: '||actor.name||')',eq.id
     from public.profiles where active and role='bme';
   insert into public.activities(equipment_id,actor_id,action,notes)
     values(eq.id,uid,'report_equipment',note);
   result:=jsonb_build_object('id',eq.id);
 elsif p_action='dispatch_repair_pickup' then
   if actor.role<>'bme' then raise exception 'เฉพาะ BME เท่านั้น'; end if;
   if eq.status<>'borrowed' then raise exception 'เครื่องไม่ได้อยู่ระหว่างยืม'; end if;
   select * into loan from public.loans where equipment_id=eq.id and status='approved' for update;
   if loan.id is null then raise exception 'ไม่พบรายการยืมที่กำลังใช้งาน'; end if;
   if not exists(select 1 from public.activities where equipment_id=eq.id and action='report_equipment') then raise exception 'ยังไม่มีรายงานปัญหาจากพยาบาล'; end if;
   target_uid:=(p_payload->>'assigned_to')::uuid;
   if not exists(select 1 from public.profiles where id=target_uid and active and role='technician') then raise exception 'ไม่พบช่างที่ใช้งานอยู่'; end if;
   if exists(select 1 from public.pm_tasks where equipment_id=eq.id and status='assigned') then raise exception 'มีงานช่างที่ยังไม่ปิดอยู่แล้ว'; end if;
   insert into public.pm_tasks(equipment_id,assigned_by,assigned_to,mode,target_date,location,priority,notes)
     values(eq.id,uid,target_uid,'pickup',coalesce((p_payload->>'target_date')::date,(now() at time zone 'Asia/Bangkok')::date),coalesce(nullif(p_payload->>'location',''),eq.location),coalesce(p_payload->>'priority','urgent'),note)
     returning id into task_id;
   insert into public.notifications(recipient_id,title,body,equipment_id) values(target_uid,'รับงานรับเครื่องซ่อม',eq.code||' • '||note,eq.id);
   insert into public.activities(equipment_id,actor_id,subject_id,action,notes) values(eq.id,uid,target_uid,'dispatch_repair_pickup',note);
   result:=jsonb_build_object('id',task_id);
 elsif p_action='confirm_repair_pickup' then
   if actor.role<>'technician' then raise exception 'เฉพาะช่างเทคนิคเท่านั้น'; end if;
   select * into loan from public.loans where equipment_id=eq.id and status='approved' for update;
   select id into task_id from public.pm_tasks where equipment_id=eq.id and assigned_to=uid and status='assigned' and mode='pickup' for update;
   if loan.id is null or task_id is null or eq.status<>'borrowed' then raise exception 'ไม่พบงานรับเครื่องที่ได้รับมอบหมาย'; end if;
   if upper(trim(coalesce(p_payload->>'scanned_code','')))<>eq.code then raise exception 'รหัสที่สแกนไม่ตรงกับเครื่อง'; end if;
   update public.loans set status='returned',returned_by=uid,returned_at=now() where id=loan.id;
   update public.equipment set status='pm_due',department='หน่วยเครื่องมือแพทย์กลาง',location='ช่างรับเครื่องไปซ่อม' where id=eq.id;
   update public.pm_tasks set location='หน่วยเครื่องมือแพทย์กลาง (ช่างรับเครื่องแล้ว)' where id=task_id;
   insert into public.notifications(recipient_id,title,body,equipment_id) values(loan.borrower_id,'ช่างรับเครื่องไปซ่อมแล้ว',eq.code,eq.id);
   perform private.notify_role('bme','ช่างรับเครื่องแล้ว',eq.code,eq.id);
   insert into public.activities(equipment_id,actor_id,subject_id,action,notes) values(eq.id,uid,loan.borrower_id,'confirm_repair_pickup',note);
   result:=jsonb_build_object('id',task_id);
 else
   if actor.role<>'technician' then raise exception 'เฉพาะช่างเทคนิค'; end if;
   return private.perform_action(p_action,p_payload,p_request_id);
 end if;
 update public.equipment set revision=revision+1,updated_at=now() where id=eq.id;
 result:=coalesce(result,jsonb_build_object('id',eq.id));
 insert into private.action_requests values(uid,p_request_id,p_action,p_payload,result);
 return result;
end;
$$;

revoke all on function public.medlink_action(text,jsonb,uuid) from public,anon;
grant execute on function public.medlink_action(text,jsonb,uuid) to authenticated;
