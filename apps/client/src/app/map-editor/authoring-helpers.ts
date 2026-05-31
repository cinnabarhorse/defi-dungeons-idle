import type {
  AuthoringAsset,
  BodyRecipe,
  ChunkBlueprint,
  EdgeWallHorizontal,
  EdgeWallVertical,
  Side,
} from '../../../../../data/maps/authoring-types';
import type { PlacedAsset } from '../../types/map-editor';

const indent = (level: number) => '  '.repeat(level);

const sanitizeConstName = (id: string): string => {
  return id
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
};

const escapeString = (value: string): string =>
  value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

const randomSuffix = (): string => Math.random().toString(36).slice(2, 8);

const makeEditorId = (seed: string, index: number): string =>
  `${seed}-${index}-${randomSuffix()}`;

const toAuthoringAsset = (asset: PlacedAsset): AuthoringAsset => {
  const base: AuthoringAsset = {
    id: asset.id,
    assetId: asset.assetId,
    x: asset.x,
    y: asset.y,
    sprite: asset.sprite || '',
    category: asset.category,
  };

  if (typeof asset.allowOverlap === 'boolean') {
    base.allowOverlap = asset.allowOverlap;
  }
  if (typeof asset.rotation === 'number') {
    base.rotation = asset.rotation;
  }
  if (asset.flipX) {
    base.flipX = true;
  }
  if (typeof (asset as { zIndex?: number }).zIndex === 'number') {
    base.zIndex = (asset as { zIndex: number }).zIndex;
  }

  return base;
};

export const placedAssetsFromBody = (body: BodyRecipe): PlacedAsset[] => {
  const assets: PlacedAsset[] = [];

  const append = (source: AuthoringAsset[]) => {
    for (const asset of source) {
      assets.push({
        id: asset.id || makeEditorId(asset.assetId || 'asset', assets.length),
        assetId: asset.assetId || asset.id || `asset_${assets.length}`,
        x: asset.x,
        y: asset.y,
        sprite: asset.sprite,
        category: asset.category,
        allowOverlap: asset.allowOverlap,
      });
    }
  };

  append(body.floors || []);
  append(body.details || []);

  return assets;
};

export const authoringAssetsToPlacedAssets = (
  assets: AuthoringAsset[],
  seed = 'asset'
): PlacedAsset[] =>
  assets.map((asset, index) => {
    const idSeed = asset.assetId || asset.id || seed;
    return {
      id: makeEditorId(idSeed, index),
      assetId: asset.assetId || asset.id || `asset_${index}`,
      x: asset.x,
      y: asset.y,
      sprite: asset.sprite,
      category: asset.category,
      allowOverlap: asset.allowOverlap,
      rotation: asset.rotation,
      flipX: asset.flipX,
      zIndex: asset.zIndex,
    } as PlacedAsset;
  });

export const buildBodyRecipeFromState = (params: {
  id: string;
  width: number;
  height: number;
  assets: PlacedAsset[];
}): BodyRecipe => {
  const floors: AuthoringAsset[] = [];
  const details: AuthoringAsset[] = [];

  for (const asset of params.assets) {
    if (!asset.category) continue;
    const authoringAsset = toAuthoringAsset(asset);
    if (asset.category === 'floors') {
      floors.push(authoringAsset);
    } else {
      // Preserve non-floor tiles (including interior walls) in details so they round-trip.
      details.push(authoringAsset);
    }
  }

  return {
    id: params.id,
    size: { width: params.width, height: params.height },
    floors,
    details,
  };
};

const serializeAuthoringAsset = (
  asset: AuthoringAsset,
  level: number
): string => {
  const lines: string[] = [];
  lines.push(`${indent(level)}{`);
  const props: string[] = [];
  if (asset.id) props.push(`id: '${escapeString(asset.id)}'`);
  if (asset.assetId) props.push(`assetId: '${escapeString(asset.assetId)}'`);
  props.push(`x: ${asset.x}`);
  props.push(`y: ${asset.y}`);
  props.push(`sprite: '${escapeString(asset.sprite)}'`);
  props.push(`category: '${escapeString(asset.category)}'`);
  if (typeof asset.allowOverlap === 'boolean') {
    props.push(`allowOverlap: ${asset.allowOverlap}`);
  }
  if (typeof asset.rotation === 'number') {
    props.push(`rotation: ${asset.rotation}`);
  }
  if (asset.flipX) {
    props.push('flipX: true');
  }
  if (typeof asset.zIndex === 'number') {
    props.push(`zIndex: ${asset.zIndex}`);
  }
  lines.push(`${indent(level + 1)}${props.join(`, `)}`);
  lines.push(`${indent(level)}}`);
  return lines.join('\n');
};

