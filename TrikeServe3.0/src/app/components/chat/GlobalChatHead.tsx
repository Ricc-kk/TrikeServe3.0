import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useChatHeadVisibility } from '../../contexts/ChatHeadVisibilityContext';
import { supabaseHelpers } from '../../../lib/supabase';
import FloatingChatHead from '../ui/FloatingChatHead';
import RideChatOverlay from '../rider/RideChatOverlay';

interface ChatConversation {
  id: string;
  participant_a_id: string;
  participant_b_id: string;
  participant_a_role: string;
  participant_b_role: string;
  participant_a_name: string | null;
  participant_b_name: string | null;
  participant_a_avatar: string | null;
  participant_b_avatar: string | null;
  last_message_at: string | null;
  last_message_sender_id: string | null;
  updated_at: string;
  unread_count_a: number;
  unread_count_b: number;
}

function unreadCount(conversation: ChatConversation, userId: string) {
  return conversation.participant_a_id === userId
    ? conversation.unread_count_a || 0
    : conversation.unread_count_b || 0;
}

function peerDisplayName(name: string | null | undefined, role: string | null | undefined) {
  const savedName = name?.trim();
  if (savedName) return savedName;
  switch (role) {
    case 'business': return 'Restaurant';
    case 'rider': return 'Driver';
    case 'customer': return 'Customer';
    default: return 'User';
  }
}

