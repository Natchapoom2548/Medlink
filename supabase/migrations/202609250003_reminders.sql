create extension if not exists pg_cron with schema pg_catalog;
create function private.send_due_reminders() returns void language sql security definer set search_path='' as $$
 insert into public.notifications(recipient_id,title,body,equipment_id,dedup_key)
 select l.borrower_id,'ครบกำหนดคืนเครื่องพรุ่งนี้',e.code||' • กรุณาประสาน BME รับคืน',e.id,'due:'||l.id::text||':'||l.return_date::text
 from public.loans l join public.equipment e on e.id=l.equipment_id join public.profiles p on p.id=l.borrower_id
 where l.status='approved' and p.active and l.return_date=(now() at time zone 'Asia/Bangkok')::date+1
 on conflict(recipient_id,dedup_key) do nothing;
$$;
revoke all on function private.send_due_reminders() from public,anon,authenticated;
-- 01:00 UTC = 08:00 Asia/Bangkok. Re-running the job is harmless.
select cron.schedule('medlink-due-reminders','0 1 * * *','select private.send_due_reminders()');
