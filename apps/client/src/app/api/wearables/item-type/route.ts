import { NextResponse } from 'next/server';
import path from 'path';
import { spawnSync } from 'child_process';
import fs from 'fs/promises';
import vm from 'vm';

import prettier from 'prettier';
import { z } from 'zod';
import {
  CodeBlockWriter,
  Node,
  Project,
  QuoteKind,
  SyntaxKind,
  type ArrayLiteralExpression,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type SourceFile,
} from 'ts-morph';

import {
  getWearableBySlug as getWearableBySlugCached,
  ITEM_TYPES_BY_SLOT as SHARED_ITEM_TYPES_BY_SLOT,
  EQUIPMENT_STATS as SHARED_EQUIPMENT_STATS,
  STAT as SHARED_STAT,
  type AbilityEffect,
  type AuraEffect,
  type EquipmentEffect,
  type EquipmentModifierOperation,
  type EquipmentStat,
  type EquipmentStatModifier,
  type TagEffect,
  type WearableRarity,
  type WearableSlot,
} from '../../../../data/wearables';
import { getPrimarySlot } from '../../../../lib/wearable-utils';

const repoRoot = path.join(process.cwd(), '..', '..');
const tsconfigPath = path.join(repoRoot, 'tsconfig.json');
const wearablesPath = path.join(repoRoot, 'data', 'wearables.ts');

const WEARABLE_SLOT_VALUES = Object.keys(
  SHARED_ITEM_TYPES_BY_SLOT
) as WearableSlot[];
const WEARABLE_SLOT_SET = new Set<string>(WEARABLE_SLOT_VALUES);

const RARITY_VALUES = [
  'common',
  'uncommon',
  'rare',
  'legendary',
  'mythical',
  'godlike',
] as const satisfies readonly WearableRarity[];

const EQUIPMENT_STAT_SET = new Set<string>(
  SHARED_EQUIPMENT_STATS as readonly string[]
);

const UpdatePayloadSchema = z.object({
  updates: z
    .array(
      z.object({
        wearableSlug: z.string().min(1),
        itemType: z
          .string()
          .min(2)
          .max(40)
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
          .nullable(),
      })
    )
    .nonempty(),
});

const WearableSlotSchema = z
  .string()
  .trim()
  .refine((value): value is WearableSlot => WEARABLE_SLOT_SET.has(value), {
    message: 'Invalid wearable slot.',
  })
  .transform((value) => value as WearableSlot);

const RaritySchema = z.enum(RARITY_VALUES);

const EquipmentStatSchema = z
  .string()
  .trim()
  .refine((value): value is EquipmentStat => EQUIPMENT_STAT_SET.has(value), {
    message: 'Invalid equipment stat.',
  })
  .transform((value) => value as EquipmentStat);

const OperationSchema = z.enum(['add', 'mul', 'add_percent']);

const EquipmentStatModifierSchema = z
  .object({
    stat: EquipmentStatSchema,
    value: z.number().finite(),
    operation: OperationSchema.optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
  })
  .superRefine((modifier, ctx) => {
    const operation: EquipmentModifierOperation = modifier.operation ?? 'add';

    if (operation === 'mul') {
      if (modifier.value <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Multipliers must be greater than 0.',
          path: ['value'],
        });
      } else if (modifier.value < 0.5 || modifier.value > 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Multiplier should stay between 0.5 and 3 for safety.',
          path: ['value'],
        });
      }
    }

    if (operation === 'add_percent') {
      if (modifier.value < -1 || modifier.value > 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            'Percent modifiers must be between -1.0 (-100%) and 5.0 (+500%).',
          path: ['value'],
        });
      }
    }

    if (
      modifier.min !== undefined &&
      modifier.max !== undefined &&
      modifier.min > modifier.max
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'min cannot be greater than max.',
        path: ['min'],
      });
    }
  });

const StatEffectSchema = z.object({
  type: z.literal('stat'),
  modifiers: z
    .array(EquipmentStatModifierSchema)
    .min(1, 'Provide at least one stat modifier.'),
});

const TagEffectSchema = z.object({
  type: z.literal('tag'),
  tags: z
    .array(z.string().trim().min(1, 'Tag cannot be empty.'))
    .min(1, 'Provide at least one tag.'),
});

