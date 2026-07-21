import { memo, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { useForm } from 'react-hook-form';
import { Spinner } from '@librechat/client';
import { useParams } from 'react-router-dom';
import { Constants, buildTree } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ChatFormValues } from '~/common';
import { ChatContext, AddedChatContext, ChatFormProvider, useFileMapContext } from '~/Providers';
import { useAddedResponse, useResumeOnLoad, useAdaptiveSSE, useChatHelpers } from '~/hooks';
import ConversationStarters from './Input/ConversationStarters';
import { useGetMessagesByConvoId } from '~/data-provider';
import MessagesView from './Messages/MessagesView';
import Presentation from './Presentation';
import ChatForm from './Input/ChatForm';
import Landing from './Landing';
import Header from './Header';
import Footer from './Footer';
import { cn } from '~/utils';
import store from '~/store';

function LoadingSpinner() {
  return (
    <div className="relative flex-1 overflow-hidden overflow-y-auto">
      <div className="relative flex h-full items-center justify-center">
        <Spinner className="text-text-primary" />
      </div>
    </div>
  );
}

function ChatView({ index = 0 }: { index?: number }) {
  const { conversationId } = useParams();
  const rootSubmission = useRecoilValue(store.submissionByIndex(index));

  const methods = useForm<ChatFormValues>({
    defaultValues: { text: '' },
  });

  const fileMap = useFileMapContext();

  const { data: messagesTree = null, isLoading } = useGetMessagesByConvoId(conversationId ?? '', {
    select: useCallback(
      (data: TMessage[]) => {
        const dataTree = buildTree({ messages: data, fileMap });
        return dataTree?.length === 0 ? null : (dataTree ?? null);
      },
      [fileMap],
    ),
    enabled: !!fileMap,
  });

  const chatHelpers = useChatHelpers(index, conversationId);
  const addedChatHelpers = useAddedResponse();

  useAdaptiveSSE(rootSubmission, chatHelpers, false, index);

  // Auto-resume if navigating back to conversation with active job
  // Wait for messages to load before resuming to avoid race condition
  useResumeOnLoad(conversationId, chatHelpers.getMessages, index, !isLoading);

  let content: JSX.Element | null | undefined;
  const isLandingPage =
    (!messagesTree || messagesTree.length === 0) &&
    (conversationId === Constants.NEW_CONVO || !conversationId);
  const isNavigating = (!messagesTree || messagesTree.length === 0) && conversationId != null;

  if (isLoading && conversationId !== Constants.NEW_CONVO) {
    content = <LoadingSpinner />;
  } else if ((isLoading || isNavigating) && !isLandingPage) {
    content = <LoadingSpinner />;
  } else if (!isLandingPage) {
    content = <MessagesView messagesTree={messagesTree} />;
  } else {
    content = <Landing />;
  }

  return (
    <ChatFormProvider {...methods}>
      <ChatContext.Provider value={chatHelpers}>
        <AddedChatContext.Provider value={addedChatHelpers}>
          <Presentation>
            <div className="relative flex h-full w-full flex-col">
              <Header />
              <>
                <div
                  className={cn(
                    'flex flex-col',
                    isLandingPage
                      ? 'min-h-0 flex-1 items-center overflow-y-auto pt-14'
                      : 'h-full overflow-y-auto',
                  )}
                >
                  {isLandingPage ? (
                    <>
                      <div className="max-h-[22vh] w-full grow" aria-hidden="true" />
                      <div className="flex w-full flex-col items-center pb-4">
                        {content}
                        <div className="w-full max-w-3xl px-4 transition-all duration-200 sm:px-0 xl:max-w-4xl">
                          <ChatForm index={index} />
                          <ConversationStarters />
                        </div>
                      </div>
                      <div className="w-full grow" aria-hidden="true" />
                    </>
                  ) : (
                    <>
                      {content}
                      <div className="w-full">
                        <ChatForm index={index} />
                        <Footer />
                      </div>
                    </>
                  )}
                </div>
                {isLandingPage && <Footer />}
              </>
            </div>
          </Presentation>
        </AddedChatContext.Provider>
      </ChatContext.Provider>
    </ChatFormProvider>
  );
}

export default memo(ChatView);
