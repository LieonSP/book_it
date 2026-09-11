# /deploy

You are the **prod deployment orchestrator** for Book_it. When invoked with a GitHub issue number (e.g. `/deploy 4`), you deploy the feature to production, verify it, and close the issue.

---

## Step 1 — Read the issue and release checklist

Fetch the issue:
```bash
gh issue view <number> --repo LieonSP/book_it --comments
```

Find the comment posted by the build agent that starts with `## ✅ Dev + QA passed — Ready for prod deployment`. Extract:
- **Migrations** — list of migration files to run, in order
- **RLS policies** — what was added
- **Environment variables** — any new vars needed in Vercel prod
- **Manual steps** — pre/post deploy actions
- **Risks & rollback** — the risk description and rollback steps
- **Commit SHA** — the commit on `dev` that was built and QA'd

> ⚠️ If no such comment exists on the issue, stop and tell the user to run `/build <number>` first.

---

## Step 2 — Risk assessment

Assess the deployment risk level. Flag as **HIGH RISK** if ANY of the following are true:

- A migration contains `DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN` (type change), `TRUNCATE`, or `DELETE` without a `WHERE` clause
- The rollback section says anything other than a simple reverse migration
- New environment variables are listed and you cannot confirm they are already set in Vercel prod
- Manual steps are listed (anything other than "None")

If HIGH RISK: **stop and present the full release checklist to the user**, explain exactly which items triggered the flag, and ask for explicit confirmation before proceeding.

If not high risk: proceed autonomously. Log "Risk assessment: LOW — proceeding automatically." in your final report.

---

## Step 3 — Check environment variables (if any)

If the release checklist lists new environment variables, check whether they are already set in Vercel prod:
```bash
vercel env ls --environment production
```

If any are missing: **stop and tell the user** which variables need to be added in the Vercel dashboard before deployment can proceed. Do not continue until this is resolved.

If no new environment variables are listed: skip this step entirely.

---

## Step 4 — Run migrations on prod

Re-link the Supabase CLI to prod before running any migration:
```bash
npx supabase link --project-ref rlylrmtysxkpdbhvxrvq
```

Apply pending migrations with `db push`, per the non-negotiable rule in `CLAUDE.md` — this is the only method that keeps `supabase_migrations.schema_migrations` in sync with what's actually applied. Do NOT run individual files with `db query -f`; that bypasses the tracker and is exactly how prod and the migration files drift out of sync.
```bash
npx supabase db push --linked
```

Before AND after pushing, confirm the tracker is actually in sync:
```bash
npx supabase migration list --linked
```
Every entry should show a matching `local` and `remote` version. If any migration shows an empty `remote` after push, stop — the push did not apply cleanly.

After each migration, run a quick sanity check to confirm the schema change landed:
```bash
# Example: if the migration added a table, verify it exists
npx supabase db query --linked -- -c "SELECT to_regclass('public.<table_name>')"
```
Adapt the sanity check to whatever the migration did (new table, new column, new policy, etc.).

If any migration fails: **stop immediately**, do not merge to main. Report the exact error and the rollback steps from the release checklist.

We are prod-only as of 2026-09-11 (see `CLAUDE.md`) — the CLI stays linked to prod, no re-link step needed after this.

---

## Step 5 — Create and merge PR dev → main

Create a PR from `dev` to `main`:
```bash
gh pr create \
  --repo LieonSP/book_it \
  --base main \
  --head dev \
  --title "feat: deploy issue #<number> — <issue title>" \
  --body "$(cat <<'EOF'
## Deploying to prod

Closes #<number>

### What's included
<paste the "What was built" bullet list from the build report>

### Migrations run on prod
<paste migration list from release checklist>

### Commit
`<commit SHA>` on `dev`

🤖 Deployed with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Then merge the PR immediately:
```bash
gh pr merge --repo LieonSP/book_it --merge --delete-branch=false
```

> Do not use `--squash` or `--rebase` — preserve the commit history from dev.

---

## Step 6 — Close the issue

> ℹ️ Vercel auto-deploys on merge to `main` — no polling needed. The Kanban "Done" transition is handled automatically by GitHub when the PR merges.

Close the issue:
```bash
gh issue close <number> --repo LieonSP/book_it --comment "Deployed to prod. PR merged to main."
```

---

## Step 8 — Final report

Return a structured report:

```
## Deploy Report — Issue #<number>: <title>

### Result: ✅ DEPLOYED / ❌ FAILED

### Risk assessment
- Level: LOW / HIGH
- <reason if HIGH, or "Proceeded automatically" if LOW>

### Migrations
- <filename> — ✅ applied / ❌ failed
- Sanity checks: ✅ passed / ❌ failed

### PR
- <PR URL> — merged to main

### Vercel
- Auto-deployed on merge ✅

### Issue
- Closed: ✅ (Kanban → Done handled by GitHub automation on merge)

### Rollback (if needed)
<paste rollback steps from release checklist, or "N/A">
```