const AuraEffectSchema = z.object({
  type: z.literal('aura'),
  color: z.string().trim().min(1).optional(),
  level: z.number().int().min(1).max(5).optional(),
});

const AbilityEffectSchema = z.object({
  type: z.literal('ability'),
  abilitySlug: z.string().trim().min(1),
  params: z.record(z.string().trim().min(1), z.any()).optional(),
});

const EquipmentEffectInputSchema = z.union([
  StatEffectSchema,
  TagEffectSchema,
  AuraEffectSchema,
  AbilityEffectSchema,
]);

const SaveItemTypeEffectsSchema = z
  .object({
    slot: WearableSlotSchema,
    typeSlug: z
      .string()
      .min(2)
      .max(40)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    rarity: RaritySchema,
    mode: z.enum(['replace', 'append', 'remove']),
    effects: z.array(EquipmentEffectInputSchema),
  })
  .superRefine((input, ctx) => {
    if (input.mode !== 'replace' && input.effects.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide at least one effect when appending or removing.',
        path: ['effects'],
      });
    }
  });

type SaveItemTypeEffectsInput = z.infer<typeof SaveItemTypeEffectsSchema>;

export const dynamic = 'force-dynamic';

async function formatFile(filePath: string) {
  const config = await prettier.resolveConfig(filePath);
  const content = await fs.readFile(filePath, 'utf8');
  const formatted = await prettier.format(content, {
    ...(config ?? {}),
    filepath: filePath,
  });
  await fs.writeFile(filePath, formatted, 'utf8');
}

function createProject(): Project {
  return new Project({
    tsConfigFilePath: tsconfigPath,
    manipulationSettings: {
      quoteKind: QuoteKind.Single,
      useTrailingCommas: true,
    },
  });
}

function loadWearablesSource(project: Project): SourceFile {
  const source =
    project.getSourceFile(wearablesPath) ??
    project.addSourceFileAtPath(wearablesPath);

  if (!source) {
    throw new Error('Failed to load wearables source file.');
  }

  return source;
}

async function persistWearables(project: Project) {
  await project.save();
  await formatFile(wearablesPath);

  const result = spawnSync('pnpm', ['run', 'generate:shared'], {
    cwd: repoRoot,
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    throw new Error('Failed to run pnpm run generate:shared.');
  }
}

function getPropertyName(property: PropertyAssignment): string {
  const nameNode = property.getNameNode();
  return nameNode.getText().replace(/^['"`]|['"`]$/g, '');
}

function escapeString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function formatPropertyName(key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return key;
  }
  return `'${escapeString(key)}'`;
}

function formatNumber(value: number): string {
  if (Number.isInteger(value)) {
    return value.toString();
  }
  if (Number.isFinite(value)) {
    return Number(value).toString();
  }
  return '0';
}

function findPropertyAssignment(
  objectLiteral: ObjectLiteralExpression,
  key: string
): PropertyAssignment | undefined {
  return objectLiteral.getProperties().find((property) => {
    if (!Node.isPropertyAssignment(property)) {
      return false;
    }
    return getPropertyName(property) === key;
  }) as PropertyAssignment | undefined;
}

function getObjectLiteralFromProperty(
  property: PropertyAssignment
): ObjectLiteralExpression {
  const initializer = property.getInitializerIfKind(
    SyntaxKind.ObjectLiteralExpression
  );
  if (initializer) {
    return initializer;
  }

  property.setInitializer('{}');
  const created = property.getInitializerIfKind(
    SyntaxKind.ObjectLiteralExpression
  );
  if (!created) {
    throw new Error('Failed to normalise object literal initializer.');
  }
  return created;
}

function sortObject<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => sortObject(entry)) as unknown as T;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, val]) => val !== undefined
    );

    entries.sort(([a], [b]) => a.localeCompare(b));

    const result: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      result[key] = sortObject(val);
    }
    return result as unknown as T;
  }

  return value;
}

