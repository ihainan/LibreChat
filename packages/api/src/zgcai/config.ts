export function getMcpUrl(): string | undefined {
  return process.env.DINGTALK_MCP_URL || undefined;
}

export function getMcpTimeoutMs(): number {
  return Number(process.env.DINGTALK_MCP_TIMEOUT_MS) || 60_000;
}

export function getOrgRootDeptId(): number {
  return Number(process.env.ZGCAI_ROOT_DEPT_ID ?? -1);
}

export function getOrgRootDeptName(): string {
  return process.env.ZGCAI_ROOT_DEPT_NAME || '中关村两院';
}

export function getOrgTreeRefreshIntervalMs(): number {
  return Number(process.env.ORG_TREE_REFRESH_INTERVAL_MS) || 30 * 60 * 1000;
}

export function getUserDeptRefreshIntervalMs(): number {
  return Number(process.env.USER_DEPT_REFRESH_INTERVAL_MS) || 24 * 60 * 60 * 1000;
}

export function getUserDeptStaleMs(): number {
  return Number(process.env.USER_DEPT_STALE_MS) || 24 * 60 * 60 * 1000;
}

export const MCP_TOOLS = {
  subDeptsByDeptId:
    process.env.DINGTALK_MCP_TOOL_GET_SUB_DEPTS || 'get_sub_depts_by_dept_id',
  userInfoByUserIds:
    process.env.DINGTALK_MCP_TOOL_GET_USER_INFO || 'get_user_info_by_user_ids',
  searchUserByKeyword:
    process.env.DINGTALK_MCP_TOOL_SEARCH_USER || 'search_user_by_key_word',
} as const;
