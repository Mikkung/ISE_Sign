create table if not exists public.student_directory (
  id uuid primary key default gen_random_uuid(),
  student_id text not null,
  email text not null,
  first_name text not null,
  last_name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  constraint student_directory_student_id_normalized check (student_id = lower(btrim(student_id)) and student_id <> ''),
  constraint student_directory_email_normalized check (email = lower(btrim(email))),
  constraint student_directory_email_exact_domain check (email ~ '^[^[:space:]@]+@student\.chula\.ac\.th$'),
  constraint student_directory_email_prefix_matches_id check (split_part(email, '@', 1) = student_id),
  constraint student_directory_first_name_required check (length(btrim(first_name)) > 0),
  constraint student_directory_last_name_required check (length(btrim(last_name)) > 0)
);

create unique index if not exists student_directory_student_id_key on public.student_directory(student_id);
create unique index if not exists student_directory_email_key on public.student_directory(email);
create index if not exists student_directory_active_email_idx on public.student_directory(email) where is_active;

create table if not exists public.student_email_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 5 check (max_attempts > 0),
  sent_at timestamptz not null default now(),
  verified_at timestamptz,
  consumed_at timestamptz,
  project_id uuid references public.projects(id) on delete set null,
  session_fingerprint text,
  created_at timestamptz not null default now(),
  constraint student_email_verifications_email_normalized check (email = lower(btrim(email))),
  constraint student_email_verifications_email_exact_domain check (email ~ '^[^[:space:]@]+@student\.chula\.ac\.th$'),
  constraint student_email_verifications_code_hash_shape check (position(':' in code_hash) > 0)
);

create index if not exists student_email_verifications_user_email_idx
  on public.student_email_verifications(user_id, email, sent_at desc);
create index if not exists student_email_verifications_active_idx
  on public.student_email_verifications(user_id, email)
  where consumed_at is null and verified_at is null;

alter table public.projects
  add column if not exists project_type_category text,
  add column if not exists project_type_custom text,
  add column if not exists start_date date,
  add column if not exists end_date date,
  add column if not exists student_directory_id uuid references public.student_directory(id),
  add column if not exists student_email_verification_id uuid references public.student_email_verifications(id),
  add column if not exists requester_student_id text,
  add column if not exists requester_email text,
  add column if not exists requester_first_name text,
  add column if not exists requester_last_name text,
  add column if not exists requester_verified_at timestamptz,
  add column if not exists requester_auth_user_id uuid references public.profiles(id);

