Environment variables for gotchi sprites

- GOTCHI_TRAITS_BASE_PATH: absolute path to folder that contains "Trait Files/"
- GOTCHI_SPRITES_OUTPUT: optional absolute path for output PNGs (default: public/spritesheets in dev, /var/gotchiverse/spritesheets in production)
- GOTCHI_PUBLIC_BASE_URL: public URL path to serve sprites (default: /spritesheets)

## Smart Wallet Support

- BASE_RPC_URL: RPC endpoint for Base chain (default: https://mainnet.base.org)
  - Required for EIP-1271 signature verification (Coinbase Smart Wallet)
  - Example: `BASE_RPC_URL=https://base-mainnet.infura.io/v3/YOUR_KEY`

**Production (Hetzner):**
- Sprites are automatically saved to `/var/gotchiverse/spritesheets` when `NODE_ENV=production`
- This directory persists outside the git repository, so sprites survive code deployments
- You can override this by setting `GOTCHI_SPRITES_OUTPUT` in your deployment script or environment
- Ensure the directory exists and is writable: `sudo mkdir -p /var/gotchiverse/spritesheets && sudo chown $USER:$USER /var/gotchiverse/spritesheets`

**Versioning & Cache Invalidation:**
- Each sprite has a `.meta.json` file that stores a hash of the gotchi's attributes (collateral, eye traits, wearables)
- When a gotchi's wearables change, the attribute hash changes and the sprite is automatically regenerated
- Generator version changes (via `.generator-version` file) trigger regeneration of all sprites
- URLs include a content hash query parameter (`?v=...`) for cache busting
- Legacy sprites without metadata files are automatically regenerated on first access
