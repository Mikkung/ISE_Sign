alter table public.projects
  add column if not exists cancelled_by uuid references public.profiles(id),
  add column if not exists cancellation_reason text;

create index if not exists projects_cancelled_at_idx
  on public.projects(cancelled_at);