function normalizeEffect(effect: EquipmentEffect): EquipmentEffect {
  if (effect.type === 'stat') {
    return {
      type: 'stat',
      modifiers: effect.modifiers.map((modifier) => {
        const normalized: EquipmentStatModifier = {
          stat: modifier.stat,
          value: modifier.value,
        };
        if (modifier.operation) {
          normalized.operation = modifier.operation;
        }
        if (modifier.min !== undefined) {
          normalized.min = modifier.min;
        }
        if (modifier.max !== undefined) {
          normalized.max = modifier.max;
        }
        return normalized;
      }),
    };
  }

  if (effect.type === 'tag') {
    const seen = new Set<string>();
    const tags = effect.tags
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .filter((tag) => {
        if (seen.has(tag)) {
          return false;
        }
        seen.add(tag);
        return true;
      });
    const normalized: TagEffect = {
      type: 'tag',
      tags,
    };
    return normalized;
  }

  if (effect.type === 'aura') {
    const aura: AuraEffect = { type: 'aura' };
    if (effect.color?.trim()) {
      aura.color = effect.color.trim();
    }
    if (effect.level !== undefined) {
      aura.level = effect.level;
    }
    return aura;
  }

  const ability: AbilityEffect = {
    type: 'ability',
    abilitySlug: effect.abilitySlug.trim(),
  };
  if (effect.params) {
    ability.params = sortObject(effect.params);
  }
  return ability;
}

function canonicalizeEffect(effect: EquipmentEffect): string {
  if (effect.type === 'stat') {
    const modifiers = effect.modifiers.map((modifier) => ({
      stat: modifier.stat,
      operation: modifier.operation ?? 'add',
      value: modifier.value,
      min: modifier.min ?? null,
      max: modifier.max ?? null,
    }));

    modifiers.sort((a, b) => {
      if (a.stat !== b.stat) {
        return a.stat.localeCompare(b.stat);
      }
      if (a.operation !== b.operation) {
        return a.operation.localeCompare(b.operation);
      }
      if (a.value !== b.value) {
        return a.value - b.value;
      }
      const minA = a.min ?? Number.NEGATIVE_INFINITY;
      const minB = b.min ?? Number.NEGATIVE_INFINITY;
      if (minA !== minB) {
        return minA - minB;
      }
      const maxA = a.max ?? Number.POSITIVE_INFINITY;
      const maxB = b.max ?? Number.POSITIVE_INFINITY;
      if (maxA !== maxB) {
        return maxA - maxB;
      }
      return 0;
    });

    return JSON.stringify({ type: 'stat', modifiers });
  }

  if (effect.type === 'tag') {
    const tags = [...effect.tags].map((tag) => tag.trim()).sort();
    return JSON.stringify({ type: 'tag', tags });
  }

  if (effect.type === 'aura') {
    return JSON.stringify({
      type: 'aura',
      color: effect.color ?? null,
      level: effect.level ?? null,
    });
  }

  return JSON.stringify({
    type: 'ability',
    abilitySlug: effect.abilitySlug.trim(),
    params: sortObject(effect.params ?? {}),
  });
}

function sanitizeEffects(effects: EquipmentEffect[]): EquipmentEffect[] {
  const seen = new Set<string>();
  const sanitized: EquipmentEffect[] = [];

  for (const effect of effects.map((entry) => normalizeEffect(entry))) {
    const key = canonicalizeEffect(effect);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    sanitized.push(effect);
  }

  return sanitized;
}

function effectsEqual(a: EquipmentEffect[], b: EquipmentEffect[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (canonicalizeEffect(a[i]) !== canonicalizeEffect(b[i])) {
      return false;
    }
  }
  return true;
}

function parseEffectsFromArray(
  arrayLiteral: ArrayLiteralExpression | undefined
): EquipmentEffect[] {
  if (!arrayLiteral) {
    return [];
  }

  const parsed: EquipmentEffect[] = [];
  for (const element of arrayLiteral.getElements()) {
    const raw = element.getText().trim();
    if (!raw) {
      continue;
    }

    try {
      const evaluated = vm.runInNewContext(`(${raw})`, {
        STAT: SHARED_STAT,
      }) as EquipmentEffect;
      parsed.push(normalizeEffect(evaluated));
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : String(error ?? 'unknown');
      throw new Error(`Failed to parse existing effect "${raw}": ${reason}`);
    }
  }
  return parsed;
}

function writeString(writer: CodeBlockWriter, value: string) {
  writer.write(`'${escapeString(value)}'`);
}

