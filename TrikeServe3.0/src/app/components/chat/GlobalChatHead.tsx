import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useChatHeadVisibility } from '../../contexts/ChatHeadVisibilityContext';
import { supabaseHelpers } from '../../../lib/supabase';
import FloatingChatHead from '../ui/FloatingChatHead';

interface ChatConversation {
  id: string;
  participant_a_id: string;
  participant_b_id: string;
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

export default function GlobalChatHead() {
  const { user, isLoading } = useAuth();
  const { localHeadCount } = useChatHeadVisibility();
  const location = useLocation();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [pulseKey, setPulseKey] = useState(0);
  const lastSignalRef = useRef('');

  useEffect(() => {
    if (!user?.id) {
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
    if (!user?.id || conversations.length === 0) return [];

    const activityOf = (item: ChatConversation) =>
      new Date(item.last_message_at || item.updated_at).getTime() || 0;
    const newestByPeer = new Map<string, ChatConversation>();
    for (const item of [...conversations].sort((a, b) => activityOf(b) - activityOf(a))) {
      const peerId = item.participant_a_id === user.id ? item.participant_b_id : item.participant_a_id;
      if (peerId && !newestByPeer.has(peerId)) newestByPeer.set(peerId, item);
    }
    return [...newestByPeer.values()].sort((a, b) => activityOf(b) - activityOf(a));
  }, [conversations, user?.id]);
  const conversation = recentConversations[0] || null;

  useEffect(() => {
    if (!conversation || !user?.id) {
      lastSignalRef.current = '';
      return;
    }
    const signal = `${conversation.id}:${conversation.last_message_at || ''}:${conversation.last_message_sender_id || ''}:${unreadCount(conversation, user.id)}`;
    if (lastSignalRef.current && lastSignalRef.current !== signal) {
      setPulseKey((key) => key + 1);
    }
    lastSignalRef.current = signal;
  }, [conversation, user?.id]);

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
  const peerIsA = conversation ? conversation.participant_a_id !== user.id : false;
  const peerName = conversation
    ? peerIsA ? conversation.participant_a_name : conversation.participant_b_name
    : 'Messages';
  const peerAvatar = conversation
    ? peerIsA ? conversation.participant_a_avatar : conversation.participant_b_avatar
    : null;
  const stackItems = recentConversations.slice(1, 4).map((item) => {
    const peerIsA = item.participant_a_id !== user.id;
    return {
      id: item.id,
      peerAvatar: peerIsA ? item.participant_a_avatar : item.participant_b_avatar,
      peerLabel: (peerIsA ? item.participant_a_name : item.participant_b_name) || 'your conversation',
      unread: unreadCount(item, user.id),
      onOpen: () => navigate(`${messagesPath}/thread/${item.id}`),
    };
  });

  return (
    <FloatingChatHead
      isGlobal
      hidden={localHeadCount > 0 || (isOnMessagesPage && isCurrentThread)}
      storageKey={`trikeserve_chat_head_pos_${user.role}`}
      headId={conversation?.id || 'messages'}
      peerAvatar={peerAvatar}
      peerIsMessages={!conversation}
      peerLabel={peerName || 'your latest conversation'}
      unread={conversation ? unreadCount(conversation, user.id) : 0}
      pulseKey={pulseKey}
      stackItems={stackItems}
      onOpen={() => navigate(conversation ? `${messagesPath}/thread/${conversation.id}` : messagesPath)}
    />
  );
}
