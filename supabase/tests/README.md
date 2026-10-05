# Supabase policy verification

Two scripts that check Row Level Security and the storage path convention are
actually **enforced**, not merely declared in a migration.

| Script | Ticket | Checks |
| ------ | ------ | ------ |
| `rls-verify.mjs` | BE-06 | Two signed-in users cannot read each other's rows or storage objects |
| `storage-verify.mjs` | BE-07 | The three buckets exist and are private; uploads must start with `<user_id>/` |

## Running them

They need a running local stack, and they create test users, so **point them at
a local Supabase — never at the hosted project**.

```bash
supabase start

status=$(supabase status -o json)
export SB_URL=$(echo "$status" | node -pe 'JSON.parse(require("fs").readFileSync(0)).API_URL')
export SB_ANON=$(echo "$status" | node -pe 'JSON.parse(require("fs").readFileSync(0)).ANON_KEY')
export SB_SERVICE=$(echo "$status" | node -pe 'JSON.parse(require("fs").readFileSync(0)).SERVICE_ROLE_KEY')

node supabase/tests/rls-verify.mjs
node supabase/tests/storage-verify.mjs
```

Each exits non-zero if any check fails, so they work in a script or a hook.

## Why they are not part of `npm test`

`npm test` runs jest against `__tests__/`, and CI has no Supabase stack. These
are integration tests against a live local stack, so they live outside the jest
tree and are run deliberately — most usefully after changing a policy or adding
a table.

## Reading the output

Checks labelled **(control)** are the reason the results mean anything. A
cross-user read returning zero rows proves nothing on its own: an empty table
or a silently failed insert produces the same zero. Each denial is therefore
paired with a control proving the owner *can* see the row.

The storage script also covers the ways a path convention leaks in practice —
a bare filename at the bucket root, another user's folder, a folder whose name
merely *starts* with the user's id, the id buried as a deeper segment, and a
case-altered id. The prefix case matters most: the policy compares

```sql
(storage.foldername(name))[1] = auth.uid()::text
```

which is exact. Loosening that to a `like` or a prefix match would let anyone
reach another user's files by creating `<their-uid>-anything/`, and the test
would catch it.

## Adding a table

Add it to `TABLES` in `rls-verify.mjs` and give it a row shape in `rowFor()`.
The convention in `CLAUDE.md` — every table carries `owner_id`, RLS on, one
policy comparing `auth.uid() = owner_id` — is what keeps that a one-line change.
