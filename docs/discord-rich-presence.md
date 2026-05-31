### Discord Rich Presence (Desktop wrapper)

This repository includes a minimal Electron app that sets Discord Rich Presence so friends can see "Playing DeFi Dungeons" while you play.

#### 1) Create a Discord Application
- Go to the Discord Developer Portal and create an Application.
- Copy the Client ID.
- (Optional) Add Rich Presence Art assets (large image) — not required for basic text.

#### 2) Configure environment
Set your Client ID in the environment (shell or `.env.local` in repo root):

```bash
export DISCORD_CLIENT_ID=YOUR_CLIENT_ID
```

You can also override the client URL the desktop loads:

```bash
export CLIENT_URL=http://localhost:3001
export CLIENT_PUBLIC_URL=https://dungeons.gotchiverse.io
```

#### 3) Run in development

```bash
pnpm i
pnpm dev
```

The desktop app waits for the Next.js client on port 3001 and then launches Electron, setting your Discord presence.

#### 4) Production notes
This is a minimal dev-oriented wrapper. If you want to distribute a desktop app, add a packager like `electron-builder` and configure icons and signing.


