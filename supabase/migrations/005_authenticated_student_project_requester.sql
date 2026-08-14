create or replace function public.validate_project_submission_requester()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  directory_row public.student_directory%rowtype;
begin
  if new.status in ('submitted', 'staff_review', 'staff_approved', 'approval_pending', 'partially_approved', 'approved', 'completed') then
    if new.start_date is null or new.end_date is null then
      raise exception 'Start Date and End Date are required before submission.';
    end if;

    if new.project_type_category is null then
      raise exception 'Project Type is required before submission.';
    end if;

    if new.student_id is null
      or new.student_directory_id is null
      or new.requester_student_id is null
      or new.requester_email is null
      or new.requester_first_name is null
      or new.requester_last_name is null
      or new.requester_verified_at is null
      or new.requester_auth_user_id is null
    then
      raise exception 'Authenticated requester identity is required before submission.';
    end if;

    if new.requester_auth_user_id <> new.student_id then
      raise exception 'Authenticated requester does not match the project owner.';
    end if;

    select *
    into directory_row
    from public.student_directory
    where id = new.student_directory_id;

    if not found
      or not directory_row.is_active
      or directory_row.student_id <> new.requester_student_id
      or directory_row.email <> new.requester_email
      or directory_row.first_name <> new.requester_first_name
      or directory_row.last_name <> new.requester_last_name
      or split_part(directory_row.email, '@', 1) <> directory_row.student_id
    then
      raise exception 'Authenticated student directory record is invalid or inactive.';
    end if;
  end if;

  return new;
end;
$$;

grant execute on function public.validate_project_submission_requester() to authenticated;
revoke execute on function public.validate_project_submission_requester() from anon, public;
