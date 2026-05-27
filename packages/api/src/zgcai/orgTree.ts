import { logger } from '@librechat/data-schemas';
import { crawlDeptTree, DeptNode } from './dingtalk';
import { getOrgRootDeptId, getOrgRootDeptName, getOrgTreeRefreshIntervalMs, getMcpUrl } from './config';

interface OrgTreeState {
  tree: Map<number, DeptNode>;
  refreshedAt: number;
}

let state: OrgTreeState | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let inFlightRefresh: Promise<OrgTreeState | null> | null = null;

async function refresh(): Promise<OrgTreeState | null> {
  if (!getMcpUrl()) {
    logger.warn('[zgcai/orgTree] DINGTALK_MCP_URL not configured — skipping refresh');
    return state;
  }

  try {
    const tree = await crawlDeptTree(getOrgRootDeptId(), getOrgRootDeptName());
    if (tree.size <= 1) {
      logger.warn('[zgcai/orgTree] Crawled tree is empty or only root — keeping previous state');
      return state;
    }
    state = { tree, refreshedAt: Date.now() };
    logger.info(`[zgcai/orgTree] Refreshed: ${tree.size} departments`);
    return state;
  } catch (err) {
    logger.error(`[zgcai/orgTree] Refresh failed: ${(err as Error).message}`);
    return state;
  }
}

export async function ensureOrgTree(): Promise<Map<number, DeptNode> | null> {
  if (state) {
    return state.tree;
  }
  if (!inFlightRefresh) {
    inFlightRefresh = refresh();
  }
  const result = await inFlightRefresh;
  inFlightRefresh = null;
  return result?.tree ?? null;
}

export function getCachedOrgTree(): Map<number, DeptNode> | null {
  return state?.tree ?? null;
}

export function resolveDeptPath(deptId: number): { deptName: string; fullPath: string } | null {
  const tree = state?.tree;
  if (!tree) {
    return null;
  }
  const node = tree.get(deptId);
  if (!node) {
    return null;
  }
  return { deptName: node.deptName, fullPath: node.fullPath };
}

export function startOrgTreeRefreshLoop(): void {
  if (refreshTimer) {
    return;
  }
  const intervalMs = getOrgTreeRefreshIntervalMs();
  refreshTimer = setInterval(() => {
    refresh().catch((err) => logger.error('[zgcai/orgTree] timer error', err));
  }, intervalMs);
  if (typeof refreshTimer.unref === 'function') {
    refreshTimer.unref();
  }
}

export function stopOrgTreeRefreshLoop(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
