import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

interface ChatHeadVisibilityContextValue {
  localHeadCount: number;
  registerLocalHead: () => () => void;
}

const ChatHeadVisibilityContext = createContext<ChatHeadVisibilityContextValue | null>(null);

export function ChatHeadVisibilityProvider({ children }: { children: ReactNode }) {
  const [localHeadCount, setLocalHeadCount] = useState(0);

  const registerLocalHead = useCallback(() => {
    setLocalHeadCount((count) => count + 1);
    return () => setLocalHeadCount((count) => Math.max(0, count - 1));
  }, []);

  return (
    <ChatHeadVisibilityContext.Provider value={{ localHeadCount, registerLocalHead }}>
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
