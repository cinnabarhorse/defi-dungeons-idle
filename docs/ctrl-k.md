### Ctrl+K asset search — questions to confirm before implementation

- **target page**: Should the overlay live on `apps/client/src/app/map-editor/page.tsx` (asset editor) rather than the site root `apps/client/src/app/page.tsx`? The behavior described (select category + scroll to asset) maps to the map editor sidebar.

Yes

- **keyboard shortcut**: Trigger with `Ctrl+K` on Windows/Linux and `⌘K` on macOS? Should we also support `/` to open the palette, and always ignore the shortcut when an input/textarea/select is focused?

Don't need the slash command. And sure, ignore when an input is focused.

- **open/close behavior**: Open as a modal overlay centered on screen, close via `Esc`, outside click, and selection? Any additional ways to open it (e.g., a small "Search assets… (⌘K)" button in the sidebar header)?

Search assets in the sidebar would be good too.

- **ui components**: OK to implement with our existing `Dialog` component for the shell plus a custom list, or do you want Shadcn Command (`cmdk`) added as a dependency to get type-ahead and ARIA patterns out of the box?

let's use the shadcn cmdk

- **search scope**: Include all assets from `ASSET_CATEGORIES` (floors, walls, nature, rocks, special, characters, enemies, spawn)? Any categories to exclude from search results?

nope, inclue them all

- **fields to search**: Search over `name` (primary), `id`, and `sprite` filename; for enemies also `enemyType`. Anything else to include (e.g., category name)?

you can sort results by category name and include it as a header

- **matching algorithm**: Is simple, case-insensitive substring matching sufficient, or should we use fuzzy matching (e.g., Fuse.js)? If fuzzy, OK to add `fuse.js` as a dependency?

Substring matching is probably fine.

- **result ordering**: Sort by best match (exact prefix > substring > fuzzy score), then by category name and asset name? Any preferred ordering or grouping (e.g., group results by category sections)?

Yes, sort by best match.

- **result limit**: Cap results (e.g., first 50) with the option to "show all" or infinite scroll? Or show all since the dataset is small enough?

Show all is fine.

- **thumbnails**: For assets with `sprite`, show a 32–48px thumbnail. For character sprites (sprite sheets), show the first idle frame like the sidebar does. For items without sprites (enemies/spawn), reuse the same colored placeholder styles as the sidebar. Is this acceptable, or do you want animated thumbnails for assets with `frameCount` > 1?

I want to use animated thumbnails when available.

- **selection behavior**: On selection, should we also set the current `selectedAsset` (not just select category + scroll) so the user can immediately place it, consistent with clicking in the list?

Yes, that would be perfect.

- **scroll behavior**: After switching `selectedCategory`, scroll the left sidebar list so the chosen asset’s button is centered and briefly highlighted. OK to add `data-asset-id` attributes to list items and a `ref` on the scroll container for reliable `scrollIntoView`?

Sounds good. You can also update the URL if you would like.

- **accessibility / keyboard**: Support Up/Down to navigate results and Enter to select; `Esc` to close; maintain focus in the dialog (focus trap). Any additional a11y expectations?

Perfect.

- **debounce**: Debounce input (e.g., 100–150ms) to avoid excessive re-renders while typing, or keep it immediate?

Sure, feel free to debounce.

- **performance / index**: We’ll precompute a flattened array from `ASSET_CATEGORIES` once per mount via `useMemo`. Any concerns with that approach?

Nope.

- **persistence**: Keep overlay state out of the URL by default. Do you want us to integrate `nuqs` to reflect query text in the URL (e.g., `?q=`) for shareability, or keep it ephemeral?

Yes, you can implement Nuqs.

- **styling**: Follow the editor’s light theme (gray/white) with Tailwind classes and our Button styles. Any branding or specific sizing you want for the palette width and max height?

Nope.

- **edge cases**: If multiple assets share the same name across categories, is showing category chips in each result sufficient to disambiguate?

Yes.

- **future-proofing**: Should we reserve keyboard tokens (like `>` to filter by category, e.g., `>floors grass`), or keep v1 simple?

Keep v1 simple.
