
import { intro, outro, multiselect, text, confirm, spinner } from '@clack/prompts';
import { execSync } from 'child_process';
import kleur from 'kleur';

async function main() {
  console.clear();
  
  intro(kleur.bgBlue().white(' 🚀 Gotchiverse Deployment CLI '));

  const options = [
    { value: 'game', label: 'Game Server (deploy.yml)', hint: 'Triggers game-*' },
    { value: 'sg', label: 'Subgraph (deploy-subgraph.yml)', hint: 'Triggers sg-*' },
    { value: 'func', label: 'Supabase Functions (deploy-functions.yml)', hint: 'Triggers func-*' },
    { value: 'all', label: 'ALL Systems', hint: 'Triggers all-*' },
  ];

  const selected = await multiselect({
    message: 'Which systems do you want to deploy?',
    options,
    required: true,
  });

  if (typeof selected === 'symbol') {
    outro(kleur.yellow('Operation cancelled.'));
    process.exit(0);
  }

  // If 'all' is selected, it overrides others or can be treated as just 'all-'
  // If the user selects 'all' + others, 'all-' is enough to trigger everything if the workflows are set up that way.
  // However, the workflows trigger on `all-*` OR their specific tag. 
  // Using `all-` is cleaner if they want everything.
  
  let finalPrefixes: string[] = [];
  
  if (selected.includes('all')) {
    finalPrefixes = ['all'];
  } else {
    finalPrefixes = selected as string[];
  }

  const tagSuffix = await text({
    message: 'Enter the tag version/suffix (e.g., v1.0.0)',
    placeholder: 'v1.0.0',
    validate(value) {
      if (value.length === 0) return 'Tag suffix is required!';
      if (value.includes(' ')) return 'No spaces allowed!';
    },
  });

  if (typeof tagSuffix === 'symbol') {
    outro(kleur.yellow('Operation cancelled.'));
    process.exit(0);
  }

  const tagsToCreate = finalPrefixes.map(prefix => `${prefix}-${tagSuffix}`);

  const shouldContinue = await confirm({
    message: `Ready to create and push the following tags?\n\n${tagsToCreate.map(t => kleur.green(`  • ${t}`)).join('\n')}\n`,
  });

  if (!shouldContinue || typeof shouldContinue === 'symbol') {
    outro(kleur.yellow('Deployment cancelled.'));
    process.exit(0);
  }

  const s = spinner();
  
  try {
    s.start('Tagging and pushing...');

    // Verify we are on main (optional, but good practice for prod deploys)
    // const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    // if (branch !== 'main') {
    //   // Warning or strict check? Let's just warn via log if not main, or maybe just proceed as user knows best.
    // }

    for (const tag of tagsToCreate) {
      // Check if tag exists locally
      try {
        execSync(`git rev-parse ${tag}`, { stdio: 'ignore' });
        // If successful, tag exists. Delete it? Or fail?
        // Let's fail or ask. For now, assume simple flow: fail if exists.
        s.stop(kleur.red(`Tag ${tag} already exists!`));
        process.exit(1);
      } catch (e) {
        // Tag doesn't exist, good.
      }

      // Create tag
      execSync(`git tag ${tag}`);
      
      // Push tag
      execSync(`git push origin ${tag}`);
    }

    s.stop(kleur.green('Deployment tags pushed successfully!'));
    
    outro(`
${kleur.green('✔')} Deployment triggers sent to GitHub Actions.
${kleur.dim('Check progress at: https://github.com/gotchiverse/gotchiverse-live/actions')}
    `);

  } catch (error: any) {
    s.stop(kleur.red('Failed to deploy.'));
    console.error(error.message);
    process.exit(1);
  }
}

main().catch(console.error);

