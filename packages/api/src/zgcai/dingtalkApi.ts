import axios from 'axios';
import { logger } from '@librechat/data-schemas';
import type { DeptNode } from './dingtalk';
import {
  getAppKey,
  getAppSecret,
  getOapiBase,
  getPruneHidden,
  getOrgRootDeptId,
  getOrgRootDeptName,
} from './config';

/** DingTalk Open API root department id (company root). */
const DINGTALK_ROOT_ID = 1;

interface FlatDept {
  id: number;
  name: string;
  parentid: number;
}

interface TokenResponse {
  errcode?: number;
  errmsg?: string;
  access_token?: string;
  expires_in?: number;
}

interface DeptListResponse {
  errcode?: number;
  errmsg?: string;
  department?: FlatDept[];
}

interface DeptGetResponse {
  errcode?: number;
  errmsg?: string;
  result?: { hide_dept?: boolean };
}

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 5 * 60 * 1000) {
    return tokenCache.token;
  }
  const appkey = getAppKey();
  const appsecret = getAppSecret();
  if (!appkey || !appsecret) {
    throw new Error('[zgcai/dingtalkApi] DINGTALK_APPKEY/DINGTALK_APPSECRET not configured');
  }
  const res = await axios.get<TokenResponse>(`${getOapiBase()}/gettoken`, {
    params: { appkey, appsecret },
    timeout: 20_000,
  });
  const data = res.data;
  if (data.errcode !== 0 || !data.access_token) {
    throw new Error(
      `[zgcai/dingtalkApi] gettoken failed: errcode=${data.errcode} errmsg=${data.errmsg}`,
    );
  }
  tokenCache = { token: data.access_token, expiresAt: now + (data.expires_in ?? 7200) * 1000 };
  return tokenCache.token;
}

async function fetchDeptListFlat(token: string): Promise<FlatDept[]> {
  const res = await axios.get<DeptListResponse>(`${getOapiBase()}/department/list`, {
    params: { access_token: token, fetch_child: true, id: DINGTALK_ROOT_ID },
    timeout: 30_000,
  });
  const data = res.data;
  if (data.errcode !== 0 || !Array.isArray(data.department)) {
    throw new Error(
      `[zgcai/dingtalkApi] department/list failed: errcode=${data.errcode} errmsg=${data.errmsg}`,
    );
  }
  return data.department;
}

async function fetchHideDept(token: string, deptId: number): Promise<boolean> {
  const res = await axios.post<DeptGetResponse>(
    `${getOapiBase()}/topapi/v2/department/get`,
    { dept_id: deptId },
    { params: { access_token: token }, timeout: 20_000 },
  );
  const data = res.data;
  if (data.errcode !== 0) {
    throw new Error(
      `[zgcai/dingtalkApi] department/get failed for ${deptId}: errcode=${data.errcode} errmsg=${data.errmsg}`,
    );
  }
  return Boolean(data.result?.hide_dept);
}

/**
 * Builds the org tree from the DingTalk Open API. One atomic `department/list` call yields the
 * full flat tree, so there is no partial-subtree-loss failure mode. Optionally prunes departments
 * whose own or ancestor `hide_dept` is true, matching the visibility of the MCP data source.
 */
export async function buildOrgTreeFromApi(): Promise<Map<number, DeptNode>> {
  const token = await getAccessToken();
  const flat = await fetchDeptListFlat(token);

  const byId = new Map<number, FlatDept>();
  for (const dept of flat) {
    byId.set(dept.id, dept);
  }

  const rootId = getOrgRootDeptId();
  const rootName = getOrgRootDeptName();

  const fullPathOf = (id: number): string => {
    const names: string[] = [];
    const seen = new Set<number>();
    let cur: number | undefined = id;
    while (cur != null && !seen.has(cur)) {
      const node = byId.get(cur);
      if (!node) {
        break;
      }
      seen.add(cur);
      names.push(node.name);
      cur = node.parentid;
    }
    names.push(rootName);
    return names.reverse().join(' > ');
  };

  const hidden = new Map<number, boolean>();
  if (getPruneHidden()) {
    for (const dept of flat) {
      hidden.set(dept.id, await fetchHideDept(token, dept.id));
    }
  }
  const isPruned = (id: number): boolean => {
    const seen = new Set<number>();
    let cur: number | undefined = id;
    while (cur != null && !seen.has(cur)) {
      const node = byId.get(cur);
      if (!node) {
        break;
      }
      seen.add(cur);
      if (hidden.get(cur)) {
        return true;
      }
      cur = node.parentid;
    }
    return false;
  };

  const out = new Map<number, DeptNode>();
  out.set(rootId, { deptId: rootId, deptName: rootName, parentId: null, fullPath: rootName });
  for (const dept of flat) {
    if (isPruned(dept.id)) {
      continue;
    }
    out.set(dept.id, {
      deptId: dept.id,
      deptName: dept.name,
      parentId: dept.parentid === DINGTALK_ROOT_ID ? rootId : dept.parentid,
      fullPath: fullPathOf(dept.id),
    });
  }

  logger.info(
    `[zgcai/dingtalkApi] Built org tree from Open API: ${flat.length} raw, ${out.size} nodes after prune`,
  );
  return out;
}
