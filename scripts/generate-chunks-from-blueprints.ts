/*
 * Generate data/maps/chunks-dungeon.ts from authoring blueprints.
 * Minimal stub: wires modules, performs basic concatenation, and writes the file.
 * The detailed wall-window math and stamping will be added incrementally.
 */

import {
  BodyRecipe,
  ChunkBlueprint,
  ChunkBlueprintVariant,
  GeneratedChunk,
  GeneratedChunkAsset,
  PortWindow,
  StampPolicy,
} from '../data/maps/authoring-types';
import ROOM_BASE_40x40 from '../data/maps/bodies/room-base';
import {
  CONNECTOR_HORIZONTAL_40x40,
  CONNECTOR_VERTICAL_40x40,
} from '../data/maps/bodies/connector-base';
import ROOM_BLUEPRINTS from '../data/maps/blueprints/room-blueprints';
import CONNECTOR_BLUEPRINTS from '../data/maps/blueprints/connector-blueprints';
import { getOrientedStamp } from '../data/maps/stamps/port-stamps';
import { ROFL_ROOM } from '../data/maps/bodies/rofl-room';
import { ROFL_POND } from '../data/maps/bodies/rofl-pond';

function selectBody(bodyId: string, fallbackBody: BodyRecipe): BodyRecipe {
  let body: BodyRecipe | undefined;
  switch (bodyId) {
    case 'room-base-40':
      body = ROOM_BASE_40x40;
      break;
    case 'connector-horizontal-40':
      body = CONNECTOR_HORIZONTAL_40x40;
      break;
    case 'connector-vertical-40':
      body = CONNECTOR_VERTICAL_40x40;
      break;
    case 'rofl-room':
      body = ROFL_ROOM;
      break;
    case 'rofl-pond':
      body = ROFL_POND;
      break;
    default:
      body = undefined;
  }
  if (!body) return fallbackBody;
  const hasFloors = Array.isArray(body.floors) && body.floors.length > 0;
  // Walls/perimeter now optional; only require floors to accept body
  if (!hasFloors) return fallbackBody;
  return body;
}

type Dimensions = { width: number; height: number };

const ensureFootprint = (
  stampId: string,
  side: 'N' | 'S' | 'E' | 'W'
): Dimensions => {
  const { assets } = getOrientedStamp(stampId, side);
  const footprint = assets.footprint || { width: 8, height: 6 };
  return {
    width: Math.max(1, footprint.width || 8),
    height: Math.max(1, footprint.height || 6),
  };
};

const resolveStampIdForPort = (
  variant: ChunkBlueprintVariant,
  fallbackId: string,
  port: PortWindow
): string => {
  return port.stampId || variant.stampId || fallbackId;
};

// With oriented stamp variants, we no longer auto-rotate; footprint is provided per side when available.
const orientedFootprint = (footprint: Dimensions): Dimensions => footprint;

const shouldApplyStamp = (
  variantPolicy: StampPolicy | undefined,
  blueprintPolicy: StampPolicy | undefined
): boolean => {
  const effective = variantPolicy || blueprintPolicy || 'none';
  return effective === 'all' || effective === 'defaultOnly';
};

