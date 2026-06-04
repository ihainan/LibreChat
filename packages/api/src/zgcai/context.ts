import type { UserDepartment } from './userDept';

const USER_BLOCK_HEADER = '[用户上下文]';
const TRIAGE_BLOCK_HEADER = '[内部工具分诊：search_knowledge vs ask_knowledge_graph]';
const TOOL_BLOCK_HEADER = '[内部知识库 search_knowledge 工具使用规则]';
const KG_BLOCK_HEADER = '[内部知识图谱 ask_knowledge_graph 工具使用规则]';

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

  const sections: string[] = [userBlock];
  if (rendered.count > 0) {
    sections.push(buildTriageBlock());
    sections.push(buildKnowledgeToolBlock(rendered.count));
  }
  sections.push(buildKnowledgeGraphToolBlock());
  return sections.join('\n\n');
}

function buildTriageBlock(): string {
  return [
    TRIAGE_BLOCK_HEADER,
    '本系统挂载了两个内部数据源工具，能力正交，**不要混用**：',
    '',
    '1. `search_knowledge`：基于用户部门权限的内部**文档**全文搜索。语料是 markdown 长文，覆盖：规章制度、流程规范、培养理念、活动通知、组织职责的叙述性内容。',
    '2. `ask_knowledge_graph`：中关村两院**结构化知识图谱**问答。覆盖：人物、机构、项目、文章等实体，及它们之间的关系（任职、研究方向、荣誉、所属、合作、师承等）。',
    '',
    '选择规则（按问题形态判断）：',
    '- **谁 / 在哪 / 任什么职 / 研究什么 / 列出某类实体 / 谁在 X 工作 / 多跳关系推理** → 优先 `ask_knowledge_graph`，结构化命中率远高于文档检索。',
    '- **如何 / 为什么 / 流程是什么 / 规章怎么写 / 培养理念** → 优先 `search_knowledge`，文档原文才是事实来源。',
    '- **混合型问题**（例如 "刘铁岩老师的项目背景"）：先用 `ask_knowledge_graph` 拿到实体正名与结构化事实，再用该正名作为 query 调 `search_knowledge` 取文档原文。',
    '',
    '通用约束：拿不准是否要查时，倾向于调用工具而非凭通用知识作答；纯闲聊或与本机构无关的通用知识无需调用。',
  ].join('\n');
}

function buildKnowledgeGraphToolBlock(): string {
  return [
    KG_BLOCK_HEADER,
    '`ask_knowledge_graph(question)` 是中关村两院结构化知识图谱的**高层问答接口**：你只需把一个完整的自然语言问题传给它，它内部会自动完成多步图谱检索、实体消歧和关系推理，返回综合后的中文答案。',
    '',
    '调用约定：',
    '- 传入**一个完整、自包含的问题**（可包含多个约束或多跳关系），不要把问题拆成多次零碎调用。例如直接问「哪些研究员与香港科技大学有校友或合作关系」，而不是先查机构再逐个查人。',
    '- 该工具**不**接受 `user_name` / `dept_id` 等参数（与 search_knowledge 区分），即使你看到了用户上下文也不要传。',
    '- 图谱内部的底层查询、谓词选择、双向关系、同名消歧等细节由该工具自行处理，你**不需要**了解或构造任何图谱查询语法。',
    '- 一次调用通常已足够；除非要问的是**另一个不相关的问题**，否则不要对同一问题反复调用。',
    '',
    '当它返回「知识图谱中未收录该信息」时，如实转达，必要时再用 `search_knowledge` 从文档侧补充。',
  ].join('\n');
}

function buildKnowledgeToolBlock(deptCount: number): string {
  const multiDeptGuidance =
    deptCount > 1
      ? '- 用户属于多个部门时：把上方列出的**所有**部门 ID 放进一个数组，**一次性**传给 dept_id（如 [123, 456]），单次调用即可，**不要**对每个部门分别调用。'
      : '- 调用时直接使用上方"所在部门"中给出的部门 ID。';

  const deptIdParamDesc =
    deptCount > 1
      ? '- dept_id：上方"所在部门"中的"部门 ID"。用户有多个部门时传入包含全部 ID 的数组（如 [123, 456]）。'
      : '- dept_id：上方"所在部门"中的"部门 ID"（数字，也可传单元素数组）。';

  return [
    TOOL_BLOCK_HEADER,
    '当用户问题涉及机构内部事项（规章制度、流程规范、项目进展、部门职责、人员职责、内部资源、活动通知、组织架构等）时，**优先调用** search_knowledge 工具再回答。',
    '',
    '调用参数：',
    '- user_name：上方"姓名"字段的值',
    deptIdParamDesc,
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
