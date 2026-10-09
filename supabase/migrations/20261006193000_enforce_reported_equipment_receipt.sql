create function private.enforce_reported_equipment_receipt()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if old.status='approved'
    and new.status='returned'
    and old.issue_reported_at is not null
    and new.issue_received_at is null then
    raise exception 'เครื่องมีรายงานปัญหา ต้องสแกนรับผ่านคิวรายงานปัญหา';
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_reported_equipment_receipt() from public,anon,authenticated;

create trigger enforce_reported_equipment_receipt
before update on public.loans
for each row execute function private.enforce_reported_equipment_receipt();
