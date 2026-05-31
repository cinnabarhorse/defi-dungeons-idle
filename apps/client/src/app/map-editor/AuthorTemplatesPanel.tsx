'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  BodyRecipe,
  ChunkBlueprint,
  Side,
  StampPolicy,
} from '../../../../../data/maps/authoring-types';
import type {
  MapClusterType,
  MapMeta,
  MapPort,
  PlacedAsset,
} from '../../types/map-editor';
import {
  buildBodyRecipeFromState,
  buildStampOrientationFromState,
  inferFootprintFromAssets,
  placedAssetsFromBody,
  placedAssetsFromStampOrientation,
  renderBlueprintModule,
  renderBodyModule,
  StampOrientationState,
} from './authoring-helpers';

const BODY_OPTIONS: Array<{
  id: string;
  label: string;
  fileKey: string;
  orientation?: MapMeta['orientation'];
  mapType: MapClusterType;
}> = [
  {
    id: 'room-base-40',
    label: 'Room Base 40x40',
    fileKey: 'room-base',
    mapType: 'room',
  },
  {
    id: 'rofl-room',
    label: 'ROFL Room 24x24',
    fileKey: 'custom-bodies',
    mapType: 'room',
  },
  {
    id: 'rofl-pond',
    label: 'ROFL Pond 32x32',
    fileKey: 'custom-bodies',
    mapType: 'room',
  },
  {
    id: 'connector-horizontal-40',
    label: 'Connector Horizontal 40x40',
    fileKey: 'connector-base',
    orientation: 'h',
    mapType: 'connector',
  },
  {
    id: 'connector-vertical-40',
    label: 'Connector Vertical 40x40',
    fileKey: 'connector-base',
    orientation: 'v',
    mapType: 'connector',
  },
];

const BODIES_BY_FILE: Record<string, string[]> = {
  'room-base': ['room-base-40'],
  'custom-bodies': ['rofl-room', 'rofl-pond'],
  'connector-base': ['connector-horizontal-40', 'connector-vertical-40'],
};

const STAMP_SIDES: Side[] = ['N', 'S', 'E', 'W'];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();

  if (!response.ok) {
    try {
      const payload = JSON.parse(text) as { error?: string };
      if (payload?.error) {
        throw new Error(payload.error);
      }
    } catch {
      // no-op fallback
    }
    throw new Error(text || 'Request failed.');
  }

  if (!text) {
    return {} as T;
  }

  return JSON.parse(text) as T;
}

type BodiesTabProps = {
  mapWidth: number;
  mapHeight: number;
  setMapWidth: (value: number) => void;
  setMapHeight: (value: number) => void;
  setMapType: (value: MapClusterType) => void;
  setMapOrientation: (value: MapMeta['orientation'] | undefined) => void;
  placedAssets: PlacedAsset[];
  updatePlacedAssets: (updater: React.SetStateAction<PlacedAsset[]>) => void;
  setPorts: React.Dispatch<React.SetStateAction<MapPort[]>>;
};

type BodiesCache = Map<string, BodyRecipe[]>;

type StampsTabProps = {
  mapWidth: number;
  mapHeight: number;
  setMapWidth: (value: number) => void;
  setMapHeight: (value: number) => void;
  setMapType: (value: MapClusterType) => void;
  setMapOrientation: (value: MapMeta['orientation'] | undefined) => void;
  placedAssets: PlacedAsset[];
  updatePlacedAssets: (updater: React.SetStateAction<PlacedAsset[]>) => void;
  setPorts: React.Dispatch<React.SetStateAction<MapPort[]>>;
};

type BlueprintFileKey = 'room-blueprints' | 'connector-blueprints';

type BlueprintsTabProps = {
  onSaveComplete?: () => void;
};

