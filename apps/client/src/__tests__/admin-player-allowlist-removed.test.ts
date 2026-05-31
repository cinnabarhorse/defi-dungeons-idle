import fs from 'node:fs';
import path from 'node:path';

const adminIndexPagePath = path.join(
  process.cwd(),
  'apps/client/src/app/admin/page.tsx'
);

const adminPlayersPagePath = path.join(
  process.cwd(),
  'apps/client/src/app/admin/players/page.tsx'
);

describe('admin allowlist ui cleanup', () => {
  it('does not render the removed /admin/allowlist link on the admin index', () => {
    const source = fs.readFileSync(adminIndexPagePath, 'utf8');

    expect(source).not.toContain('href="/admin/allowlist"');
    expect(source).not.toContain('Player Allowlist');
  });

  it('does not show quick links to /admin/allowlist on admin players page', () => {
    const source = fs.readFileSync(adminPlayersPagePath, 'utf8');

    expect(source).not.toContain('href="/admin/allowlist"');
    expect(source).not.toContain('/admin/allowlist');
  });
});
