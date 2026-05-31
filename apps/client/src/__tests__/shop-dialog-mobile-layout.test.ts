import fs from 'node:fs';
import path from 'node:path';

const shopDialogPath = path.join(
  process.cwd(),
  'apps/client/src/components/shop/shop-dialog.tsx'
);

function readShopDialogSource() {
  return fs.readFileSync(shopDialogPath, 'utf8');
}

describe('shop dialog mobile layout', () => {
  it('does not disable vertical scrolling for dialog content (iPhone regression)', () => {
    const source = readShopDialogSource();

    // The Shop dialog uses a shared DialogContent that provides a scrollable body
    // for small viewports. Overriding the body wrapper to `overflow-hidden` can
    // clip the Sell action buttons on mobile, blocking the selling flow.
    expect(source).not.toContain('[&>div:last-child]:overflow-hidden');
  });
});

