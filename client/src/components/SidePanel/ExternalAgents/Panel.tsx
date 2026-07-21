import { useMemo } from 'react';
import type { TExternalAgent } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const placeholderColors = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-teal-500',
];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return placeholderColors[hash % placeholderColors.length];
}

function AgentAvatar({ agent }: { agent: TExternalAgent }) {
  if (agent.iconURL) {
    return (
      <img
        src={agent.iconURL}
        alt={agent.name}
        className="h-9 w-9 flex-shrink-0 rounded-lg object-cover"
      />
    );
  }

  const initial = agent.name.trim().charAt(0) || '?';
  return (
    <div
      aria-hidden="true"
      className={cn(
        'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-base font-semibold text-white',
        colorForName(agent.name),
      )}
    >
      {initial}
    </div>
  );
}

function ExternalAgentRow({ agent }: { agent: TExternalAgent }) {
  return (
    <a
      href={agent.url}
      target="_blank"
      rel="noreferrer noopener"
      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover"
    >
      <AgentAvatar agent={agent} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text-primary">{agent.name}</div>
        {agent.description != null && agent.description !== '' && (
          <div className="truncate text-xs text-text-secondary">{agent.description}</div>
        )}
      </div>
    </a>
  );
}

export default function ExternalAgentsPanel() {
  const localize = useLocalize();
  const { data: config } = useGetStartupConfig();

  const agents = useMemo(
    () => config?.interface?.externalAgents ?? [],
    [config?.interface?.externalAgents],
  );

  return (
    <div className="flex h-full flex-col px-2 pb-4">
      <h2 className="px-2 py-2 text-sm font-semibold text-text-primary">
        {localize('com_nav_external_agents')}
      </h2>
      <div className="flex flex-col gap-0.5 overflow-y-auto">
        {agents.map((agent, index) => (
          <ExternalAgentRow key={`${agent.url}-${index}`} agent={agent} />
        ))}
      </div>
    </div>
  );
}
