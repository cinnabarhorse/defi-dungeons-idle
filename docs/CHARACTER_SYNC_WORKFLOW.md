# Shared Files Generation Workflow

This document explains how shared data files (characters, difficulty tiers, etc.) are kept synchronized between client and server to ensure consistency while avoiding workspace dependency issues.

## ⚠️ Important: Build-Time Compilation

**JavaScript files are NOT committed to git** - they are generated at build time only. The repository contains only TypeScript source files. When you deploy:

1. Pull the latest code (TypeScript sources only)
2. Run `npm run build:server` (compiles TS → JS automatically)
3. Deploy the generated JS files

## 📁 File Structure

```
gotchiverse-live/
├── data/
│   └── characters.ts                    # 🎯 SINGLE SOURCE OF TRUTH
├── shared/
│   └── difficulty-tiers.ts              # 🎯 SINGLE SOURCE OF TRUTH
├── apps/
│   ├── client/src/data/
│   │   ├── characters.ts                # ⚠️  AUTO-GENERATED (do not edit)
│   │   └── difficulty-tiers.ts          # ⚠️  AUTO-GENERATED (do not edit)
│   └── server/src/data/
│       ├── characters.ts                # ⚠️  AUTO-GENERATED (do not edit)
│       └── difficulty-tiers.ts          # ⚠️  AUTO-GENERATED (do not edit)
└── scripts/
    └── generate-shared-files.js         # 🔄 Generation script
```

## 🔄 How It Works

1. **Single Source of Truth**: Source files contain all definitions
2. **Auto-Generation**: Script copies files to both client and server with appropriate headers
3. **Build Integration**: Generation happens automatically during build/dev processes
4. **No Workspace Dependencies**: Each app has its own copy, avoiding MODULE_NOT_FOUND errors

## 🚀 Usage

### Making Changes to Shared Data

1. **Only edit** the source files (`/data/characters.ts`, `/shared/difficulty-tiers.ts`)
2. **Run generation**: `npm run generate:shared`
3. **Rebuild**: Both client and server as needed

### Automatic Generation

The generation happens automatically during:

- `npm run dev` / `npm run dev:local`
- `npm run build` / `npm run build:server`
- `npm run prebuild`

### Manual Generation

```bash
npm run generate:shared
```

## ⚠️ Important Rules

### ✅ DO

- Edit source files (`/data/characters.ts`, `/shared/difficulty-tiers.ts`) for changes
- Run `npm run generate:shared` after making changes
- Commit all generated files together (source + both generated files)

### ❌ DON'T

- Edit generated files in `apps/client/src/data/` directly
- Edit generated files in `apps/server/src/data/` directly
- Try to import from workspace packages or shared directories

## 🔧 Troubleshooting

### If you see MODULE_NOT_FOUND errors:

1. Run `npm run generate:shared`
2. Rebuild the affected app
3. Check that the generated files exist

### If shared data is out of sync:

1. Edit the source files (`/data/characters.ts`, `/shared/difficulty-tiers.ts`)
2. Run `npm run generate:shared`
3. Rebuild both client and server

### If the generation script fails:

- Check that source files exist and are valid TypeScript
- Ensure you have write permissions to the target directories

## 🎯 Benefits

- **Reliability**: No workspace dependency issues
- **Consistency**: Single source of truth ensures data stays in sync
- **Automation**: Integrated into build process
- **Self-Contained**: Each app has everything it needs locally
- **Clear Ownership**: Obvious which files to edit (the sources)
- **Extensible**: Easy to add new shared files to the system

## 📝 Example Workflow

```bash
# 1. Make changes to shared data
vim data/characters.ts
vim shared/difficulty-tiers.ts

# 2. Generate to client and server
npm run generate:shared

# 3. Test locally
npm run dev:local

# 4. Build for production
npm run build:server

# 5. Deploy
# (files are now self-contained and reliable)
```

This approach eliminates the workspace dependency issues that consistently cause deployment failures while maintaining single sources of truth for all shared data.
