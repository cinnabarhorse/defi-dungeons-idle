import cron from 'node-cron';
import { captureDailyGotchiSnapshot } from './capture-daily-gotchi-snapshot';

const DEFAULT_DAILY_GOTCHI_SNAPSHOT_CRON = '0 0 * * *';

function getDailyGotchiSnapshotCronExpression() {
  const configured = process.env.DAILY_GOTCHI_SNAPSHOT_CRON?.trim();
  return configured || DEFAULT_DAILY_GOTCHI_SNAPSHOT_CRON;
}

export function startDailyGotchiSnapshotCron() {
  const expression = getDailyGotchiSnapshotCronExpression();

  console.info('[Cron] Registering daily gotchi snapshot scheduler', {
    expression,
    timezone: 'UTC',
  });

  return cron.schedule(
    expression,
    async () => {
      try {
        const result = await captureDailyGotchiSnapshot();
        console.info('[Cron] Daily gotchi snapshot scheduler completed', {
          date: result.date,
          blockNumber: result.blockNumber,
          baseHeadBlock: result.baseHeadBlock,
          subgraphHeadBlock: result.subgraphHeadBlock,
        });
      } catch (error) {
        console.error('[Cron] Daily gotchi snapshot scheduler failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    },
    {
      timezone: 'UTC',
      noOverlap: true,
    }
  );
}