function writeValue(writer: CodeBlockWriter, value: unknown): void {
  if (value === null) {
    writer.write('null');
    return;
  }
  if (typeof value === 'string') {
    writeString(writer, value);
    return;
  }
  if (typeof value === 'number') {
    writer.write(formatNumber(value));
    return;
  }
  if (typeof value === 'boolean') {
    writer.write(value ? 'true' : 'false');
    return;
  }
  if (Array.isArray(value)) {
    writer.write('[');
    if (value.length === 0) {
      writer.write(']');
      return;
    }
    writer.newLine();
    writer.indent(() => {
      value.forEach((entry, index) => {
        writeValue(writer, entry);
        if (index < value.length - 1) {
          writer.write(',');
        }
        writer.newLine();
      });
    });
    writer.write(']');
    return;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    writer.write('{');
    if (entries.length === 0) {
      writer.write('}');
      return;
    }
    writer.newLine();
    writer.indent(() => {
      entries.forEach(([key, nested]) => {
        writer.write(`${formatPropertyName(key)}: `);
        writeValue(writer, nested);
        writer.write(',');
        writer.newLine();
      });
    });
    writer.write('}');
    return;
  }

  writer.write('undefined');
}

function writeEffectsArray(
  writer: CodeBlockWriter,
  effects: EquipmentEffect[]
) {
  writer.write('[');
  if (effects.length === 0) {
    writer.write(']');
    return;
  }

  writer.newLine();
  writer.indent(() => {
    effects.forEach((effect, index) => {
      writeEffect(writer, effect);
      if (index < effects.length - 1) {
        writer.write(',');
      }
      writer.newLine();
    });
  });
  writer.write(']');
}

function writeEffect(writer: CodeBlockWriter, effect: EquipmentEffect) {
  writer.write('{');
  writer.newLine();
  writer.indent(() => {
    writer.write(`type: '${effect.type}',`);
    writer.newLine();

    if (effect.type === 'stat') {
      writer.write('modifiers: [');
      if (effect.modifiers.length === 0) {
        writer.write('],');
        writer.newLine();
      } else {
        writer.newLine();
        writer.indent(() => {
          effect.modifiers.forEach((modifier, index) => {
            writer.write('{');
            writer.newLine();
            writer.indent(() => {
              writer.write(`stat: '${modifier.stat}',`);
              writer.newLine();
              writer.write(`value: ${formatNumber(modifier.value)},`);
              writer.newLine();
              if (modifier.operation) {
                writer.write(`operation: '${modifier.operation}',`);
                writer.newLine();
              }
              if (modifier.min !== undefined) {
                writer.write(`min: ${formatNumber(modifier.min)},`);
                writer.newLine();
              }
              if (modifier.max !== undefined) {
                writer.write(`max: ${formatNumber(modifier.max)},`);
                writer.newLine();
              }
            });
            writer.write('}');
            if (index < effect.modifiers.length - 1) {
              writer.write(',');
            }
            writer.newLine();
          });
        });
        writer.write('],');
        writer.newLine();
      }
      return;
    }

    if (effect.type === 'tag') {
      writer.write('tags: [');
      if (effect.tags.length === 0) {
        writer.write('],');
        writer.newLine();
      } else {
        writer.newLine();
        writer.indent(() => {
          effect.tags.forEach((tag, index) => {
            writeString(writer, tag);
            if (index < effect.tags.length - 1) {
              writer.write(',');
            }
            writer.newLine();
          });
        });
        writer.write('],');
        writer.newLine();
      }
      return;
    }

    if (effect.type === 'aura') {
      if (effect.color) {
        writer.write(`color: '${escapeString(effect.color)}',`);
        writer.newLine();
      }
      if (effect.level !== undefined) {
        writer.write(`level: ${formatNumber(effect.level)},`);
        writer.newLine();
      }
      return;
    }

    writer.write(`abilitySlug: '${escapeString(effect.abilitySlug)}',`);
    writer.newLine();
    if (effect.params && Object.keys(effect.params).length > 0) {
      writer.write('params: ');
      writeValue(writer, effect.params);
      writer.write(',');
      writer.newLine();
    }
  });
  writer.write('}');
}

