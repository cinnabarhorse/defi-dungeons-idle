import fs from 'node:fs';
import path from 'node:path';

const inventoryPagePath = path.join(
  process.cwd(),
  'apps/client/src/app/me/inventory/page.tsx'
);

function readInventoryPageSource() {
  return fs.readFileSync(inventoryPagePath, 'utf8');
}

describe('inventory back navigation', () => {
  it('does not hardcode the back link to /me', () => {
    const source = readInventoryPageSource();

    // Back should follow browser history (previous page) instead of always
    // returning to the profile page.
    expect(source).toContain('InventoryBackButton');
    expect(source).not.toContain('href="/me"');
  });
});

