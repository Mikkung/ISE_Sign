# Role and Permission Matrix

| Capability | Student | Staff | Approver | Admin |
| --- | --- | --- | --- | --- |
| Create project | Yes | No | No | Yes |
| Edit draft | Own only | Assigned/unit | No | Yes |
| Submit project | Own only | No | No | Yes |
| Upload document version | Own permitted project | Assigned/unit | No | Yes |
| View own/member project | Yes | Assigned/unit | Assigned approval only | Yes |
| View internal comments | No | Yes | Yes | Yes |
| Request revision | Respond only | Yes | Yes | Yes |
| Configure workflow | No | Yes | No | Yes |
| Add approver after activation | No | Yes, reason required | No | Yes |
| Approve and certify | No | If assigned | Assigned only | If assigned |
| Manage users/settings | No | No | No | Yes |
| View audit logs | No | Operational logs | Related project history | Yes |

Frontend role checks are convenience only. Supabase RLS is the source of authorization truth.