function mutateItemTypeEffects(
  initializer: ObjectLiteralExpression,
  input: SaveItemTypeEffectsInput
): { changed: boolean; total: number } {
  const slotProperty = findPropertyAssignment(initializer, input.slot);
  const slotObject = slotProperty
    ? getObjectLiteralFromProperty(slotProperty)
    : null;

  const typeProperty =
    slotObject !== null
      ? findPropertyAssignment(slotObject, input.typeSlug)
      : null;
  const typeObject = typeProperty
    ? getObjectLiteralFromProperty(typeProperty)
    : null;

  const rarityProperty =
    typeObject !== null
      ? findPropertyAssignment(typeObject, input.rarity)
      : undefined;

  const existingEffects = rarityProperty
    ? parseEffectsFromArray(
        rarityProperty.getInitializerIfKind(SyntaxKind.ArrayLiteralExpression)
      )
    : [];

  const sanitizedExisting = existingEffects;
  const sanitizedInput = sanitizeEffects(input.effects);

  let newEffects: EquipmentEffect[] = sanitizedExisting;
  let changed = false;

  if (input.mode === 'replace') {
    if (!effectsEqual(sanitizedExisting, sanitizedInput)) {
      newEffects = sanitizedInput;
      changed = true;
    }
  } else if (input.mode === 'append') {
    newEffects = [...sanitizedExisting];
    const seen = new Set(
      sanitizedExisting.map((effect) => canonicalizeEffect(effect))
    );
    for (const effect of sanitizedInput) {
      const key = canonicalizeEffect(effect);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      newEffects.push(effect);
      changed = true;
    }
  } else {
    // remove
    if (!rarityProperty) {
      return {
        changed: false,
        total: sanitizedExisting.length,
      };
    }
    const removeKeys = new Set(
      sanitizedInput.map((effect) => canonicalizeEffect(effect))
    );
    newEffects = sanitizedExisting.filter(
      (effect) => !removeKeys.has(canonicalizeEffect(effect))
    );
    if (newEffects.length !== sanitizedExisting.length) {
      changed = true;
    }
  }

  if (!changed) {
    return {
      changed: false,
      total: sanitizedExisting.length,
    };
  }

  if (newEffects.length === 0) {
    if (rarityProperty) {
      rarityProperty.remove();
    }
    if (typeObject && typeObject.getProperties().length === 0 && typeProperty) {
      typeProperty.remove();
    }
    if (slotObject && slotObject.getProperties().length === 0 && slotProperty) {
      slotProperty.remove();
    }

    return {
      changed: true,
      total: 0,
    };
  }

  const ensuredSlotProperty =
    slotProperty ??
    initializer.addPropertyAssignment({
      name: formatPropertyName(input.slot),
      initializer: '{}',
    });
  const ensuredSlotObject = getObjectLiteralFromProperty(ensuredSlotProperty);

  const ensuredTypeProperty =
    typeProperty ??
    ensuredSlotObject.addPropertyAssignment({
      name: formatPropertyName(input.typeSlug),
      initializer: '{}',
    });
  const ensuredTypeObject =
    typeObject ?? getObjectLiteralFromProperty(ensuredTypeProperty);

  const ensuredRarityProperty =
    findPropertyAssignment(ensuredTypeObject, input.rarity) ??
    ensuredTypeObject.addPropertyAssignment({
      name: formatPropertyName(input.rarity),
      initializer: '[]',
    });

  ensuredRarityProperty.setInitializer((writer) => {
    writeEffectsArray(writer, newEffects);
  });

  return {
    changed: true,
    total: newEffects.length,
  };
}

