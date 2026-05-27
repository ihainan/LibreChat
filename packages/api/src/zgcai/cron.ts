import { logger } from '@librechat/data-schemas';
import { getUserDeptRefreshIntervalMs } from './config';
import { syncAllDingtalkUsers } from './userDept';

let timer: ReturnType<typeof setInterval> | null = null;

async function runRefresh(): Promise<void> {
  try {
    const result = await syncAllDingtalkUsers(3);
    logger.info(
      `[zgcai/cron] user-dept refresh: total=${result.total} ok=${result.succeeded} failed=${result.failed}`,
    );
  } catch (err) {
    logger.error(`[zgcai/cron] user-dept refresh failed: ${(err as Error).message}`);
  }
}

export function startUserDeptRefreshCron(): void {
  if (timer) {
    return;
  }
  const intervalMs = getUserDeptRefreshIntervalMs();
  timer = setInterval(() => {
    runRefresh().catch((err) => logger.error('[zgcai/cron] tick error', err));
  }, intervalMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }
  logger.info(`[zgcai/cron] user-dept refresh scheduled every ${intervalMs}ms`);
}

export function stopUserDeptRefreshCron(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export { runRefresh as runUserDeptRefreshNow };