// TODO: implement proper wall-window subtraction and port stamp placement
function renderVariant(
  body: BodyRecipe,
  blueprint: ChunkBlueprint,
  variant: ChunkBlueprintVariant
): GeneratedChunk {
  const assets: GeneratedChunkAsset[] = [];
  assets.push(...(body.floors || []));
  assets.push(...(body.details || []));
  if (variant.decorations?.length) {
    assets.push(...variant.decorations);
  }

  const width = body.size.width;
  const height = body.size.height;

  const windows = {
    N: [] as Array<{ x0: number; x1: number }>,
    S: [] as Array<{ x0: number; x1: number }>,
    W: [] as Array<{ y0: number; y1: number }>,
    E: [] as Array<{ y0: number; y1: number }>,
  };

  for (const p of variant.ports) {
    const stampId = resolveStampIdForPort(variant, blueprint.defaultStampId, p);
    const footprint = orientedFootprint(ensureFootprint(stampId, p.side));
    // For vertical ports (W/E), the opening spans along Y → use oriented height.
    const span =
      p.side === 'N' || p.side === 'S'
        ? p.widthTiles || footprint.width
        : p.widthTiles || footprint.height;
    const half = Math.floor(span / 2);
    if (p.side === 'N' || p.side === 'S') {
      const x0 = Math.max(0, p.centerOffsetTiles - half);
      const x1 = Math.min(width - 2, x0 + span - 1);
      (windows as any)[p.side].push({ x0, x1 });
    } else {
      const y0 = Math.max(0, p.centerOffsetTiles - half);
      const y1 = Math.min(height - 2, y0 + span - 1);
      (windows as any)[p.side].push({ y0, y1 });
    }
  }

  // Subtract port windows from perimeter walls
  const totalWindows =
    windows.N.length + windows.S.length + windows.W.length + windows.E.length;
  if (totalWindows > 0) {
    const shouldCullWall = (a: GeneratedChunkAsset): boolean => {
      if (a.category !== 'walls') return false;
      // Only consider perimeter positions
      const onNorth = a.y === 0;
      const onSouth = a.y === height - 2;
      const onWest = a.x === 0;
      const onEast = a.x === width - 2;
      if (!onNorth && !onSouth && !onWest && !onEast) return false;

      if (onNorth) {
        return windows.N.some(({ x0, x1 }) => a.x >= x0 && a.x <= x1);
      }
      if (onSouth) {
        return windows.S.some(({ x0, x1 }) => a.x >= x0 && a.x <= x1);
      }
      if (onWest) {
        return windows.W.some(({ y0, y1 }) => a.y >= y0 && a.y <= y1);
      }
      if (onEast) {
        return windows.E.some(({ y0, y1 }) => a.y >= y0 && a.y <= y1);
      }
      return false;
    };

    const filtered = assets.filter((a) => !shouldCullWall(a));
    assets.length = 0;
    assets.push(...filtered);
  }

  // Place stamps per port (policy)

  const stampEnabled = shouldApplyStamp(
    variant.stampPolicy,
    blueprint.stampPolicy
  );
  for (const p of variant.ports) {
    const stampId = resolveStampIdForPort(variant, blueprint.defaultStampId, p);
    const footprint = orientedFootprint(ensureFootprint(stampId, p.side));
    const w = footprint.width;
    const h = footprint.height;
    let xStart = 0;
    let yStart = 0;

    //place the port at the right spot
    if (p.side === 'N') {
      xStart = Math.max(0, p.centerOffsetTiles - Math.floor(w / 2));
      yStart = 0;
    } else if (p.side === 'S') {
      xStart = Math.max(0, p.centerOffsetTiles - Math.floor(w / 2));
      yStart = height - h;
    } else if (p.side === 'W') {
      xStart = 0;
      yStart = Math.max(0, p.centerOffsetTiles - Math.floor(h / 2));
    } else {
      xStart = width - w;
      yStart = Math.max(0, p.centerOffsetTiles - Math.floor(h / 2));
    }

    if (stampEnabled) {
      const { assets: oriented } = getOrientedStamp(stampId, p.side);

      const localAssets = oriented.localAssets;
      for (const a of localAssets) {
        const placed = {
          assetId: a.assetId || '',
          x: xStart + a.x,
          y: yStart + a.y,
          sprite: a.sprite,
          category: a.category,
          allowOverlap: a.allowOverlap,
        } as any;
        assets.push(placed);
      }
    }
  }

  return {
    name: variant.name,
    width: body.size.width,
    height: body.size.height,

    instances: 0,
    type: variant.meta?.role || 'room',
    assets,
    meta: {
      ...variant.meta,
      family: blueprint.name,
      familyInstances:
        typeof blueprint.instances === 'number'
          ? Math.max(0, blueprint.instances)
          : undefined,
      ports: variant.ports.map((p) => {
        const stampId = resolveStampIdForPort(
          variant,
          blueprint.defaultStampId,
          p
        );
        const oriented = orientedFootprint(ensureFootprint(stampId, p.side));
        const widthTiles =
          p.side === 'N' || p.side === 'S'
            ? p.widthTiles || oriented.width
            : p.widthTiles || oriented.height;
        return {
          side: p.side,
          centerOffsetTiles: p.centerOffsetTiles,
          widthTiles,
        };
      }),
    },
  };
}

export function generateChunksFromBlueprints(): GeneratedChunk[] {
  const blueprints: ChunkBlueprint[] = [
    ...ROOM_BLUEPRINTS,
    ...CONNECTOR_BLUEPRINTS,
  ];

  const out: GeneratedChunk[] = [];
  // Extract authoring sources from the map file once
  const defaultRoomBody = selectBody('room-base-40', ROOM_BASE_40x40);
  const connectorHorizontalBody = selectBody(
    'connector-horizontal-40',
    CONNECTOR_HORIZONTAL_40x40
  );
  const connectorVerticalBody = selectBody(
    'connector-vertical-40',
    CONNECTOR_VERTICAL_40x40
  );
  const roflRoomBody = selectBody('rofl-room', ROFL_ROOM);
  const roflPondBody = selectBody('rofl-pond', ROFL_POND);
  const fallbackBodies = new Map<string, BodyRecipe>([
    ['room-base-40', defaultRoomBody],
    ['connector-horizontal-40', connectorHorizontalBody],
    ['connector-vertical-40', connectorVerticalBody],
    ['rofl-room', roflRoomBody],
    ['rofl-pond', roflPondBody],
  ]);
  for (const bp of blueprints) {
    const familyInstances =
      typeof bp.instances === 'number' ? Math.max(0, bp.instances) : undefined;
    for (const variant of bp.variants) {
      const orientation = variant.meta?.orientation;
      const effectiveBodyId =
        variant.bodyId ||
        (orientation && variant.bodyByOrientation?.[orientation]) ||
        (orientation && bp.bodyByOrientation?.[orientation]) ||
        bp.bodyId;
      const fallbackBody =
        fallbackBodies.get(effectiveBodyId) || defaultRoomBody;
      const body = selectBody(effectiveBodyId, fallbackBody);
      const chunk = renderVariant(body, bp, variant);
      // Mirror family instances on meta for runtime selection
      if (familyInstances !== undefined) {
        chunk.meta = {
          ...(chunk.meta || {}),
          family: bp.name,
          familyInstances,
        };
      }
      out.push(chunk);
    }
  }
  return out;
}

function main() {}

if (require.main === module) {
  main();
}
