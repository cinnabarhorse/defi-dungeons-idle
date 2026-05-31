import * as ts from 'typescript';

import type { AuthoringFileKey, AuthoringFileKeyWithStamps } from './files';

export type Side = 'N' | 'S' | 'E' | 'W';

export interface NormalizedAuthoringAsset {
  id?: string;
  assetId?: string;
  x: number;
  y: number;
  sprite: string;
  category: string;
  allowOverlap?: boolean;
  rotation?: number;
  flipX?: boolean;
  zIndex?: number;
}

export interface NormalizedOrientation {
  localAssets: NormalizedAuthoringAsset[];
  footprint?: { width: number; height: number };
}

export interface NormalizedStampPayload {
  id: string;
  oriented: Record<Side, NormalizedOrientation>;
}

const SIDES: readonly Side[] = ['N', 'S', 'E', 'W'] as const;

const ensureString = (value: unknown, message: string): string => {
  if (typeof value !== 'string') {
    throw new Error(message);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(message);
  }
  return trimmed;
};

const ensureNumber = (value: unknown, message: string): number => {
  if (typeof value !== 'number') {
    throw new Error(message);
  }
  if (!Number.isFinite(value)) {
    throw new Error(message);
  }
  return value;
};

const ensureOptionalNumber = (
  value: unknown,
  message: string
): number | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(message);
  }
  return value;
};

export const validateAuthoringContents = (
  key: AuthoringFileKey,
  contents: string
): void => {
  if (typeof contents !== 'string' || contents.trim() === '') {
    throw new Error('Contents must be a non-empty string.');
  }

  const result = ts.transpileModule(contents, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.Preserve,
    },
    reportDiagnostics: true,
  });

  if (result.diagnostics && result.diagnostics.length > 0) {
    const message = result.diagnostics
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      )
      .join('\n');
    throw new Error(`TypeScript syntax error: ${message}`);
  }

  const assertContains = (needle: string, message: string) => {
    if (!contents.includes(needle)) {
      throw new Error(message);
    }
  };

  switch (key) {
    case 'room-base':
    case 'connector-base':
    case 'custom-bodies':
      assertContains('size', 'Body file must define a `size` property.');
      assertContains('floors', 'Body file must include a `floors` array.');
      break;
    case 'room-blueprints':
    case 'connector-blueprints':
      assertContains('variants', 'Blueprint file must define `variants`.');
      assertContains(
        'defaultStampId',
        'Blueprint file must define a `defaultStampId`.'
      );
      break;
    default: {
      const exhaustive: never = key;
      throw new Error(`Unsupported authoring file key: ${exhaustive}`);
    }
  }
};

export const validateStampPayload = (body: unknown): NormalizedStampPayload => {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be an object.');
  }

  const { id, oriented } = body as {
    id?: unknown;
    oriented?: unknown;
  };

  const normalizedId = ensureString(id, 'Stamp id is required.');

  if (!oriented || typeof oriented !== 'object') {
    throw new Error('`oriented` must be an object with N/S/E/W entries.');
  }

  const normalized: Record<Side, NormalizedOrientation> = {
    N: { localAssets: [] },
    S: { localAssets: [] },
    E: { localAssets: [] },
    W: { localAssets: [] },
  };

  for (const side of SIDES) {
    const entry = (oriented as Record<string, unknown>)[side];
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Orientation "${side}" is required.`);
    }

    const { localAssets, footprint } = entry as {
      localAssets?: unknown;
      footprint?: unknown;
    };

    if (!Array.isArray(localAssets) || localAssets.length === 0) {
      throw new Error(
        `Orientation "${side}" must include a non-empty localAssets array.`
      );
    }

    const normalizedAssets: NormalizedAuthoringAsset[] = localAssets.map(
      (asset, index) => {
        if (!asset || typeof asset !== 'object') {
          throw new Error(
            `Asset #${index + 1} for orientation "${side}" must be an object.`
          );
        }
        const { x, y, sprite, category } = asset as Record<string, unknown>;
        const normalizedSprite = ensureString(
          sprite,
          `Asset #${index + 1} for orientation "${side}" is missing sprite.`
        );
        const normalizedCategory = ensureString(
          category,
          `Asset #${index + 1} for orientation "${side}" is missing category.`
        );

        const normalizedAsset: NormalizedAuthoringAsset = {
          sprite: normalizedSprite,
          category: normalizedCategory,
          x: ensureNumber(
            x,
            `Asset #${index + 1} for orientation "${side}" is missing numeric x.`
          ),
          y: ensureNumber(
            y,
            `Asset #${index + 1} for orientation "${side}" is missing numeric y.`
          ),
        };

        const {
          assetId,
          id: assetIdProp,
          allowOverlap,
          rotation,
          flipX,
          zIndex,
        } = asset as Record<string, unknown>;

        if (typeof assetIdProp === 'string') {
          normalizedAsset.id = assetIdProp;
        }
        if (typeof assetId === 'string') {
          normalizedAsset.assetId = assetId;
        }
        if (typeof allowOverlap === 'boolean') {
          normalizedAsset.allowOverlap = allowOverlap;
        }
        const rotationValue = ensureOptionalNumber(
          rotation,
          `Asset #${index + 1} for orientation "${side}" has invalid rotation.`
        );
        if (rotationValue !== undefined) {
          normalizedAsset.rotation = rotationValue;
        }
        const zIndexValue = ensureOptionalNumber(
          zIndex,
          `Asset #${index + 1} for orientation "${side}" has invalid zIndex.`
        );
        if (zIndexValue !== undefined) {
          normalizedAsset.zIndex = zIndexValue;
        }
        if (flipX === true) {
          normalizedAsset.flipX = true;
        }

        return normalizedAsset;
      }
    );

    let normalizedFootprint: NormalizedOrientation['footprint'];
    if (footprint !== undefined) {
      if (!footprint || typeof footprint !== 'object') {
        throw new Error(
          `Orientation "${side}" footprint must be an object with width/height.`
        );
      }
      const maybeFootprint = footprint as Record<string, unknown>;
      const width = ensureNumber(
        maybeFootprint.width,
        `Orientation "${side}" footprint width must be a positive number.`
      );
      const height = ensureNumber(
        maybeFootprint.height,
        `Orientation "${side}" footprint height must be a positive number.`
      );
      if (width <= 0 || height <= 0) {
        throw new Error(
          `Orientation "${side}" footprint width/height must be positive.`
        );
      }
      normalizedFootprint = { width, height };
    }

    normalized[side] = {
      localAssets: normalizedAssets,
      ...(normalizedFootprint ? { footprint: normalizedFootprint } : {}),
    };
  }

  return {
    id: normalizedId,
    oriented: normalized,
  };
};

export const assertStampFileKey = (key: AuthoringFileKeyWithStamps): void => {
  if (key !== 'port-stamps') {
    throw new Error('Stamp updates are only supported for `port-stamps`.');
  }
};
