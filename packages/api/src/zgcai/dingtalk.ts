import axios from 'axios';
import { logger } from '@librechat/data-schemas';
import { getMcpTimeoutMs, getMcpUrl, MCP_TOOLS } from './config';

export interface DeptNode {
  deptId: number;
  deptName: string;
  parentId: number | null;
  fullPath: string;
}

export interface MemberDept {
  deptId: number;
  deptName: string;
}

export interface UserInfo {
  userId: string;
  name: string;
  depts: MemberDept[];
}

class MissingMcpUrlError extends Error {
  constructor() {
    super('DINGTALK_MCP_URL is not configured');
    this.name = 'MissingMcpUrlError';
  }
}

async function callTool<T = unknown>(toolName: string, args: Record<string, unknown>): Promise<T> {
  const url = getMcpUrl();
  if (!url) {
    throw new MissingMcpUrlError();
  }

  const payload = {
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: toolName, arguments: args },
    id: 1,
  };

  const res = await axios.post(url, payload, {
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    timeout: getMcpTimeoutMs(),
    responseType: 'text',
    transformResponse: (body: string) => body,
  });

  return extractResult<T>(res.data, res.headers?.['content-type'] ?? '');
}

function extractResult<T>(body: string, contentType: string): T {
  let result: unknown = null;

  if (contentType.includes('text/event-stream')) {
    for (const line of body.split('\n')) {
      if (!line.startsWith('data:')) {
        continue;
      }
      const chunk = JSON.parse(line.slice(5).trim());
      if (chunk?.result != null) {
        result = chunk.result;
        break;
      }
    }
  } else {
    const parsed = JSON.parse(body);
    if (parsed?.error) {
      throw new Error(`MCP error: ${JSON.stringify(parsed.error)}`);
    }
    result = parsed?.result ?? {};
  }

  if (result && typeof result === 'object') {
    const obj = result as {
      content?: Array<{ type?: string; text?: string }>;
      structuredContent?: unknown;
    };
    if (obj.structuredContent !== undefined) {
      assertNotFalseSuccess(obj.structuredContent);
      return obj.structuredContent as T;
    }
    if (obj.content?.[0]?.type === 'text' && obj.content[0].text != null) {
      const parsed = JSON.parse(obj.content[0].text) as unknown;
      assertNotFalseSuccess(parsed);
      return parsed as T;
    }
  }

  return result as T;
}

/**
 * The MCP gateway can return a "false success" (HTTP 200, no JSON-RPC error, isError:false) with the
 * real failure hidden as `{"success": false, ...}` in the tool payload. Treat it as an error so it
 * propagates instead of being silently read as an empty result (which drops entire dept subtrees).
 */
function assertNotFalseSuccess(payload: unknown): void {
  if (
    payload &&
    typeof payload === 'object' &&
    (payload as { success?: boolean }).success === false
  ) {
    throw new Error(`MCP tool false-success: ${JSON.stringify(payload)}`);
  }
}

interface SubDeptResponse {
  success?: boolean;
  result?: Array<{
    deptId?: number | string;
    dept_id?: number | string;
    deptName?: string;
    dept_name?: string;
  }>;
  list?: Array<{
    deptId?: number | string;
    dept_id?: number | string;
    deptName?: string;
    dept_name?: string;
  }>;
}

function parseSubDepts(raw: unknown): Array<{ deptId: number; deptName: string }> {
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  const r = raw as SubDeptResponse;
  const items = r.result ?? r.list ?? [];
  if (!Array.isArray(items)) {
    return [];
  }
  const out: Array<{ deptId: number; deptName: string }> = [];
  for (const item of items) {
    const idRaw = item.deptId ?? item.dept_id;
    if (idRaw == null) {
      continue;
    }
    out.push({
      deptId: Number(idRaw),
      deptName: String(item.deptName ?? item.dept_name ?? ''),
    });
  }
  return out;
}

export async function getSubDepts(
  deptId: number,
): Promise<Array<{ deptId: number; deptName: string }>> {
  const raw = await callTool(MCP_TOOLS.subDeptsByDeptId, { deptId });
  return parseSubDepts(raw);
}

interface SearchUserResponse {
  userId?: string[];
}