export default function GlobalChatHead() {
  const { user, isLoading } = useAuth();
  const {
    localHeadIds,
    openedConversationId,
    toggleChatOverlay,
    closeChatOverlay,
    setRecentChatHeads,
    chatHeadOpenRequest,
  } = useChatHeadVisibility();
  const location = useLocation();
  const navigate = useNavigate();
  const previousRouteRef = useRef({ userId: user?.id ?? null, pathname: location.pathname });
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [overlayConversation, setOverlayConversation] = useState<ChatConversation | null>(null);
  const [requestedConversation, setRequestedConversation] = useState<ChatConversation | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [pulseKey, setPulseKey] = useState(0);
  const [isHeadActivated, setIsHeadActivated] = useState(false);
  const messageSignalsByUserRef = useRef(new Map<string, Map<string, string>>());
  const consumedOpenRequestRef = useRef<number | null>(null);
  const conversationsOwnerRef = useRef<string | null>(null);
  const previousAuthRef = useRef<{ id: string; role: string } | null>(
    user?.id ? { id: user.id, role: user.role } : null,
  );

  useEffect(() => {
    const previous = previousAuthRef.current;
    const current = user?.id ? { id: user.id, role: user.role } : null;
    if (previous && (!current || current.id !== previous.id)) {
      // A session ending is not new message activity. Persist the closed state
      // so authentication changes do not bring the heads back by themselves.
      try {
        window.localStorage.setItem(`trikeserve_global_chat_head_dismissed_${previous.id}`, 'true');
        window.localStorage.setItem(
          `trikeserve_chat_head_dismissed_${previous.id}_trikeserve_chat_head_pos_${previous.role}`,
          'true',
        );
      } catch {
        // Persistence is a convenience; the current session can continue.
      }
    }
    previousAuthRef.current = current;
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!user?.id) {
      conversationsOwnerRef.current = null;
      setConversations([]);
      return;
    }

    let active = true;
    const refresh = async () => {
      try {
        const { data, error } = await supabaseHelpers.getChatConversations(user.id);
        if (!active) return;
        if (error) {
          console.error('[GlobalChatHead] Error loading conversations:', error);
          return;
        }
        const rows = (data || []) as ChatConversation[];
        const previousSignals = messageSignalsByUserRef.current.get(user.id);
        const nextSignals = new Map(rows.map((item) => [
          item.id,
          `${item.last_message_at || ''}:${item.last_message_sender_id || ''}`,
        ]));
        const activityOf = (item: ChatConversation) =>
          new Date(item.last_message_at || item.updated_at).getTime() || 0;
        const changedMessages = previousSignals
          ? rows.filter((item) =>
              Boolean(item.last_message_at || item.last_message_sender_id) &&
              previousSignals.get(item.id) !== `${item.last_message_at || ''}:${item.last_message_sender_id || ''}`
            )
          : [];
        messageSignalsByUserRef.current.set(user.id, nextSignals);

        if (changedMessages.length > 0) {
          const newestMessage = [...changedMessages].sort((a, b) => activityOf(b) - activityOf(a))[0];
          setIsHeadActivated(true);
          setSelectedConversationId(newestMessage.id);
          setPulseKey((key) => key + 1);
          try {
            window.localStorage.removeItem(`trikeserve_global_chat_head_dismissed_${user.id}`);
            window.localStorage.removeItem(
              `trikeserve_chat_head_dismissed_${user.id}_trikeserve_chat_head_pos_${user.role}`,
            );
          } catch {
            // The activity still updates in memory if persistence is unavailable.
          }
        }

        conversationsOwnerRef.current = user.id;
        setConversations(rows);
      } catch (error) {
        if (active) console.error('[GlobalChatHead] Unexpected inbox error:', error);
      }
    };

    void refresh();
    const unsubscribe = supabaseHelpers.subscribeToUserChatThreads(user.id, () => void refresh());
    const interval = window.setInterval(() => void refresh(), 5000);

    return () => {
      active = false;
      unsubscribe();
      window.clearInterval(interval);
    };
  }, [user?.id]);

  const recentConversations = useMemo(() => {
    // Never interpret the previous account's inbox as new activity while the
    // next account's session and conversations are being restored.
    if (!user?.id || conversationsOwnerRef.current !== user.id || conversations.length === 0) return [];

    const activityOf = (item: ChatConversation) =>
      new Date(item.last_message_at || item.updated_at).getTime() || 0;
    const newestByPeer = new Map<string, ChatConversation>();
    for (const item of [...conversations].sort((a, b) => activityOf(b) - activityOf(a))) {
      const peerId = item.participant_a_id === user.id ? item.participant_b_id : item.participant_a_id;
      if (peerId && !newestByPeer.has(peerId)) newestByPeer.set(peerId, item);
    }
    return [...newestByPeer.values()].sort((a, b) => activityOf(b) - activityOf(a));
  }, [conversations, user?.id]);

  useEffect(() => {
    if (openedConversationId) setSelectedConversationId(openedConversationId);
  }, [openedConversationId]);

  useEffect(() => {
    setSelectedConversationId(null);
    setRequestedConversation(null);
    setIsHeadActivated(false);
  }, [user?.id]);

  useEffect(() => {
    const previousRoute = previousRouteRef.current;
    const enteredThreadWhileSignedIn = Boolean(
      user?.id &&
      previousRoute.userId === user.id &&
      previousRoute.pathname !== location.pathname &&
      /\/messages\/(?:thread|business|driver)\//.test(location.pathname),
    );
    previousRouteRef.current = { userId: user?.id ?? null, pathname: location.pathname };

    // A thread URL restored during sign-in is not a manual open. Only a route
    // change made during the same signed-in session clears the dismissed state.
    if (!user?.id || (!openedConversationId && !enteredThreadWhileSignedIn)) {
      return;
    }

    setIsHeadActivated(true);
    if (openedConversationId) setSelectedConversationId(openedConversationId);
    else if (enteredThreadWhileSignedIn) {
      const threadId = location.pathname.match(/\/messages\/thread\/([^/]+)/)?.[1];
      if (threadId) setSelectedConversationId(decodeURIComponent(threadId));
    }

    // Manually opening a thread also restores the screen-specific head used by
    // ride and order pages when the user returns there.
    try {
      window.localStorage.removeItem(`trikeserve_global_chat_head_dismissed_${user.id}`);
      window.localStorage.removeItem(
        `trikeserve_chat_head_dismissed_${user.id}_trikeserve_chat_head_pos_${user.role}`,
      );
    } catch {
      // Dismissal persistence is a convenience; manual open still works here.
    }
  }, [location.pathname, openedConversationId, user?.id, user?.role]);

  useEffect(() => {
    const request = chatHeadOpenRequest;
    if (
      !user?.id ||
      !request ||
      request.userId !== user.id ||
      consumedOpenRequestRef.current === request.requestId
    ) {
      return;
    }

    consumedOpenRequestRef.current = request.requestId;
    setIsHeadActivated(true);
    setSelectedConversationId(request.conversationId);
    setPulseKey((key) => key + 1);
    try {
      window.localStorage.removeItem(`trikeserve_global_chat_head_dismissed_${user.id}`);
      window.localStorage.removeItem(
        `trikeserve_chat_head_dismissed_${user.id}_trikeserve_chat_head_pos_${user.role}`,
      );
    } catch {
      // Manual open still activates the head for this session.
    }
  }, [chatHeadOpenRequest, user?.id, user?.role]);

  useEffect(() => {
    const request = chatHeadOpenRequest;
    if (!user?.id || !request || request.userId !== user.id) return;
    const existing = conversations.find((item) => item.id === request.conversationId);
    if (existing) {
      setRequestedConversation(existing);
      return;
    }
    if (requestedConversation?.id === request.conversationId) return;

    let active = true;
    void supabaseHelpers.getChatConversationById(request.conversationId).then(({ data, error }) => {
      if (active && !error && data) setRequestedConversation(data as ChatConversation);
    });
    return () => {
      active = false;
    };
  }, [chatHeadOpenRequest, conversations, requestedConversation?.id, user?.id]);

  useEffect(() => {
    if (!user?.id) {
      setRecentChatHeads([]);
      return;
    }

    const nextHeads = recentConversations.map((item) => {
      const peerIsA = item.participant_a_id !== user.id;
      const peerId = peerIsA ? item.participant_a_id : item.participant_b_id;
      return {
        conversationId: item.id,
        peerId,
        peerName: peerDisplayName(
          peerIsA ? item.participant_a_name : item.participant_b_name,
          peerIsA ? item.participant_a_role : item.participant_b_role,
        ),
        peerAvatar: peerIsA ? item.participant_a_avatar : item.participant_b_avatar,
        unread: unreadCount(item, user.id),
        lastActivityAt: item.last_message_at || item.updated_at,
      };
    });
    setRecentChatHeads((current) => {
      const unchanged = current.length === nextHeads.length && current.every((item, index) => {
        const next = nextHeads[index];
        return item.conversationId === next.conversationId &&
          item.peerId === next.peerId &&
          item.peerName === next.peerName &&
          item.peerAvatar === next.peerAvatar &&
          item.unread === next.unread &&
          item.lastActivityAt === next.lastActivityAt;
      });
      return unchanged ? current : nextHeads;
    });
  }, [recentConversations, setRecentChatHeads, user?.id]);

  const latestConversation = recentConversations[0] || null;
  const conversation = recentConversations.find((item) => item.id === selectedConversationId)
    || conversations.find((item) => item.id === selectedConversationId)
    || (requestedConversation?.id === selectedConversationId ? requestedConversation : null)
    || latestConversation;

  const hasOpenedConversationInList = Boolean(
    openedConversationId && conversations.some((item) => item.id === openedConversationId),
  );
  useEffect(() => {
    if (!user?.id) {
      setOverlayConversation(null);
      closeChatOverlay();
      return;
    }
    if (!openedConversationId || hasOpenedConversationInList) {
      setOverlayConversation(null);
      return;
    }
    if (overlayConversation?.id === openedConversationId) return;

    let active = true;
    void supabaseHelpers.getChatConversationById(openedConversationId).then(({ data, error }) => {
      if (!active) return;
      if (error || !data) {
        closeChatOverlay();
        return;
      }
      setOverlayConversation(data as ChatConversation);
    });

    return () => {
      active = false;
    };
  }, [openedConversationId, hasOpenedConversationInList, overlayConversation?.id, user?.id, closeChatOverlay]);

  if (
    isLoading ||
    !user?.id ||
    (user.role !== 'customer' && user.role !== 'business' && user.role !== 'rider')
  ) {
    return null;
  }

  const roleBasePath = user.role === 'rider' ? '/rider' : `/${user.role}`;
  if (location.pathname !== roleBasePath && !location.pathname.startsWith(`${roleBasePath}/`)) {
    return null;
  }

  const messagesPath = user.role === 'rider' ? '/rider/messages' : `/${user.role}/messages`;
  const isOnMessagesPage = location.pathname === messagesPath || location.pathname.startsWith(`${messagesPath}/`);
  const isOnMessageThread = isOnMessagesPage && /\/messages\/(?:thread|business|driver)\//.test(location.pathname);
  const selectedOverlayConversation = openedConversationId
    ? conversations.find((item) => item.id === openedConversationId) ||
      (overlayConversation?.id === openedConversationId ? overlayConversation : null)
    : null;
  const peerIsA = conversation ? conversation.participant_a_id !== user.id : false;
  const peerName = conversation
    ? peerDisplayName(
        peerIsA ? conversation.participant_a_name : conversation.participant_b_name,
        peerIsA ? conversation.participant_a_role : conversation.participant_b_role,
      )
    : 'Messages';
  const peerAvatar = conversation
    ? peerIsA ? conversation.participant_a_avatar : conversation.participant_b_avatar
    : null;
  const stackItems = recentConversations.filter((item) => item.id !== conversation?.id).map((item) => {
    const peerIsA = item.participant_a_id !== user.id;
    return {
      id: item.id,
      peerAvatar: peerIsA ? item.participant_a_avatar : item.participant_b_avatar,
      peerLabel: peerDisplayName(
        peerIsA ? item.participant_a_name : item.participant_b_name,
        peerIsA ? item.participant_a_role : item.participant_b_role,
      ),
      unread: unreadCount(item, user.id),
      onOpen: () => toggleChatOverlay(item.id),
    };
  });
  const orderDetailHasLocalHead = user.role === 'customer' &&
    location.pathname.startsWith('/customer/order-detail/') &&
    localHeadIds.length > 0;

  return (
    <>
      <FloatingChatHead
        key={user.id}
        isGlobal
        hidden={
          !isHeadActivated ||
          orderDetailHasLocalHead ||
          Boolean(conversation && localHeadIds.includes(conversation.id)) ||
          Boolean(openedConversationId) ||
          isOnMessageThread
        }
        storageKey={`trikeserve_global_chat_head_pos_${user.role}`}
        dismissalStorageKey={`trikeserve_global_chat_head_dismissed_${user.id}`}
        initialPlacement="top-right"
        layoutKey={location.pathname}
        headId={conversation?.id || 'messages'}
        peerAvatar={peerAvatar}
        peerIsMessages={!conversation}
        peerLabel={peerName || 'your latest conversation'}
        unread={conversation ? unreadCount(conversation, user.id) : 0}
        pulseKey={pulseKey}
        stackItems={stackItems}
        onOpen={() => conversation ? toggleChatOverlay(conversation.id) : navigate(messagesPath)}
      />
      {selectedOverlayConversation && (
        (() => {
          const conversation = selectedOverlayConversation;
          const senderIsA = conversation.participant_a_id === user.id;
          const peerId = senderIsA ? conversation.participant_b_id : conversation.participant_a_id;
          const peerRole = senderIsA ? conversation.participant_b_role : conversation.participant_a_role;
          const peerName = senderIsA ? conversation.participant_b_name : conversation.participant_a_name;
          const peerAvatar = senderIsA ? conversation.participant_b_avatar : conversation.participant_a_avatar;

          return (
            <RideChatOverlay
              key={conversation.id}
              open={openedConversationId === conversation.id}
              conversationId={conversation.id}
              peerId={peerId}
              currentUserId={user.id}
              peerName={peerDisplayName(peerName, peerRole)}
              peerAvatar={peerAvatar}
              peerRole={peerRole as 'customer' | 'business' | 'rider'}
              senderRole={user.role as 'customer' | 'business' | 'rider'}
              senderName={user.name || 'User'}
              receiverRole={peerRole as 'customer' | 'business' | 'rider'}
              onClose={closeChatOverlay}
              zIndexClass="z-[10001]"
            />
          );
        })()
      )}
    </>
  );
}
