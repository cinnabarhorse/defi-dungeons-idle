'use client';

import React, { useCallback, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { parseTmx } from '../../lib/tiled/tmx';
import { sliceTiles } from '../../lib/tiled/slicer';
import { buildZip } from '../../lib/tiled/exporter';
import {
  ExporterInputs,
  LayerCategoryMapping,
  TiledParseResult,
} from '../../lib/tiled/types';

interface ParseContext {
  result: TiledParseResult;
  images: Map<string, File>;
  warnings: string[];
}

type Status = 'idle' | 'parsing' | 'parsed' | 'exporting' | 'done';

const KNOWN_CATEGORIES = ['floors', 'walls', 'hazards', 'decor', 'special'];

export default function TiledImporterPage(): JSX.Element {
  const [tmxFile, setTmxFile] = useState<File | null>(null);
  const [tilesetFiles, setTilesetFiles] = useState<File[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [importName, setImportName] = useState<string>('');
  const [tileSize, setTileSize] = useState<number>(32);

  const [status, setStatus] = useState<Status>('idle');
  const [parseContext, setParseContext] = useState<ParseContext | null>(null);
  const [layerCategories, setLayerCategories] = useState<LayerCategoryMapping>({});
  const [errorMessages, setErrorMessages] = useState<string[]>([]);
  const [infoMessages, setInfoMessages] = useState<string[]>([]);
  const [missingImages, setMissingImages] = useState<string[]>([]);
  const [exportSummary, setExportSummary] = useState<{ assetCount: number; placementCount: number } | null>(null);

  const handleParse = useCallback(async () => {
    setStatus('parsing');
    setErrorMessages([]);
    setInfoMessages([]);
    setMissingImages([]);
    setExportSummary(null);
    setParseContext(null);

    try {
      const imageMap = new Map<string, File>();
      const parseWarnings: string[] = [];
      let tmxText: string | null = null;

      if (zipFile) {
        const zip = await JSZip.loadAsync(zipFile);
        const entries = Object.values(zip.files);
        for (const entry of entries) {
          if (entry.dir) {
            continue;
          }
          const lowerName = entry.name.toLowerCase();
          if (lowerName.endsWith('.tmx')) {
            const entryText = await entry.async('text');
            if (!tmxText) {
              tmxText = entryText;
            } else {
              parseWarnings.push(`Multiple TMX files found in ZIP. Using ${entry.name}.`);
            }
          }
          if (lowerName.endsWith('.png')) {
            const blob = await entry.async('blob');
            const file = new File([blob], entry.name, { type: 'image/png', lastModified: Date.now() });
            registerImageFile(imageMap, file, entry.name);
          }
        }
        if (!tmxText) {
          parseWarnings.push('ZIP file did not contain a TMX file.');
        }
      }

      if (!tmxText && tmxFile) {
        tmxText = await tmxFile.text();
      }

      if (!tmxText) {
        setErrorMessages(['Select a TMX file or a ZIP archive containing one.']);
        setStatus('idle');
        return;
      }

      if (tilesetFiles.length > 0) {
        tilesetFiles.forEach((file) => registerImageFile(imageMap, file));
      }

      const result = parseTmx(tmxText);
      const combinedWarnings = [...parseWarnings, ...result.warnings];

      setParseContext({ result, images: imageMap, warnings: combinedWarnings });

      setLayerCategories((prev) => {
        const next: LayerCategoryMapping = {};
        result.layers.forEach((layer) => {
          next[layer.name] = prev[layer.name] ?? inferCategory(layer.name);
        });
        return next;
      });

      const errorsToReport = result.errors.length > 0 ? result.errors : [];
      const infos: string[] = [];
      if (combinedWarnings.length > 0) {
        infos.push(...combinedWarnings);
      }

      setErrorMessages(errorsToReport);
      setInfoMessages(infos);
      setStatus('parsed');
    } catch (error) {
      setErrorMessages([error instanceof Error ? error.message : 'Unknown parse error']);
      setStatus('idle');
    }
  }, [tmxFile, tilesetFiles, zipFile]);

  const handleExport = useCallback(async () => {
    if (!parseContext) {
      return;
    }

    setStatus('exporting');
    setErrorMessages([]);
    setMissingImages([]);

    try {
      const sliceResult = await sliceTiles({
        tilesets: parseContext.result.tilesets,
        usedTiles: parseContext.result.usedTiles,
        images: parseContext.images,
        targetTileSize: tileSize,
      });

      const exporterInputs: ExporterInputs = {
        importName,
        targetTileSize: tileSize,
        slices: sliceResult.assets,
        placements: parseContext.result.placements,
        tilesets: parseContext.result.tilesets,
        layerCategories,
      };

      const exportResult = await buildZip(exporterInputs);

      triggerDownload(exportResult.blob, `${sanitizeFileName(importName || 'tmx-import')}.zip`);
      setMissingImages(sliceResult.missingImages);
      setExportSummary({
        assetCount: sliceResult.assets.length,
        placementCount: parseContext.result.placements.length,
      });
      setStatus('done');
    } catch (error) {
      setErrorMessages([error instanceof Error ? error.message : 'Export failed']);
      setStatus('parsed');
    }
  }, [importName, layerCategories, parseContext, tileSize]);

  const summary = useMemo(() => parseContext?.result.summary, [parseContext]);

  const canExport = Boolean(
    parseContext &&
      status !== 'exporting' &&
      parseContext.result.errors.length === 0 &&
      parseContext.result.usedTiles.length > 0,
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6 text-sm">
      <header className="rounded-lg bg-slate-900/70 p-6 shadow">
        <h1 className="text-2xl font-semibold text-white">Tiled Importer</h1>
        <p className="mt-2 text-slate-300">
          Load a Tiled TMX file (with tileset images) and export ready-to-use Gotchiverse assets.
        </p>
      </header>

      <section className="rounded-lg bg-slate-900/40 p-6 shadow">
        <h2 className="text-lg font-semibold text-white">Inputs</h2>
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className="font-medium text-slate-200">TMX File</label>
            <input
              type="file"
              accept=".tmx"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setTmxFile(file);
              }}
              className="rounded border border-slate-700 bg-slate-900 p-2 text-slate-100"
            />
            <p className="text-xs text-slate-400">Select the exported map from Tiled.</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-medium text-slate-200">Tileset Images (.png)</label>
            <input
              type="file"
              accept=".png"
              multiple
              onChange={(event) => {
                const files = event.target.files ? Array.from(event.target.files) : [];
                setTilesetFiles(files);
              }}
              className="rounded border border-slate-700 bg-slate-900 p-2 text-slate-100"
            />
            <p className="text-xs text-slate-400">Optional when a ZIP is provided.</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-medium text-slate-200">ZIP Bundle (tmx + png)</label>
            <input
              type="file"
              accept=".zip"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setZipFile(file);
              }}
              className="rounded border border-slate-700 bg-slate-900 p-2 text-slate-100"
            />
            <p className="text-xs text-slate-400">Provide a packaged export directly from Tiled.</p>
          </div>
          <div className="flex flex-col gap-2">
            <label className="font-medium text-slate-200">Import Name</label>
            <input
              type="text"
              value={importName}
              onChange={(event) => setImportName(event.target.value)}
              placeholder="dungeon-room"
              className="rounded border border-slate-700 bg-slate-900 p-2 text-slate-100"
            />
            <label className="mt-2 font-medium text-slate-200">Target Tile Size</label>
            <input
              type="number"
              min={8}
              step={1}
              value={tileSize}
              onChange={(event) => setTileSize(Number(event.target.value) || 32)}
              className="rounded border border-slate-700 bg-slate-900 p-2 text-slate-100"
            />
          </div>
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleParse}
            disabled={status === 'parsing'}
            className="rounded bg-emerald-500 px-4 py-2 font-medium text-slate-900 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {status === 'parsing' ? 'Parsing…' : 'Parse TMX'}
          </button>
          <button
            onClick={handleExport}
            disabled={!canExport}
            className="rounded bg-indigo-500 px-4 py-2 font-medium text-white transition hover:bg-indigo-400 disabled:opacity-50"
          >
            {status === 'exporting' ? 'Exporting…' : 'Export ZIP'}
          </button>
        </div>
      </section>

      {errorMessages.length > 0 && (
        <section className="rounded-lg border border-red-500/40 bg-red-950/60 p-4 text-sm text-red-200">
          <h3 className="mb-2 font-semibold">Errors</h3>
          <ul className="list-disc space-y-1 pl-5">
            {errorMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </section>
      )}

      {infoMessages.length > 0 && (
        <section className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-4 text-sm text-amber-200">
          <h3 className="mb-2 font-semibold">Warnings</h3>
          <ul className="list-disc space-y-1 pl-5">
            {infoMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </section>
      )}

      {summary && (
        <section className="rounded-lg bg-slate-900/40 p-6 shadow">
          <h2 className="text-lg font-semibold text-white">Parse Summary</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-slate-400">Layers</dt>
              <dd className="text-xl font-semibold text-white">{summary.layerCount}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Tiles used</dt>
              <dd className="text-xl font-semibold text-white">{summary.distinctTiles}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Animated tiles</dt>
              <dd className="text-xl font-semibold text-white">{summary.animatedTiles}</dd>
            </div>
            <div>
              <dt className="text-slate-400">Placements</dt>
              <dd className="text-xl font-semibold text-white">{summary.totalPlacements}</dd>
            </div>
          </dl>
        </section>
      )}

      {parseContext && (
        <section className="rounded-lg bg-slate-900/40 p-6 shadow">
          <h2 className="text-lg font-semibold text-white">Layer Categories</h2>
          <p className="mt-1 text-xs text-slate-400">
            Adjust categories before exporting. These map to asset palettes in the editor.
          </p>
          <div className="mt-4 space-y-3">
            {parseContext.result.layers.map((layer) => (
              <div key={layer.id} className="flex flex-col gap-1 rounded border border-slate-800 bg-slate-950/40 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-200">{layer.name}</p>
                  <p className="text-xs text-slate-400">{layer.width} × {layer.height}</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={layerCategories[layer.name] ?? ''}
                    onChange={(event) =>
                      setLayerCategories((prev) => ({
                        ...prev,
                        [layer.name]: event.target.value,
                      }))
                    }
                    list="layer-category-options"
                    placeholder={inferCategory(layer.name)}
                    className="w-40 rounded border border-slate-700 bg-slate-900 p-2 text-slate-100"
                  />
                </div>
              </div>
            ))}
          </div>
          <datalist id="layer-category-options">
            {KNOWN_CATEGORIES.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </section>
      )}

      {missingImages.length > 0 && (
        <section className="rounded-lg border border-amber-500/40 bg-amber-950/40 p-4 text-sm text-amber-200">
          <h3 className="mb-2 font-semibold">Missing Images</h3>
          <p className="mb-2">
            These tilesets could not be found. The ZIP will exclude tiles referencing them.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {missingImages.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      )}

      {exportSummary && (
        <section className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-4 text-sm text-emerald-200">
          <h3 className="mb-2 font-semibold">Export Complete</h3>
          <p className="text-emerald-100">
            Generated {exportSummary.assetCount} assets with {exportSummary.placementCount} placements.
          </p>
        </section>
      )}
    </div>
  );
}

function registerImageFile(map: Map<string, File>, file: File, relativePath?: string) {
  const candidates = new Set<string>();
  const baseKey = normalizePath(relativePath ?? file.name);
  if (baseKey) {
    candidates.add(baseKey);
    const parts = baseKey.split('/');
    candidates.add(parts[parts.length - 1]);
  }
  candidates.add(file.name.toLowerCase());

  candidates.forEach((key) => {
    map.set(key, file);
  });
}

function normalizePath(value: string | undefined): string {
  if (!value) {
    return '';
  }
  return value.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

function inferCategory(layerName: string): string {
  const normalized = layerName.toLowerCase();
  if (/(floor|ground|terrain)/.test(normalized)) {
    return 'floors';
  }
  if (/(wall|barrier|rock|block)/.test(normalized)) {
    return 'walls';
  }
  if (/(water|liquid|lava)/.test(normalized)) {
    return 'hazards';
  }
  if (/(prop|decor|furniture)/.test(normalized)) {
    return 'decor';
  }
  return 'special';
}

function sanitizeFileName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-_]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '') || 'tmx-import';
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
