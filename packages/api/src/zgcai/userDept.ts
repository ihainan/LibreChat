import mongoose from 'mongoose';
import { logger } from '@librechat/data-schemas';
import type { IUser } from '@librechat/data-schemas';
import { findUserWithDepts, getUserInfoByUserIds, UserInfo } from './dingtalk';
import { ensureOrgTree, resolveDeptPath } from './orgTree';
import { getMcpUrl, getUserDeptStaleMs } from './config';

export interface UserDepartment {
  deptId: number;
  deptName: string;
  fullPath: string;
}

interface SyncTarget {
  _id: mongoose.Types.ObjectId | string;
  name?: string;
  dingtalkId?: string;
  dingtalkUserId?: string;
  departmentsSyncedAt?: Date;
  departments?: UserDepartment[];
}

const inFlight = new Map<string, Promise<UserDepartment[] | null>>();

function buildDepartments(depts: Array<{ deptId: number; deptName: string }>): UserDepartment[] {
  const seen = new Set<number>();
  const out: UserDepartment[] = [];
  for (const d of depts) {
    if (seen.has(d.deptId)) {
      continue;
    }
    seen.add(d.deptId);
    const resolved = resolveDeptPath(d.deptId);
    out.push({
      deptId: d.deptId,
      deptName: resolved?.deptName || d.deptName,
      fullPath: resolved?.fullPath || d.deptName,
    });
  }
  return out;
}

async function lookupUserInfo(target: SyncTarget): Promise<UserInfo | null> {
  if (target.dingtalkUserId) {
    const infos = await getUserInfoByUserIds([target.dingtalkUserId]);
    if (infos.length > 0) {
      return infos[0];
    }
    logger.warn(
      `[zgcai/userDept] Cached dingtalkUserId ${target.dingtalkUserId} returned no info — falling back to name search`,
    );
  }
  const name = (target.name ?? '').trim();
  if (!name) {
    return null;
  }
  return findUserWithDepts(name);
}

async function persistDepartments(
  userId: mongoose.Types.ObjectId | string,
  dingtalkUserId: string,
  departments: UserDepartment[],
): Promise<void> {
  const User = mongoose.models.User as mongoose.Model<IUser> | undefined;
  if (!User) {
    logger.error('[zgcai/userDept] User model not registered');
    return;
  }
  await User.findByIdAndUpdate(userId, {
    $set: {
      dingtalkUserId,
      departments,
      departmentsSyncedAt: new Date(),
    },
  }).lean();
}

async function doSync(target: SyncTarget): Promise<UserDepartment[] | null> {
  if (!getMcpUrl()) {
    return null;
  }
  if (!target.name && !target.dingtalkUserId) {
    return null;
  }

  await ensureOrgTree();
  const info = await lookupUserInfo(target);
  if (!info) {
    logger.warn(
      `[zgcai/userDept] Could not find DingTalk user info for ${target._id} (name=${target.name ?? ''})`,
    );
    return null;
  }

  const departments = buildDepartments(info.depts);
  await persistDepartments(target._id, info.userId, departments);
  logger.info(
    `[zgcai/userDept] Synced ${departments.length} departments for user ${target._id} (userId=${info.userId})`,
  );
  return departments;
}

export async function syncUserDepartments(
  target: SyncTarget,
): Promise<UserDepartment[] | null> {
  const key = String(target._id);
  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }
  const promise = doSync(target).finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

export function isUserDeptStale(target: SyncTarget): boolean {
  if (!target.departmentsSyncedAt) {
    return true;
  }
  const ageMs = Date.now() - new Date(target.departmentsSyncedAt).getTime();
  return ageMs > getUserDeptStaleMs();
}

export function triggerBackgroundSyncIfStale(target: SyncTarget): void {
  if (!target.name && !target.dingtalkUserId) {
    return;
  }
  if (!isUserDeptStale(target) && target.departments && target.departments.length > 0) {
    return;
  }
  syncUserDepartments(target).catch((err) =>
    logger.error(`[zgcai/userDept] background sync failed: ${(err as Error).message}`),
  );
}

export interface BatchSyncResult {
  total: number;
  succeeded: number;
  failed: number;
}

export async function syncAllDingtalkUsers(concurrency = 3): Promise<BatchSyncResult> {
  const User = mongoose.models.User as mongoose.Model<IUser> | undefined;
  if (!User) {
    logger.error('[zgcai/userDept] User model not registered');
    return { total: 0, succeeded: 0, failed: 0 };
  }

  const users = await User.find({ dingtalkId: { $exists: true, $ne: null } })
    .select({ _id: 1, name: 1, dingtalkId: 1, dingtalkUserId: 1, departmentsSyncedAt: 1 })
    .lean();

  let succeeded = 0;
  let failed = 0;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= users.length) {
        return;
      }
      const u = users[idx] as unknown as SyncTarget;
      try {
        const result = await syncUserDepartments(u);
        if (result) {
          succeeded++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
        logger.error(`[zgcai/userDept] batch sync failed for ${u._id}: ${(err as Error).message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => worker()));
  return { total: users.length, succeeded, failed };
}
