#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: deploy-and-monitor.sh --message "<commit message>" [--tag "game-YYYYmmdd-HHMMSS"] [--no-watch]

Runs typechecks, commits (if needed), pushes, tags a game-* release, then monitors deploy status.
EOF
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: required command '$cmd' not found in PATH." >&2
    exit 1
  fi
}

message=""
tag=""
watch="1"

while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--message)
      message="${2:-}"
      shift 2
      ;;
    -t|--tag)
      tag="${2:-}"
      shift 2
      ;;
    --no-watch)
      watch="0"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

require_cmd git
require_cmd pnpm

if [[ "$watch" == "1" ]]; then
  if ! command -v gh >/dev/null 2>&1; then
    echo "Warning: gh not found; skipping deploy monitoring."
    watch="0"
  fi
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "main" ]]; then
  echo "Error: deploy-and-monitor must run on main. Current branch: $branch" >&2
  exit 1
fi

git fetch origin main --quiet
read -r behind ahead <<<"$(git rev-list --left-right --count origin/main...HEAD)"
if (( behind > 0 )); then
  echo "Error: local main is behind origin/main by $behind commit(s). Fast-forward first." >&2
  exit 1
fi

echo "=== Summary ==="
git status --short
git diff
git diff --stat
git log -1 --oneline

echo ""
echo "=== Check Types ==="
echo "=== Checking Client ==="
pnpm --filter @gotchiverse/client exec tsc --noEmit 2>&1

echo ""
echo "=== Checking Server ==="
pnpm --filter @gotchiverse/server exec tsc --noEmit 2>&1

echo ""
echo "=== Commit ==="
git add -A
created_commit="0"
if git diff --cached --quiet; then
  echo "No staged changes to commit; releasing current HEAD."
else
  if [[ -z "$message" ]]; then
    message="chore(release): deploy game release"
  fi
  git commit -m "$message"
  created_commit="1"
fi

echo ""
echo "=== Push ==="
git push origin HEAD
sha="$(git rev-parse HEAD)"

echo ""
echo "=== Tag (game-*) ==="
if [[ -z "$tag" ]]; then
  tag="game-$(date +%Y%m%d-%H%M%S)"
fi

if [[ "$tag" != game-* ]]; then
  echo "Error: release tag must start with 'game-'." >&2
  exit 1
fi

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null || \
  git ls-remote --tags origin "refs/tags/$tag" | grep -q .; then
  base_tag="$tag"
  suffix=1
  while git rev-parse -q --verify "refs/tags/${base_tag}-${suffix}" >/dev/null || \
    git ls-remote --tags origin "refs/tags/${base_tag}-${suffix}" | grep -q .; do
    suffix=$((suffix + 1))
  done
  tag="${base_tag}-${suffix}"
  echo "Tag already exists; using $tag"
fi

git tag "$tag" "$sha"
git push origin "$tag"

echo ""
echo "=== Release Identity ==="
echo "Commit SHA: $sha"
echo "Tag: $tag"
if [[ "$created_commit" == "1" ]]; then
  echo "Commit mode: created new release commit"
else
  echo "Commit mode: reused existing HEAD (no local changes)"
fi

if [[ "$watch" != "1" ]]; then
  echo ""
  echo "Skipping deploy monitoring."
  exit 0
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Warning: gh auth not available; skipping deploy monitoring."
  exit 0
fi

repo="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
workflow_failure="0"
vercel_failure="0"

echo ""
echo "=== Watch GitHub Action Runs (push for release SHA) ==="
run_ids=()
for attempt in $(seq 1 30); do
  run_ids_raw="$(
    gh run list --limit 50 \
      --json databaseId,headSha,event \
      -q ".[] | select(.headSha==\"$sha\" and .event==\"push\") | .databaseId" || true
  )"
  run_ids=()
  while IFS= read -r run_id; do
    if [[ -n "$run_id" ]]; then
      run_ids+=("$run_id")
    fi
  done <<EOF
$run_ids_raw
EOF
  if (( ${#run_ids[@]} > 0 )); then
    break
  fi
  sleep 5
done

if (( ${#run_ids[@]} == 0 )); then
  echo "Warning: no push workflow runs found for SHA $sha"
else
  for run_id in "${run_ids[@]}"; do
    if ! gh run watch "$run_id" --exit-status; then
      workflow_failure="1"
    fi
  done
fi

echo ""
echo "=== Watch Vercel Deployment ==="
vercel_state=""
vercel_url=""
vercel_description=""
for attempt in $(seq 1 60); do
  vercel_state="$(
    gh api "repos/$repo/commits/$sha/status" \
      -q '.statuses[]? | select(.context=="Vercel") | .state' | head -n 1 || true
  )"
  vercel_url="$(
    gh api "repos/$repo/commits/$sha/status" \
      -q '.statuses[]? | select(.context=="Vercel") | .target_url' | head -n 1 || true
  )"
  vercel_description="$(
    gh api "repos/$repo/commits/$sha/status" \
      -q '.statuses[]? | select(.context=="Vercel") | .description' | head -n 1 || true
  )"
  if [[ "$vercel_state" == "success" || "$vercel_state" == "failure" || "$vercel_state" == "error" ]]; then
    break
  fi
  sleep 10
done

echo ""
echo "=== Deployment Summary ==="
workflow_summary="$(
  gh run list --limit 50 --json workflowName,headSha,event,status,conclusion,url \
    -q ".[] | select(.headSha==\"$sha\" and .event==\"push\") | \"- \(.workflowName): \(.status)/\(.conclusion // \"\") \(.url)\"" || true
)"
if [[ -z "$workflow_summary" ]]; then
  workflow_summary="- none found"
fi
echo "GitHub Actions:"
echo "$workflow_summary"
if [[ "$vercel_state" == "failure" || "$vercel_state" == "error" ]]; then
  vercel_failure="1"
fi
echo "Vercel: ${vercel_state:-not found}"
if [[ -n "$vercel_description" ]]; then
  echo "Vercel detail: $vercel_description"
fi
if [[ -n "$vercel_url" ]]; then
  echo "Vercel url: $vercel_url"
fi

if [[ "$workflow_failure" == "1" || "$vercel_failure" == "1" ]]; then
  echo ""
  echo "Release monitoring detected failures." >&2
  exit 1
fi

if [[ "$workflow_summary" == "- none found" ]]; then
  echo ""
  echo "Warning: no push workflows were detected for this SHA."
fi

if [[ -z "$vercel_state" || "$vercel_state" == "pending" ]]; then
  echo ""
  echo "Warning: Vercel status did not reach a terminal state during watch window."
fi

echo ""
echo "Release monitoring complete."
