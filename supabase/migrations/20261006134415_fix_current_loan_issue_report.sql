create or replace function private.require_current_loan_issue_report()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.mode = 'pickup' and exists (
    select 1
    from public.loans l
    where l.equipment_id = new.equipment_id
      and l.status = 'approved'
  ) and not exists (
    select 1
    from public.loans l
    join public.activities a
      on a.equipment_id = l.equipment_id
     and a.action = 'report_equipment'
     and a.created_at >= l.created_at
    where l.equipment_id = new.equipment_id
      and l.status = 'approved'
  ) then
    raise exception 'ยังไม่มีรายงานปัญหาสำหรับรอบยืมปัจจุบัน';
  end if;
  return new;
end;
$$;

revoke all on function private.require_current_loan_issue_report() from public, anon, authenticated;

create trigger require_current_loan_issue_report
before insert on public.pm_tasks
for each row execute function private.require_current_loan_issue_report();
