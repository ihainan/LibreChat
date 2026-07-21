import { logger } from '@librechat/data-schemas';
import type { AppConfig } from '@librechat/data-schemas';
import {
  Tools,
  Constants,
  isAgentsEndpoint,
  isEphemeralAgentId,
  encodeEphemeralAgentId,
} from 'librechat-data-provider';
import type {
  AgentModelParameters,
  TEphemeralAgent,
  TModelSpec,
  Agent,
} from 'librechat-data-provider';
import { getCustomEndpointConfig } from '~/app/config';

const { mcp_all, mcp_delimiter } = Constants;

function parseForcedMcpServers(): string[] {
  const raw = process.env.ZGCAI_FORCED_MCP_SERVERS;
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Default context window for ephemeral agents whose model the token map does not
 * recognize (e.g. the `smart-router` gateway model). Without this LibreChat falls
 * back to DEFAULT_MAX_CONTEXT_TOKENS (32000) and emergency-truncates the agent's
 * working memory mid-run, causing repeated tool calls. Tunable via env; 0/empty
 * disables the override and restores stock fallback behavior.
 */
function getDefaultMaxContextTokens(): number {
  const raw = process.env.ZGCAI_DEFAULT_MAX_CONTEXT_TOKENS;
  if (raw === undefined) {
    return 190000;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Default system prompt injected into ephemeral agents (the `smart-router` gateway
 * model) when the caller did not supply their own `promptPrefix`. It enforces the
 * two-source retrieval policy for 中关村两院 questions: entity / expert / list /
 * achievement / relation questions must consult BOTH the knowledge graph
 * (ask_knowledge_graph) and the knowledge base (search_knowledge) rather than only
 * one. Tunable via ZGCAI_DEFAULT_INSTRUCTIONS; set it to an empty string to disable.
 */
const ZGCAI_DEFAULT_INSTRUCTIONS = `你是中关村两院（中关村学院 / 中关村人工智能研究院）的内部知识助手，有两个互补的检索工具：
- ask_knowledge_graph（知识图谱）：结构化的实体与关系（任职、研究方向、参与、合作、师承，以及 faculty/student 等身份类别），擅长“谁-关系-什么”“某机构/项目有哪些人”。
- search_knowledge（知识库）：文章、讲座实录、成果报道、制度与培养方案等叙述性文档，是人物头衔与简介、专家与团队构成、科研成果与事件、时间与权威出处的主要来源。

检索与作答策略：
1. 当问题涉及两院的人物/专家、成员或成果清单、团队、项目、关系、人物画像、最新进展、核实或比较时，必须同时调用 ask_knowledge_graph 与 search_knowledge，再合并作答，不要只用其中一个。
2. 仅当问题明确只属于单一模态时才可只调一个：纯规章/流程/制度 → 只用 search_knowledge；单个原子关系的是否判定 → 只用 ask_knowledge_graph。拿不准时默认双源。
3. 同义归并：AI4Math / AI for Mathematics / AI for Maths 视为同一研究方向；名称的空格、标点差异视为同一实体，检索时覆盖这些写法。
4. 交叉校验：两源相互补全与印证；一源有、另一源无的信息如实呈现并标注来源，不得因某一源查不到就断言“不存在”。
5. 身份甄别：区分教授/研究员/导师（专家）与学员/在校生/选拔营参与者，不得把学员称为“专家”或“核心成员”。
6. 分层作答（核心专家 → 其他研究人员 → 学员/参与者），标注关键结论来源；覆盖可能不全时明确说明“可能不完整”，不要臆造。`;

function getDefaultInstructions(): string {
  const raw = process.env.ZGCAI_DEFAULT_INSTRUCTIONS;
  return raw === undefined ? ZGCAI_DEFAULT_INSTRUCTIONS : raw;
}

export interface LoadAgentDeps {
  getAgent: (searchParameter: { id: string }) => Promise<Agent | null>;
  getMCPServerTools: (
    userId: string,
    serverName: string,
  ) => Promise<Record<string, unknown> | null>;
}

export interface LoadAgentParams {
  req: {
    user?: { id?: string };
    config?: AppConfig;
    body?: {
      promptPrefix?: string;
      ephemeralAgent?: TEphemeralAgent;
    };
  };
  spec?: string;
  agent_id: string;
  endpoint: string;
  model_parameters?: AgentModelParameters & { model?: string };
}

/**
 * Load an ephemeral agent based on the request parameters.
 */
export async function loadEphemeralAgent(
  { req, spec, endpoint, model_parameters: _m }: Omit<LoadAgentParams, 'agent_id'>,
  deps: LoadAgentDeps,
): Promise<Agent | null> {
  const { model, ...model_parameters } = _m ?? ({} as unknown as AgentModelParameters);
  // Forced MCP servers (knowledge base + graph) make the agent context heavy. The
  // gateway model `smart-router` isn't in LibreChat's token map, so without an
  // explicit value it falls back to 32000 and truncates mid-run. Inject a sane
  // default unless the caller already set one.
  const defaultMaxContextTokens = getDefaultMaxContextTokens();
  if (
    defaultMaxContextTokens > 0 &&
    (model_parameters as AgentModelParameters).maxContextTokens == null
  ) {
    (model_parameters as AgentModelParameters).maxContextTokens = defaultMaxContextTokens;
  }
  const modelSpecs = req.config?.modelSpecs as { list?: TModelSpec[] } | undefined;
  let modelSpec: TModelSpec | null = null;
  if (spec != null && spec !== '') {
    modelSpec = modelSpecs?.list?.find((s) => s.name === spec) ?? null;
  }
  const ephemeralAgent: TEphemeralAgent | undefined = req.body?.ephemeralAgent;
  const mcpServers = new Set<string>(ephemeralAgent?.mcp);
  const userId = req.user?.id ?? '';
  if (modelSpec?.mcpServers) {
    for (const mcpServer of modelSpec.mcpServers) {
      mcpServers.add(mcpServer);
    }
  }
  for (const forced of parseForcedMcpServers()) {
    mcpServers.add(forced);
  }
  const tools: string[] = [];
  if (ephemeralAgent?.execute_code === true || modelSpec?.executeCode === true) {
    tools.push(Tools.execute_code);
  }
  if (ephemeralAgent?.file_search === true || modelSpec?.fileSearch === true) {
    tools.push(Tools.file_search);
  }
  if (ephemeralAgent?.web_search === true || modelSpec?.webSearch === true) {
    tools.push(Tools.web_search);
  }

  const addedServers = new Set<string>();
  if (mcpServers.size > 0) {
    for (const mcpServer of mcpServers) {
      if (addedServers.has(mcpServer)) {
        continue;
      }
      const serverTools = await deps.getMCPServerTools(userId, mcpServer);
      if (!serverTools) {
        tools.push(`${mcp_all}${mcp_delimiter}${mcpServer}`);
        addedServers.add(mcpServer);
        continue;
      }
      tools.push(...Object.keys(serverTools));
      addedServers.add(mcpServer);
    }
  }

  // Respect a caller-supplied prompt; otherwise inject the two-source retrieval
  // policy so the gateway model consults both the knowledge graph and knowledge
  // base for 两院 questions instead of picking a single tool.
  const promptPrefix = req.body?.promptPrefix;
  const instructions = promptPrefix?.trim() ? promptPrefix : getDefaultInstructions() || undefined;

  // Get endpoint config for modelDisplayLabel fallback
  const appConfig = req.config;
  const endpoints = appConfig?.endpoints;
  let endpointConfig = endpoints?.[endpoint as keyof typeof endpoints];
  if (!isAgentsEndpoint(endpoint) && !endpointConfig) {
    try {
      endpointConfig = getCustomEndpointConfig({ endpoint, appConfig });
    } catch (err) {
      logger.error('[loadEphemeralAgent] Error getting custom endpoint config', err);
    }
  }

  // For ephemeral agents, use modelLabel if provided, then model spec's label,
  // then modelDisplayLabel from endpoint config, otherwise empty string to show model name
  const sender =
    (model_parameters as AgentModelParameters & { modelLabel?: string })?.modelLabel ??
    modelSpec?.label ??
    (endpointConfig as { modelDisplayLabel?: string } | undefined)?.modelDisplayLabel ??
    '';

  // Encode ephemeral agent ID with endpoint, model, and computed sender for display
  const ephemeralId = encodeEphemeralAgentId({
    endpoint,
    model: model as string,
    sender: sender as string,
  });

  const result: Partial<Agent> = {
    id: ephemeralId,
    instructions,
    provider: endpoint,
    model_parameters,
    model,
    tools,
  };

  if (ephemeralAgent?.artifacts) {
    result.artifacts = ephemeralAgent.artifacts;
  }
  return result as Agent;
}

/**
 * Load an agent based on the provided ID.
 * For ephemeral agents, builds a synthetic agent from request parameters.
 * For persistent agents, fetches from the database.
 */
export async function loadAgent(
  params: LoadAgentParams,
  deps: LoadAgentDeps,
): Promise<Agent | null> {
  const { req, spec, agent_id, endpoint, model_parameters } = params;
  if (!agent_id) {
    return null;
  }
  if (isEphemeralAgentId(agent_id)) {
    return loadEphemeralAgent({ req, spec, endpoint, model_parameters }, deps);
  }
  const agent = await deps.getAgent({ id: agent_id });

  if (!agent) {
    return null;
  }

  // Set version count from versions array length
  const agentWithVersion = agent as Agent & { versions?: unknown[]; version?: number };
  agentWithVersion.version = agentWithVersion.versions ? agentWithVersion.versions.length : 0;
  return agent;
}
