import fs from 'node:fs';
import path from 'node:path';

const adminStatsClientPath = path.join(
  process.cwd(),
  'apps/client/src/app/admin/stats/admin-stats-client.tsx'
);

function readAdminStatsClientSource() {
  return fs.readFileSync(adminStatsClientPath, 'utf8');
}

describe('admin stats shop spend layout', () => {
  it('renders only the two daily shop spend charts', () => {
    const source = readAdminStatsClientSource();

    expect(source).toContain('title="Gold spent per item per day"');
    expect(source).toContain('title="Shop items purchased per day"');
    expect(source).not.toContain('title="Gold spent per day"');
  });
});
