# Data Source Files

This directory contains all shared data source files that are automatically copied to both client and server during build time to maintain single source of truth and avoid workspace package dependency issues.

## Files

- `difficulty-tiers.ts` - Difficulty tier definitions and reward calculations
- `characters.ts` - Character stats and definitions
- `enemy-sprite-configs.ts` - Enemy sprite sheets and animation configurations
- `items.ts` - Item definitions, colors, and stats
- `enemies.ts` - Enemy stats and behavior (generates different client/server versions)

## How it works

1. **Source**: Files in this directory are the single source of truth
2. **Generation**: The `scripts/generate-shared-files.ts` script copies these files to their target locations
3. **Auto-generated files**: Target files include headers warning not to edit them directly
4. **Build integration**: Generation runs automatically before builds and dev starts

## Usage

### Manual generation

```bash
npm run generate:shared
```

### Automatic generation

The files are automatically generated during:

- `npm run build`
- `npm run build:server`
- `npm run dev`
- `npm run dev:local`

## Target locations

All files generate to both:

- `apps/client/src/data/[filename].ts`
- `apps/server/src/data/[filename].ts`

## Client vs Server Differences

- **Most files**: Identical copies on both client and server
- **enemies.ts**:
  - Client gets lightweight version (names, types for map editor)
  - Server gets full version (stats, AI, utilities)

## Adding new shared files

1. Add the source file to this `/data/` directory
2. Add the filename to the `FILES` array in `scripts/generate-shared-files.ts`
3. Run `npm run generate:shared` to generate the files

Example:

```typescript
// In scripts/generate-shared-files.ts
const FILES: FileConfig[] = [
  // ... existing files
  { name: 'my-new-data' }, // Just add this line!
];
```

## Important notes

- ⚠️ **Never edit the generated files directly** - they will be overwritten
- ✅ **Always edit the source files** in this `/data/` directory
- 🔄 **Generation is automatic** during builds and dev starts
- 📝 **Generated files include headers** warning about auto-generation
- 🎯 **Single source of truth** - all shared data lives here
