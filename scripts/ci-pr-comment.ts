#!/usr/bin/env tsx
/**
 * CI PR Comment Reporter
 *
 * Posts or updates a PR comment with the `tests` run URL, conclusion, and retry count.
 * The comment includes timestamps and identifies the current branch.
 *
 * Usage:
 *   pnpm ci:comment --url <run_url> --conclusion <conclusion> [--retries <count>]
 *   tsx scripts/ci-pr-comment.ts --url <run_url> --conclusion <conclusion>
 *
 * Options:
 *   --url         The workflow run URL
 *   --conclusion  The workflow conclusion (success, failure, cancelled, etc.)
 *   --retries     Number of retry attempts (default: 0)
 *   --branch      Branch name (auto-detected if not provided)
 */

import { execSync } from "child_process";

const COMMENT_MARKER = "<!-- repo-ci-status -->";

interface CommentParams {
  runUrl: string;
  conclusion: string;
  retryCount: number;
  branch: string;
}

function exec(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8" }).trim();
}

function execSafe(cmd: string): { stdout: string; error: boolean } {
  try {
    const stdout = exec(cmd);
    return { stdout, error: false };
  } catch {
    return { stdout: "", error: true };
  }
}

function getCurrentBranch(): string {
  return exec("git rev-parse --abbrev-ref HEAD");
}

function getPRNumber(branch: string): string | null {
  const { stdout, error } = execSafe(
    `gh pr view "${branch}" --json number --jq '.number'`
  );
  return error ? null : stdout;
}

function formatConclusion(conclusion: string): string {
  const icons: Record<string, string> = {
    success: "✅",
    failure: "❌",
    cancelled: "⚪",
    skipped: "⏭️",
    timed_out: "⏰",
    action_required: "🔔",
    neutral: "➖",
  };
  return `${icons[conclusion] || "❓"} ${conclusion}`;
}

function buildComment(params: CommentParams): string {
  const { runUrl, conclusion, retryCount, branch } = params;
  const timestamp = new Date().toISOString();
  const formattedConclusion = formatConclusion(conclusion);

  return `${COMMENT_MARKER}
## 🤖 CI Status

| Field | Value |
|-------|-------|
| **Branch** | \`${branch}\` |
| **Status** | ${formattedConclusion} |
| **Run URL** | [View Workflow](${runUrl}) |
| **Retry Count** | ${retryCount} |
| **Updated** | ${timestamp} |

---
<details>
<summary>📝 What is this?</summary>

This comment is automatically posted/updated by the repo CI automation.
It tracks the latest \`tests\` workflow status for this PR.

- **Retries**: Number of CI retry attempts made
- **Status**: Final conclusion of the workflow run
</details>
`;
}

function findExistingComment(prNumber: string): string | null {
  const { stdout, error } = execSafe(
    `gh pr view ${prNumber} --json comments --jq '.comments[] | select(.body | contains("${COMMENT_MARKER}")) | .id' | head -1`
  );
  return error || !stdout ? null : stdout;
}

function postComment(prNumber: string, body: string): boolean {
  const result = execSafe(
    `gh pr comment ${prNumber} --body "${body.replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`
  );
  return !result.error;
}

function updateComment(commentId: string, body: string): boolean {
  // gh doesn't have a direct update comment command, so we use the API
  const result = execSafe(
    `gh api graphql -f query='mutation { updateIssueComment(input: {id: "${commentId}", body: "${body
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")}"}) { issueComment { id } } }'`
  );
  return !result.error;
}

function postOrUpdatePRComment(params: CommentParams): {
  success: boolean;
  message: string;
} {
  const prNumber = getPRNumber(params.branch);

  if (!prNumber) {
    console.log(
      `⚠️  No PR found for branch '${params.branch}'. Skipping PR comment.`
    );
    return {
      success: true,
      message: `No PR found for branch '${params.branch}'. Comment skipped.`,
    };
  }

  const comment = buildComment(params);

  // Check for existing comment
  const existingCommentId = findExistingComment(prNumber);

  if (existingCommentId) {
    console.log(`📝 Updating existing comment on PR #${prNumber}...`);
    const success = updateComment(existingCommentId, comment);
    if (success) {
      console.log(`✅ Comment updated on PR #${prNumber}`);
      return { success: true, message: `Comment updated on PR #${prNumber}` };
    } else {
      // Fall back to posting new comment
      console.log("⚠️ Failed to update comment, posting new one...");
    }
  }

  // Post new comment
  console.log(`📝 Posting new comment to PR #${prNumber}...`);
  const success = postComment(prNumber, comment);

  if (success) {
    console.log(`✅ Comment posted to PR #${prNumber}`);
    return { success: true, message: `Comment posted to PR #${prNumber}` };
  } else {
    console.log(`❌ Failed to post comment to PR #${prNumber}`);
    return { success: false, message: `Failed to post comment to PR #${prNumber}` };
  }
}

function parseArgs(): CommentParams | null {
  const args = process.argv.slice(2);
  let runUrl = "";
  let conclusion = "";
  let retryCount = 0;
  let branch = "";

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--url":
        runUrl = args[++i] || "";
        break;
      case "--conclusion":
        conclusion = args[++i] || "";
        break;
      case "--retries":
        retryCount = parseInt(args[++i] || "0", 10);
        break;
      case "--branch":
        branch = args[++i] || "";
        break;
    }
  }

  if (!runUrl || !conclusion) {
    console.error("Usage: ci-pr-comment.ts --url <run_url> --conclusion <conclusion> [--retries <count>] [--branch <name>]");
    console.error("\nRequired:");
    console.error("  --url         The workflow run URL");
    console.error("  --conclusion  The workflow conclusion");
    console.error("\nOptional:");
    console.error("  --retries     Number of retry attempts (default: 0)");
    console.error("  --branch      Branch name (auto-detected if not provided)");
    return null;
  }

  if (!branch) {
    branch = getCurrentBranch();
  }

  return { runUrl, conclusion, retryCount, branch };
}

// Export for use as module
export { postOrUpdatePRComment, CommentParams, buildComment };

// Run if executed directly
async function main() {
  console.log("🤖 CI PR Comment Reporter\n");

  // Check if gh CLI is available
  const { error: ghMissing } = execSafe("gh --version");
  if (ghMissing) {
    console.error("❌ GitHub CLI (gh) is not installed. Please install it first.");
    process.exit(1);
  }

  const params = parseArgs();
  if (!params) {
    process.exit(1);
  }

  console.log(`📍 Branch: ${params.branch}`);
  console.log(`🔗 Run URL: ${params.runUrl}`);
  console.log(`📊 Conclusion: ${params.conclusion}`);
  console.log(`🔄 Retries: ${params.retryCount}\n`);

  const result = postOrUpdatePRComment(params);
  
  if (!result.success) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
