create table if not exists public.auth_registration_allowlist (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  intended_role public.app_role not null,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  used_at timestamptz,
  constraint auth_registration_allowlist_email_normalized check (email = lower(btrim(email))),
  constraint auth_registration_allowlist_intended_role_privileged check (intended_role in ('staff', 'approver', 'admin'))
);

create unique index if not exists auth_registration_allowlist_active_email_idx
  on public.auth_registration_allowlist(email)
  where is_active and used_at is null;

alter table public.auth_registration_allowlist enable row level security;

drop policy if exists "registration allowlist admin read" on public.auth_registration_allowlist;
drop policy if exists "registration allowlist admin manage" on public.auth_registration_allowlist;

create policy "registration allowlist admin read"
on public.auth_registration_allowlist
for select
using (public.is_admin());

create policy "registration allowlist admin manage"
on public.auth_registration_allowlist
for all
using (public.is_admin())
with check (public.is_admin());

create or replace function public.is_exact_student_chula_email(candidate text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    lower(btrim(candidate)) ~ '^[^[:space:]@]+@student\.chula\.ac\.th$'
    and array_length(regexp_split_to_array(lower(btrim(candidate)), '@'), 1) = 2,
    false
  )
$$;

create or replace function public.hook_restrict_student_self_registration(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  allowlist_id uuid;
begin
  normalized_email := lower(btrim(coalesce(event->'user'->>'email', '')));

  if normalized_email = '' or position('@' in normalized_email) = 0 then
    return jsonb_build_object(
      'error',
      jsonb_build_object(
        'http_code', 400,
        'message', 'Self-registration is available only for Chulalongkorn University student email accounts.'
      )
    );
  end if;

  if public.is_exact_student_chula_email(normalized_email) then
    return '{}'::jsonb;
  end if;

  select id
  into allowlist_id
  from public.auth_registration_allowlist
  where email = normalized_email
    and is_active
    and used_at is null
    and (expires_at is null or expires_at > now())
  order by created_at
  limit 1;

  if allowlist_id is not null then
    update public.auth_registration_allowlist
    set used_at = now()
    where id = allowlist_id;

    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object(
      'http_code', 403,
      'message', 'Self-registration is available only for Chulalongkorn University student email accounts.'
    )
  );
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text;
  display_name text;
begin
  normalized_email := lower(btrim(coalesce(new.email, new.id::text)));
  display_name := btrim(regexp_replace(coalesce(new.raw_user_meta_data ->> 'display_name', new.email, 'New user'), '\s+', ' ', 'g'));

  if display_name = '' then
    display_name := normalized_email;
  end if;

  insert into public.profiles (id, display_name, email, role, is_active)
  values (
    new.id,
    left(display_name, 120),
    normalized_email,
    'student',
    true
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant select, update on public.auth_registration_allowlist to supabase_auth_admin;
grant select, insert, update, delete on public.auth_registration_allowlist to authenticated;
grant execute on function public.is_exact_student_chula_email(text) to supabase_auth_admin;
grant execute on function public.hook_restrict_student_self_registration(jsonb) to supabase_auth_admin;
grant execute on function public.handle_new_auth_user() to supabase_auth_admin;

revoke all on public.auth_registration_allowlist from anon;
revoke all on public.auth_registration_allowlist from public;
revoke execute on function public.is_exact_student_chula_email(text) from anon, authenticated, public;
revoke execute on function public.hook_restrict_student_self_registration(jsonb) from anon, authenticated, public;
revoke execute on function public.handle_new_auth_user() from anon, authenticated, public;
