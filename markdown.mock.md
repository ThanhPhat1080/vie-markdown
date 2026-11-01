# Git workflow and deployment

> Authoritative rules for branches, PRs and deploys. Claude must follow this exactly.

This is git flow.
Please follow.


## Branches
| Branch | Purpose | Deploys to |
|---|---|---|
| `main` | Production. Protected. Only receives PRs from `develop`. | Vercel Production |
| `develop` | Integration/development. Default target for all work. | Vercel Preview |
| feature/fix branches (incl. `claude/*`) | Short-lived work, branched from `develop`. | Vercel Preview |

## Flow for every change (Claude follows this exactly)
1. **Branch from the user's local `develop`.** `git fetch origin`, `git checkout develop`, `git pull origin develop`, then `git checkout -b <branch>` (use the `claude/*` name the session assigns, otherwise `claude/<short-topic>`). Do this before editing anything, and never keep working on an old feature branch. The user can then `git fetch` and check out the branch to test locally.
3. **Commit and push** the branch. **Every time a new branch is created, tell the user so, with the exact commands to switch their local git to it** (`git fetch origin && git checkout <branch>`), and how to test (`npm ci && npm run dev`). Keep it short.
Then Settings -> General -> Default branch -> `develop`, so new PRs default to it.

## Vercel

> Code

```js
    const a = 1;
    for (a; a <= 10; a++) console.log(a);
    return;
```

## Supabase (project `uhpsqaqejizcyzwhwnsl`)
Phase 2 work for Sort It goes through the integration branch `claude/phase2/sort-it`.