export async function searchUserIdsByKeyword(keyword: string): Promise<string[]> {
  const trimmed = (keyword ?? '').trim();
  if (!trimmed) {
    return [];
  }
  try {
    const raw = (await callTool(MCP_TOOLS.searchUserByKeyword, {
      keyWord: trimmed,
    })) as SearchUserResponse;
    const ids = raw?.userId;
    if (!Array.isArray(ids)) {
      return [];
    }
    return ids.map((v) => String(v)).filter((v) => v.length > 0);
  } catch (err) {
    logger.warn(
      `[zgcai/dingtalk] searchUserIdsByKeyword failed for "${trimmed}": ${(err as Error).message}`,
    );
    return [];
  }
}

interface UserInfoResponse {
  success?: boolean;
  result?: Array<{
    orgEmployeeModel?: {
      orgUserId?: string | number;
      userId?: string | number;
      orgUserName?: string;
      name?: string;
      depts?: Array<{ deptId?: number | string; deptName?: string }>;
    };
  }>;
}

function parseUserInfoList(raw: unknown): UserInfo[] {
  if (!raw || typeof raw !== 'object') {
    return [];
  }
  const items = (raw as UserInfoResponse).result;
  if (!Array.isArray(items)) {
    return [];
  }
  const out: UserInfo[] = [];
  for (const item of items) {
    const m = item?.orgEmployeeModel;
    if (!m) {
      continue;
    }
    const userId = m.orgUserId ?? m.userId;
    if (userId == null) {
      continue;
    }
    const depts: MemberDept[] = Array.isArray(m.depts)
      ? m.depts
          .map((d) => ({
            deptId: Number(d?.deptId ?? NaN),
            deptName: String(d?.deptName ?? ''),
          }))
          .filter((d) => Number.isFinite(d.deptId))
      : [];
    out.push({
      userId: String(userId),
      name: String(m.orgUserName ?? m.name ?? ''),
      depts,
    });
  }
  return out;
}

export async function getUserInfoByUserIds(userIds: string[]): Promise<UserInfo[]> {
  if (userIds.length === 0) {
    return [];
  }
  try {
    const raw = await callTool(MCP_TOOLS.userInfoByUserIds, { user_id_list: userIds });
    return parseUserInfoList(raw);
  } catch (err) {
    logger.warn(`[zgcai/dingtalk] getUserInfoByUserIds failed: ${(err as Error).message}`);
    return [];
  }
}

export async function findUserWithDepts(name: string): Promise<UserInfo | null> {
  const candidates = await searchUserIdsByKeyword(name);
  if (candidates.length === 0) {
    return null;
  }
  const infos = await getUserInfoByUserIds(candidates);
  if (infos.length === 0) {
    return null;
  }
  const trimmedName = name.trim();
  const exact = infos.find((u) => u.name === trimmedName);
  if (exact) {
    if (infos.length > 1) {
      logger.warn(
        `[zgcai/dingtalk] Multiple users matched "${trimmedName}" — picking exact-name match (userId=${exact.userId})`,
      );
    }
    return exact;
  }
  if (infos.length > 1) {
    logger.warn(
      `[zgcai/dingtalk] Ambiguous match for "${trimmedName}" — ${infos.length} candidates, no exact-name; picking first (userId=${infos[0].userId})`,
    );
  }
  return infos[0];
}

export async function crawlDeptTree(
  rootDeptId: number,
  rootDeptName: string,
): Promise<Map<number, DeptNode>> {
  const visited = new Set<number>();
  const out = new Map<number, DeptNode>();
  out.set(rootDeptId, {
    deptId: rootDeptId,
    deptName: rootDeptName,
    parentId: null,
    fullPath: rootDeptName,
  });
  await traverse(rootDeptId, rootDeptName, visited, out);
  return out;
}

async function traverse(
  deptId: number,
  parentPath: string,
  visited: Set<number>,
  out: Map<number, DeptNode>,
): Promise<void> {
  if (visited.has(deptId)) {
    return;
  }
  visited.add(deptId);

  let subs: Array<{ deptId: number; deptName: string }> = [];
  try {
    subs = await getSubDepts(deptId);
  } catch (err) {
    // Abort the whole crawl rather than silently drop this dept's subtree; the caller keeps the
    // previous good tree, so a transient failure never produces a partially-populated org tree.
    logger.error(`[zgcai/dingtalk] getSubDepts failed for ${deptId}: ${(err as Error).message}`);
    throw err;
  }

  for (const child of subs) {
    const childPath = parentPath ? `${parentPath} > ${child.deptName}` : child.deptName;
    out.set(child.deptId, {
      deptId: child.deptId,
      deptName: child.deptName,
      parentId: deptId,
      fullPath: childPath,
    });
    await traverse(child.deptId, childPath, visited, out);
  }
}

export { MissingMcpUrlError };