const BodiesTab: React.FC<BodiesTabProps> = ({
  mapWidth,
  mapHeight,
  setMapWidth,
  setMapHeight,
  setMapType,
  setMapOrientation,
  placedAssets,
  updatePlacedAssets,
  setPorts,
}) => {
  const [selectedBodyId, setSelectedBodyId] = useState<string>(
    BODY_OPTIONS[0].id
  );
  const [bodyCache, setBodyCache] = useState<BodiesCache>(new Map());
  const [bodyStatus, setBodyStatus] = useState<string | null>(null);
  const [isBodyActionPending, setIsBodyActionPending] = useState(false);

  const selectedBodyOption = useMemo(
    () =>
      BODY_OPTIONS.find((option) => option.id === selectedBodyId) ??
      BODY_OPTIONS[0],
    [selectedBodyId]
  );

  const loadBodiesForKey = useCallback(
    async (
      key:
        | 'room-base'
        | 'connector-base'
        | 'custom-bodies'
        | 'rofl-room'
        | 'rofl-pond'
    ): Promise<BodyRecipe[]> => {
      if (bodyCache.has(key)) {
        return bodyCache.get(key)!;
      }
      const data = await fetchJson<{ bodies: BodyRecipe[] }>(
        `/api/authoring/bodies?key=${key}`
      );
      setBodyCache((prev) => {
        const next = new Map(prev);
        next.set(key as any, data.bodies);
        return next;
      });
      return data.bodies;
    },
    [bodyCache]
  );

  const applyBodyToEditor = useCallback(
    (
      body: BodyRecipe,
      mapTypeValue: MapClusterType,
      orientation?: MapMeta['orientation']
    ) => {
      setMapWidth(body.size.width);
      setMapHeight(body.size.height);
      setMapType(mapTypeValue);
      setMapOrientation(orientation);
      setPorts([]);
      updatePlacedAssets(placedAssetsFromBody(body));
    },
    [
      setMapHeight,
      setMapOrientation,
      setMapType,
      setMapWidth,
      setPorts,
      updatePlacedAssets,
    ]
  );

  const handleLoadBody = useCallback(async () => {
    setBodyStatus(null);
    setIsBodyActionPending(true);
    try {
      const option = selectedBodyOption;
      const bodies = await loadBodiesForKey(option.fileKey as any);
      const body = bodies.find((item) => item.id === option.id);
      if (!body) {
        throw new Error(`Body "${option.id}" not found in ${option.fileKey}.`);
      }
      applyBodyToEditor(body, option.mapType, option.orientation);
      setBodyStatus(`Loaded body "${option.id}".`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load body.';
      setBodyStatus(message);
    } finally {
      setIsBodyActionPending(false);
    }
  }, [applyBodyToEditor, loadBodiesForKey, selectedBodyOption]);

  const handleSaveBody = useCallback(async () => {
    setBodyStatus(null);
    setIsBodyActionPending(true);
    try {
      const option = selectedBodyOption;
      const bodies = await loadBodiesForKey(option.fileKey as any);
      const existing = bodies.find((item) => item.id === option.id);

      const recipe = buildBodyRecipeFromState({
        id: option.id,
        width: mapWidth,
        height: mapHeight,
        assets: placedAssets,
      });

      const byId = new Map<string, BodyRecipe>();
      for (const body of bodies) {
        byId.set(body.id, body);
      }
      byId.set(recipe.id, recipe);

      const ordered = (
        BODIES_BY_FILE[
          option.fileKey as
            | 'room-base'
            | 'connector-base'
            | 'custom-bodies'
            | 'rofl-room'
            | 'rofl-pond'
        ] || []
      ).map((id: string) => byId.get(id));
      const filtered = ordered.filter((body): body is BodyRecipe =>
        Boolean(body)
      );
      if (!filtered.length) {
        filtered.push(recipe);
      }

      const moduleContents = renderBodyModule(option.fileKey as any, filtered);
      const result = await fetchJson<{ ok: boolean; error?: string }>(
        '/api/authoring/file',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: option.fileKey,
            contents: moduleContents,
          }),
        }
      );

      if (!result.ok) {
        throw new Error(result.error || 'Failed to save body.');
      }

      setBodyCache((prev) => {
        const next = new Map(prev);
        next.set(option.fileKey as any, filtered);
        return next;
      });
      setBodyStatus(`Saved body "${recipe.id}" to ${option.fileKey}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save body.';
      setBodyStatus(message);
    } finally {
      setIsBodyActionPending(false);
    }
  }, [loadBodiesForKey, mapHeight, mapWidth, placedAssets, selectedBodyOption]);

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-600">
          Body Template
        </label>
        <select
          value={selectedBodyId}
          onChange={(event) => setSelectedBodyId(event.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
        >
          {BODY_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void handleLoadBody()}
          disabled={isBodyActionPending}
          className="rounded border border-gray-300 px-2 py-1 text-left text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          Load Body
        </button>

        <button
          type="button"
          onClick={() => void handleSaveBody()}
          disabled={isBodyActionPending}
          className="rounded border border-blue-500 bg-blue-500 px-2 py-1 text-left text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
        >
          Save as Body
        </button>
      </div>
      {bodyStatus ? (
        <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
          {bodyStatus}
        </div>
      ) : null}
    </div>
  );
};

const StampsTab: React.FC<StampsTabProps> = ({
  mapWidth,
  mapHeight,
  setMapWidth,
  setMapHeight,
  setMapType,
  setMapOrientation,
  placedAssets,
  updatePlacedAssets,
  setPorts,
}) => {
  const [stampIds, setStampIds] = useState<string[]>([]);
  const [selectedStampId, setSelectedStampId] = useState<string>('');
  const [orientationState, setOrientationState] = useState<
    Record<Side, StampOrientationState | null>
  >({
    N: null,
    S: null,
    E: null,
    W: null,
  });
  const [activeSide, setActiveSide] = useState<Side>('N');
  const [stampStatus, setStampStatus] = useState<string | null>(null);
  const [isStampPending, setIsStampPending] = useState(false);

  useEffect(() => {
    void fetchJson<{ stamps: Array<{ id: string }> }>('/api/authoring/stamps')
      .then((data) => {
        const ids = data.stamps.map((stamp) => stamp.id);
        setStampIds(ids);
        setSelectedStampId((prev) => prev || ids[0] || '');
      })
      .catch((error) => {
        setStampStatus(
          error instanceof Error ? error.message : 'Failed to load stamps.'
        );
      });
  }, []);

  const applyOrientationToCanvas = useCallback(
    (side: Side, state: StampOrientationState | null) => {
      setPorts([]);
      setMapType('connector');
      setMapOrientation(undefined);
      if (!state) {
        updatePlacedAssets([]);
        return;
      }
      const footprint =
        state.footprint || inferFootprintFromAssets(state.localAssets);
      setMapWidth(footprint.width);
      setMapHeight(footprint.height);
      const assets = placedAssetsFromStampOrientation(
        state,
        `${selectedStampId}-${side}`
      );
      updatePlacedAssets(assets);
    },
    [
      selectedStampId,
      setMapHeight,
      setMapOrientation,
      setMapType,
      setMapWidth,
      setPorts,
      updatePlacedAssets,
    ]
  );

  const captureCanvasToOrientation = useCallback(
    (side: Side): Record<Side, StampOrientationState | null> | null => {
      let snapshot: Record<Side, StampOrientationState | null> | null = null;
      setOrientationState((prev) => {
        const next = { ...prev };
        next[side] = buildStampOrientationFromState({
          assets: placedAssets,
          width: mapWidth,
          height: mapHeight,
        });
        snapshot = next;
        return next;
      });
      setStampStatus(`Captured orientation ${side}.`);
      return snapshot;
    },
    [mapHeight, mapWidth, placedAssets]
  );

  const handleLoadStamp = useCallback(async () => {
    if (!selectedStampId) {
      setStampStatus('Select a stamp id first.');
      return;
    }

    setIsStampPending(true);
    setStampStatus(null);
    try {
      const data = await fetchJson<{
        stamps: Array<{
          id: string;
          oriented?: Record<Side, StampOrientationState>;
        }>;
      }>(`/api/authoring/stamps?id=${selectedStampId}`);

      const stamp = data.stamps.find((entry) => entry.id === selectedStampId);
      if (!stamp || !stamp.oriented) {
        throw new Error(`Stamp "${selectedStampId}" is missing oriented data.`);
      }

      const nextState: Record<Side, StampOrientationState | null> = {
        N: null,
        S: null,
        E: null,
        W: null,
      };

      for (const side of STAMP_SIDES) {
        const entry = stamp.oriented[side];
        if (!entry || !Array.isArray(entry.localAssets)) {
          throw new Error(
            `Stamp "${selectedStampId}" is missing assets for orientation ${side}.`
          );
        }
        nextState[side] = {
          localAssets: entry.localAssets.map((asset) => ({ ...asset })),
          footprint: entry.footprint ? { ...entry.footprint } : undefined,
        };
      }

      for (const side of STAMP_SIDES) {
        if (!nextState[side]) {
          throw new Error(`Orientation ${side} is required for editing.`);
        }
      }

      setOrientationState(nextState);
      setActiveSide('N');
      applyOrientationToCanvas('N', nextState.N);
      setStampStatus(`Loaded stamp "${selectedStampId}".`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to load stamp.';
      setStampStatus(message);
    } finally {
      setIsStampPending(false);
    }
  }, [applyOrientationToCanvas, selectedStampId]);

  const handleSwitchSide = useCallback(
    (nextSide: Side) => {
      const snapshot =
        captureCanvasToOrientation(activeSide) || orientationState;
      setActiveSide(nextSide);
      applyOrientationToCanvas(nextSide, snapshot[nextSide]);
    },
    [
      activeSide,
      applyOrientationToCanvas,
      captureCanvasToOrientation,
      orientationState,
    ]
  );

  const handleUpdateFootprint = useCallback(
    (dimension: 'width' | 'height', value: number) => {
      setOrientationState((prev) => {
        const current = prev[activeSide];
        if (!current) return prev;
        const footprint = {
          width:
            current.footprint?.width ??
            inferFootprintFromAssets(current.localAssets).width,
          height:
            current.footprint?.height ??
            inferFootprintFromAssets(current.localAssets).height,
        };
        footprint[dimension] = Math.max(1, Math.floor(value));
        return { ...prev, [activeSide]: { ...current, footprint } };
      });
    },
    [activeSide]
  );

  const handleSaveStamp = useCallback(async () => {
    const snapshot = captureCanvasToOrientation(activeSide) || orientationState;
    setIsStampPending(true);
    setStampStatus(null);
    try {
      const oriented = STAMP_SIDES.reduce(
        (acc, side) => {
          const entry = snapshot[side];
          if (!entry || entry.localAssets.length === 0) {
            throw new Error(
              `Orientation ${side} must have at least one asset.`
            );
          }
          const footprint =
            entry.footprint ?? inferFootprintFromAssets(entry.localAssets);
          acc[side] = {
            localAssets: entry.localAssets,
            footprint,
          };
          return acc;
        },
        {} as Record<Side, StampOrientationState>
      );

      const payload = {
        id: selectedStampId,
        oriented: oriented,
      };

      const result = await fetchJson<{ ok: boolean; error?: string }>(
        '/api/authoring/stamp',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      if (!result.ok) {
        throw new Error(result.error || 'Failed to save stamp.');
      }

      setOrientationState(oriented);
      setStampStatus('Stamp saved.');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save stamp.';
      setStampStatus(message);
    } finally {
      setIsStampPending(false);
    }
  }, [
    activeSide,
    captureCanvasToOrientation,
    orientationState,
    selectedStampId,
  ]);

  const activeOrientation = orientationState[activeSide];
  const activeFootprint =
    activeOrientation?.footprint ||
    (activeOrientation
      ? inferFootprintFromAssets(activeOrientation.localAssets)
      : { width: mapWidth, height: mapHeight });

  const footprintWidth = activeFootprint.width || mapWidth;
  const footprintHeight = activeFootprint.height || mapHeight;

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-semibold text-gray-600">
          Stamp ID
        </label>
        <select
          value={selectedStampId}
          onChange={(event) => setSelectedStampId(event.target.value)}
          className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
        >
          {stampIds.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        {STAMP_SIDES.map((side) => {
          const hasData = orientationState[side]?.localAssets?.length;
          return (
            <button
              key={side}
              type="button"
              onClick={() => handleSwitchSide(side)}
              className={`rounded px-2 py-1 text-xs font-semibold ${
                activeSide === side
                  ? 'bg-blue-500 text-white'
                  : hasData
                    ? 'border border-blue-300 text-blue-700'
                    : 'border border-gray-300 text-gray-600'
              }`}
            >
              {side}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void handleLoadStamp()}
          disabled={isStampPending}
          className="rounded border border-gray-300 px-2 py-1 text-left text-xs hover:bg-gray-50 disabled:opacity-50"
        >
          Load Stamp
        </button>
        <button
          type="button"
          onClick={() => captureCanvasToOrientation(activeSide)}
          className="rounded border border-gray-300 px-2 py-1 text-left text-xs hover:bg-gray-50"
        >
          Capture from Canvas
        </button>
        <button
          type="button"
          onClick={() =>
            applyOrientationToCanvas(activeSide, orientationState[activeSide])
          }
          className="rounded border border-gray-300 px-2 py-1 text-left text-xs hover:bg-gray-50"
        >
          Apply to Canvas
        </button>
        <button
          type="button"
          onClick={() => void handleSaveStamp()}
          disabled={isStampPending || !selectedStampId}
          className="rounded border border-blue-500 bg-blue-500 px-2 py-1 text-left text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
        >
          Save Oriented Stamp
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-gray-600">Footprint Width</span>
          <input
            type="number"
            value={footprintWidth}
            min={1}
            onChange={(event) =>
              handleUpdateFootprint('width', Number(event.target.value))
            }
            className="rounded border border-gray-300 px-2 py-1"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-gray-600">Footprint Height</span>
          <input
            type="number"
            value={footprintHeight}
            min={1}
            onChange={(event) =>
              handleUpdateFootprint('height', Number(event.target.value))
            }
            className="rounded border border-gray-300 px-2 py-1"
          />
        </label>
      </div>
      {stampStatus ? (
        <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
          {stampStatus}
        </div>
      ) : null}
    </div>
  );
};

const BlueprintsTab: React.FC<BlueprintsTabProps> = ({ onSaveComplete }) => {
  const [activeFileKey, setActiveFileKey] =
    useState<BlueprintFileKey>('room-blueprints');
  const [blueprintCache, setBlueprintCache] = useState<
    Map<BlueprintFileKey, ChunkBlueprint[]>
  >(new Map());
  const [selectedBlueprintIndex, setSelectedBlueprintIndex] = useState(0);
  const [selectedVariantIndex, setSelectedVariantIndex] = useState(0);
  const [status, setStatus] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const currentBlueprints = blueprintCache.get(activeFileKey) ?? [];
  const currentBlueprint = currentBlueprints[selectedBlueprintIndex];
  const currentVariant = currentBlueprint?.variants[selectedVariantIndex];

  const loadBlueprints = useCallback(
    async (key: BlueprintFileKey): Promise<ChunkBlueprint[]> => {
      if (blueprintCache.has(key)) {
        return blueprintCache.get(key)!;
      }
      const data = await fetchJson<{ blueprints: ChunkBlueprint[] }>(
        `/api/authoring/blueprints?key=${key}`
      );
      setBlueprintCache((prev) => {
        const next = new Map(prev);
        next.set(key, data.blueprints);
        return next;
      });
      return data.blueprints;
    },
    [blueprintCache]
  );

  useEffect(() => {
    let cancelled = false;
    void loadBlueprints(activeFileKey)
      .then((list) => {
        if (cancelled) return;
        if (list.length === 0) {
          setSelectedBlueprintIndex(0);
          setSelectedVariantIndex(0);
        } else if (selectedBlueprintIndex >= list.length) {
          setSelectedBlueprintIndex(0);
          setSelectedVariantIndex(0);
        } else if (
          selectedVariantIndex >=
          (list[selectedBlueprintIndex]?.variants.length ?? 0)
        ) {
          setSelectedVariantIndex(0);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        setStatus(
          error instanceof Error ? error.message : 'Failed to load blueprints.'
        );
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeFileKey,
    loadBlueprints,
    selectedBlueprintIndex,
    selectedVariantIndex,
  ]);

  const updateBlueprints = useCallback(
    (updater: (existing: ChunkBlueprint[]) => ChunkBlueprint[]) => {
      setBlueprintCache((prev) => {
        const next = new Map(prev);
        const existing = prev.get(activeFileKey) ?? [];
        next.set(activeFileKey, updater(existing));
        return next;
      });
    },
    [activeFileKey]
  );

  const updateBlueprintAtIndex = useCallback(
    (index: number, mutator: (blueprint: ChunkBlueprint) => ChunkBlueprint) => {
      updateBlueprints((existing) => {
        if (!existing[index]) return existing;
        const copy = existing.slice();
        copy[index] = mutator(existing[index]!);
        return copy;
      });
    },
    [updateBlueprints]
  );

  const updateVariantAtIndex = useCallback(
    (
      variantIndex: number,
      mutator: (
        variant: ChunkBlueprint['variants'][number]
      ) => ChunkBlueprint['variants'][number]
    ) => {
      updateBlueprintAtIndex(selectedBlueprintIndex, (blueprint) => {
        if (!blueprint.variants[variantIndex]) return blueprint;
        const variants = blueprint.variants.slice();
        variants[variantIndex] = mutator(blueprint.variants[variantIndex]!);
        return { ...blueprint, variants };
      });
    },
    [selectedBlueprintIndex, updateBlueprintAtIndex]
  );

  const handleAddBlueprint = useCallback(() => {
    const timestamp = Date.now();
    const newBlueprint: ChunkBlueprint = {
      name: `new-blueprint-${timestamp}`,
      bodyId: '',
      defaultStampId: '',
      variants: [],
    };
    updateBlueprints((existing) => [...existing, newBlueprint]);
    setSelectedBlueprintIndex(currentBlueprints.length);
    setSelectedVariantIndex(0);
    setStatus('Added new blueprint.');
  }, [currentBlueprints.length, updateBlueprints]);

  const handleRemoveBlueprint = useCallback(() => {
    if (!currentBlueprint) return;
    updateBlueprints((existing) => {
      const copy = existing.slice();
      copy.splice(selectedBlueprintIndex, 1);
      return copy;
    });
    setSelectedBlueprintIndex((prev) => Math.max(0, prev - 1));
    setSelectedVariantIndex(0);
    setStatus(`Removed blueprint "${currentBlueprint.name}".`);
  }, [currentBlueprint, selectedBlueprintIndex, updateBlueprints]);

  const handleAddVariant = useCallback(() => {
    if (!currentBlueprint) return;
    const variantName = `variant-${Date.now()}`;
    updateBlueprintAtIndex(selectedBlueprintIndex, (blueprint) => ({
      ...blueprint,
      variants: [
        ...blueprint.variants,
        {
          name: variantName,
          ports: [],
        },
      ],
    }));
    setSelectedVariantIndex(currentBlueprint.variants.length);
    setStatus(`Added variant "${variantName}".`);
  }, [currentBlueprint, selectedBlueprintIndex, updateBlueprintAtIndex]);

  const handleRemoveVariant = useCallback(() => {
    if (!currentBlueprint || !currentVariant) return;
    updateBlueprintAtIndex(selectedBlueprintIndex, (blueprint) => {
      const variants = blueprint.variants.slice();
      variants.splice(selectedVariantIndex, 1);
      return { ...blueprint, variants };
    });
    setSelectedVariantIndex((prev) => Math.max(0, prev - 1));
    setStatus(`Removed variant "${currentVariant.name}".`);
  }, [
    currentBlueprint,
    currentVariant,
    selectedBlueprintIndex,
    selectedVariantIndex,
    updateBlueprintAtIndex,
  ]);

  const handleSaveBlueprintFile = useCallback(async () => {
    setIsSaving(true);
    setStatus(null);
    try {
      const blueprints = blueprintCache.get(activeFileKey) ?? [];
      const moduleContents = renderBlueprintModule(activeFileKey, blueprints);
      const result = await fetchJson<{ ok: boolean; error?: string }>(
        '/api/authoring/file',
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: activeFileKey,
            contents: moduleContents,
          }),
        }
      );
      if (!result.ok) {
        throw new Error(result.error || 'Failed to save blueprints.');
      }
      setStatus('Blueprint file saved.');
      onSaveComplete?.();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save blueprints.';
      setStatus(message);
    } finally {
      setIsSaving(false);
    }
  }, [activeFileKey, blueprintCache, onSaveComplete]);

  const blueprintStampPolicy = currentBlueprint?.stampPolicy ?? '';
  const variantStampPolicy = currentVariant?.stampPolicy ?? '';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label className="flex flex-col gap-1">
          <span className="text-gray-600">Blueprint File</span>
          <select
            value={activeFileKey}
            onChange={(event) => {
              setActiveFileKey(event.target.value as BlueprintFileKey);
              setSelectedBlueprintIndex(0);
              setSelectedVariantIndex(0);
            }}
            className="rounded border border-gray-300 px-2 py-1"
          >
            <option value="room-blueprints">room-blueprints.ts</option>
            <option value="connector-blueprints">
              connector-blueprints.ts
            </option>
          </select>
        </label>
        <div className="flex items-end justify-end gap-2">
          <button
            type="button"
            onClick={handleAddBlueprint}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
          >
            Add Blueprint
          </button>
          <button
            type="button"
            onClick={handleSaveBlueprintFile}
            disabled={isSaving}
            className="rounded border border-blue-500 bg-blue-500 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-600 disabled:opacity-50"
          >
            Save File
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {currentBlueprints.map((blueprint, index) => (
          <button
            key={blueprint.name || index}
            type="button"
            onClick={() => {
              setSelectedBlueprintIndex(index);
              setSelectedVariantIndex(0);
            }}
            className={`rounded px-2 py-1 ${
              index === selectedBlueprintIndex
                ? 'bg-blue-500 text-white'
                : 'border border-gray-300 text-gray-700'
            }`}
          >
            {blueprint.name || `Blueprint ${index + 1}`}
          </button>
        ))}
      </div>
      {currentBlueprint ? (
        <div className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="text-gray-600">Blueprint Name</span>
              <input
                type="text"
                value={currentBlueprint.name}
                onChange={(event) => {
                  const nextName = event.target.value;
                  updateBlueprintAtIndex(
                    selectedBlueprintIndex,
                    (blueprint) => ({
                      ...blueprint,
                      name: nextName,
                    })
                  );
                }}
                className="rounded border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-gray-600">Body ID</span>
              <input
                type="text"
                value={currentBlueprint.bodyId}
                onChange={(event) => {
                  const value = event.target.value;
                  updateBlueprintAtIndex(
                    selectedBlueprintIndex,
                    (blueprint) => ({
                      ...blueprint,
                      bodyId: value,
                    })
                  );
                }}
                className="rounded border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-gray-600">Default Stamp ID</span>
              <input
                type="text"
                value={currentBlueprint.defaultStampId}
                onChange={(event) => {
                  const value = event.target.value;
                  updateBlueprintAtIndex(
                    selectedBlueprintIndex,
                    (blueprint) => ({
                      ...blueprint,
                      defaultStampId: value,
                    })
                  );
                }}
                className="rounded border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-gray-600">Stamp Policy</span>
              <select
                value={blueprintStampPolicy}
                onChange={(event) => {
                  const value = event.target.value as StampPolicy | '';
                  updateBlueprintAtIndex(
                    selectedBlueprintIndex,
                    (blueprint) => ({
                      ...blueprint,
                      stampPolicy: value || undefined,
                    })
                  );
                }}
                className="rounded border border-gray-300 px-2 py-1"
              >
                <option value="">inherit</option>
                <option value="all">all</option>
                <option value="defaultOnly">defaultOnly</option>
                <option value="none">none</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-gray-600">Body (orientation h)</span>
              <input
                type="text"
                value={currentBlueprint.bodyByOrientation?.h ?? ''}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  updateBlueprintAtIndex(
                    selectedBlueprintIndex,
                    (blueprint) => {
                      const bodyByOrientation = {
                        ...(blueprint.bodyByOrientation ?? {}),
                      };
                      if (value) {
                        bodyByOrientation.h = value;
                      } else {
                        delete bodyByOrientation.h;
                      }
                      if (!bodyByOrientation.h && !bodyByOrientation.v) {
                        return { ...blueprint, bodyByOrientation: undefined };
                      }
                      return { ...blueprint, bodyByOrientation };
                    }
                  );
                }}
                className="rounded border border-gray-300 px-2 py-1"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-gray-600">Body (orientation v)</span>
              <input
                type="text"
                value={currentBlueprint.bodyByOrientation?.v ?? ''}
                onChange={(event) => {
                  const value = event.target.value.trim();
                  updateBlueprintAtIndex(
                    selectedBlueprintIndex,
                    (blueprint) => {
                      const bodyByOrientation = {
                        ...(blueprint.bodyByOrientation ?? {}),
                      };
                      if (value) {
                        bodyByOrientation.v = value;
                      } else {
                        delete bodyByOrientation.v;
                      }
                      if (!bodyByOrientation.h && !bodyByOrientation.v) {
                        return { ...blueprint, bodyByOrientation: undefined };
                      }
                      return { ...blueprint, bodyByOrientation };
                    }
                  );
                }}
                className="rounded border border-gray-300 px-2 py-1"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-gray-600">
              Variants
            </span>
            {currentBlueprint.variants.map((variant, index) => (
              <button
                key={variant.name || index}
                type="button"
                onClick={() => setSelectedVariantIndex(index)}
                className={`rounded px-2 py-1 ${
                  index === selectedVariantIndex
                    ? 'bg-blue-500 text-white'
                    : 'border border-gray-300 text-gray-700'
                }`}
              >
                {variant.name || `Variant ${index + 1}`}
              </button>
            ))}
            <button
              type="button"
              onClick={handleAddVariant}
              className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
            >
              Add Variant
            </button>
            {currentVariant ? (
              <button
                type="button"
                onClick={handleRemoveVariant}
                className="rounded border border-gray-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
              >
                Remove Variant
              </button>
            ) : null}
          </div>
          {currentVariant ? (
            <div className="space-y-3 rounded border border-gray-200 bg-gray-50 p-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-gray-600">Variant Name</span>
                  <input
                    type="text"
                    value={currentVariant.name}
                    onChange={(event) => {
                      const value = event.target.value;
                      updateVariantAtIndex(selectedVariantIndex, (variant) => ({
                        ...variant,
                        name: value,
                      }));
                    }}
                    className="rounded border border-gray-300 px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-600">Stamp Policy</span>
                  <select
                    value={variantStampPolicy}
                    onChange={(event) => {
                      const value = event.target.value as StampPolicy | '';
                      updateVariantAtIndex(selectedVariantIndex, (variant) => ({
                        ...variant,
                        stampPolicy: value || undefined,
                      }));
                    }}
                    className="rounded border border-gray-300 px-2 py-1"
                  >
                    <option value="">inherit</option>
                    <option value="all">all</option>
                    <option value="defaultOnly">defaultOnly</option>
                    <option value="none">none</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-600">Stamp Override</span>
                  <input
                    type="text"
                    value={currentVariant.stampId ?? ''}
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      updateVariantAtIndex(selectedVariantIndex, (variant) => ({
                        ...variant,
                        stampId: value || undefined,
                      }));
                    }}
                    className="rounded border border-gray-300 px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-600">Body Override</span>
                  <input
                    type="text"
                    value={currentVariant.bodyId ?? ''}
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      updateVariantAtIndex(selectedVariantIndex, (variant) => ({
                        ...variant,
                        bodyId: value || undefined,
                      }));
                    }}
                    className="rounded border border-gray-300 px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-600">Body (orientation h)</span>
                  <input
                    type="text"
                    value={currentVariant.bodyByOrientation?.h ?? ''}
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      updateVariantAtIndex(selectedVariantIndex, (variant) => {
                        const bodyByOrientation = {
                          ...(variant.bodyByOrientation ?? {}),
                        };
                        if (value) {
                          bodyByOrientation.h = value;
                        } else {
                          delete bodyByOrientation.h;
                        }
                        if (!bodyByOrientation.h && !bodyByOrientation.v) {
                          return { ...variant, bodyByOrientation: undefined };
                        }
                        return { ...variant, bodyByOrientation };
                      });
                    }}
                    className="rounded border border-gray-300 px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-600">Body (orientation v)</span>
                  <input
                    type="text"
                    value={currentVariant.bodyByOrientation?.v ?? ''}
                    onChange={(event) => {
                      const value = event.target.value.trim();
                      updateVariantAtIndex(selectedVariantIndex, (variant) => {
                        const bodyByOrientation = {
                          ...(variant.bodyByOrientation ?? {}),
                        };
                        if (value) {
                          bodyByOrientation.v = value;
                        } else {
                          delete bodyByOrientation.v;
                        }
                        if (!bodyByOrientation.h && !bodyByOrientation.v) {
                          return { ...variant, bodyByOrientation: undefined };
                        }
                        return { ...variant, bodyByOrientation };
                      });
                    }}
                    className="rounded border border-gray-300 px-2 py-1"
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-gray-600">Meta Role</span>
                  <select
                    value={currentVariant.meta?.role ?? ''}
                    onChange={(event) => {
                      const value = event.target.value as
                        | 'room'
                        | 'connector'
                        | 'intersection'
                        | '';
                      updateVariantAtIndex(selectedVariantIndex, (variant) => {
                        const meta = { ...(variant.meta ?? {}) };
                        if (value) meta.role = value;
                        else delete meta.role;
                        if (Object.keys(meta).length === 0) {
                          return { ...variant, meta: undefined };
                        }
                        return { ...variant, meta };
                      });
                    }}
                    className="rounded border border-gray-300 px-2 py-1"
                  >
                    <option value="">(none)</option>
                    <option value="room">room</option>
                    <option value="connector">connector</option>
                    <option value="intersection">intersection</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-600">Meta Orientation</span>
                  <select
                    value={currentVariant.meta?.orientation ?? ''}
                    onChange={(event) => {
                      const value = event.target.value as 'h' | 'v' | '';
                      updateVariantAtIndex(selectedVariantIndex, (variant) => {
                        const meta = { ...(variant.meta ?? {}) };
                        if (value) meta.orientation = value;
                        else delete meta.orientation;
                        if (Object.keys(meta).length === 0) {
                          return { ...variant, meta: undefined };
                        }
                        return { ...variant, meta };
                      });
                    }}
                    className="rounded border border-gray-300 px-2 py-1"
                  >
                    <option value="">(none)</option>
                    <option value="h">h</option>
                    <option value="v">v</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-600">Meta Weight</span>
                  <input
                    type="number"
                    value={currentVariant.meta?.weight ?? ''}
                    onChange={(event) => {
                      const raw = event.target.value;
                      updateVariantAtIndex(selectedVariantIndex, (variant) => {
                        const meta = { ...(variant.meta ?? {}) };
                        if (raw === '') {
                          delete meta.weight;
                        } else {
                          meta.weight = Number(raw);
                        }
                        if (Object.keys(meta).length === 0) {
                          return { ...variant, meta: undefined };
                        }
                        return { ...variant, meta };
                      });
                    }}
                    className="rounded border border-gray-300 px-2 py-1"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-gray-600">
                    Meta Tags (comma separated)
                  </span>
                  <input
                    type="text"
                    value={(currentVariant.meta?.tags ?? []).join(', ')}
                    onChange={(event) => {
                      const raw = event.target.value;
                      const tags = raw
                        .split(',')
                        .map((tag) => tag.trim())
                        .filter(Boolean);
                      updateVariantAtIndex(selectedVariantIndex, (variant) => {
                        const meta = { ...(variant.meta ?? {}) };
                        if (tags.length) meta.tags = tags;
                        else delete meta.tags;
                        if (Object.keys(meta).length === 0) {
                          return { ...variant, meta: undefined };
                        }
                        return { ...variant, meta };
                      });
                    }}
                    className="rounded border border-gray-300 px-2 py-1"
                  />
                </label>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600">
                    Ports
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      updateVariantAtIndex(selectedVariantIndex, (variant) => ({
                        ...variant,
                        ports: [
                          ...(variant.ports ?? []),
                          {
                            side: 'N' as Side,
                            centerOffsetTiles: 0,
                            widthTiles: 1,
                          },
                        ],
                      }));
                    }}
                    className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50"
                  >
                    Add Port
                  </button>
                </div>
                <div className="space-y-2">
                  {(currentVariant.ports ?? []).map((port, index) => (
                    <div
                      key={`${port.side}-${index}`}
                      className="grid grid-cols-4 gap-2 rounded border border-gray-200 bg-white p-2"
                    >
                      <label className="flex flex-col gap-1">
                        <span className="text-gray-600">Side</span>
                        <select
                          value={port.side}
                          onChange={(event) => {
                            const value = event.target.value as Side;
                            updateVariantAtIndex(
                              selectedVariantIndex,
                              (variant) => {
                                const ports = [...(variant.ports ?? [])];
                                ports[index] = {
                                  ...ports[index]!,
                                  side: value,
                                };
                                return { ...variant, ports };
                              }
                            );
                          }}
                          className="rounded border border-gray-300 px-2 py-1"
                        >
                          {STAMP_SIDES.map((side) => (
                            <option key={side} value={side}>
                              {side}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-gray-600">Center Offset</span>
                        <input
                          type="number"
                          value={port.centerOffsetTiles}
                          onChange={(event) => {
                            const value = Number(event.target.value);
                            updateVariantAtIndex(
                              selectedVariantIndex,
                              (variant) => {
                                const ports = [...(variant.ports ?? [])];
                                ports[index] = {
                                  ...ports[index]!,
                                  centerOffsetTiles: value,
                                };
                                return { ...variant, ports };
                              }
                            );
                          }}
                          className="rounded border border-gray-300 px-2 py-1"
                        />
                      </label>
                      <label className="flex flex-col gap-1">
                        <span className="text-gray-600">Width</span>
                        <input
                          type="number"
                          value={port.widthTiles ?? ''}
                          onChange={(event) => {
                            const raw = event.target.value;
                            updateVariantAtIndex(
                              selectedVariantIndex,
                              (variant) => {
                                const ports = [...(variant.ports ?? [])];
                                ports[index] = {
                                  ...ports[index]!,
                                  widthTiles:
                                    raw === '' ? undefined : Number(raw),
                                };
                                return { ...variant, ports };
                              }
                            );
                          }}
                          className="rounded border border-gray-300 px-2 py-1"
                        />
                      </label>
                      <div className="flex items-end justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            updateVariantAtIndex(
                              selectedVariantIndex,
                              (variant) => {
                                const ports = [...(variant.ports ?? [])];
                                ports.splice(index, 1);
                                return { ...variant, ports };
                              }
                            );
                          }}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded border border-dashed border-gray-300 p-4 text-xs text-gray-500">
              Select or add a variant to edit its details.
            </div>
          )}
          <div className="flex justify-between">
            <button
              type="button"
              onClick={handleRemoveBlueprint}
              className="rounded border border-gray-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              Remove Blueprint
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded border border-dashed border-gray-300 p-4 text-xs text-gray-500">
          Add a blueprint to begin editing.
        </div>
      )}
      {status ? (
        <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700">
          {status}
        </div>
      ) : null}
    </div>
  );
};

type AuthorTemplatesPanelProps = {
  mapWidth: number;
  mapHeight: number;
  setMapWidth: (value: number) => void;
  setMapHeight: (value: number) => void;
  setMapType: (value: MapClusterType) => void;
  setMapOrientation: (value: MapMeta['orientation'] | undefined) => void;
  placedAssets: PlacedAsset[];
  updatePlacedAssets: (updater: React.SetStateAction<PlacedAsset[]>) => void;
  setPorts: React.Dispatch<React.SetStateAction<MapPort[]>>;
  onPreviewRegenerated: () => Promise<void> | void;
};

export function AuthorTemplatesPanel(props: AuthorTemplatesPanelProps) {
  const {
    mapWidth,
    mapHeight,
    setMapWidth,
    setMapHeight,
    setMapType,
    setMapOrientation,
    placedAssets,
    updatePlacedAssets,
    setPorts,
    onPreviewRegenerated,
  } = props;

  const [activeTab, setActiveTab] = useState<
    'bodies' | 'stamps' | 'blueprints'
  >('bodies');
  const [previewStatus, setPreviewStatus] = useState<string | null>(null);
  const [isPreviewPending, setIsPreviewPending] = useState(false);

  const handlePreview = useCallback(async () => {
    setIsPreviewPending(true);
    setPreviewStatus(null);
    try {
      const response = await fetch('/api/authoring/generate', {
        method: 'POST',
      });
      const payload = await response.json();
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Failed to run generator.');
      }
      const elapsed =
        typeof payload.elapsedMs === 'number'
          ? `${Math.round(payload.elapsedMs)}ms`
          : 'OK';
      const size =
        typeof payload.size === 'number' ? `${payload.size} bytes` : '';
      const count =
        typeof payload.chunkCount === 'number'
          ? `${payload.chunkCount} chunks`
          : '';
      const message = [`Preview generated`, count, size, elapsed]
        .filter(Boolean)
        .join(' • ');
      setPreviewStatus(message);
      await onPreviewRegenerated();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Preview failed.';
      setPreviewStatus(message);
    } finally {
      setIsPreviewPending(false);
    }
  }, [onPreviewRegenerated]);

  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div className="flex border-b border-gray-200">
        {[
          { key: 'bodies', label: 'Bodies' },
          { key: 'stamps', label: 'Stamps' },
          { key: 'blueprints', label: 'Blueprints' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`flex-1 px-3 py-2 text-sm font-medium ${
              activeTab === tab.key
                ? 'bg-blue-100 text-blue-900'
                : 'text-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="p-3 text-sm text-black">
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handlePreview()}
            disabled={isPreviewPending}
            className="rounded border border-green-500 bg-green-500 px-2 py-1 text-xs font-semibold text-white hover:bg-green-600 disabled:opacity-50"
          >
            Preview / Regenerate
          </button>
          {previewStatus ? (
            <span className="text-[11px] text-gray-600">{previewStatus}</span>
          ) : null}
        </div>
        {activeTab === 'bodies' ? (
          <BodiesTab
            mapWidth={mapWidth}
            mapHeight={mapHeight}
            setMapWidth={setMapWidth}
            setMapHeight={setMapHeight}
            setMapType={setMapType}
            setMapOrientation={setMapOrientation}
            placedAssets={placedAssets}
            updatePlacedAssets={updatePlacedAssets}
            setPorts={setPorts}
          />
        ) : null}
        {activeTab === 'stamps' ? (
          <StampsTab
            mapWidth={mapWidth}
            mapHeight={mapHeight}
            setMapWidth={setMapWidth}
            setMapHeight={setMapHeight}
            setMapType={setMapType}
            setMapOrientation={setMapOrientation}
            placedAssets={placedAssets}
            updatePlacedAssets={updatePlacedAssets}
            setPorts={setPorts}
          />
        ) : null}
        {activeTab === 'blueprints' ? (
          <BlueprintsTab onSaveComplete={onPreviewRegenerated} />
        ) : null}
      </div>
    </div>
  );
}
