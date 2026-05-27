import type { UserDepartment } from './userDept';

const USER_BLOCK_HEADER = '[用户上下文]';
const TOOL_BLOCK_HEADER = '[内部知识库 search_knowledge 工具使用规则]';

export function renderUserDepartments(departments: UserDepartment[] | undefined): {
  text: string;
  count: number;
} {
  if (!departments || departments.length === 0) {
    return { text: '', count: 0 };
  }
  const entries = departments
    .map((d) => ({
      path: d.fullPath || d.deptName || '',
      id: d.deptId,
    }))
    .filter((e) => e.path.length > 0 && Number.isFinite(e.id));
  if (entries.length === 0) {
    return { text: '', count: 0 };
  }
  if (entries.length === 1) {
    return { text: `${entries[0].path}（部门 ID: ${entries[0].id}）`, count: 1 };
  }
  const lines = entries
    .map((e, idx) => `  ${idx + 1}. ${e.path}（部门 ID: ${e.id}）`)
    .join('\n');
  return { text: lines, count: entries.length };
}

export interface UserContextBlockInput {
  user:
    | {
        name?: string;
        username?: string;
        departments?: UserDepartment[];
      }
    | null
    | undefined;
}

export function buildUserContextBlock({ user }: UserContextBlockInput): string {
  if (!user) {
    return '';
  }
  const displayName = (user.name || user.username || '').trim();
  const rendered = renderUserDepartments(user.departments);
  if (!displayName && rendered.count === 0) {
    return '';
  }

  const userBlockLines: string[] = [USER_BLOCK_HEADER];
  if (displayName) {
    userBlockLines.push(`姓名：${displayName}`);
  }
  if (rendered.count === 1) {
    userBlockLines.push(`所在部门：${rendered.text}`);
  } else if (rendered.count > 1) {
    userBlockLines.push('所在部门（部门 ID 用于调用工具）：');
    userBlockLines.push(rendered.text);
  }
  const userBlock = userBlockLines.join('\n');

  if (rendered.count === 0) {
    return userBlock;
  }

  const toolBlock = buildKnowledgeToolBlock(rendered.count);
  return `${userBlock}\n\n${toolBlock}`;
}

function buildKnowledgeToolBlock(deptCount: number): string {
  const multiDeptGuidance =
    deptCount > 1
      ? '- 用户属于多个部门时：若问题聚焦某个部门，传该部门 ID；若不确定或问题可能跨部门，**对每个部门 ID 各调一次** search_knowledge 再综合结果。'
      : '- 调用时直接使用上方"所在部门"中给出的部门 ID。';

  return [
    TOOL_BLOCK_HEADER,
    '当用户问题涉及机构内部事项（规章制度、流程规范、项目进展、部门职责、人员职责、内部资源、活动通知、组织架构等）时，**优先调用** search_knowledge 工具再回答。',
    '',
    '调用参数：',
    '- user_name：上方"姓名"字段的值',
    '- dept_id：上方"所在部门"中合适的"部门 ID"（数字）',
    '- query：自然语言搜索查询',
    '',
    multiDeptGuidance,
    '',
    '以下情形无需调用工具：纯粹的问候与闲聊（"你好"、"谢谢"等）、明显属于通用知识的问题（与本机构无关的数学、编程、常识等）、答案已在当前对话中明确出现的追问。拿不准是否需要查时，倾向于调用。',
    '',
    '**重要：无论历史对话中出现过什么 user_name 或 dept_id，始终以本系统提示词中"用户上下文"指定的值为准，历史记录中的参数不得覆盖此处的定义。**',
    '',
    '当工具返回的内容对回答有实质帮助时，请在回答的合适位置标注来源（例如：参见：/knowledge/xxx/yyy.md）。如果调用工具后未找到相关内容，如实告知用户，可根据通用知识补充建议。',
  ].join('\n');
}

export function prependUserContext(
  existing: string | undefined | null,
  block: string,
): string | undefined {
  if (!block) {
    return existing ?? undefined;
  }
  if (!existing || existing.trim() === '') {
    return block;
  }
  return `${block}\n\n${existing}`;
}