alter table public.projects
  alter column academic_program drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_academic_program_allowed'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_academic_program_allowed
      check (academic_program is null or academic_program in ('ADME', 'AERO', 'ICE', 'ROBOTICS&AI', 'SEMI', 'NANO'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_type_category_allowed'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_type_category_allowed
      check (
        project_type_category is null
        or project_type_category in ('CSR Trip', 'Open House', 'First Meet', 'Sports Competition', 'Academic Competition', 'Other')
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_other_type_custom_required'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_other_type_custom_required
      check (
        project_type_category is distinct from 'Other'
        or length(btrim(coalesce(project_type_custom, ''))) > 0
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_date_range_valid'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_date_range_valid
      check (start_date is null or end_date is null or start_date <= end_date);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_requester_email_exact_domain'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_requester_email_exact_domain
      check (requester_email is null or requester_email ~ '^[^[:space:]@]+@student\.chula\.ac\.th$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'projects_requester_email_prefix_matches_id'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_requester_email_prefix_matches_id
      check (requester_email is null or requester_student_id is null or split_part(requester_email, '@', 1) = requester_student_id);
  end if;
end
$$;

create index if not exists projects_student_directory_idx on public.projects(student_directory_id);
create index if not exists projects_requester_email_idx on public.projects(requester_email);
create index if not exists projects_start_end_date_idx on public.projects(start_date, end_date);

create or replace function public.prevent_project_requester_identity_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
    and old.submitted_at is not null
    and (
      new.student_directory_id is distinct from old.student_directory_id
      or new.student_email_verification_id is distinct from old.student_email_verification_id
      or new.requester_student_id is distinct from old.requester_student_id
      or new.requester_email is distinct from old.requester_email
      or new.requester_first_name is distinct from old.requester_first_name
      or new.requester_last_name is distinct from old.requester_last_name
      or new.requester_verified_at is distinct from old.requester_verified_at
      or new.requester_auth_user_id is distinct from old.requester_auth_user_id
    )
  then
    raise exception 'Requester identity cannot be changed after submission.';
  end if;

  return new;
end;
$$;

create or replace function public.validate_project_submission_requester()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  directory_row public.student_directory%rowtype;
  verification_row public.student_email_verifications%rowtype;
begin
  if new.status in ('submitted', 'staff_review', 'staff_approved', 'approval_pending', 'partially_approved', 'approved', 'completed') then
    if new.start_date is null or new.end_date is null then
      raise exception 'Start Date and End Date are required before submission.';
    end if;

    if new.project_type_category is null then
      raise exception 'Project Type is required before submission.';
    end if;

    if new.student_directory_id is null
      or new.student_email_verification_id is null
      or new.requester_student_id is null
      or new.requester_email is null
      or new.requester_first_name is null
      or new.requester_last_name is null
      or new.requester_verified_at is null
      or new.requester_auth_user_id is null
    then
      raise exception 'Verified requester identity is required before submission.';
    end if;

    select *
    into directory_row
    from public.student_directory
    where id = new.student_directory_id;

    if not found
      or not directory_row.is_active
      or directory_row.student_id <> new.requester_student_id
      or directory_row.email <> new.requester_email
      or split_part(directory_row.email, '@', 1) <> directory_row.student_id
    then
      raise exception 'Verified student directory record is invalid or inactive.';
    end if;

    select *
    into verification_row
    from public.student_email_verifications
    where id = new.student_email_verification_id;

    if not found
      or verification_row.user_id <> new.student_id
      or verification_row.email <> new.requester_email
      or verification_row.verified_at is null
      or verification_row.consumed_at is not null
      or verification_row.expires_at <= now()
    then
      raise exception 'A valid unconsumed student email verification is required before submission.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_project_requester_identity_changes on public.projects;
create trigger prevent_project_requester_identity_changes
before update on public.projects
for each row execute function public.prevent_project_requester_identity_changes();

drop trigger if exists validate_project_submission_requester on public.projects;
create trigger validate_project_submission_requester
before insert or update on public.projects
for each row execute function public.validate_project_submission_requester();

drop trigger if exists student_directory_updated_at on public.student_directory;
create trigger student_directory_updated_at
before update on public.student_directory
for each row execute function public.set_updated_at();

alter table public.student_directory enable row level security;
alter table public.student_email_verifications enable row level security;

drop policy if exists "student directory admin manage" on public.student_directory;
drop policy if exists "student directory staff read project snapshots only" on public.student_directory;
drop policy if exists "student verifications admin manage" on public.student_email_verifications;

create policy "student directory admin manage"
on public.student_directory
for all
using (public.is_admin())
with check (public.is_admin());

create policy "student verifications admin manage"
on public.student_email_verifications
for all
using (public.is_admin())
with check (public.is_admin());

grant select, insert, update, delete on public.student_directory to authenticated;
revoke all on public.student_directory from anon;
revoke all on public.student_directory from public;

revoke all on public.student_email_verifications from anon;
revoke all on public.student_email_verifications from authenticated;
revoke all on public.student_email_verifications from public;

grant execute on function public.prevent_project_requester_identity_changes() to authenticated;
grant execute on function public.validate_project_submission_requester() to authenticated;
revoke execute on function public.prevent_project_requester_identity_changes() from anon, public;
revoke execute on function public.validate_project_submission_requester() from anon, public;

