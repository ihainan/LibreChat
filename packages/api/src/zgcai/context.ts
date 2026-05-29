import type { UserDepartment } from './userDept';

const USER_BLOCK_HEADER = '[用户上下文]';
const TRIAGE_BLOCK_HEADER = '[内部工具分诊：search_knowledge vs kg_*]';
const TOOL_BLOCK_HEADER = '[内部知识库 search_knowledge 工具使用规则]';
const KG_BLOCK_HEADER = '[内部知识图谱 kg_* 工具使用规则]';

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
    '2. `kg_*` 系列：中关村两院**结构化知识图谱**查询。覆盖：人物、机构、项目、文章等实体，及它们之间的关系（任职、研究方向、荣誉、所属、合作等）。',
    '',
    '选择规则（按问题形态判断）：',
    '- **谁 / 在哪 / 任什么职 / 研究什么 / 列出某类实体 / 谁在 X 工作** → 优先 `kg_*`，结构化命中率远高于文档检索。',
    '- **如何 / 为什么 / 流程是什么 / 规章怎么写 / 培养理念** → 优先 `search_knowledge`，文档原文才是事实来源。',
    '- **混合型问题**（例如 "刘铁岩老师的项目背景"）：先用 `kg_find_entity` 或 `kg_search_entity_by_name` 拿到实体正名，再用该正名作为 query 调 `search_knowledge` 取文档原文。',
    '',
    '通用约束：拿不准是否要查时，倾向于调用工具而非凭通用知识作答；纯闲聊或与本机构无关的通用知识无需调用。',
  ].join('\n');
}

function buildKnowledgeGraphToolBlock(): string {
  return [
    KG_BLOCK_HEADER,
    '知识图谱以 `[subject, predicate, object]` 三元组为核心，实体类别包括 `faculty / student / school / organization / project / article` 等；常见谓词包括 `workFor / workAt / researches / hasHonor / servesAs / leads / memberOf` 等。',
    '',
    '工具选择：',
    '- `kg_find_entity(name, category?)` — 已知完整正名，精确取实体条目（含简介、职位、所属等）。',
    '- `kg_search_entity_by_name(partial, category?)` — 只知道部分名字（姓氏 / 简称 / 关键词）。',
    '- `kg_find_relations(name, direction?, predicate?)` — 查询某实体的所有关系。**默认 direction=both**（双向），数据集里机构常作为 object 出现，**不要改成 out**，否则会漏召回。',
    '- `kg_find_triples(subject?, predicate?, object?)` — 已知关系模式按需组合：例如「谁在 X 工作」用 `predicate="workFor", object="X"`。',
    '- `kg_list_predicates_for(name)` — 不确定能问什么时，先列出该实体上出现过的所有谓词。',
    '- `kg_list_by_category(category, tag?)` — 枚举某类实体，可选 tag 进一步过滤（如 `tag="中关村学院"`）。',
    '',
    '调用约定：',
    '- 实体名传**完整正名**（如「刘铁岩」「北京中关村学院」），不要带 `$` 前缀。',
    '- 工具内部已经处理 JSE 表达式、双向 `$or` 查询、`$name-like` 等细节，**不要尝试自己构造 $meta / $triple / $or 等 JSE 指令**。',
    '- `kg_*` 工具**不**接受 `user_name` 或 `dept_id` 参数（与 search_knowledge 区分），即使你看到了用户上下文也不要传。',
    '',
    '常见追问的串联范式：',
    '- "X 是谁" → `kg_find_entity(name="X")` 取条目正名和 content.data 简介。',
    '- "X 任职于哪里 / 研究什么 / 有哪些荣誉" → `kg_find_relations(name="X")` 双向。',
    '- "X 机构有哪些员工" → `kg_find_triples(predicate="workFor", object="X")`。',
    '- 同名歧义：当 `kg_find_entity` 返回多个同名条目时，结合返回里的 `category`、`tags`、`content` 字段做语义消歧；必要时取其中某条的 `key`，在后续 `kg_find_relations` / `kg_find_triples` 调用中用 `"$" + key` 作为实体引用以精确锁定。',
  ].join('\n');
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
