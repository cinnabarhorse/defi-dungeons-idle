#!/usr/bin/env tsx

import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath, pathToFileURL } from 'url';

import {
  confirm,
  intro,
  isCancel,
  note,
  outro,
  select,
  spinner,
  text,
} from '@clack/prompts';
import kleur from 'kleur';
import prettier from 'prettier';
import { z } from 'zod';
import {
  Node,
  Project,
  QuoteKind,
  SyntaxKind,
  type ArrayLiteralExpression,
  type ObjectLiteralExpression,
} from 'ts-morph';

type FlagOptions = {
  dryRun: boolean;
  slot?: string;
  type?: string;
};
const slugSchema = z
  .string()
  .min(2, 'Slug must be at least 2 characters')
  .max(40, 'Slug must be at most 40 characters')
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'Slug must be lowercase, alphanumeric, and dash-separated'
  );

async function formatFile(filepath: string) {
  const config = await prettier.resolveConfig(filepath);
  const content = await fs.readFile(filepath, 'utf8');
  const formatted = await prettier.format(content, {
    ...(config ?? {}),
    filepath,
  });
  await fs.writeFile(filepath, formatted, 'utf8');
}

function parseArgs(): FlagOptions {
  const args = process.argv.slice(2);
  const flags: FlagOptions = { dryRun: false };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--dry-run':
      case '--dryrun':
        flags.dryRun = true;
        break;
      case '--slot':
        flags.slot = args[i + 1];
        i += 1;
        break;
      case '--type':
      case '--item-type':
        flags.type = args[i + 1];
        i += 1;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        break;
    }
  }

  return flags;
}

function printHelp() {
  console.log(`
Wearables Classification CLI

Usage:
  pnpm tsx scripts/wearables-cli.ts [options]

Options:
  --slot <slot>           Specify the wearable slot (e.g. head, body)
  --type <slug>           Specify the classification slug to apply
  --dry-run               Show planned updates without writing files
  --help                  Show this help message
`);
}

function ensureStringLiteralArray(
  obj: ObjectLiteralExpression,
  propertyName: string
): ArrayLiteralExpression {
  const property = obj.getProperty(propertyName);
  if (!property || !Node.isPropertyAssignment(property)) {
    throw new Error(
      `ITEM_TYPES_BY_SLOT.${propertyName} is missing or not a property assignment`
    );
  }
  const initializer = property.getInitializer();
  if (!initializer || !Node.isArrayLiteralExpression(initializer)) {
    throw new Error(
      `ITEM_TYPES_BY_SLOT.${propertyName} is not an array literal`
    );
  }
  return initializer;
}

