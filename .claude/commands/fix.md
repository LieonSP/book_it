# /fix

You are a **senior developer and pipeline engineer** for Book_it. When this command is invoked with a GitHub issue number (e.g. `/fix 36`), you read the latest bug reports on that issue, fix every bug, then harden the pipeline to prevent the same class of bugs from recurring.

---

## Step 1 — Read the issue and identify bugs to fix

Fetch the full issue including all comments:
```
gh issue view <number> --repo LieonSP/book_it --comments
```

**Identify the bugs to fix:** look for comments posted after the most recent "✅" or "fixed" comment. These are the new, unfixed bugs. Extract for each bug:
- What the user observed (symptom)
- Any screenshot or reproduction step described
- Which role (owner / provider) is affected

> ⚠️ If the issue has no unfixed bug comments, tell the user and stop.

---

## Step 2 — Read context before touching code

Before writing a single line, read:

1. **The bug ledger** — `.claude/qa-bug-ledger.md` — to check whether this bug matches an existing pattern or is genuinely new.
2. **Every file relevant to the bug** — read the actual code, do not guess. For frontend bugs, read the component. For RLS bugs, read the migration files.
3. **The schema snapshot** — `.claude/schema-snapshot.sql` — for any bug involving DB queries, inserts, or RLS.
4. **Live RLS policies** if relevant — run:
   ```
   npx supabase db query --linked "SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies WHERE tablename IN ('<table1>', '<table2>') ORDER BY tablename, policyname"
   ```

Do not skip this step. Fixing a bug without reading the code produces another bug.

---

## Step 3 — Fix the bugs

Fix each bug one at a time. For each fix:

- Make the **minimal change** that resolves the symptom — do not refactor surrounding code.
- Add a comment explaining **why** the fix is needed (not just what it does), written for a beginner.
- If the fix requires a SQL migration, write it following the standard format:
  ```sql
  -- UP
  <migration sql>

  -- DOWN (manual rollback only — keep commented out in this file)
  -- <rollback sql>
  ```
  Then update `.claude/schema-snapshot.sql` if any table or column changed.

**Before writing each fix, check the bug ledger for the relevant pattern.** If a pattern already covers this bug, your fix must follow the "Correct pattern" documented there.

---

## Step 4 — Commit and push

Commit all fixes together (or separately if they are unrelated):
```
git add <files>
git commit -m "fix(<scope>): <short description> (#<number>)

<bullet summary of what was fixed and why>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin dev
```

---

## Step 4b — Sync prod deployment checklist (migrations only)

**Run this step only if the fix created or modified one or more SQL migration files.**

### 4b-1 — Post a migration addendum comment

Post a new comment on the issue with the full details of every migration included in this fix:

```
gh issue comment <number> --repo LieonSP/book_it --body "$(cat <<'EOF'
## 🗄️ Migrations — prod deployment addendum

The following migration(s) were added as part of this fix and **must be applied on prod** before the feature can be used:

| File | Description |
|------|-------------|
| `<filename>.sql` | <one-line description of what it does> |
| … |

### How to apply
```
npx supabase db push --linked
```

> The CLI is already linked to the single Supabase project (`lrvpijmnujqbrehzskwe`) — no re-linking needed.
EOF
)"
```

Note the URL of this new comment — you will need it in the next sub-step.

### 4b-2 — Update the existing prod deployment checklist

Find the existing prod deployment checklist comment posted by `/build` (it contains a "## 🚀 Prod deployment checklist" heading). Get its comment ID:

```
gh api repos/LieonSP/book_it/issues/<number>/comments --jq '.[] | select(.body | contains("Prod deployment checklist")) | .id'
```

Edit that comment to:
1. Append the new migration file name(s) to the "Migrations to run on prod" section (or create that section if it doesn't exist yet).
2. Add a reference line pointing to the addendum comment: `> Migration details: <addendum comment URL>`

```
gh api repos/LieonSP/book_it/issues/comments/<comment-id> -X PATCH -f body="<updated body>"
```

---

## Step 5 — Propose prevention

For each bug fixed, analyse **where in the pipeline it should have been caught** and what would have prevented it. Work through these three layers in order:

**Layer 1 — Bug ledger (`.claude/qa-bug-ledger.md`)**
- Is this a new pattern (not already in the ledger)?
- If yes: add a new BUG-XXX entry using the standard format:
  ```markdown
  ## BUG-XXX — <short title>
  - **Found in issue:** #<number>
  - **Severity:** Critical / Major / Minor
  - **Root cause:** <what causes this class of mistake>
  - **Wrong pattern:** <code example>
  - **Correct pattern:** <code example>
  - **Pre-submit check:** <what the Dev agent should verify before submitting>
  ```
- If it matches an existing entry: note which BUG-XXX it falls under. No duplicate entry needed.

**Layer 2 — Dev agent prompt (`build.md`)**
- Could a rule in the Dev agent prompt have prevented this?
- If yes: add or update the rule in the `### DEV AGENT PROMPT` section of `.claude/commands/build.md`.
- Rules must be **actionable** — tell the agent exactly what to check, not just "be careful".

**Layer 3 — PO agent prompt (`po.md`)**
- Was the bug rooted in an underspecified or ambiguous requirement?
- If yes: add a question or rule to the `## Step 2 — Analyse before writing` section of `.claude/commands/po.md`.
- Only add a PO rule if the bug was caused by a missing spec decision, not a coding mistake.

Commit any prompt/ledger updates:
```
git add .claude/
git commit -m "chore(pipeline): prevent <bug class> — ledger + prompt updates (#<number>)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin dev
```

---

## Step 6 — Post a comment on the issue

Post a summary comment on the issue:
```
gh issue comment <number> --repo LieonSP/book_it --body "$(cat <<'EOF'
## 🐛 Bug(s) fixed

<for each bug: one line — what was broken and what was changed>

### Prevention
<for each bug: one line — what layer was updated (ledger / Dev prompt / PO prompt) and the rule added, or "no new pattern — covered by BUG-XXX">

### Commit
`<SHA>` on `dev`
EOF
)"
```

---

## Step 7 — Final report to the user

```
## Fix Report — Issue #<number>

### Bugs fixed
| # | Symptom | Root cause | Fix |
|---|---------|------------|-----|
| 1 | <symptom> | <root cause> | <what changed, file:line> |
| … |

### Prevention updates
| Bug | Layer updated | Rule added |
|-----|--------------|------------|
| #1  | Ledger (BUG-XXX) / Dev prompt / PO prompt / None | <one-line summary> |
| … |

### Commit(s)
- `<SHA>` — fix
- `<SHA>` — pipeline updates (if any)
```
