import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { ArrowLeft, MessageCircle, Send, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { useAuth } from '../../contexts/AuthContext';
import { supabaseHelpers } from '../../../lib/supabase';
import { buildChatThreadKey, getPeerAvatar, getPeerName, getRoleLabel, ChatContextType, ChatRole } from '../../../lib/chat';

interface ChatHubProps {
  title: string;
  backPath: string;
  basePath: string;
  directPeerId?: string;
  directPeerRole?: ChatRole;
  directPeerName?: string;
  directPeerAvatar?: string;
  contextType?: ChatContextType;
  contextId?: string;
  subject?: string;
}

interface ChatConversation {
  id: string;
  thread_key: string;
  thread_type: string;
  context_type: string | null;
  context_id: string | null;
  participant_a_id: string;
  participant_b_id: string;
  participant_a_role: string;
  participant_b_role: string;
  participant_a_name: string | null;
  participant_b_name: string | null;
  participant_a_avatar: string | null;
  participant_b_avatar: string | null;
  subject: string | null;
  last_message_preview: string | null;
  last_message_sender_id: string | null;
  last_message_at: string | null;
  unread_count_a: number;
  unread_count_b: number;
  created_at: string;
  updated_at: string;
}

interface ChatMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  receiver_id: string;
  sender_name: string;
  sender_role: string;
  receiver_role: string;
  message: string;
  read: boolean;
  created_at: string;
}

