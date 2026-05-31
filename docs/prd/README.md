# PRDs

This folder holds lightweight Product Requirement Docs (PRDs) for changes that benefit from upfront design.

## When to write a PRD

- New features or significant changes
- Cross-cutting work affecting multiple systems
- Changes requiring team alignment before implementation

Skip PRDs for bug fixes, small tweaks, or well-understood tasks.

## Naming convention

```
docs/prd/<issue-number>-<short-slug>.md
```

Examples:
- `docs/prd/42-wallet-connect.md`
- `docs/prd/108-notification-system.md`

## Creating a PRD

1. Copy `TEMPLATE.md` to a new file following the naming convention
2. Fill in each section (delete any that don't apply)
3. Commit to a feature branch or directly to `main` for early drafts

## Linking from Issues and PRs

**In the GitHub Issue:**
```
PRD: docs/prd/42-wallet-connect.md
```

**In the PR description:**
```
Implements: docs/prd/42-wallet-connect.md
```

This makes it easy to trace requirements back to implementation.
