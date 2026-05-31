import vm from 'vm';
import * as ts from 'typescript';
import path from 'path';
import { readFileSync, existsSync } from 'fs';

import type { AuthoringFileKey, AuthoringFileKeyWithStamps } from './files';
import { readAuthoringFile, resolveAuthoringAbsolutePath } from './files';

const SUPPORTED_IMPORTS = new Set([
  '../authoring-types',
  '../../authoring-types',
  '../../maps/authoring-types',
]);

const transpileModuleToCommonJS = (
  source: string,
  filename: string
): string => {
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: false,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
    fileName: filename,
    reportDiagnostics: true,
  });

  if (transpiled.diagnostics && transpiled.diagnostics.length > 0) {
    const message = transpiled.diagnostics
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
      )
      .join('\n');
    throw new Error(`Failed to transpile module ${filename}: ${message}`);
  }

  return transpiled.outputText;
};

export const evaluateAuthoringModule = async (
  key: AuthoringFileKeyWithStamps
): Promise<Record<string, unknown>> => {
  const filename = resolveAuthoringAbsolutePath(key);

  const moduleCache = new Map<string, Record<string, unknown>>();

  const evaluateFileAtPath = (
    absolutePath: string
  ): Record<string, unknown> => {
    const cached = moduleCache.get(absolutePath);
    if (cached) return cached;

    const source = readFileSync(absolutePath, 'utf8');
    const compiled = transpileModuleToCommonJS(source, absolutePath);

    const exports: Record<string, unknown> = {};
    const moduleObj = { exports } as { exports: Record<string, unknown> };

    const context = vm.createContext({
      exports,
      module: moduleObj,
      require: (specifier: string) => {
        if (
          SUPPORTED_IMPORTS.has(specifier) ||
          SUPPORTED_IMPORTS.has(specifier.replace(/\.js$/i, ''))
        ) {
          return {};
        }
        if (specifier.startsWith('.')) {
          // Resolve relative TS module under the authoring tree
          let resolved = path.resolve(path.dirname(absolutePath), specifier);
          if (existsSync(resolved + '.ts')) {
            resolved = resolved + '.ts';
          } else if (existsSync(resolved)) {
            // Allow explicit .ts or index.ts
            if (resolved.endsWith('.ts')) {
              // ok
            } else if (existsSync(path.join(resolved, 'index.ts'))) {
              resolved = path.join(resolved, 'index.ts');
            }
          } else if (existsSync(resolved + '/index.ts')) {
            resolved = resolved + '/index.ts';
          } else {
            throw new Error(
              `Unsupported import "${specifier}" in ${absolutePath}`
            );
          }
          return evaluateFileAtPath(resolved);
        }
        throw new Error(`Unsupported import "${specifier}" in ${absolutePath}`);
      },
      __filename: absolutePath,
      __dirname: path.dirname(absolutePath),
    });

    vm.runInContext(compiled, context, { filename: absolutePath });

    const result = moduleObj.exports ?? exports;
    moduleCache.set(absolutePath, result);
    return result;
  };

  return evaluateFileAtPath(filename);
};

export const loadBodyRecipes = async (key: AuthoringFileKey) => {
  const exports = await evaluateAuthoringModule(key);
  const seen = new Map<string, unknown>();

  const tryRegister = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const candidate = value as { id?: unknown; size?: unknown };
    if (typeof candidate.id !== 'string') return;
    if (!candidate.size || typeof candidate.size !== 'object') return;
    seen.set(candidate.id, value);
  };

  if (exports && typeof exports === 'object') {
    for (const value of Object.values(exports)) {
      tryRegister(value);
    }
  }

  if ('default' in exports) {
    tryRegister((exports as Record<string, unknown>).default);
  }

  return Array.from(seen.values()) as Array<{
    id: string;
    size: { width: number; height: number };
    floors: unknown[];
    details?: unknown[];
  }>;
};

export const loadConnectorBodies = async () =>
  loadBodyRecipes('connector-base');

export const loadRoomBodies = async () => loadBodyRecipes('room-base');

export const loadStampedPorts = async () => {
  const exports = await evaluateAuthoringModule('port-stamps');
  const byId = new Map<string, Record<string, unknown>>();

  const register = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    const candidate = value as { id?: unknown; oriented?: unknown };
    if (typeof candidate.id === 'string' && candidate.oriented) {
      if (!byId.has(candidate.id)) {
        byId.set(candidate.id, value as Record<string, unknown>);
      }
    }
  };

  if (exports && typeof exports === 'object') {
    for (const [key, value] of Object.entries(exports)) {
      if (key === 'PORT_STAMPS' && value && typeof value === 'object') {
        for (const stamp of Object.values(value as Record<string, unknown>)) {
          register(stamp);
        }
      } else {
        register(value);
      }
    }
  }

  return Array.from(byId.values());
};

export const loadBlueprints = async (
  key: Extract<AuthoringFileKey, 'room-blueprints' | 'connector-blueprints'>
) => {
  const exports = await evaluateAuthoringModule(key);
  const byName = new Map<string, Record<string, unknown>>();

  const register = (value: unknown) => {
    if (!Array.isArray(value)) return;
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue;
      const candidate = entry as { name?: unknown };
      if (typeof candidate.name !== 'string') continue;
      if (!byName.has(candidate.name)) {
        byName.set(candidate.name, entry as Record<string, unknown>);
      }
    }
  };

  if (exports && typeof exports === 'object') {
    for (const value of Object.values(exports)) {
      register(value);
    }
  }

  if ('default' in exports) {
    register((exports as Record<string, unknown>).default);
  }

  return Array.from(byName.values());
};
