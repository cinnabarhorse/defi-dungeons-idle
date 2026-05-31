### Loot Tab — UI Spec (Draft)

#### Purpose

Display what loot is available to earn from treasure chests. Initial version uses hardcoded values; future versions will populate dynamically from server data.

#### Initial Scope (Static)

- **Data (hardcoded)**:
  - **$GHO**: 985
  - **$GHST**: 1200
  - **Alloy**: 893
  - **Godlike Rofl**: 1

- **Placement (proposed)**: New "Loot" tab within the existing player/profile panel. Mirrors on mobile in the lobby if applicable.

No, it's not in the player/profile panel. It's in the activeTab selector in the /page.tsx file.

- **UI (proposed)**:
  - Grid/list of items with name and quantity; optional icon per item if assets exist.
  - Uses Shadcn UI (Tabs, Card, Badge as needed) and Tailwind.
  - Responsive: 1 column on small screens, 2–4 on larger screens.
  - Accessibility: semantic headings, focus states, ARIA labels for counts.

- **State/Rendering (guidelines)**:
  - Prefer React Server Components for read-only display; keep client-side minimal.
  - Optionally reflect the active tab in the URL via `nuqs` (e.g., `?tab=loot`).

  That would be great. We should do the same for /me tab too.

#### Future (Dynamic) Notes

- **Source of truth**: server-provided loot table for treasure chests; avoid client-derived values.
- **API shape (example)**:

```ts
export interface LootItem {
  id: string; // stable key (e.g., "gho", "ghst", "alloy", "godlike-rofl")
  name: string; // display label
  quantity: number; // available to earn
  category: 'token' | 'material' | 'wearable' | 'other';
  rarity?: 'common' | 'rare' | 'legendary' | 'godlike';
  iconUrl?: string; // optional asset path
}
```

- **Transport**: fetch via Next.js route in `apps/client` or from `apps/server` endpoint/WS, then hydrate UI.

#### Acceptance Criteria (for static version)

- A new "Loot" tab is visible alongside existing tabs in the player/profile UI.
- The tab shows exactly four entries: $GHO 985, $GHST 1200, Alloy 893, Godlike Rofl 1.
- Layout is responsive and accessible; numbers are formatted with thousands separators.
- No API calls required for the static version.

#### Open Questions

1. **Placement**: Should the Loot tab live inside `ProfilePanel` specifically, or elsewhere?

in its own /loot tab.

2. **Mobile**: Should the mobile layout of `Lobby` show the same Loot tab, or is desktop-only fine initially?

Both.

3. **Tab state**: Reflect the selected tab in the URL using `nuqs` (e.g., `?tab=loot`)?
   Sure.
4. **Icons**: Do we have/should we show icons for $GHO, $GHST, Alloy, Godlike Rofl? If yes, preferred asset paths?

No not yet. 5. **Styling cues**: Use rarity-based colors/badges (e.g., godlike styling) or keep it neutral for now?

Use rarity styling.

6. **Copy**: Exact header/subtext? e.g., "Available chest loot (preview)" with a short disclaimer.
7. **Sorting**: Sort by rarity, name, or quantity (default)? Any filters needed now?
8. **Numbers**: Use thousands separators (e.g., 1,200). Any locale preference?
9. **CTA**: Include a call-to-action (e.g., "Find a chest" or "Start run") on this tab?

"Start run" sounds cool.

10. **Dynamic source (later)**: Should the data come from `apps/server` (authoritative) or a Next.js API route in `apps/client` that proxies server data?

Up to you, eventually it will come from server.

11. **Wearables mapping**: Is "Godlike Rofl" mapped to an existing wearable ID and icon in `public/wearables/`?

Yes ID 156.

12. **Telemetry**: Track tab views/clicks? If yes, preferred analytics hook?

Not yet.

#### Implementation Notes (once approved)

- Add a new Loot tab to the existing tab set (likely in `apps/client/src/components/ProfilePanel.tsx`).
- Create a small presentational component (e.g., `apps/client/src/components/loot/LootList.tsx`) that renders from a static array for now.
- Wrap client pieces in `Suspense` with a lightweight fallback if needed; avoid client state for static data.
