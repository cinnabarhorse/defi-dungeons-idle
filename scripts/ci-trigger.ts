#!/usr/bin/env tsx
/**
 * CI Trigger and Monitor Script
 *
 * Triggers CI via push on the current PR branch and waits with `gh run watch`.
 * Captures and prints the workflow run URL and conclusion.
 *
 * Usage:
 *   pnpm ci:trigger
 *   tsx scripts/ci-trigger.ts
 */

import { execSync, spawnSync } from "child_process";

interface CIResult {
  success: boolean;
  runUrl: string | null;
  conclusion: string | null;
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
    `gh pr view ${branch} --json number --jq '.number'`
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
  workflow: string = "tests"
): { runId: string; runUrl: string } | null {
  // Wait a moment for the workflow to be triggered
  console.log("Waiting for workflow to be triggered...");

  // Poll for the workflow run (it may take a few seconds to appear)
  for (let i = 0; i < 10; i++) {
    const { stdout, error } = execSafe(
      `gh run list --branch "${branch}" --workflow "${workflow}" --limit 1 --json databaseId,url --jq '.[0] | "\\(.databaseId) \\(.url)"'`
    );

    if (!error && stdout.length > 0) {
      const [runId, runUrl] = stdout.split(" ");
      if (runId && runUrl) {
        return { runId, runUrl };
      }
    }

    // Wait 2 seconds before retrying
    execSync("sleep 2");
  }

  return null;
}

function watchWorkflowRun(runId: string): string {
  // Use gh run watch to wait for completion
  // --exit-status makes it exit with non-zero if run fails
  const result = spawnSync("gh", ["run", "watch", runId, "--exit-status"], {
    encoding: "utf-8",
    stdio: "inherit",
  });

  // Get the conclusion after watching
  const { stdout } = execSafe(
    `gh run view ${runId} --json conclusion --jq '.conclusion'`
  );

  return stdout || (result.status === 0 ? "success" : "failure");
}

function getRunUrl(runId: string): string {
  const { stdout } = execSafe(`gh run view ${runId} --json url --jq '.url'`);
  return stdout;
}

async function main(): Promise<CIResult> {
  console.log("🚀 CI Trigger and Monitor\n");

  // Check if gh CLI is available
  const { error: ghMissing } = execSafe("gh --version");
  if (ghMissing) {
    const result: CIResult = {
      success: false,
      runUrl: null,
      conclusion: null,
      error: "GitHub CLI (gh) is not installed. Please install it first.",
    };
    console.error(`❌ ${result.error}`);
    process.exit(1);
    return result;
  }

  // Get current branch
  const branch = getCurrentBranch();
  console.log(`📍 Current branch: ${branch}`);

  // Check if on protected branch
  if (isProtectedBranch(branch)) {
    const result: CIResult = {
      success: false,
      runUrl: null,
      conclusion: null,
      error: `Cannot trigger CI automation on protected branch '${branch}'. Please use a PR branch.`,
    };
    console.error(`\n❌ ${result.error}`);
    process.exit(1);
    return result;
  }

  // Check if detached HEAD
  if (branch === "HEAD") {
    const result: CIResult = {
      success: false,
      runUrl: null,
      conclusion: null,
      error: "Detached HEAD state detected. Please checkout a branch first.",
    };
    console.error(`\n❌ ${result.error}`);
    process.exit(1);
    return result;
  }

  // Require a PR for the current branch
  const hasPR = hasPRForBranch(branch);
  if (!hasPR) {
    const result: CIResult = {
      success: false,
      runUrl: null,
      conclusion: null,
      error: `No PR found for branch '${branch}'. Create a PR or checkout a PR branch before triggering CI.`,
    };
    console.error(`\n❌ ${result.error}`);
    process.exit(1);
    return result;
  }

  // Push to trigger CI
  console.log("\n📤 Pushing to trigger CI...");
  const pushSuccess = pushCurrentBranch();
  if (!pushSuccess) {
    const result: CIResult = {
      success: false,
      runUrl: null,
      conclusion: null,
      error: "Failed to push changes. Check your git configuration.",
    };
    console.error(`\n❌ ${result.error}`);
    process.exit(1);
    return result;
  }

  // Get the latest workflow run
  console.log("\n🔍 Finding workflow run...");
  const run = getLatestWorkflowRun(branch, "tests");

  if (!run) {
    const result: CIResult = {
      success: false,
      runUrl: null,
      conclusion: null,
      error: "Could not find the triggered workflow run.",
    };
    console.error(`\n❌ ${result.error}`);
    process.exit(1);
    return result;
  }

  console.log(`\n📋 Workflow Run URL: ${run.runUrl}`);
  console.log(`🔄 Watching run ${run.runId}...\n`);

  // Watch and wait for completion
  const conclusion = watchWorkflowRun(run.runId);
  const finalUrl = getRunUrl(run.runId) || run.runUrl;

  // Report results
  console.log("\n" + "=".repeat(60));
  console.log("📊 CI Results");
  console.log("=".repeat(60));
  console.log(`🔗 Run URL: ${finalUrl}`);
  console.log(`✅ Conclusion: ${conclusion}`);
  console.log("=".repeat(60));

  const result: CIResult = {
    success: conclusion === "success",
    runUrl: finalUrl,
    conclusion,
  };

  if (result.success) {
    console.log("\n✅ CI passed successfully!");
  } else {
    console.log(`\n❌ CI failed with conclusion: ${conclusion}`);
    process.exit(1);
  }

  return result;
}

// Export for use as module
export { main as triggerCI, CIResult };

// Run if executed directly
main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
