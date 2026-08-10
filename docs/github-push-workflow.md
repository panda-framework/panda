# GitHub Push Workflow

**Status:** Repository workflow

**Default transport:** SSH

**Alternative authentication:** GitHub token loaded from the ignored `.env`

## 1. Purpose

Use this workflow whenever repository changes are committed and pushed to
GitHub. It keeps the scope explicit, protects credentials, requires useful
commit context, and ensures the final report describes both completed work and
recommended next steps.

When a task explicitly requires staying on the current branch, do not create a
new branch. Confirm the branch before committing and push that branch directly.

## 2. Credential safety

Never commit any of the following:

- a GitHub access token;
- a private SSH key;
- a populated `.env` file;
- authentication output containing an unmasked secret.

The repository `.gitignore` excludes `.env`. Keep placeholder variable names in
`.env.example` and real values only in the local `.env` file.

Before staging changes, verify the local credential file is ignored:

```bash
git check-ignore .env
git status --short
```

The first command must report `.env`, and `git status` must not list it.

## 3. Preferred authentication: SSH

Use an SSH remote for normal Git fetch and push operations. A suitable remote
has this shape:

```text
git@github.com:OWNER/REPOSITORY.git
```

This repository may use a configured SSH host alias, so a remote such as
`git@github-panda:OWNER/REPOSITORY.git` is also valid when that alias exists in
the local SSH configuration.

Inspect and test the configured remote without changing it:

```bash
git remote -v
git ls-remote --heads origin
```

SSH private keys belong in the user's SSH directory or an OS-backed key agent.
Do not put private-key contents in `.env`. If a non-default key must be selected,
configure it in `~/.ssh/config` or set only its path locally, for example:

```text
Host github-panda
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_panda
  IdentitiesOnly yes
```

Only the public key is uploaded to GitHub.

## 4. Alternative authentication: token from `.env`

The local `.env` may define:

```dotenv
GITHUB_ACCESS_TOKEN=replace_with_a_local_token
```

Do not place the real value in documentation or `.env.example`.

GitHub CLI recognizes `GH_TOKEN` directly. Load the repository variable into
the current shell without printing it:

```bash
set -a
source ./.env
set +a
export GH_TOKEN="$GITHUB_ACCESS_TOKEN"
unset GITHUB_TOKEN
gh auth status
```

Unsetting `GITHUB_TOKEN` prevents a stale inherited value from overriding the
repository-local credential. Never run commands that echo either token.

For Git transport, prefer SSH even when a token is available. Use the token for
GitHub API or `gh` operations that SSH does not cover.

## 5. Pre-commit scope check

Before staging anything:

```bash
git status -sb
git branch --show-current
git diff --check
git diff
```

Confirm all of the following:

- the current branch matches the requested branch strategy;
- every modified or untracked file belongs to the requested task;
- no secret or generated file is present;
- the diff contains no accidental formatting damage;
- no unrelated user work will be staged.

When the working tree contains mixed changes, stage only explicit paths. Do not
use `git add -A` unless the complete working tree has been confirmed as in
scope.

## 6. Validation

Run checks appropriate to the change before committing:

- Documentation-only: `git diff --check`, link/path inspection, and any
  available documentation linter.
- TypeScript contracts or implementation: build, typecheck, and affected unit
  tests.
- Runtime behavior: affected integration and end-to-end tests.
- UI behavior: build plus the relevant browser or component verification.

Record the exact checks and their results in the commit body or final push
report. If a check was intentionally not run, state why.

## 7. Detailed commit message

Use a concise imperative subject and a structured body. The body should explain
what changed, why it changed, how it was validated, and what should happen
next.

```text
Document PANDA v0.1 implementation sequence

What changed:
- Added the dependency-ordered v0.1 implementation plan.
- Linked the plan from the documentation index.

Why:
- Establishes safe migration and review gates for the first closed-loop run.
- Prevents real effects from being enabled before policy enforcement.

Validation:
- git diff --check
- Documentation paths and links inspected

Next steps:
- Freeze the Phase 0 scenario and acceptance criteria.
- Begin additive contract work in Phase 1.
```

Create the commit by staging only the confirmed files and supplying the subject
and detailed body. Do not include secrets in the message.

## 8. Synchronize and push

Check the remote immediately before pushing:

```bash
git fetch origin
git status -sb
git rev-list --left-right --count origin/$(git branch --show-current)...HEAD
```

If the remote branch has commits not present locally, stop and inspect them.
Do not force-push or rewrite history unless explicitly authorized.

For an existing current branch, push with:

```bash
git push origin "$(git branch --show-current)"
```

Use `-u` only when the branch does not already have an upstream. Never create a
new branch when the task explicitly requires the current branch.

## 9. Post-push verification

After pushing:

```bash
git status -sb
git log -1 --oneline
git ls-remote --heads origin "$(git branch --show-current)"
```

Confirm that:

- the local working tree is clean;
- the local and remote branch point to the new commit;
- the intended files are included in the commit;
- no credential or unrelated file was committed.

## 10. Required completion report

Every completed push should report:

### What was done

- branch pushed;
- commit hash and subject;
- files or functional areas changed;
- validation performed;
- remote synchronization result.

### Next-step suggestions

- the next implementation phase or follow-up task;
- any remaining risks, limitations, or deferred checks;
- whether review, deployment, or additional verification is recommended.

Example:

```text
Pushed main at abc1234.

What was done:
- Added the PANDA v0.1 implementation plan and GitHub workflow.
- Updated the documentation index.
- Verified the diff and confirmed the remote commit.

Next steps:
- Approve the Phase 0 acceptance contract.
- Start Phase 1 with additive shared contracts and unit tests.
```

## 11. Prohibited operations

Unless a user explicitly authorizes them, do not:

- create or switch branches;
- force-push;
- amend an already-pushed commit;
- reset or discard user changes;
- stage unrelated files;
- commit `.env`, access tokens, or private keys;
- treat a successful push as evidence that build or runtime checks passed.
