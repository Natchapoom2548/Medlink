grant all on all tables in schema public to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('medlink-files','medlink-files',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do nothing;
create policy medlink_upload on storage.objects for insert to authenticated with check(bucket_id='medlink-files' and (storage.foldername(name))[1]=auth.uid()::text and private.current_role() is not null);
create policy medlink_download on storage.objects for select to authenticated using(bucket_id='medlink-files' and private.current_role() is not null and (owner_id=auth.uid()::text or private.can_read_file(name)));
create policy medlink_cleanup on storage.objects for delete to authenticated using(bucket_id='medlink-files' and owner_id=auth.uid()::text and private.current_role() is not null and not exists(select 1 from public.attachments where path=name));
revoke all on function private.notify_role(text,text,text,uuid,uuid) from public;

-- Every privileged account change is serialized, including protection of the last BME.
create function public.admin_save_profile(p_actor uuid,p_id uuid,p_email text,p_staff_id text,p_name text,p_role text,p_active boolean,p_department text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(94250925);
 if not exists(select 1 from public.profiles where id=p_actor and active and role='bme') then raise exception 'BME required'; end if;
 if exists(select 1 from public.profiles where id=p_id and active and role='bme') and (not p_active or p_role<>'bme') and (select count(*) from public.profiles where active and role='bme')<=1 then raise exception 'ไม่สามารถระงับหรือลดสิทธิ์ BME คนสุดท้าย'; end if;
 if nullif(trim(p_name),'') is null or nullif(trim(p_staff_id),'') is null then raise exception 'ชื่อและรหัสพนักงานจำเป็น'; end if;
 insert into public.profiles(id,email,staff_id,name,role,active,department) values(p_id,p_email,p_staff_id,p_name,p_role,p_active,p_department)
 on conflict(id) do update set staff_id=excluded.staff_id,name=excluded.name,role=excluded.role,active=excluded.active,department=excluded.department;
end;
$$;
revoke all on function public.admin_save_profile(uuid,uuid,text,text,text,text,boolean,text) from public,anon,authenticated;
grant execute on function public.admin_save_profile(uuid,uuid,text,text,text,text,boolean,text) to service_role;

do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
   foreach t in array array['profiles','equipment','loans','pm_tasks','activities','notifications','conversations','messages','conversation_reads','attachments'] loop
     if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then
       execute format('alter publication supabase_realtime add table public.%I',t);
     end if;
   end loop;
 end if;
end $$;