const serializeAssetArray = (
  label: string,
  assets: AuthoringAsset[],
  level: number
): string => {
  if (!assets || assets.length === 0) {
    return `${indent(level)}${label}: [],`;
  }
  const lines: string[] = [];
  lines.push(`${indent(level)}${label}: [`);
  for (const asset of assets) {
    lines.push(serializeAuthoringAsset(asset, level + 1) + ',');
  }
  lines.push(`${indent(level)}],`);
  return lines.join('\n');
};

const serializeBodyObject = (body: BodyRecipe, level: number): string => {
  const lines: string[] = [];
  lines.push(`${indent(level)}{`);
  lines.push(`${indent(level + 1)}id: '${escapeString(body.id)}',`);
  lines.push(
    `${indent(level + 1)}size: { width: ${body.size.width}, height: ${body.size.height} },`
  );
  lines.push(serializeAssetArray('floors', body.floors || [], level + 1));
  lines.push(serializeAssetArray('details', body.details || [], level + 1));

  lines.push(`${indent(level)}}`);
  return lines.join('\n');
};

const BODY_CONST_NAME_OVERRIDES: Record<string, string> = {
  'room-base-40': 'ROOM_BASE_40x40',
  'connector-horizontal-40': 'CONNECTOR_HORIZONTAL_40x40',
  'connector-vertical-40': 'CONNECTOR_VERTICAL_40x40',
};

export const renderBodyModule = (key: string, bodies: BodyRecipe[]): string => {
  if (!Array.isArray(bodies) || bodies.length === 0) {
    throw new Error('At least one body recipe is required to render module.');
  }

  const header = "import { BodyRecipe } from '../authoring-types';\n\n";

  const entries: string[] = [];
  const constNames: string[] = [];
  for (const body of bodies) {
    const constName =
      BODY_CONST_NAME_OVERRIDES[body.id] || sanitizeConstName(body.id);
    constNames.push(constName);
    entries.push(
      `export const ${constName}: BodyRecipe = ${serializeBodyObject(body, 0)};\n`
    );
  }

  const defaultExport = `export default ${constNames[0]};\n`;

  const content = header + entries.join('\n') + '\n' + defaultExport;
  return content.endsWith('\n') ? content : `${content}\n`;
};

export interface StampOrientationState {
  localAssets: AuthoringAsset[];
  footprint?: { width: number; height: number };
}

export const placedAssetsFromStampOrientation = (
  orientation: StampOrientationState,
  seed = 'stamp'
): PlacedAsset[] => {
  if (!orientation) return [];
  return authoringAssetsToPlacedAssets(orientation.localAssets || [], seed);
};

export const placedAssetsToAuthoringAssets = (
  assets: PlacedAsset[]
): AuthoringAsset[] => assets.map(toAuthoringAsset);

export const buildStampOrientationFromState = (params: {
  assets: PlacedAsset[];
  width?: number;
  height?: number;
}): StampOrientationState => {
  const { assets, width, height } = params;
  const authoring = placedAssetsToAuthoringAssets(assets);
  const footprint =
    typeof width === 'number' && typeof height === 'number'
      ? { width, height }
      : undefined;
  return {
    localAssets: authoring,
    ...(footprint ? { footprint } : {}),
  };
};

const coordinatesBounds = (points: Array<{ x: number; y: number }>) => {
  if (!points.length) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }
  let minX = points[0]!.x;
  let maxX = points[0]!.x;
  let minY = points[0]!.y;
  let maxY = points[0]!.y;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, maxX, minY, maxY };
};

export const inferFootprintFromAssets = (
  assets: Array<AuthoringAsset | PlacedAsset>
): { width: number; height: number } => {
  if (!assets.length) {
    return { width: 1, height: 1 };
  }
  const points = assets.map((asset) => ({ x: asset.x, y: asset.y }));
  const { minX, maxX, minY, maxY } = coordinatesBounds(points);
  return {
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, maxY - minY + 1),
  };
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const serializeValue = (value: unknown, level: number): string => {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    const items = value
      .map((item) => `${indent(level + 1)}${serializeValue(item, level + 1)}`)
      .join(',\n');
    return `[\n${items}\n${indent(level)}]`;
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value).filter(
      ([, val]) => val !== undefined
    );
    if (entries.length === 0) {
      return '{}';
    }
    const lines = entries
      .map(
        ([key, val]) =>
          `${indent(level + 1)}${key}: ${serializeValue(val, level + 1)}`
      )
      .join(',\n');
    return `{\n${lines}\n${indent(level)}}`;
  }

  if (typeof value === 'string') {
    return `'${escapeString(value)}'`;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value === null) {
    return 'null';
  }

  return 'undefined';
};

