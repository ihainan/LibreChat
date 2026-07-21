import { useMemo, useCallback } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { useMediaQuery } from '@librechat/client';
import { EModelEndpoint, Constants } from 'librechat-data-provider';
import type { TUser, TSuggestions } from 'librechat-data-provider';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import {
  useGetAssistantDocsQuery,
  useGetEndpointsQuery,
  useGetStartupConfig,
} from '~/data-provider';
import { useSubmitMessage, useAuthContext, useLocalize } from '~/hooks';
import { getIconEndpoint, getEntity } from '~/utils';

/** Number of suggestions shown on small screens, leaving room for additional landing content. */
const MOBILE_SUGGESTION_COUNT = 2;

/** Picks the department-matched suggestion set for a user, falling back to the default set. */
function resolveDeptSuggestions(
  suggestions: TSuggestions | undefined,
  departments: TUser['departments'],
): string[] {
  if (!suggestions) {
    return [];
  }
  const rule = suggestions.departments?.find((r) =>
    departments?.some(
      (d) =>
        (r.match?.deptId != null && d.deptId === r.match.deptId) ||
        (r.match?.name != null &&
          ((d.deptName?.includes(r.match.name) ?? false) ||
            (d.fullPath?.includes(r.match.name) ?? false))),
    ),
  );
  return (rule?.items ?? suggestions.default ?? []).filter((item) => item.trim().length > 0);
}

function pickRandom(items: string[], count: number): string[] {
  if (items.length <= count) {
    return items;
  }
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

const ConversationStarters = () => {
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { user } = useAuthContext();
  const localize = useLocalize();
  const isSmallScreen = useMediaQuery('(max-width: 639px)');
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig } = useGetEndpointsQuery();

  const endpointType = useMemo(() => {
    let ep = conversation?.endpoint ?? '';
    if (ep === EModelEndpoint.azureOpenAI) {
      ep = EModelEndpoint.openAI;
    }
    return getIconEndpoint({
      endpointsConfig,
      iconURL: conversation?.iconURL,
      endpoint: ep,
    });
  }, [conversation?.endpoint, conversation?.iconURL, endpointsConfig]);

  const { data: documentsMap = new Map() } = useGetAssistantDocsQuery(endpointType, {
    select: (data) => new Map(data.map((dbA) => [dbA.assistant_id, dbA])),
  });

  const { entity, isAgent } = getEntity({
    endpoint: endpointType,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });

  const conversation_starters = useMemo(() => {
    if (entity?.conversation_starters?.length) {
      return entity.conversation_starters;
    }

    if (isAgent) {
      return [];
    }

    return documentsMap.get(entity?.id ?? '')?.conversation_starters ?? [];
  }, [documentsMap, isAgent, entity]);

  const deptSuggestions = useMemo(
    () => resolveDeptSuggestions(startupConfig?.interface?.suggestions, user?.departments),
    [startupConfig?.interface?.suggestions, user?.departments],
  );

  const usingSuggestions = conversation_starters.length === 0 && deptSuggestions.length > 0;
  const starters = conversation_starters.length ? conversation_starters : deptSuggestions;

  const displayStarters = useMemo(() => {
    const capped = starters.slice(0, Constants.MAX_CONVO_STARTERS);
    if (!usingSuggestions || !isSmallScreen) {
      return capped;
    }
    return pickRandom(starters, MOBILE_SUGGESTION_COUNT);
  }, [starters, usingSuggestions, isSmallScreen]);

  const { submitMessage } = useSubmitMessage();
  const sendConversationStarter = useCallback(
    (text: string) => submitMessage({ text }),
    [submitMessage],
  );

  if (!displayStarters.length) {
    return null;
  }

  return (
    <div className="mx-auto mt-6 flex w-full max-w-md flex-col gap-3 sm:mt-8 sm:max-w-none">
      {usingSuggestions && (
        <div className="text-center text-xs font-semibold uppercase tracking-wider text-text-secondary">
          {localize('com_ui_suggestions')}
        </div>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-2.5">
        {displayStarters.map((text: string, index: number) => (
          <button
            key={index}
            onClick={() => sendConversationStarter(text)}
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-border-medium px-4 py-3 text-start transition-colors duration-200 fade-in hover:bg-surface-tertiary"
          >
            <span className="flex-1 truncate text-sm text-text-secondary">{text}</span>
            <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-text-tertiary" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default ConversationStarters;
