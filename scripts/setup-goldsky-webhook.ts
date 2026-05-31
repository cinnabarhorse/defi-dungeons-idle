import { execSync } from 'child_process';
import * as readline from 'readline';

const SUBGRAPH_NAME = 'dd-deposits-subgraph';
const WEBHOOK_NAME = 'supabase-deposits-test';
const ENTITY = 'deposit'; // Lowercase per Goldsky list-entities
const PROJECT_REF = 'bnshvshhmddyedmxoqtg';
const OP = 'INSERT';
const TAG = 'initial-deploy-5';

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('🔧 Configuring Goldsky Webhook...');

  // 1. Get Configuration
  const projectRef =
    PROJECT_REF || (await prompt('Enter Supabase Project Ref: '));
  if (!projectRef) throw new Error('Project Ref is required');

  const secret =
    process.env.GOLDSKY_WEBHOOK_SECRET ||
    (await prompt('Enter Webhook Secret (optional, press enter to skip): '));

  const versionTag =
    TAG ||
    (await prompt('Enter Subgraph Version Tag (default: v0.0.2): ')) ||
    'v0.0.2';

  const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/goldsky-deposits`;
  const subgraphFullName = `${SUBGRAPH_NAME}/${versionTag}`;

  console.log(`
  Configuration:
  - Subgraph: ${subgraphFullName}
  - Webhook:  ${WEBHOOK_NAME}
  - URL:      ${webhookUrl}
  `);

  // 2. Construct Command
  // We use npx to ensure we use the latest or locally installed version if present
  // Syntax: goldsky subgraph webhook create <SUBGRAPH_NAME> --name <NAME> ...
  let cmd = `npx -y @goldskycom/cli subgraph webhook create "${subgraphFullName}"`;
  cmd += ` --name "${WEBHOOK_NAME}"`;
  cmd += ` --url "${webhookUrl}"`;
  cmd += ` --entity "${ENTITY}"`;
  // cmd += ` --op "${OP}"`; // Not supported by CLI
  // cmd += ` --headers "Content-Type=application/json"`; // Not supported by CLI

  if (secret) {
    cmd += ` --secret "${secret}"`;
  }

  console.log('🚀 Running Goldsky CLI...');
  try {
    // Execute
    execSync(cmd, { stdio: 'inherit' });
    console.log('✅ Webhook configured successfully!');
  } catch (error) {
    console.error('❌ Failed to configure webhook.');
    process.exit(1);
  }
}

main().catch(console.error);
