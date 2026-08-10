# GitHub Pull Request Workflow

**Status:** Repository workflow

**Default transport:** SSH

**Alternative authentication:** GitHub token loaded from the ignored `.env`

## 1. Purpose

Use this workflow whenever repository changes are committed, pushed, reviewed
in a pull request, and merged into `main`. It keeps the scope explicit,
protects credentials, requires useful commit context, and ensures the final
report describes both completed work and recommended next steps.

When a task explicitly requires staying on the current branch, do not create a
new branch. Confirm the branch before committing and push that branch directly.

### Publication contract

When the user explicitly asks to publish, ship, or merge changes, execute this
workflow through its remote steps. Do not stop after describing the commands,
creating a local commit, pushing the branch, or opening the pull request.

Unless the user requests a narrower outcome, publication is complete only when:

- the intended changes are committed and pushed;
- a ready-for-review pull request targets `main`;
- required review and CI gates pass;
- the pull request is merged; and
- the resulting commit is verified on `origin/main`.

Continue processing actionable failures and review feedback on the same branch
until publication succeeds. Stop only for a gate that cannot be resolved with
the available credentials or repository permissions, and report that exact
gate and the remote state already reached. Do not leave an explicitly requested
push, pull request, or merge merely as a suggested next step.

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

## 4. GitHub CLI authentication from `.env`

The local `.env` may define:

```dotenv
GITHUB_ACCESS_TOKEN=replace_with_a_local_token
```

Do not place the real value in documentation or `.env.example`.

GitHub CLI recognizes `GH_TOKEN` directly. For a temporary session, load the
repository variable into the current shell without printing it:

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

### Register the token as a GitHub CLI profile

For a persistent CLI login, register `GITHUB_ACCESS_TOKEN` once. This stores the
credential in the operating-system keyring when one is available and configures
the GitHub CLI profile to keep using SSH for Git operations:

```bash
set -a
source ./.env
set +a
printf '%s\n' "$GITHUB_ACCESS_TOKEN" | \
  env -u GH_TOKEN -u GITHUB_TOKEN \
  gh auth login --hostname github.com --git-protocol ssh --with-token
unset GITHUB_ACCESS_TOKEN
env -u GH_TOKEN -u GITHUB_TOKEN gh auth status
```

The final command must identify the expected GitHub account, report it as
active, and show `ssh` as the Git operations protocol. Do not pass the token on
the command line, write it into Git configuration, or print it in logs.

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

## 9. Create the pull request

Create a pull request from the pushed branch into `main`. First check whether
the branch already has an open pull request so duplicate PRs are not created:

```bash
branch="$(git branch --show-current)"
gh pr list --head "$branch" --base main --state open
```

If no pull request exists, write a useful description to a temporary file and
create a ready-for-review PR:

```bash
pr_body="$(mktemp)"
# Edit "$pr_body" with: what changed, why, user impact, and validation.
gh pr create \
  --base main \
  --head "$branch" \
  --title "Concise description of the complete change" \
  --body-file "$pr_body"
rm "$pr_body"
```

Confirm the PR targets `main` and contains only the intended commits and files:

```bash
gh pr view --json number,url,baseRefName,headRefName,state,isDraft
gh pr diff --name-only
```

## 10. Process review and checks

Do not merge immediately after opening the pull request. Process it through the
repository's review and CI gates:

```bash
gh pr checks --watch
gh pr view --json reviewDecision,mergeStateStatus,mergeable
```

If checks fail, inspect the failing run, fix the cause on the same branch, run
the relevant local validation, commit, and push again. If review feedback is
actionable, address it with new commits and reply to or resolve the applicable
review threads. Do not approve your own pull request or bypass a required
review. Repeat the checks until required CI passes and branch protection allows
the merge.

## 11. Merge into `main`

Immediately before merging, verify the PR is open, targets `main`, is not a
draft, and is in a mergeable state:

```bash
gh pr view --json number,url,state,isDraft,baseRefName,reviewDecision,mergeStateStatus,mergeable
```

Merge using the repository's required strategy. When no strategy is mandated,
prefer squash merge so the feature branch becomes one focused commit on
`main`:

```bash
gh pr merge --squash --delete-branch
```

If GitHub reports that requirements are still pending, leave the PR open and
report the exact gate. Do not use an admin bypass unless the user explicitly
authorizes bypassing branch protection.

## 12. Post-merge verification

After merging:

```bash
gh pr view --json state,mergedAt,mergeCommit,url
git fetch origin main
git log -1 --oneline origin/main
```

Confirm that:

- the pull request state is `MERGED`;
- the merge commit is present on `origin/main`;
- only the intended files were included;
- no credential or unrelated file was committed;
- any intentionally retained local changes are still present and untouched.

Do not switch branches, pull, or delete a local branch while unrelated local
changes are present. The remote branch may be deleted by the merge command
without disturbing those local changes.
## 13. Required completion report

Every completed publication should report:

### What was done

- source branch and pull request URL;
- commit hash and subject;
- files or functional areas changed;
- validation performed;
- review and CI result;
- merge commit on `main` and remote synchronization result.

### Next-step suggestions

- the next implementation phase or follow-up task;
- any remaining risks, limitations, or deferred checks;
- whether review, deployment, or additional verification is recommended.

Example:

```text
Merged PR #123 into main at abc1234.

What was done:
- Added the PANDA v0.1 implementation plan and GitHub workflow.
- Passed required checks and completed review.
- Squash-merged the PR and verified the commit on origin/main.

Next steps:
- Approve the Phase 0 acceptance contract.
- Start Phase 1 with additive shared contracts and unit tests.
```

## 14. Prohibited operations

Unless a user explicitly authorizes them, do not:

- create or switch branches;
- force-push;
- amend an already-pushed commit;
- reset or discard user changes;
- stage unrelated files;
- commit `.env`, access tokens, or private keys;
- treat a successful push as evidence that build or runtime checks passed;
- merge a draft PR or a PR with failed required checks;
- bypass branch protection without explicit authorization.
