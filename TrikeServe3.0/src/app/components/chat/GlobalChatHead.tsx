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
  } = useChatHeadVisibility();
  const location = useLocation();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [overlayConversation, setOverlayConversation] = useState<ChatConversation | null>(null);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [pulseKey, setPulseKey] = useState(0);
  const lastSignalRef = useRef('');
  const conversationsOwnerRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) {
      conversationsOwnerRef.current = null;
      setConversations([]);
      lastSignalRef.current = '';
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
        conversationsOwnerRef.current = user.id;
        setConversations((data || []) as ChatConversation[]);
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
    lastSignalRef.current = '';
  }, [user?.id]);

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
    || latestConversation;

  useEffect(() => {
    if (!latestConversation || !user?.id) {
      lastSignalRef.current = '';
      return;
    }
    // Read-count changes should update the badge without re-opening a dismissed
    // head. A new message changes its activity timestamp or sender, and promotes
    // that conversation to the one visible while the chat is closed.
    const signal = `${latestConversation.id}:${latestConversation.last_message_at || ''}:${latestConversation.last_message_sender_id || ''}`;
    if (lastSignalRef.current && lastSignalRef.current !== signal) {
      setPulseKey((key) => key + 1);
      setSelectedConversationId(latestConversation.id);
    }
    lastSignalRef.current = signal;
  }, [latestConversation, user?.id]);

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
  const isCurrentThread = Boolean(
    conversation && location.pathname === `${messagesPath}/thread/${conversation.id}`,
  );
  const isOnMessagesPage = location.pathname === messagesPath || location.pathname.startsWith(`${messagesPath}/`);
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

  return (
    <>
      <FloatingChatHead
        key={user.id}
        isGlobal
        hidden={
          Boolean(conversation && localHeadIds.includes(conversation.id)) ||
          Boolean(openedConversationId) ||
          (isOnMessagesPage && isCurrentThread)
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
