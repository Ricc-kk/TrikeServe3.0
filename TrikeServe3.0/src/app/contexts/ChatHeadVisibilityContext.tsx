import { createContext, useCallback, useContext, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

export interface RecentChatHead {
  conversationId: string;
  peerId: string;
  peerName: string;
  peerAvatar: string | null;
  peerIsGroup?: boolean;
  unread: number;
  lastActivityAt: string | null;
}

export interface ChatHeadOpenRequest {
  userId: string;
  conversationId: string;
  requestId: number;
}

interface ChatHeadVisibilityContextValue {
  localHeadIds: string[];
  registerLocalHead: (conversationId?: string) => () => void;
  openedConversationId: string | null;
  toggleChatOverlay: (conversationId: string) => void;
  closeChatOverlay: () => void;
  recentChatHeads: RecentChatHead[];
  setRecentChatHeads: Dispatch<SetStateAction<RecentChatHead[]>>;
  chatHeadOpenRequest: ChatHeadOpenRequest | null;
  requestChatHeadOpen: (userId: string, conversationId: string) => void;
}

const ChatHeadVisibilityContext = createContext<ChatHeadVisibilityContextValue | null>(null);

export function ChatHeadVisibilityProvider({ children }: { children: ReactNode }) {
  const [localHeads, setLocalHeads] = useState<Array<{ key: number; conversationId?: string }>>([]);
  const [openedConversationId, setOpenedConversationId] = useState<string | null>(null);
  const [recentChatHeads, setRecentChatHeads] = useState<RecentChatHead[]>([]);
  const nextHeadKey = useRef(0);
  const nextOpenRequestId = useRef(0);
  const [chatHeadOpenRequest, setChatHeadOpenRequest] = useState<ChatHeadOpenRequest | null>(null);

  const registerLocalHead = useCallback((conversationId?: string) => {
    const key = ++nextHeadKey.current;
    setLocalHeads((heads) => [...heads, { key, conversationId }]);
    return () => setLocalHeads((heads) => heads.filter((head) => head.key !== key));
  }, []);
  const toggleChatOverlay = useCallback((conversationId: string) => {
    setOpenedConversationId((current) => current === conversationId ? null : conversationId);
  }, []);
  const closeChatOverlay = useCallback(() => setOpenedConversationId(null), []);
  const requestChatHeadOpen = useCallback((userId: string, conversationId: string) => {
    setChatHeadOpenRequest({ userId, conversationId, requestId: ++nextOpenRequestId.current });
  }, []);

  const localHeadIds = localHeads.flatMap((head) => head.conversationId ? [head.conversationId] : []);

  return (
    <ChatHeadVisibilityContext.Provider value={{
      localHeadIds,
      registerLocalHead,
      openedConversationId,
      toggleChatOverlay,
      closeChatOverlay,
      recentChatHeads,
      setRecentChatHeads,
      chatHeadOpenRequest,
      requestChatHeadOpen,
    }}>
      {children}
    </ChatHeadVisibilityContext.Provider>
  );
}

export function useChatHeadVisibility() {
  const context = useContext(ChatHeadVisibilityContext);
  if (!context) {
    throw new Error('useChatHeadVisibility must be used inside ChatHeadVisibilityProvider');
  }
  return context;
}