export const renderBlueprintModule = (
  key: 'room-blueprints' | 'connector-blueprints',
  blueprints: ChunkBlueprint[]
): string => {
  const header = "import { ChunkBlueprint } from '../authoring-types';\n\n";
  const constName =
    key === 'room-blueprints' ? 'ROOM_BLUEPRINTS' : 'CONNECTOR_BLUEPRINTS';
  const indentBlock = (text: string, level: number): string =>
    text
      .split('\n')
      .map((line) => (line.length ? `${indent(level)}${line}` : line))
      .join('\n');

  const serializeBlueprint = (blueprint: ChunkBlueprint): string => {
    const blueprintObj: Record<string, unknown> = {
      name: blueprint.name,
      bodyId: blueprint.bodyId,
      defaultStampId: blueprint.defaultStampId,
    };

    if (blueprint.stampPolicy) {
      blueprintObj.stampPolicy = blueprint.stampPolicy;
    }

    if (
      blueprint.bodyByOrientation &&
      (blueprint.bodyByOrientation.h || blueprint.bodyByOrientation.v)
    ) {
      const bodyOrientation: Record<string, unknown> = {};
      if (blueprint.bodyByOrientation.h) {
        bodyOrientation.h = blueprint.bodyByOrientation.h;
      }
      if (blueprint.bodyByOrientation.v) {
        bodyOrientation.v = blueprint.bodyByOrientation.v;
      }
      blueprintObj.bodyByOrientation = bodyOrientation;
    }

    const variantObjects = blueprint.variants.map((variant) => {
      const variantObj: Record<string, unknown> = {
        name: variant.name,
      };

      const ports = (variant.ports ?? []).map((port) => {
        const portObj: Record<string, unknown> = {
          side: port.side,
          centerOffsetTiles: port.centerOffsetTiles,
        };
        if (port.widthTiles !== undefined) {
          portObj.widthTiles = port.widthTiles;
        }
        if (port.stampId) {
          portObj.stampId = port.stampId;
        }
        return portObj;
      });

      variantObj.ports = ports;

      if (variant.stampPolicy) {
        variantObj.stampPolicy = variant.stampPolicy;
      }
      if (variant.stampId) {
        variantObj.stampId = variant.stampId;
      }
      if (variant.bodyId) {
        variantObj.bodyId = variant.bodyId;
      }

      if (
        variant.bodyByOrientation &&
        (variant.bodyByOrientation.h || variant.bodyByOrientation.v)
      ) {
        const variantBodyOrientation: Record<string, unknown> = {};
        if (variant.bodyByOrientation.h) {
          variantBodyOrientation.h = variant.bodyByOrientation.h;
        }
        if (variant.bodyByOrientation.v) {
          variantBodyOrientation.v = variant.bodyByOrientation.v;
        }
        variantObj.bodyByOrientation = variantBodyOrientation;
      }

      if (variant.meta) {
        const meta: Record<string, unknown> = {};
        if (variant.meta.role) meta.role = variant.meta.role;
        if (variant.meta.orientation)
          meta.orientation = variant.meta.orientation;
        if (variant.meta.tags && variant.meta.tags.length) {
          meta.tags = [...variant.meta.tags];
        }
        if (typeof variant.meta.weight === 'number') {
          meta.weight = variant.meta.weight;
        }
        if (Object.keys(meta).length > 0) {
          variantObj.meta = meta;
        }
      }

      if (variant.decorations && variant.decorations.length) {
        variantObj.decorations = variant.decorations.map((decoration) => ({
          ...decoration,
        }));
      }

      return variantObj;
    });

    blueprintObj.variants = variantObjects;

    return indentBlock(serializeValue(blueprintObj, 0), 1);
  };

  const entries = blueprints.map(
    (blueprint) => `${serializeBlueprint(blueprint)},`
  );

  const body = `export const ${constName}: ChunkBlueprint[] = [\n${entries.join(
    '\n'
  )}\n];\n\nexport default ${constName};\n`;
  const content = header + body;
  return content.endsWith('\n') ? content : `${content}\n`;
};
