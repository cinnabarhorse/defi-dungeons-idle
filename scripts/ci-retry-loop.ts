#!/usr/bin/env tsx
/**
 * CI Auto-Fix and Retry Loop
 *
 * On CI failure, pulls failed logs and exposes them to the agent for fixes.
 * After applying fixes, pushes changes and retries the `tests` workflow.
 * Retries are capped at 10 and each push counts as a retry.
 *
 * Usage:
 *   pnpm ci:retry
 *   tsx scripts/ci-retry-loop.ts
 *
 * Environment:
 *   CI_MAX_RETRIES - Maximum retry attempts (default: 10)
 */

import { execSync, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { postOrUpdatePRComment } from "./ci-pr-comment";

const MAX_RETRIES = parseInt(process.env.CI_MAX_RETRIES || "10", 10);
const RETRY_SLEEP_SECONDS = parseInt(
  process.env.CI_RETRY_SLEEP_SECONDS || "15",
  10
);
const CI_STATE_DIR = ".ci";
const FAILURES_FILE = path.join(CI_STATE_DIR, "failures.md");

interface CIRetryResult {
  success: boolean;
  runUrl: string | null;
  conclusion: string | null;
  retryCount: number;
  failureLogs?: string;
  error?: string;
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

function isProtectedBranch(branch: string): boolean {
  const protectedBranches = ["main", "master"];
  return protectedBranches.includes(branch);
}

function hasPRForBranch(branch: string): boolean {
  const { stdout, error } = execSafe(
    `gh pr view "${branch}" --json number --jq '.number'`
  );
  return !error && stdout.length > 0;
}

function pushCurrentBranch(): boolean {
  const result = spawnSync("git", ["push"], {
    encoding: "utf-8",
    stdio: "inherit",
  });
  return result.status === 0;
}

function getLatestWorkflowRun(
  branch: string,
  workflow: string = "tests",
  lastRunId?: string
): { runId: string; runUrl: string } | null {
  console.log("Waiting for workflow to be triggered...");

  for (let i = 0; i < 20; i++) {
    const { stdout, error } = execSafe(
      `gh run list --branch "${branch}" --workflow "${workflow}" --limit 1 --json databaseId,url --jq '.[0] | "\\(.databaseId) \\(.url)"'`
    );

    if (!error && stdout.length > 0) {
      const [runId, runUrl] = stdout.split(" ");
      if (runId && runUrl && runId !== lastRunId) {
        return { runId, runUrl };
      }
    }

    execSync("sleep 2");
  }

  return null;
}

function triggerWorkflowDispatch(branch: string, workflow: string = "tests"): boolean {
  const result = spawnSync("gh", ["workflow", "run", workflow, "--ref", branch], {
    encoding: "utf-8",
    stdio: "inherit",
  });
  return result.status === 0;
}

function watchWorkflowRun(runId: string): string {
  const result = spawnSync("gh", ["run", "watch", runId, "--exit-status"], {
    encoding: "utf-8",
    stdio: "inherit",
  });

  const { stdout } = execSafe(
    `gh run view ${runId} --json conclusion --jq '.conclusion'`
  );

  return stdout || (result.status === 0 ? "success" : "failure");
}

function getRunUrl(runId: string): string {
  const { stdout } = execSafe(`gh run view ${runId} --json url --jq '.url'`);
  return stdout;
}

function reportPRStatus(params: {
  runUrl: string;
  conclusion: string;
  retryCount: number;
  branch: string;
}): void {
  try {
    const result = postOrUpdatePRComment(params);
    if (!result.success) {
      console.log(`⚠️ Failed to update PR comment: ${result.message}`);
    }
  } catch (error) {
    console.log("⚠️ Failed to update PR comment:", error);
  }
}

function getFailedJobLogs(runId: string): string {
  console.log("\n📥 Fetching failed job logs...");

  // Get failed jobs
  const { stdout: jobsJson, error: jobsError } = execSafe(
    `gh run view ${runId} --json jobs --jq '.jobs[] | select(.conclusion == "failure") | .databaseId'`
  );

  if (jobsError || !jobsJson) {
    // Fall back to getting all logs
    const { stdout: allLogs } = execSafe(`gh run view ${runId} --log-failed`);
    return allLogs || "No logs available";
  }

  const jobIds = jobsJson.split("\n").filter((id) => id.length > 0);
  let logs = "";

  for (const jobId of jobIds) {
    const { stdout: jobLog } = execSafe(
      `gh run view ${runId} --job ${jobId} --log`
    );
    if (jobLog) {
      logs += `\n=== Job ${jobId} ===\n${jobLog}\n`;
    }
  }

  // If no specific job logs, try the --log-failed flag
  if (!logs) {
    const { stdout: failedLogs } = execSafe(`gh run view ${runId} --log-failed`);
    return failedLogs || "No failed logs available";
  }

  return logs;
}

function extractErrorSummary(logs: string): string {
  const lines = logs.split("\n");
  const errorLines: string[] = [];
  let inErrorBlock = false;

  for (const line of lines) {
    const lowerLine = line.toLowerCase();

    // Detect error boundaries
    if (
      lowerLine.includes("error") ||
      lowerLine.includes("failed") ||
      lowerLine.includes("✖") ||
      lowerLine.includes("exception")
    ) {
      inErrorBlock = true;
    }

    if (inErrorBlock) {
      errorLines.push(line);
      // Capture some context after the error
      if (errorLines.length > 50) {
        break;
      }
    }

    // Stop at success markers
    if (lowerLine.includes("passed") || lowerLine.includes("success")) {
      if (inErrorBlock && errorLines.length > 5) {
        break;
      }
    }
  }

  return errorLines.length > 0
    ? errorLines.join("\n")
    : logs.slice(0, 2000) + "\n... (truncated)";
}

function writeFailureLog(
  retryCount: number,
  runUrl: string,
  errorSummary: string
): void {
  if (!fs.existsSync(CI_STATE_DIR)) {
    fs.mkdirSync(CI_STATE_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString();
  const entry = `
## Failure at ${timestamp} (Retry ${retryCount})

**Run URL:** ${runUrl}

### Error Summary

\`\`\`
${errorSummary}
\`\`\`

---
`;

  // Append to failures file
  let existingContent = "";
  if (fs.existsSync(FAILURES_FILE)) {
    existingContent = fs.readFileSync(FAILURES_FILE, "utf-8");
  } else {
    existingContent = "# CI Failures Log\n\n> Recent failures to avoid.\n\n";
  }

  fs.writeFileSync(FAILURES_FILE, existingContent + entry);
  console.log(`📝 Failure logged to ${FAILURES_FILE}`);
}

async function runCIWithRetry(): Promise<CIRetryResult> {
  console.log("🔄 CI Auto-Fix and Retry Loop\n");
  console.log(`📊 Max retries: ${MAX_RETRIES}\n`);

  // Check if gh CLI is available
  const { error: ghMissing } = execSafe("gh --version");
  if (ghMissing) {
    return {
      success: false,
      runUrl: null,
      conclusion: null,
      retryCount: 0,
      error: "GitHub CLI (gh) is not installed. Please install it first.",
    };
  }

  // Get current branch
  const branch = getCurrentBranch();
  console.log(`📍 Current branch: ${branch}`);

  // Check if on protected branch
  if (isProtectedBranch(branch)) {
    return {
      success: false,
      runUrl: null,
      conclusion: null,
      retryCount: 0,
      error: `Cannot run CI automation on protected branch '${branch}'. Please use a PR branch.`,
    };
  }

  // Require a PR for the current branch
  if (!hasPRForBranch(branch)) {
    return {
      success: false,
      runUrl: null,
      conclusion: null,
      retryCount: 0,
      error: `No PR found for branch '${branch}'. Create a PR or checkout a PR branch before running the CI retry loop.`,
    };
  }

  // Check if detached HEAD
  if (branch === "HEAD") {
    return {
      success: false,
      runUrl: null,
      conclusion: null,
      retryCount: 0,
      error: "Detached HEAD state detected. Please checkout a branch first.",
    };
  }

  let retryCount = 0;
  let lastRunUrl: string | null = null;
  let lastConclusion: string | null = null;
  let lastFailureLogs: string | null = null;
  let lastRunId: string | null = null;

  while (retryCount < MAX_RETRIES) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🔄 Attempt ${retryCount + 1} of ${MAX_RETRIES}`);
    console.log("=".repeat(60));

    // Push to trigger CI
    console.log("\n📤 Pushing to trigger CI...");
    const pushSuccess = pushCurrentBranch();
    if (!pushSuccess) {
      return {
        success: false,
        runUrl: lastRunUrl,
        conclusion: "push_failed",
        retryCount,
        error: "Failed to push changes. Check your git configuration.",
      };
    }

    // This push counts as a retry
    retryCount++;

    // Get the latest workflow run
    console.log("\n🔍 Finding workflow run...");
    let run = getLatestWorkflowRun(branch, "tests", lastRunId || undefined);

    if (!run) {
      console.log("⚠️ No new workflow run detected. Triggering workflow_dispatch...");
      const dispatched = triggerWorkflowDispatch(branch, "tests");
      if (dispatched) {
        run = getLatestWorkflowRun(branch, "tests", lastRunId || undefined);
      }
    }

    if (!run) {
      console.log("⚠️ Could not find workflow run. Waiting and retrying...");
      execSync("sleep 5");
      continue;
    }

    lastRunId = run.runId;
    lastRunUrl = run.runUrl;
    console.log(`\n📋 Workflow Run URL: ${run.runUrl}`);
    console.log(`🔄 Watching run ${run.runId}...\n`);

    // Watch and wait for completion
    const conclusion = watchWorkflowRun(run.runId);
    lastConclusion = conclusion;
    lastRunUrl = getRunUrl(run.runId) || run.runUrl;

    reportPRStatus({
      runUrl: lastRunUrl,
      conclusion,
      retryCount,
      branch,
    });

    if (conclusion === "success") {
      console.log("\n" + "=".repeat(60));
      console.log("🎉 CI PASSED!");
      console.log("=".repeat(60));
      console.log(`🔗 Run URL: ${lastRunUrl}`);
      console.log(`✅ Conclusion: ${conclusion}`);
      console.log(`🔄 Total attempts: ${retryCount}`);
      console.log("=".repeat(60));

      return {
        success: true,
        runUrl: lastRunUrl,
        conclusion,
        retryCount,
      };
    }

    // CI failed - get logs for debugging
    console.log("\n❌ CI Failed. Fetching failure logs...\n");
    const logs = getFailedJobLogs(run.runId);
    const errorSummary = extractErrorSummary(logs);
    lastFailureLogs = errorSummary;

    // Write failure to log file
    writeFailureLog(retryCount, lastRunUrl, errorSummary);

    // Display error summary
    console.log("\n" + "=".repeat(60));
    console.log("📋 ERROR SUMMARY");
    console.log("=".repeat(60));
    console.log(errorSummary);
    console.log("=".repeat(60));

    if (retryCount >= MAX_RETRIES) {
      break;
    }

    console.log("\n⚠️ Agent should apply fixes before next retry.");
    console.log(
      "💡 The error summary above and in .ci/failures.md can guide the fix."
    );
    console.log(
      `\n⏳ Waiting ${RETRY_SLEEP_SECONDS}s before next retry...\n`
    );
    execSync(`sleep ${RETRY_SLEEP_SECONDS}`);
    continue;
  }

  // Max retries reached or failed
  console.log("\n" + "=".repeat(60));
  console.log("❌ CI FAILED - RETRY LIMIT REACHED");
  console.log("=".repeat(60));
  console.log(`🔗 Last Run URL: ${lastRunUrl}`);
  console.log(`❌ Last Conclusion: ${lastConclusion}`);
  console.log(`🔄 Total attempts: ${retryCount}`);
  console.log("=".repeat(60));

  return {
    success: false,
    runUrl: lastRunUrl,
    conclusion: lastConclusion,
    retryCount,
    failureLogs: lastFailureLogs || undefined,
    error: `CI failed after ${retryCount} attempts. Max retries (${MAX_RETRIES}) reached.`,
  };
}

// Export for use as module
export { runCIWithRetry, CIRetryResult, MAX_RETRIES };

// Run if executed directly
runCIWithRetry()
  .then((result) => {
    // Output structured result for agent consumption
    console.log("\n📤 Result JSON:");
    console.log(JSON.stringify(result, null, 2));

    if (!result.success) {
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
  });
