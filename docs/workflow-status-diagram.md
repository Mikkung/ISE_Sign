# Workflow Status Diagram

```text
draft
  |
submitted
  |
staff_review
  |---- request revision ----> revision_required ----> staff_review
  |---- reject -------------> rejected
  |
staff_approved
  |
approval_pending
  |---- partial approvals --> partially_approved
  |---- request revision ---> revision_required
  |---- reject -------------> rejected
  |
approved
  |
completed
```

Step statuses:

```text
not_started -> waiting -> in_progress -> completed
                              |             |
                              |             -> overdue
                              |-> revision_required
                              |-> rejected
                              |-> skipped
```

Sequential steps start only after earlier steps complete. Parallel approvers in the same active step receive assignments together. Completion rules are `all`, `any`, or `minimum`.