export default function ChatHub({
  title,
  backPath,
  basePath,
  directPeerId,
  directPeerRole = 'customer',
  directPeerName,
  directPeerAvatar,
  contextType = 'direct',
  contextId,
  subject,
}: ChatHubProps) {
  const navigate = useNavigate();
  const { conversationId } = useParams();
  const { user } = useAuth();

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeConversation, setActiveConversation] = useState<ChatConversation | null>(null);
  const [isCreatingThread, setIsCreatingThread] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isDirectMode = !!directPeerId;
  const activeConversationId = isDirectMode ? activeConversation?.id : conversationId;

  const loadInbox = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabaseHelpers.getChatConversations(user.id);
      if (error) {
        console.error('[ChatHub] Error loading conversations:', error);
        setConversations([]);
        return;
      }
      setConversations((data || []) as ChatConversation[]);
    } catch (error) {
      console.error('[ChatHub] Unexpected inbox error:', error);
      setConversations([]);
    }
  };

  const loadMessages = async (targetConversationId: string) => {
    try {
      const { data, error } = await supabaseHelpers.getChatMessages(targetConversationId);
      if (error) {
        console.error('[ChatHub] Error loading messages:', error);
        setMessages([]);
        return;
      }
      setMessages((data || []) as ChatMessage[]);
      if (user?.id) {
        await supabaseHelpers.markChatConversationRead(targetConversationId, user.id);
      }
    } catch (error) {
      console.error('[ChatHub] Unexpected message error:', error);
      setMessages([]);
    }
  };

  const ensureDirectConversation = async () => {
    if (!user?.id || !directPeerId) return;
    setIsCreatingThread(true);
    try {
      const threadKey = buildChatThreadKey({
        participantAId: user.id,
        participantBId: directPeerId,
        contextType,
        contextId,
      });

      const { data, error } = await supabaseHelpers.ensureChatConversation({
        threadKey,
        threadType: contextType,
        contextType,
        contextId,
        participantAId: user.id,
        participantBId: directPeerId,
        participantARole: user.role,
        participantBRole: directPeerRole,
        participantAName: user.name,
        participantBName: directPeerName,
        participantAAvatar: user.name?.[0]?.toUpperCase() || '💬',
        participantBAvatar: directPeerAvatar,
        subject,
      });

      if (error) {
        console.error('[ChatHub] Error creating conversation:', error);
        return;
      }

      setActiveConversation(data as ChatConversation);
      await loadMessages((data as ChatConversation).id);
    } finally {
      setIsCreatingThread(false);
    }
  };

  useEffect(() => {
    if (!user?.id) return;

    const initialize = async () => {
      setLoading(true);
      await loadInbox();

      if (isDirectMode && directPeerId) {
        await ensureDirectConversation();
      } else if (conversationId) {
        const selected = conversations.find((item) => item.id === conversationId);
        if (selected) {
          setActiveConversation(selected);
          await loadMessages(selected.id);
        } else {
          const { data, error } = await supabaseHelpers.getChatConversationById(conversationId);
          if (!error && data) {
            setActiveConversation(data as ChatConversation);
            await loadMessages(conversationId);
          }
        }
      }

      setLoading(false);
    };

    initialize();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, conversationId, directPeerId]);

  useEffect(() => {
    if (!activeConversationId) return;

    const interval = setInterval(() => {
      loadMessages(activeConversationId);
      loadInbox();
    }, 2500);

    const unsubscribeMessages = supabaseHelpers.subscribeToChatConversation(activeConversationId, () => {
      loadMessages(activeConversationId);
    });

    const unsubscribeThreads = user?.id
      ? supabaseHelpers.subscribeToUserChatThreads(user.id, loadInbox)
      : undefined;

    return () => {
      clearInterval(interval);
      unsubscribeMessages();
      unsubscribeThreads?.();
    };
  }, [activeConversationId, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);



  function getConversationPeer(conversation: ChatConversation) {
    const participantA = {
      id: conversation.participant_a_id,
      name: conversation.participant_a_name || 'User',
      role: conversation.participant_a_role as ChatRole,
      avatar: conversation.participant_a_avatar || '💬',
    };
    const participantB = {
      id: conversation.participant_b_id,
      name: conversation.participant_b_name || 'User',
      role: conversation.participant_b_role as ChatRole,
      avatar: conversation.participant_b_avatar || '💬',
    };

    return {
      name: getPeerName(user?.id || '', participantA, participantB),
      avatar: getPeerAvatar(user?.id || '', participantA, participantB),
      role: participantA.id === user?.id ? participantB.role : participantA.role,
      id: participantA.id === user?.id ? participantB.id : participantA.id,
    };
  }

  function getRoleTheme(role?: ChatRole | string) {
    switch (role) {
      case 'customer':
        return {
          avatarWrap: 'bg-[var(--info-soft)] border-[var(--info-soft)] text-[var(--info)]',
          roleBadge: 'bg-[var(--info)] text-white',
          roleText: 'text-[var(--info)]',
          unreadDot: 'bg-[var(--info)]',
        };
      case 'rider':
        return {
          avatarWrap: 'bg-[var(--success-soft)] border-[var(--success-soft)] text-[var(--success)]',
          roleBadge: 'bg-[var(--success)] text-white',
          roleText: 'text-[var(--success)]',
          unreadDot: 'bg-[var(--success)]',
        };
      case 'business':
        return {
          avatarWrap: 'bg-[var(--violet-soft)] border-[var(--violet-soft)] text-[var(--violet)]',
          roleBadge: 'bg-[var(--violet)] text-white',
          roleText: 'text-[var(--violet)]',
          unreadDot: 'bg-[var(--violet)]',
        };
      default:
        return {
          avatarWrap: 'bg-[var(--muted)] border-[var(--border)] text-[var(--muted-foreground)]',
          roleBadge: 'bg-[var(--muted-foreground)] text-white',
          roleText: 'text-[var(--muted-foreground)]',
          unreadDot: 'bg-[var(--primary)]',
        };
    }
  }

  const openConversation = async (conversation: ChatConversation) => {
    setActiveConversation(conversation);
    await loadMessages(conversation.id);
    navigate(`${basePath}/thread/${conversation.id}`);
  };

  const sendMessage = async () => {
    if (!user?.id || !messageText.trim() || !activeConversation) return;

    const isParticipantA = activeConversation.participant_a_id === user.id;
    const receiverId = isParticipantA ? activeConversation.participant_b_id : activeConversation.participant_a_id;
    const receiverRole = isParticipantA ? activeConversation.participant_b_role : activeConversation.participant_a_role;

    const { error } = await supabaseHelpers.sendChatMessage({
      conversationId: activeConversation.id,
      senderId: user.id,
      receiverId,
      senderName: user.name,
      senderRole: user.role,
      receiverRole,
      message: messageText.trim(),
    });

    if (error) {
      console.error('[ChatHub] Send message failed:', error);
      alert('Message failed to send. Please try again.');
      return;
    }

    setMessageText('');
    await loadMessages(activeConversation.id);
    await loadInbox();
  };

  if (!user) return null;

  const renderThread = () => {
    if (!activeConversation) {
      return (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-sm">
            {isCreatingThread ? (
              <p className="text-sm text-[var(--muted-foreground)]">Creating chat thread...</p>
            ) : (
              <>
                <MessageCircle className="w-12 h-12 text-[var(--border)] mx-auto mb-3" />
                <p className="font-semibold text-[var(--ink)]">Select a conversation</p>
                <p className="text-sm text-[var(--muted-foreground)] mt-1">Choose a chat from your inbox or start a new one.</p>
              </>
            )}
          </div>
        </div>
      );
    }

    const dbPeer = getConversationPeer(activeConversation);
    // In direct mode, prefer the props-provided name (which is fetched fresh)
    const peer = isDirectMode && directPeerName
      ? { ...dbPeer, name: directPeerName, avatar: directPeerAvatar || dbPeer.avatar }
      : dbPeer;
    const peerTheme = getRoleTheme(peer.role);

    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="bg-[var(--primary)] text-white px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
          <Button variant="ghost" size="icon" onClick={() => navigate(backPath)} className="text-white hover:bg-white/20">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className={`w-11 h-11 rounded-full border flex items-center justify-center text-2xl flex-shrink-0 ${peerTheme.avatarWrap}`}>
            {peer.avatar}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg truncate leading-tight">{peer.name}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {peer.role !== 'business' && <Badge className={peerTheme.roleBadge}>{getRoleLabel(peer.role)}</Badge>}
              <span className="text-xs text-white/80 truncate">{activeConversation.subject || activeConversation.context_type || 'Chat'}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[var(--muted)]">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="w-12 h-12 text-[var(--border)] mx-auto mb-3" />
              <p className="text-[var(--muted-foreground)] text-sm">No messages yet</p>
              <p className="text-[var(--muted-foreground)] text-xs mt-1">Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_id === user.id;
              const messageDate = new Date(msg.created_at);
              const dateTimeString = messageDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) + ', ' +
                                     messageDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${isMine ? 'bg-[var(--primary)] text-white' : 'bg-white border border-[var(--border)]'}`}>
                    <p className="text-sm break-words">{msg.message}</p>
                    <p className={`text-[10px] mt-1 ${isMine ? 'text-white/70' : 'text-[var(--muted-foreground)]'}`}>
                      {dateTimeString}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="bg-white border-t border-[var(--border)] p-4 sticky bottom-0">
          <div className="flex gap-2">
            <textarea
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              placeholder="Type your message..."
              rows={2}
              className="flex-1 px-4 py-3 border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button onClick={sendMessage} disabled={!messageText.trim()} className="bg-[var(--primary)] hover:bg-[var(--primary)] px-6">
              <Send className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (isDirectMode) {
    return (
      <div className="min-h-screen bg-[var(--muted)] flex flex-col">
        {renderThread()}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--muted)] flex flex-col">
      {!activeConversationId ? (
        <>
          <div className="bg-white border-b-2 border-[var(--border)] px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
            <Button variant="ghost" size="icon" onClick={() => navigate(backPath)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-extrabold text-[var(--primary)]" style={{ letterSpacing: '-0.02em' }}>{title}</h1>
              <p className="text-xs text-[var(--muted-foreground)]">Message customers, drivers, and business owners</p>
            </div>

          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {loading ? (
              <div className="text-center py-12 text-sm text-[var(--muted-foreground)]">Loading conversations...</div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-12">
                <MessageCircle className="w-12 h-12 text-[var(--border)] mx-auto mb-3" />
                <h3 className="font-bold text-[var(--ink)] mb-1">No conversations yet</h3>
                <p className="text-sm text-[var(--muted-foreground)]">Start a conversation from an order or ride.</p>
              </div>
            ) : (
              conversations.map((conversation) => {
                const peer = getConversationPeer(conversation);
                const peerTheme = getRoleTheme(peer.role);
                const unread = conversation.participant_a_id === user.id ? conversation.unread_count_a : conversation.unread_count_b;
                const isUnread = unread > 0;

                return (
                  <Card
                    key={conversation.id}
                    className={`p-4 bg-white border-2 transition-colors cursor-pointer ${isUnread ? 'border-[var(--primary)] bg-[var(--muted)] shadow-sm' : 'border-[var(--border)] hover:border-[var(--primary)]'}`}
                    onClick={() => openConversation(conversation)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`relative w-12 h-12 rounded-full border flex items-center justify-center text-2xl flex-shrink-0 shadow-sm ${peerTheme.avatarWrap}`}>
                        {peer.avatar || '💬'}
                        {isUnread && (
                          <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${peerTheme.unreadDot} animate-pulse`} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className={`font-bold truncate leading-tight ${isUnread ? 'text-[var(--primary)]' : 'text-[var(--ink)]'}`}>{peer.name}</p>
                            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{getRoleLabel(peer.role)}</p>
                            {conversation.subject && <p className="text-[11px] text-[var(--muted-foreground)] mt-1 truncate">{conversation.subject}</p>}
                          </div>
                          {isUnread && (
                            <Badge className="bg-[var(--primary)] text-white shadow-sm">
                              {unread} unread
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-end justify-between gap-2 mt-2">
                          <p className="text-sm text-[var(--muted-foreground)] truncate">{conversation.last_message_preview || 'No messages yet'}</p>
                          {conversation.last_message_at && (
                            <p className="text-[11px] text-[var(--muted-foreground)] whitespace-nowrap">
                              {new Date(conversation.last_message_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} {new Date(conversation.last_message_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </>
      ) : renderThread()}

    </div>
  );
}