function getArrayLiteralValues(arrayLiteral: ArrayLiteralExpression): string[] {
  return arrayLiteral
    .getElements()
    .map((element) => element.getText().replace(/^['"`]|['"`]$/g, ''));
}

async function main() {
  const flags = parseArgs();
  intro(kleur.cyan('Wearables Classification CLI'));

  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(currentDir, '..');
  const tsconfigPath = path.join(repoRoot, 'tsconfig.json');
  const wearablesPath = path.join(repoRoot, 'data', 'wearables.ts');

  const project = new Project({
    tsConfigFilePath: tsconfigPath,
    manipulationSettings: {
      quoteKind: QuoteKind.Single,
      useTrailingCommas: true,
    },
  });

  const wearablesSource =
    project.getSourceFile(wearablesPath) ??
    project.addSourceFileAtPath(wearablesPath);
  if (!wearablesSource) {
    throw new Error('Failed to load data/wearables.ts.');
  }

  const wearableModuleUrl = pathToFileURL(wearablesPath).href;
  const wearablesModule = await import(wearableModuleUrl);

  const slotAlias = wearablesSource.getTypeAlias('WearableSlot');
  if (!slotAlias) {
    throw new Error('WearableSlot type alias not found in data/wearables.ts');
  }
  const slotTypes = slotAlias
    .getType()
    .getUnionTypes()
    .map((type) => type.getLiteralValue() as string)
    .filter((value): value is string => typeof value === 'string');

  if (slotTypes.length === 0) {
    throw new Error('No WearableSlot values found.');
  }

  const slotOptions = slotTypes.map((value) => ({
    value,
    label: value,
  }));

  let selectedSlot = flags.slot;
  if (selectedSlot) {
    if (!slotTypes.includes(selectedSlot)) {
      throw new Error(
        `Invalid slot "${selectedSlot}". Valid options: ${slotTypes.join(', ')}`
      );
    }
  } else {
    const slotResult = await select({
      message: 'Select a wearable slot',
      options: slotOptions,
    });
    if (isCancel(slotResult)) {
      outro(kleur.yellow('Operation cancelled.'));
      process.exit(0);
    }
    if (typeof slotResult !== 'string') {
      throw new Error('Unexpected select result');
    }
    selectedSlot = slotResult;
  }

  if (!selectedSlot) {
    throw new Error('Slot selection failed.');
  }

  const registry = (wearablesModule.ITEM_TYPES_BY_SLOT ?? {}) as Record<
    string,
    string[]
  >;

  let slug = flags.type;
  const validateSlug = (input: string) => {
    const result = slugSchema.safeParse(input.trim());
    if (!result.success) {
      return {
        ok: false as const,
        error: result.error.issues[0]?.message ?? 'Invalid slug value',
      };
    }

    return { ok: true as const, value: result.data };
  };

  if (slug) {
    const validation = validateSlug(slug);
    if (!validation.ok) {
      throw new Error(validation.error);
    }
    slug = validation.value;
  } else {
    const slugInput = await text({
      message: 'Enter the classification slug',
      placeholder: 'light-armor',
      validate(value) {
        const result = validateSlug(value);
        if (!result.ok) {
          return result.error;
        }
        return undefined;
      },
    });
    if (isCancel(slugInput)) {
      outro(kleur.yellow('Operation cancelled.'));
      process.exit(0);
    }
    if (typeof slugInput !== 'string') {
      throw new Error('Unexpected input value');
    }
    const validated = validateSlug(slugInput);
    if (!validated.ok) {
      throw new Error(validated.error);
    }
    slug = validated.value;
  }

  if (!slug) {
    throw new Error('Classification slug is required.');
  }

  if (registry[selectedSlot].includes(slug)) {
    note(
      `Item type "${slug}" already exists for slot "${selectedSlot}".`,
      kleur.green('No action required.')
    );
    outro(kleur.green('Nothing to do.'));
    return;
  }

  const confirmation = await confirm({
    message: `Add "${slug}" to ITEM_TYPES_BY_SLOT.${selectedSlot}?`,
  });
  if (isCancel(confirmation) || confirmation === false) {
    outro(kleur.yellow('Operation cancelled.'));
    process.exit(0);
  }

  const registryDeclaration =
    wearablesSource
      .getVariableDeclaration('ITEM_TYPES_BY_SLOT')
      ?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression) ?? null;

  if (!registryDeclaration) {
    throw new Error(
      'ITEM_TYPES_BY_SLOT declaration not found in wearables file.'
    );
  }

  const registrySlotArray = ensureStringLiteralArray(
    registryDeclaration,
    selectedSlot
  );
  const registryValues = new Set(getArrayLiteralValues(registrySlotArray));

  if (registryValues.has(slug)) {
    note(
      `Item type "${slug}" is already declared for slot "${selectedSlot}".`,
      kleur.green('No action required.')
    );
    outro(kleur.green('Nothing to do.'));
    return;
  }

  if (flags.dryRun) {
    note(
      kleur.yellow('Dry run'),
      `Planned updates:
- Registry will include "${slug}" for slot "${selectedSlot}"`
    );
    outro(kleur.cyan('Dry run complete. No files were modified.'));
    process.exit(0);
  }

  const savingSpinner = spinner();
  savingSpinner.start('Saving updates...');

  registrySlotArray.addElement(`'${slug}'`);
  await project.save();
  await formatFile(wearablesPath);

  savingSpinner.stop('Source files updated.');

  const generatorSpinner = spinner();
  generatorSpinner.start('Running pnpm run generate:shared...');
  const result = spawnSync('pnpm', ['run', 'generate:shared'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    generatorSpinner.stop(kleur.red('generate:shared failed.'));
    throw new Error('Failed to run pnpm run generate:shared');
  }
  generatorSpinner.stop('Shared files generated.');

  outro(kleur.green(`Added "${slug}" to ITEM_TYPES_BY_SLOT.${selectedSlot}`));
}

main().catch((error) => {
  outro(kleur.red(String(error instanceof Error ? error.message : error)));
  process.exit(1);
});
