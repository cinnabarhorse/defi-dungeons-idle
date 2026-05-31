#!/usr/bin/env node
/**
 * Determine appropriate auto-merge labels based on issue/PR content.
 * 
 * This script analyzes issue titles, bodies, and PRD content to determine
 * the risk level and appropriate auto-merge labels.
 * 
 * Usage:
 *   node scripts/automation/determine-auto-merge-labels.mjs <issue-title> <issue-body> [prd-path]
 * 
 * Outputs JSON with labels array and risk level.
 */

function determineAutoMergeLabels(issueTitle, issueBody, prdContent = null) {
  const title = (issueTitle || '').toLowerCase();
  const body = (issueBody || '').toLowerCase();
  const prd = prdContent ? JSON.parse(prdContent) : null;
  
  const labels = ['codex-automated'];
  let riskLevel = 'high';
  let category = 'unknown';
  
  // Extract category from title/body
  const categoryPatterns = {
    linting: [
      'lint', 'format', 'prettier', 'eslint', 'style', 'formatting',
      'code style', 'indentation', 'whitespace'
    ],
    documentation: [
      'doc', 'documentation', 'readme', 'comment', 'docs',
      'update readme', 'add documentation', 'improve docs'
    ],
    test: [
      'test', 'coverage', 'add test', 'unit test', 'integration test',
      'test case', 'test coverage', 'missing test'
    ],
    cleanup: [
      'remove unused', 'delete unused', 'cleanup', 'refactor',
      'remove dead code', 'unused code', 'dead code', 'code cleanup'
    ],
    dependency: [
      'update dependency', 'upgrade', 'bump', 'dependencies',
      'package update', 'npm update', 'pnpm update'
    ],
    codeReview: [
      'code review', 'review item', 'technical debt',
      'address review', 'fix review comment'
    ],
    gameLogic: [
      'game', 'combat', 'enemy', 'player', 'room', 'idle mode',
      'ability', 'spell', 'weapon', 'loot', 'xp', 'level'
    ],
    database: [
      'migration', 'database', 'schema', 'table', 'sql',
      'db migration', 'database change'
    ],
    api: [
      'api', 'endpoint', 'route', 'rest', 'graphql',
      'api change', 'breaking change'
    ],
  };
  
  // Determine category
  const allText = `${title} ${body}`;
  for (const [cat, patterns] of Object.entries(categoryPatterns)) {
    if (patterns.some(pattern => allText.includes(pattern))) {
      category = cat;
      break;
    }
  }
  
  // Check for high-risk indicators
  const highRiskIndicators = [
    'breaking', 'migration', 'database', 'api change',
    'game logic', 'combat system', 'player data', 'save data',
    'security', 'authentication', 'authorization', 'permission'
  ];
  
  let hasHighRisk = highRiskIndicators.some(indicator => 
    allText.includes(indicator)
  );
  
  // Check PRD for risk indicators
  if (prd) {
    const prdText = JSON.stringify(prd).toLowerCase();
    if (highRiskIndicators.some(indicator => prdText.includes(indicator))) {
      hasHighRisk = true;
    }
    
    // Check if PRD mentions game logic files
    const gameLogicFiles = [
      'gameroom', 'idlemode', 'sharedgame', 'combat', 'enemy',
      'player', 'ability', 'spell'
    ];
    if (gameLogicFiles.some(file => prdText.includes(file))) {
      hasHighRisk = true;
      category = 'gameLogic';
    }
  }
  
  // Determine risk level and labels based on category
  if (hasHighRisk || category === 'gameLogic' || category === 'database' || category === 'api') {
    riskLevel = 'high';
    labels.push('no-auto-merge');
  } else if (category === 'linting' || category === 'documentation') {
    riskLevel = 'low';
    labels.push('auto-merge-safe');
  } else if (category === 'test') {
    // Test-only changes (no production code) are safe
    if (allText.includes('test only') || allText.includes('test file')) {
      riskLevel = 'low';
      labels.push('auto-merge-safe');
    } else {
      riskLevel = 'medium';
      labels.push('auto-merge');
    }
  } else if (category === 'cleanup' || category === 'codeReview') {
    // Small cleanup/refactor changes can be medium risk
    riskLevel = 'medium';
    labels.push('auto-merge');
  } else if (category === 'dependency') {
    // Dependency updates: patch/minor = medium, major = high
    if (allText.includes('major') || allText.includes('breaking')) {
      riskLevel = 'high';
      labels.push('no-auto-merge');
    } else {
      riskLevel = 'medium';
      labels.push('auto-merge');
    }
  } else {
    // Unknown category - default to no auto-merge
    riskLevel = 'high';
    labels.push('no-auto-merge');
  }
  
  return {
    labels,
    riskLevel,
    category,
    reasoning: `Category: ${category}, Risk: ${riskLevel}, High-risk indicators: ${hasHighRisk}`
  };
}

// CLI usage
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('determine-auto-merge-labels.mjs')) {
  const issueTitle = process.argv[2] || '';
  const issueBody = process.argv[3] || '';
  const prdPath = process.argv[4];
  
  let prdContent = null;
  if (prdPath) {
    try {
      const fs = await import('fs');
      prdContent = fs.readFileSync(prdPath, 'utf-8');
    } catch (err) {
      console.error(`Warning: Could not read PRD file: ${err.message}`);
    }
  }
  
  const result = determineAutoMergeLabels(issueTitle, issueBody, prdContent);
  console.log(JSON.stringify(result, null, 2));
}

export { determineAutoMergeLabels };
