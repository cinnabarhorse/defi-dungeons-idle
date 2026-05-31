import fs from 'node:fs';
import path from 'node:path';

const inventoryClientPath = path.join(
  process.cwd(),
  process.cwd().endsWith(path.join('apps', 'client'))
    ? 'src/app/me/inventory/inventory-client.tsx'
    : 'apps/client/src/app/me/inventory/inventory-client.tsx'
);

function readInventoryClientSource() {
  return fs.readFileSync(inventoryClientPath, 'utf8');
}

describe('inventory equipment layout', () => {
  it('uses the original centered 4-up card layout', () => {
    const source = readInventoryClientSource();

    expect(source).toContain('grid grid-cols-2 items-start gap-4 lg:grid-cols-4');
    expect(source).toContain('mt-1 flex flex-col items-center gap-2 rounded-md p-2');
    expect(source).toContain(
      'mt-0.5 grid min-h-[2rem] w-full content-start text-xs leading-tight text-center text-white/60'
    );
    expect(source).not.toContain(": 'Choose'");
    expect(source).not.toContain(": 'Change'");
    expect(source).not.toContain('columns-1 gap-3 xl:columns-2');
    expect(source).not.toContain('break-inside-avoid');
    expect(source).not.toContain('border-t border-white/10 pt-3');
  });

  it('keeps the repair-all controls between the stats and equipment cards', () => {
    const source = readInventoryClientSource();

    const statsIndex = source.indexOf(
      'my-6 grid grid-cols-2 lg:grid-cols-4 gap-2 text-sm text-white/70'
    );
    const repairAllIndex = source.indexOf('Repair All');
    const equipmentCardsIndex = source.indexOf(
      '{equipment ? (\n        <div className="grid grid-cols-2 items-start gap-4 lg:grid-cols-4">'
    );

    expect(repairAllIndex).toBeGreaterThan(-1);
    expect(statsIndex).toBeGreaterThan(-1);
    expect(repairAllIndex).toBeGreaterThan(statsIndex);
    expect(equipmentCardsIndex).toBeGreaterThan(statsIndex);
    expect(equipmentCardsIndex).toBeGreaterThan(repairAllIndex);
  });

  it('uses icon-based repair and unequip actions on the same row', () => {
    const source = readInventoryClientSource();

    expect(source).toContain("from 'lucide-react'");
    expect(source).toContain('Wrench');
    expect(source).toContain('aria-label="Unequip"');
    expect(source).toContain('<X className="h-4 w-4" />');
    expect(source).toContain('mt-0.5 flex flex-col gap-2');
    expect(source).toContain('flex items-center gap-2');
    expect(source).not.toContain(">Unequip<");
  });

  it('shows one trait row plus a fixed secondary row for +x more or empty space', () => {
    const source = readInventoryClientSource();

    expect(source).toContain('getEquipmentCardSummaryLayout(summaryToShow)');
    expect(source).toContain('min-h-[2rem]');
    expect(source).toContain('invisible');
    expect(source).not.toContain('summaryParts.map((part, i) =>');
  });

  it('keeps keyboard access to open the slot picker after removing the explicit button', () => {
    const source = readInventoryClientSource();

    expect(source).toContain('role="button"');
    expect(source).toContain('tabIndex={0}');
    expect(source).toContain('onKeyDown={(event) =>');
    expect(source).toContain("event.key === 'Enter' || event.key === ' '");
    expect(source).toContain('event.preventDefault()');
    expect(source).toContain('openSlotPicker()');
  });
  it('labels grenade hand-weapon damage distinctly in the summary', () => {
    const source = readInventoryClientSource();

    expect(source).toContain('GREN DMG');
  });
});