async function applyItemTypeAssignments(
  payload: z.infer<typeof UpdatePayloadSchema>
) {
  const project = createProject();
  const wearablesSource = loadWearablesSource(project);

  const itemTypesDeclaration =
    wearablesSource
      .getVariableDeclaration('itemTypes')
      ?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression) ?? null;

  if (!itemTypesDeclaration) {
    throw new Error('itemTypes declaration not found in wearables file.');
  }

  const dedupedUpdates = new Map<string, string | null>();
  for (const update of payload.updates) {
    dedupedUpdates.set(update.wearableSlug, update.itemType);
  }

  const appliedUpdates: Array<{
    slug: string;
    id: number;
    itemType: string | null;
  }> = [];

  for (const [wearableSlug, itemType] of dedupedUpdates.entries()) {
    const wearable = getWearableBySlugCached(wearableSlug);
    if (!wearable) {
      throw new Error(`Unknown wearable slug "${wearableSlug}".`);
    }

    const primarySlot = getPrimarySlot(wearable);
    const allowedTypes = SHARED_ITEM_TYPES_BY_SLOT[primarySlot] ?? [];
    if (itemType && !allowedTypes.includes(itemType)) {
      throw new Error(
        `Item type "${itemType}" is not registered for slot "${primarySlot}".`
      );
    }

    const property = itemTypesDeclaration.getProperty(String(wearable.id));
    if (!property || !Node.isPropertyAssignment(property)) {
      throw new Error(
        `Wearable id ${wearable.id} definition not found in itemTypes.`
      );
    }

    const initializer = property.getInitializerIfKind(
      SyntaxKind.ObjectLiteralExpression
    );
    if (!initializer) {
      throw new Error(`Wearable id ${wearable.id} initializer not found.`);
    }

    const existingProperty = initializer.getProperty('itemType');
    const currentValue =
      existingProperty && Node.isPropertyAssignment(existingProperty)
        ? existingProperty
            .getInitializer()
            ?.getText()
            .replace(/^['"`]|['"`]$/g, '')
        : null;

    if (
      (itemType === null && currentValue === null) ||
      itemType === currentValue
    ) {
      continue;
    }

    if (itemType === null) {
      if (existingProperty && Node.isPropertyAssignment(existingProperty)) {
        existingProperty.remove();
      }
    } else if (
      existingProperty &&
      Node.isPropertyAssignment(existingProperty)
    ) {
      existingProperty.setInitializer(`'${itemType}'`);
    } else {
      initializer.addPropertyAssignment({
        name: 'itemType',
        initializer: `'${itemType}'`,
      });
    }

    appliedUpdates.push({
      slug: wearableSlug,
      id: wearable.id,
      itemType,
    });
  }

  if (appliedUpdates.length === 0) {
    return { ok: true as const, updated: 0 };
  }

  await persistWearables(project);

  return { ok: true as const, updated: appliedUpdates.length };
}

async function applyItemTypeEffects(input: SaveItemTypeEffectsInput) {
  const allowedTypes = SHARED_ITEM_TYPES_BY_SLOT[input.slot] ?? [];
  if (!allowedTypes.includes(input.typeSlug)) {
    throw new Error(
      `Item type "${input.typeSlug}" is not registered for slot "${input.slot}".`
    );
  }

  const project = createProject();
  const wearablesSource = loadWearablesSource(project);

  const declaration =
    wearablesSource.getVariableDeclaration('ITEM_TYPE_EFFECTS');
  if (!declaration) {
    throw new Error(
      'ITEM_TYPE_EFFECTS declaration not found in wearables file.'
    );
  }

  const initializer = declaration.getInitializerIfKind(
    SyntaxKind.ObjectLiteralExpression
  );
  if (!initializer) {
    throw new Error(
      'ITEM_TYPE_EFFECTS initializer is not an object literal expression.'
    );
  }

  const mutation = mutateItemTypeEffects(initializer, input);

  if (!mutation.changed) {
    return {
      ok: true as const,
      updated: 0,
      total: mutation.total,
      mode: input.mode,
    };
  }

  await persistWearables(project);

  return {
    ok: true as const,
    updated: 1,
    total: mutation.total,
    mode: input.mode,
  };
}

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Item type editing is disabled in production.' },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();

    const itemTypeUpdateAttempt = UpdatePayloadSchema.safeParse(body);
    if (itemTypeUpdateAttempt.success) {
      const result = await applyItemTypeAssignments(itemTypeUpdateAttempt.data);
      return NextResponse.json(result);
    }

    const itemTypeEffectsAttempt = SaveItemTypeEffectsSchema.safeParse(body);
    if (itemTypeEffectsAttempt.success) {
      const result = await applyItemTypeEffects(itemTypeEffectsAttempt.data);
      return NextResponse.json(result);
    }

    const message =
      itemTypeEffectsAttempt.error?.errors[0]?.message ??
      itemTypeUpdateAttempt.error?.errors[0]?.message ??
      'Invalid request payload.';

    return NextResponse.json({ error: message }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update wearables.',
      },
      { status: 500 }
    );
  }
}
