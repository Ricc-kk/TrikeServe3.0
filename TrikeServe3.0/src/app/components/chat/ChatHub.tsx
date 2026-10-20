import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import { ArrowLeft, ArrowLeftRight, ArrowRight, Camera, ChevronRight, Flag, ImagePlus, MessageCircle, MessagesSquare, MoreVertical, Send, Trash2, X } from 'lucide-react';
import { Button } from '../ui/button';
import FloatingChatHead from '../ui/FloatingChatHead';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import BottomNav from '../ui/BottomNav';
import { useAuth } from '../../contexts/AuthContext';
import { useChatHeadVisibility } from '../../contexts/ChatHeadVisibilityContext';
import { supabaseHelpers } from '../../../lib/supabase';
import { buildChatThreadKey, getPeerAvatar, getPeerName, getRoleLabel, ChatContextType, ChatRole } from '../../../lib/chat';

interface ChatHubProps {
  title: string;
  /**
   * Where the back arrow goes from the conversation list.
   *
   * The role's home screen -- that list is the thing you leave.
   */
  backPath: string;
  /**
   * Where the back arrow goes from inside a thread.
   *
   * The messages list, not `backPath`. A thread is reached from that list, so
   * backing out of one should return there; using `backPath` skipped the list
   * entirely and dropped the reader on the home screen, losing their place in
   * the queue. Defaults to the list it was opened from.
   */
  threadBackPath?: string;
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

/**
 * One-tap phrases a driver sends constantly during a ride.
 *
 * Kept to the things said over and over on a shared tricycle -- where you are,
 * please be ready, apologies for delay. Anything situational still gets typed.
 */
const QUICK_REPLIES = [
  "On my way",
  "Where are you exactly?",
  "Please be ready at the pickup point",
  "Running a few minutes late",
  "I'm at your pickup point",
  "You're on the tricycle, let's go",
];

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

const CHAT_IMAGE_PREFIX = 'chat-image:';

export default function ChatHub({
  title,
  backPath,
  threadBackPath,
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
  const location = useLocation();
  const { conversationId } = useParams();
  const { user } = useAuth();
  const { registerLocalHead, toggleChatOverlay } = useChatHeadVisibility();

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [messageText, setMessageText] = useState('');
  const [loading, setLoading] = useState(true);
  const [inboxQuery, setInboxQuery] = useState('');
  const driverLayout = basePath === '/rider/messages';
  const businessLayout = basePath === '/business/messages';
  const customerLayout = basePath === '/customer/messages';
  const enhancedInbox = driverLayout || businessLayout || customerLayout;
  const [activeConversation, setActiveConversation] = useState<ChatConversation | null>(null);
  const [isCreatingThread, setIsCreatingThread] = useState(false);
  const [openMenuConversationId, setOpenMenuConversationId] = useState<string | null>(null);
  const [attachmentControlsOpen, setAttachmentControlsOpen] = useState(true);
  const [isChatHeadMode, setIsChatHeadMode] = useState(false);
  const [minimizedConversation, setMinimizedConversation] = useState<ChatConversation | null>(null);
  const [chatHeadOrder, setChatHeadOrder] = useState<string[]>([]);
  const [isChatHeadReorderMode, setIsChatHeadReorderMode] = useState(false);
  const draggedChatHeadIdRef = useRef<string | null>(null);
  const suppressChatHeadClickRef = useRef(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [pendingImage, setPendingImage] = useState<{
    conversationId: string;
    file: File;
    previewUrl: string;
  } | null>(null);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [reportConversation, setReportConversation] = useState<ChatConversation | null>(null);
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [deleteConversationTarget, setDeleteConversationTarget] = useState<ChatConversation | null>(null);
  const [deleteConversationError, setDeleteConversationError] = useState('');
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLTextAreaElement>(null);
  const sendInProgressRef = useRef(false);
  const locallyDeletedConversationAtRef = useRef(new Map<string, number>());
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  const messageListRef = useRef<HTMLDivElement>(null);

  /**
   * Message whose timestamp is currently revealed.
   *
   * Only one at a time: each message has a tap target that toggles it, and
   * opening a second one closes the first so the thread does not fill with
   * clutter. Held by id because the 2.5s poll hands back new message objects,
   * so keying on the object itself would collapse the state on every refresh.
   */
  const [revealedMessageId, setRevealedMessageId] = useState<string | null>(null);
  // Whether the reader is parked on the newest message. The 2.5s refresh hands
  // back a brand new array every time, so scrolling on every `messages` change
  // pinned the view to the bottom and made older messages impossible to read.
  const atBottomRef = useRef(true);
  const lastThreadRef = useRef<string | null>(null);
  const lastMessageKeyRef = useRef<string>('');

  const isDirectMode = !!directPeerId;
  const activeConversationId = isDirectMode ? activeConversation?.id : conversationId;
  const chatHeadOrderStorageKey = user?.id ? `trikeserve_chat_head_order_${user.id}` : null;

  useEffect(() => {
    if (!chatHeadOrderStorageKey) {
      setChatHeadOrder([]);
      return;
    }

    try {
      const saved = JSON.parse(localStorage.getItem(chatHeadOrderStorageKey) || '[]');
      setChatHeadOrder(Array.isArray(saved) ? saved.filter((id): id is string => typeof id === 'string') : []);
    } catch {
      setChatHeadOrder([]);
    }
  }, [chatHeadOrderStorageKey]);

  useEffect(() => {
    setPendingImage((pending) =>
      pending?.conversationId === activeConversationId ? pending : null,
    );
  }, [activeConversationId]);

  useEffect(() => {
    const previewUrl = pendingImage?.previewUrl;
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [pendingImage?.previewUrl]);

  const recentHeadConversations = useMemo(() => {
    const rows = new Map<string, ChatConversation>();
    conversations.forEach((conversation) => rows.set(conversation.id, conversation));
    if (activeConversation) rows.set(activeConversation.id, activeConversation);
    const activityOf = (conversation: ChatConversation) =>
      new Date(conversation.last_message_at || conversation.updated_at).getTime() || 0;
    const newestByPeer = new Map<string, ChatConversation>();
    for (const conversation of [...rows.values()].sort((a, b) => activityOf(b) - activityOf(a))) {
      const peerId = conversation.participant_a_id === user?.id
        ? conversation.participant_b_id
        : conversation.participant_a_id;
      if (peerId && !newestByPeer.has(peerId)) newestByPeer.set(peerId, conversation);
    }
    return [...newestByPeer.values()].sort((a, b) => activityOf(b) - activityOf(a));
  }, [activeConversation, conversations, user?.id]);

  const orderedRecentHeadConversations = useMemo(() => {
    const conversationsById = new Map<string, ChatConversation>();
    recentHeadConversations.forEach((conversation) => conversationsById.set(conversation.id, conversation));
    const savedOrder = chatHeadOrder.flatMap((id) => {
      const conversation = conversationsById.get(id);
      return conversation ? [conversation] : [];
    });
    const savedIds = new Set(savedOrder.map((conversation) => conversation.id));
    const newConversations = recentHeadConversations.filter((conversation) => !savedIds.has(conversation.id));

    // An unpinned conversation appears to the right of older heads by recency.
    // Once the user reorders the row, their saved order takes precedence.
    return [...newConversations, ...savedOrder];
  }, [chatHeadOrder, recentHeadConversations]);

  const saveChatHeadOrder = (nextOrder: string[]) => {
    setChatHeadOrder(nextOrder);
    if (!chatHeadOrderStorageKey) return;
    try {
      localStorage.setItem(chatHeadOrderStorageKey, JSON.stringify(nextOrder));
    } catch {
      // Reordering still works for this visit if storage is unavailable.
    }
  };

  const reorderChatHead = (draggedId: string, targetId: string, targetSide: 'left' | 'right' = 'left') => {
    if (draggedId === targetId) return;
    const nextOrder = orderedRecentHeadConversations.map((conversation) => conversation.id);
    const from = nextOrder.indexOf(draggedId);
    if (from < 0 || !nextOrder.includes(targetId)) return;
    const [movedId] = nextOrder.splice(from, 1);
    if (!movedId) return;
    const targetIndex = nextOrder.indexOf(targetId);
    // The row is visually reversed: an item to the target's left follows it
    // in this array, while an item to its right comes before it.
    nextOrder.splice(targetIndex + (targetSide === 'left' ? 1 : 0), 0, movedId);
    saveChatHeadOrder(nextOrder);
  };

  const moveChatHeadByOne = (conversationId: string, direction: 'left' | 'right') => {
    const nextOrder = orderedRecentHeadConversations.map((conversation) => conversation.id);
    const index = nextOrder.indexOf(conversationId);
    const targetIndex = index + (direction === 'left' ? 1 : -1);
    if (index < 0 || targetIndex < 0 || targetIndex >= nextOrder.length) return;
    [nextOrder[index], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[index]];
    saveChatHeadOrder(nextOrder);
  };

  useEffect(() => {
    if (!activeConversationId || isChatHeadMode) return;
    return registerLocalHead(activeConversationId);
  }, [activeConversationId, isChatHeadMode, registerLocalHead]);

  /**
   * The in-thread back arrow.
   *
   * A thread opened from the messages list returns there, not to the home
   * screen. In direct mode there is no list to return to, so the caller's
   * `backPath` is the only sensible target.
   */
  /**
   * Where the in-thread back arrow goes.
   *
   * A thread opened from a live ride returns to that ride, not to the messages
   * list: the driver is mid-journey, and the list is somewhere they did not mean
   * to be. `fromActiveRide` is set by the ride screen when it hands off here, so
   * a thread reached any other way still backs out to the list as before.
   */
  /**
   * Where the in-thread back arrow, and the floating head, go.
   *
   * A thread opened from a live ride returns to that ride. The target comes from
   * the ride screen in `location.state`, never derived from `basePath`:
   * deriving it produced `/customer/active-ride`, which is not a route -- the
   * customer tracks a ride on their home screen while the driver has a dedicated
   * one -- so tapping back landed on a 404.
   */
  const threadBack = isDirectMode
    ? backPath
    : ((location.state as any)?.rideBackTo as string) ?? (threadBackPath ?? basePath);

  const loadInbox = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabaseHelpers.getChatConversations(user.id);
      if (error) {
        console.error('[ChatHub] Error loading conversations:', error);
        setConversations([]);
        return;
      }
      /**
       * One card per person, newest thread wins.
       *
       * Older rows may still exist from when thread keys were scoped to a ride
       * or order. Keep those histories collapsed into the newest thread per
       * peer, and sum unread counts from the older rows so a legacy message is
       * never hidden.
       */
      const unreadOf = (c: any) =>
        c.participant_a_id === user.id ? c.unread_count_a || 0 : c.unread_count_b || 0;
      const peerOf = (c: any) =>
        c.participant_a_id === user.id ? c.participant_b_id : c.participant_a_id;

      const newestByPeer = new Map<string, any>();
      const visibleRows = ([...(data || [])] as any[]).filter(conversation => {
        const deletedAt = locallyDeletedConversationAtRef.current.get(conversation.id);
        if (deletedAt === undefined) return true;

        // A new message revives the thread; stale inbox responses do not.
        const lastMessageAt = conversation.last_message_at
          ? new Date(conversation.last_message_at).getTime()
          : 0;
        if (lastMessageAt > deletedAt) {
          locallyDeletedConversationAtRef.current.delete(conversation.id);
          return true;
        }
        return false;
      });
      for (const c of visibleRows) {
        const peer = peerOf(c);
        const held = newestByPeer.get(peer);
        if (
          !held ||
          new Date(c.updated_at).getTime() > new Date(held.updated_at).getTime()
        ) {
          newestByPeer.set(peer, held ? { ...c, unread_count_a: c.unread_count_a, unread_count_b: c.unread_count_b } : c);
          // Carry the unread total forward from the thread this one replaces.
          if (held) {
            const merged = newestByPeer.get(peer);
            merged._collapsedUnread =
              (held._collapsedUnread ?? unreadOf(held)) + unreadOf(c);
          }
        } else {
          held._collapsedUnread = (held._collapsedUnread ?? unreadOf(held)) + unreadOf(c);
        }
      }

      const collapsed = [...newestByPeer.values()];

      // Unread threads float to the top, most recently active first within each
      // group. Sorted here rather than in SQL because the unread count lives in two
      // columns (`unread_count_a` / `unread_count_b`) depending on which side
      // this user is, which PostgREST cannot filter on without knowing the side.
      const sorted = collapsed.sort((a: any, b: any) => {
        const countOf = (c: any) => c._collapsedUnread ?? unreadOf(c);
        const aUnread = countOf(a) > 0;
        const bUnread = countOf(b) > 0;
        if (aUnread !== bUnread) return aUnread ? -1 : 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
      setConversations(sorted as ChatConversation[]);
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

  const handleMessageScroll = () => {
    const el = messageListRef.current;
    if (!el) return;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  useEffect(() => {
    const el = messageListRef.current;
    if (!el) return;

    const threadChanged = lastThreadRef.current !== (activeConversationId ?? null);
    if (threadChanged) {
      lastThreadRef.current = activeConversationId ?? null;
      atBottomRef.current = true;
    }

    const key = messages.length
      ? `${messages.length}:${messages[messages.length - 1]?.id ?? ''}`
      : '0';
    const grew = key !== lastMessageKeyRef.current;
    lastMessageKeyRef.current = key;

    // A thread always opens on its newest message, and after that we only follow
    // when the reader has not scrolled away to read something older.
    if (threadChanged || (grew && atBottomRef.current)) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, activeConversationId]);



  /**
 * Renders a conversation avatar.
 *
 * Older conversation rows may store an emoji placeholder when someone has no
 * profile photo. Show the person's initial in that case, and use the photo only
 * when the stored value is a URL.
 */
function PeerAvatar({
  value,
  name,
  className,
}: {
  value: string | null | undefined;
  name: string;
  className?: string;
}) {
  const src = value?.trim() || "";
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const isImage = (/^https?:\/\//i.test(src) || src.startsWith("data:image/")) && failedSrc !== src;
  if (isImage) {
    return (
      <img
        src={src}
        alt=""
        className={`size-full object-cover ${className || ""}`}
        onError={() => setFailedSrc(src)}
      />
    );
  }

  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() || "U";
  return <span className={`${className || ""} font-semibold`}>{initial}</span>;
}

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
    setMinimizedConversation(null);
    setIsChatHeadMode(false);
    setActiveConversation(conversation);
    await loadMessages(conversation.id);
    navigate(`${basePath}/thread/${conversation.id}`);
  };

  /** Sends the composer text and staged image, or a quick-reply override. */
  const sendMessage = async (override?: string) => {
    /*
     * Only a string override is a message.
     *
     * The send button used to be wired as `onClick={sendMessage}`, so the click
     * event arrived here as `override`. `??` treats the (truthy) event object as
     * the text, `.trim()` then throws "is not a function", and the send is
     * swallowed -- tapping Send could never deliver a message, while the Enter
     * key (which calls `sendMessage()` with no argument) worked. Typing is fixed
     * at the call site; reading the override defensively means a future caller
     * passing anything non-string falls back to the composer text instead of
     * silently failing.
     */
    const text = (typeof override === 'string' ? override : messageText).trim();
    if (!user?.id || !activeConversation || sendInProgressRef.current) return;
    const imageDraft = typeof override === 'string'
      ? null
      : pendingImage?.conversationId === activeConversation.id
        ? pendingImage
        : null;
    if (!text && !imageDraft) return;

    sendInProgressRef.current = true;
    setIsSendingMessage(true);

    const isParticipantA = activeConversation.participant_a_id === user.id;
    const receiverId = isParticipantA ? activeConversation.participant_b_id : activeConversation.participant_a_id;
    const receiverRole = isParticipantA ? activeConversation.participant_b_role : activeConversation.participant_a_role;

    try {
      let imageMessage: string | null = null;
      if (imageDraft) {
        setIsUploadingImage(true);
        const { data, error } = await supabaseHelpers.uploadChatAttachment(
          activeConversation.id,
          user.id,
          imageDraft.file,
        );
        if (error || !data?.publicUrl) {
          console.error('[ChatHub] Image upload failed:', error);
          alert('Could not upload the image. Please try again.');
          return;
        }
        imageMessage = `${CHAT_IMAGE_PREFIX}${data.publicUrl}`;
      }

      if (text) {
        const { error } = await supabaseHelpers.sendChatMessage({
          conversationId: activeConversation.id,
          senderId: user.id,
          receiverId,
          senderName: user.name,
          senderRole: user.role,
          receiverRole,
          message: text,
        });

        if (error) {
          console.error('[ChatHub] Send message failed:', error);
          alert('Message failed to send. Please try again.');
          return;
        }

        setMessageText('');
        setAttachmentControlsOpen(true);
        if (messageInputRef.current) messageInputRef.current.style.height = '48px';
      }

      if (imageMessage && imageDraft) {
        const { error } = await supabaseHelpers.sendChatMessage({
          conversationId: activeConversation.id,
          senderId: user.id,
          receiverId,
          senderName: user.name,
          senderRole: user.role,
          receiverRole,
          message: imageMessage,
        });

        if (error) {
          console.error('[ChatHub] Image message failed:', error);
          alert('Image failed to send. It is still attached so you can try again.');
          setAttachmentControlsOpen(true);
          if (text) {
            await loadMessages(activeConversation.id);
            await loadInbox();
          }
          return;
        }

        setPendingImage((pending) =>
          pending?.previewUrl === imageDraft.previewUrl ? null : pending,
        );
        if (!text) {
          setMessageText('');
          if (messageInputRef.current) messageInputRef.current.style.height = '48px';
        }
      }

      setAttachmentControlsOpen(true);
      await loadMessages(activeConversation.id);
      await loadInbox();
      // Keep the business conversation one tap away as a floating chat head
      // after sending, so the owner can return to the rest of the workspace.
      if (businessLayout) openChatHead(activeConversation);
    } catch (error) {
      console.error('[ChatHub] Unexpected send failure:', error);
      alert('Message failed to send. Please try again.');
    } finally {
      sendInProgressRef.current = false;
      setIsSendingMessage(false);
      setIsUploadingImage(false);
    }
  };

  const handleImageSelected = (file?: File) => {
    if (!file || !activeConversation || !user?.id) return;
    const allowedImageTypes = new Set([
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
    ]);
    if (!allowedImageTypes.has(file.type.toLowerCase())) {
      alert('Choose a JPEG, PNG, WebP, GIF, or HEIC image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('Images must be 10 MB or smaller.');
      return;
    }

    setPendingImage({
      conversationId: activeConversation.id,
      file,
      previewUrl: URL.createObjectURL(file),
    });
  };

  const openChatHead = (conversation = activeConversation) => {
    if (!conversation) return;
    setOpenMenuConversationId(null);
    if (isDirectMode && activeConversation?.id === conversation.id) {
      setIsChatHeadMode(true);
      return;
    }
    setMinimizedConversation(conversation);
    if (activeConversationId === conversation.id) navigate(basePath);
  };

  const requestDeleteConversation = (conversation: ChatConversation) => {
    setOpenMenuConversationId(null);
    setDeleteConversationError('');
    setDeleteConversationTarget(conversation);
  };

  const deleteConversation = async () => {
    const conversation = deleteConversationTarget;
    if (!conversation || !user?.id || isDeletingConversation) return;

    setIsDeletingConversation(true);
    try {
      const deletedAt = Date.now();
      const { error } = await supabaseHelpers.deleteChatConversationForUser(conversation.id, user.id);
      if (error) {
        console.error('[ChatHub] Conversation delete failed:', error);
        setDeleteConversationError('Could not delete this conversation. Please try again.');
        return;
      }

      locallyDeletedConversationAtRef.current.set(conversation.id, deletedAt);
      setDeleteConversationTarget(null);
      setConversations(current => current.filter(item => item.id !== conversation.id));
      const wasOpenThread = activeConversationId === conversation.id;
      if (wasOpenThread) {
        setActiveConversation(null);
        setMessages([]);
      }
      await loadInbox();
      if (wasOpenThread) navigate(threadBack);
    } catch (error) {
      console.error('[ChatHub] Conversation delete failed:', error);
      setDeleteConversationError('Could not delete this conversation. Please try again.');
    } finally {
      setIsDeletingConversation(false);
    }
  };

  const openReport = (conversation: ChatConversation) => {
    setOpenMenuConversationId(null);
    setReportConversation(conversation);
    setReportDetails('');
    setReportDialogOpen(true);
  };

  const renderConversationActions = (conversation: ChatConversation) =>
    openMenuConversationId === conversation.id && (
      <div className="absolute right-0 top-12 z-30 min-w-52 overflow-hidden rounded-xl border border-line bg-surface py-1 text-[var(--ink)] shadow-xl">
        <button type="button" onClick={() => openChatHead(conversation)} className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm hover:bg-[var(--muted)]">
          <MessageCircle className="size-4" /> Open chat head
        </button>
        <button type="button" onClick={() => requestDeleteConversation(conversation)} className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-[var(--error)] hover:bg-[var(--error-soft)]">
          <Trash2 className="size-4" /> Delete conversation
        </button>
        <button type="button" onClick={() => openReport(conversation)} className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm hover:bg-[var(--muted)]">
          <Flag className="size-4" /> Report
        </button>
      </div>
    );

  const submitChatReport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const targetConversation = reportConversation ?? activeConversation;
    if (!targetConversation || !user?.id || !reportDetails.trim()) return;

    const isParticipantA = targetConversation.participant_a_id === user.id;
    const reportedUserId = isParticipantA
      ? targetConversation.participant_b_id
      : targetConversation.participant_a_id;
    setReportSubmitting(true);
    const { error } = await supabaseHelpers.reportChatConversation({
      conversationId: targetConversation.id,
      reporterId: user.id,
      reportedUserId,
      details: reportDetails.trim(),
    });
    setReportSubmitting(false);

    if (error) {
      console.error('[ChatHub] Chat report failed:', error);
      alert('Could not submit your report. Please try again.');
      return;
    }

    setReportDetails('');
    setReportDialogOpen(false);
    setReportConversation(null);
    alert('Your report has been submitted.');
  };

  const renderReportDialog = () => reportDialogOpen && (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/50 p-4" role="presentation">
      <form onSubmit={submitChatReport} className="w-full max-w-md space-y-4 rounded-2xl bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-[var(--ink)]">Report conversation</h3>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">Tell us what happened. This report will be recorded for review.</p>
          </div>
          <button type="button" aria-label="Close report form" onClick={() => setReportDialogOpen(false)} className="grid size-10 shrink-0 place-items-center rounded-full hover:bg-[var(--muted)]">
            <X className="size-5" />
          </button>
        </div>
        <textarea
          required
          value={reportDetails}
          onChange={event => setReportDetails(event.target.value)}
          placeholder="Describe the issue..."
          rows={4}
          className="w-full resize-y rounded-xl border border-line bg-surface p-3 text-sm text-[var(--ink)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setReportDialogOpen(false)} className="min-h-11">Cancel</Button>
          <Button type="submit" disabled={reportSubmitting || !reportDetails.trim()} className="min-h-11 bg-[var(--primary)] text-white hover:bg-[var(--primary)]">
            {reportSubmitting ? 'Submitting...' : 'Submit report'}
          </Button>
        </div>
      </form>
    </div>
  );

  const renderDeleteConversationDialog = () => deleteConversationTarget && (
    <div
      className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !isDeletingConversation) {
          setDeleteConversationTarget(null);
          setDeleteConversationError('');
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-conversation-title"
        aria-describedby="delete-conversation-description"
        className="w-full max-w-sm overflow-hidden rounded-3xl border border-line bg-surface shadow-2xl"
      >
        <div className="p-6">
            <h2 id="delete-conversation-title" className="mb-4 text-xl font-extrabold text-[var(--ink)]">Delete chat history?</h2>
          <p id="delete-conversation-description" className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
              This removes the entire conversation with {getConversationPeer(deleteConversationTarget).name}. The other person will still have their copy.
          </p>
          {deleteConversationError && (
            <p role="alert" className="mt-3 rounded-xl bg-[var(--error-soft)] px-3 py-2 text-sm font-medium text-[var(--error)]">
              {deleteConversationError}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line bg-[var(--muted)]/50 px-5 py-4">
          <Button
            type="button"
            variant="ghost"
            disabled={isDeletingConversation}
            onClick={() => { setDeleteConversationTarget(null); setDeleteConversationError(''); }}
            className="min-h-11 rounded-xl px-4"
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={isDeletingConversation}
            onClick={() => void deleteConversation()}
            className="min-h-11 rounded-xl bg-[var(--error)] px-4 font-bold text-white hover:opacity-90"
          >
              {isDeletingConversation ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  );

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
    const activeHeadIndex = orderedRecentHeadConversations.findIndex((conversation) => conversation.id === activeConversation.id);

    /**
     * Quick replies only make sense in a ride thread.
     *
     * Checked against the conversation's own type rather than its subject text,
     * so a ride whose subject happens to read like an order still qualifies.
     */
    const isRideThread =
      activeConversation.context_type === 'ride' ||
      activeConversation.thread_type === 'ride';

    if (isChatHeadMode) {
      return (
        <div className="relative flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
          <FloatingChatHead
            headId={activeConversation?.id}
            storageKey={`trikeserve_chat_head_pos_${user.role}`}
            peerAvatar={peer.avatar}
            peerLabel={peer.name}
            unread={0}
            pulseKey={0}
            onOpen={() => activeConversation && toggleChatOverlay(activeConversation.id)}
          />
          <p className="text-sm text-[var(--muted-foreground)]">Chat minimized. Tap the chat head to reopen.</p>
        </div>
      );
    }

    return (
      <div className={`flex-1 flex flex-col min-h-0 ${driverLayout || customerLayout ? 'mx-auto w-full max-w-5xl border-x border-line' : ''}`}>
        {/*
            Clearance strip above the thread header.

            Only when the chat was opened from a live ride, where the floating chat
            head is pinned to the top-right. Sized to the head itself (56px) rather
            than a generous band: at 64px plus a solid fill it read as a heavy bar
            across the top of the chat rather than space for a control, and it
            pushed the whole conversation down.

            Transparent, so it reads as "nothing here" rather than as a surface.
        */}
        <div
          role="group"
          aria-label="Chat heads, newest on the right. Drag to reorder, or use Arrange chat heads to move the open chat."
          className="flex h-14 w-full shrink-0 flex-row-reverse items-center justify-start gap-1 overflow-x-auto overflow-y-hidden px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <div className="flex shrink-0 flex-row-reverse items-center gap-1">
            <button
              type="button"
              title="All messages"
              aria-label="Open all messages"
              onClick={() => navigate(basePath)}
              className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--primary)] shadow-sm transition-colors hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]"
            >
              <MessagesSquare className="size-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              title={isChatHeadReorderMode ? 'Done arranging chat heads' : 'Arrange chat heads'}
              aria-label={isChatHeadReorderMode ? 'Done arranging chat heads' : 'Arrange chat heads'}
              aria-pressed={isChatHeadReorderMode}
              disabled={orderedRecentHeadConversations.length < 2}
              onClick={() => setIsChatHeadReorderMode((isReordering) => !isReordering)}
              className={`grid size-11 shrink-0 place-items-center rounded-full border shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40 ${isChatHeadReorderMode ? 'border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]' : 'border-[var(--border)] bg-[var(--surface)] text-[var(--muted-foreground)] hover:bg-[var(--primary-soft)]'}`}
            >
              <ArrowLeftRight className="size-5" aria-hidden="true" />
            </button>
            {isChatHeadReorderMode && (
              <>
                <button
                  type="button"
                  title={`Move ${peer.name} left`}
                  aria-label={`Move ${peer.name} left`}
                  disabled={activeHeadIndex < 0 || activeHeadIndex >= orderedRecentHeadConversations.length - 1}
                  onClick={() => moveChatHeadByOne(activeConversation.id, 'left')}
                  className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] shadow-sm transition-colors hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowLeft className="size-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  title={`Move ${peer.name} right`}
                  aria-label={`Move ${peer.name} right`}
                  disabled={activeHeadIndex <= 0}
                  onClick={() => moveChatHeadByOne(activeConversation.id, 'right')}
                  className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] shadow-sm transition-colors hover:bg-[var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ArrowRight className="size-5" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
          {orderedRecentHeadConversations.map((conversation) => {
            const peer = getConversationPeer(conversation);
            const isActive = conversation.id === activeConversation.id;
            const unread = (conversation as any)._collapsedUnread ?? (
              conversation.participant_a_id === user.id
                ? conversation.unread_count_a || 0
                : conversation.unread_count_b || 0
            );
            return (
              <button
                key={conversation.id}
                type="button"
                draggable
                data-chat-head-id={conversation.id}
                title={`${peer.name} · Drag to reorder`}
                aria-label={`Open chat with ${peer.name}${unread > 0 ? `, ${unread} unread` : ''}. Drag to reorder, press Alt and an arrow key, or use Arrange chat heads and its move buttons.`}
                aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
                aria-current={isActive ? 'page' : undefined}
                onDragStart={(event) => {
                  draggedChatHeadIdRef.current = conversation.id;
                  suppressChatHeadClickRef.current = true;
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', conversation.id);
                }}
                onDragOver={(event) => {
                  if (!draggedChatHeadIdRef.current) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const draggedId = event.dataTransfer.getData('text/plain') || draggedChatHeadIdRef.current;
                  if (draggedId) {
                    const bounds = event.currentTarget.getBoundingClientRect();
                    const targetSide = event.clientX < bounds.left + bounds.width / 2 ? 'left' : 'right';
                    reorderChatHead(draggedId, conversation.id, targetSide);
                  }
                  draggedChatHeadIdRef.current = null;
                }}
                onDragEnd={() => {
                  draggedChatHeadIdRef.current = null;
                  window.setTimeout(() => { suppressChatHeadClickRef.current = false; }, 0);
                }}
                onKeyDown={(event) => {
                  if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
                  event.preventDefault();
                  moveChatHeadByOne(conversation.id, event.key === 'ArrowLeft' ? 'left' : 'right');
                }}
                onClick={() => {
                  if (suppressChatHeadClickRef.current) {
                    suppressChatHeadClickRef.current = false;
                    return;
                  }
                  if (isActive) {
                    if ((location.state as any)?.fromActiveRide) navigate(threadBack);
                    return;
                  }
                  void openConversation(conversation);
                }}
                className={`relative grid size-11 shrink-0 cursor-grab place-items-center overflow-visible rounded-full border-2 bg-[var(--surface)] shadow-sm transition-transform hover:scale-105 active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] ${isActive ? 'border-[var(--primary)]' : 'border-[var(--border)]'}`}
              >
                <span className="size-full overflow-hidden rounded-full">
                  <PeerAvatar value={peer.avatar} name={peer.name} className="grid size-full place-items-center text-xl object-cover" />
                </span>
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 grid min-w-[16px] place-items-center rounded-full bg-[var(--primary)] px-1 text-[10px] font-bold text-[var(--primary-foreground)] shadow">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="relative bg-[var(--primary)] text-white px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(threadBack)}
            aria-label="Back to messages"
            className="text-white hover:bg-white/20"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          {/* Peer identity, tappable to their profile.
              Opening a chat from the active ride usually happens mid-journey, and
              "who am I about to argue with about the fare" is a reasonable thing
              to want answered right then. The whole name/photo block is the link,
              not just the avatar, because the name is what people aim at. */}
          <button
            type="button"
            onClick={() => peer.id && navigate(`/${basePath.split('/')[1]}/profile`)}
            aria-label={`View ${peer.name}'s profile`}
            className="flex flex-1 items-center gap-3 min-w-0 text-left hover:opacity-90 transition-opacity"
          >
            <div className={`w-11 h-11 overflow-hidden rounded-full border flex items-center justify-center text-2xl flex-shrink-0 ${peerTheme.avatarWrap}`}>
              <PeerAvatar value={peer.avatar} name={peer.name} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-lg truncate leading-tight">{peer.name}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {peer.role !== 'business' && <Badge className={peerTheme.roleBadge}>{getRoleLabel(peer.role)}</Badge>}
                <span className="text-xs text-white/80 truncate">{activeConversation.subject || activeConversation.context_type || 'Chat'}</span>
              </div>
            </div>
          </button>
          <div className="relative ml-auto shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Conversation options"
              aria-expanded={openMenuConversationId === activeConversation.id}
              onClick={() => setOpenMenuConversationId(open => open === activeConversation.id ? null : activeConversation.id)}
              className="text-white hover:bg-white/20"
            >
              <MoreVertical className="w-5 h-5" />
            </Button>
            {renderConversationActions(activeConversation)}
          </div>
        </div>

        <div
          ref={messageListRef}
          onScroll={handleMessageScroll}
          className="scrollbar-hide flex-1 overflow-y-auto p-4 space-y-3 bg-[var(--muted)]"
        >
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="w-12 h-12 text-[var(--border)] mx-auto mb-3" />
              <p className="text-[var(--muted-foreground)] text-sm">No messages yet</p>
              <p className="text-[var(--muted-foreground)] text-xs mt-1">Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg, index) => {
              const isMine = msg.sender_id === user.id;
              const messageDate = new Date(msg.created_at);
              const isRevealed = revealedMessageId === msg.id;

              /**
               * Day label for the chat, shown above a run of messages.
               *
               * No year, per the brief: a conversation thread is read over days,
               * not years, and the year on every message is noise. Today reads as
               * "Today", yesterday as "Yesterday", anything older as its
               * weekday, which is what people actually refer to.
               */
              const dayLabel = (() => {
                const now = new Date();
                const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
                const days = Math.round((startOf(now) - startOf(messageDate)) / 86400000);
                if (days === 0) return "Today";
                if (days === 1) return "Yesterday";
                return messageDate.toLocaleDateString([], { weekday: "short" });
              })();

              // A divider goes above the first message of each day, so the day is
              // stated once rather than repeated on every message.
              const previous = index > 0 ? messages[index - 1] : null;
              const previousDay = previous
                ? new Date(previous.created_at).toDateString()
                : null;
              const startsNewDay = previousDay !== messageDate.toDateString();

              // Time only, no date and no year: the day is already carried by the
              // divider above, so repeating it on every message is what made the
              // thread look cluttered.
              const timeString = messageDate.toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              });
              const imageUrl = msg.message.startsWith(CHAT_IMAGE_PREFIX)
                ? msg.message.slice(CHAT_IMAGE_PREFIX.length)
                : null;

              return (
                <div key={msg.id}>
                  {startsNewDay && (
                    <div className="sticky top-1 z-[1] flex justify-center py-2">
                      <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-[11px] font-bold text-[var(--muted-foreground)] shadow-sm border border-[var(--border)]">
                        {dayLabel}
                      </span>
                    </div>
                  )}

                  <div
                    className={`flex items-start gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
                  >
                    {/* Only the person you are talking to is identified. Your own
                        photo beside your own messages says nothing -- you know
                        which side of the screen is yours -- and it crowds the
                        thread. `items-start` puts the avatar level with the top
                        of the bubble rather than its baseline. */}
                    {!isMine && (
                      <div
                        className={`mt-1 size-8 flex-shrink-0 overflow-hidden rounded-full border ${peerTheme.avatarWrap}`}
                      >
                        <PeerAvatar value={peer.avatar} name={peer.name} />
                      </div>
                    )}

                    <div
                      className={`flex max-w-[75%] flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedMessageId((current) =>
                            current === msg.id ? null : msg.id
                          )
                        }
                        aria-expanded={isRevealed}
                        aria-label={
                          isRevealed
                            ? `Hide when ${timeString} was sent`
                            : `Show when this was sent`
                        }
                        className={`max-w-full rounded-2xl px-4 py-2 text-left transition-opacity active:opacity-80 ${
                          isMine
                            ? "bg-[var(--primary)] text-white"
                            : "bg-surface border border-[var(--border)]"
                        }`}
                      >
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt="Image sent in chat"
                            className="max-h-72 max-w-full rounded-xl object-contain"
                            loading="lazy"
                          />
                        ) : (
                          <span className="block text-sm break-words">{msg.message}</span>
                        )}
                      </button>

                      {/* Receipt and timestamp live outside the bubble, beneath it,
                          so the message itself is not padded around metadata it
                          does not need. The timestamp only appears once the
                          message is tapped; `read` is set by the reader's own
                          thread via markChatConversationRead, so it reflects that
                          they actually opened it. */}
                      <p
                        className={`mt-1 px-1 text-[10px] font-semibold ${
                          isMine ? "text-[var(--muted-foreground)]" : "text-[var(--muted-foreground)]"
                        }`}
                      >
                        {isMine && <span>{msg.read ? "Read" : "Sent"}</span>}
                        {isMine && isRevealed && <span className="mx-1">·</span>}
                        {isRevealed && <span>{timeString}</span>}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="bg-surface border-t border-[var(--border)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sticky bottom-0">
          {/* Quick replies. See QUICK_REPLIES for why these are driver-only
              ride-thread phrases and why a tap sends immediately. */}
          {user.role === "rider" && isRideThread && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_REPLIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => sendMessage(q)}
                  disabled={isSendingMessage}
                  className="min-h-11 rounded-xl border border-[var(--primary)] px-3 py-1.5 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)] active:scale-95 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          )}
          {pendingImage?.conversationId === activeConversation.id && (
            <div className="mb-3 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--muted)] p-2">
              <img
                src={pendingImage.previewUrl}
                alt="Selected image preview"
                className="size-14 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  {isUploadingImage ? 'Uploading image…' : isSendingMessage ? 'Sending image…' : 'Image ready to send'}
                </p>
                <p className="truncate text-xs text-[var(--muted-foreground)]">{pendingImage.file.name}</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Remove selected image"
                disabled={isSendingMessage}
                onClick={() => setPendingImage((current) =>
                  current?.previewUrl === pendingImage.previewUrl ? null : current,
                )}
                className="size-10 shrink-0 rounded-xl text-[var(--muted-foreground)] hover:bg-[var(--surface)]"
              >
                <X className="size-4" />
              </Button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              aria-label="Choose image to send"
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                void handleImageSelected(file);
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
              capture="environment"
              className="hidden"
              aria-label="Take a photo to send"
              onChange={event => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = '';
                void handleImageSelected(file);
              }}
            />
            {attachmentControlsOpen ? (
              <div className="flex shrink-0 items-end gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Upload image"
                  title="Upload image"
                  disabled={isUploadingImage || isSendingMessage}
                  onClick={() => imageInputRef.current?.click()}
                  className="min-h-12 min-w-11 rounded-xl text-[var(--primary)] hover:bg-[var(--primary-soft)]"
                >
                  <ImagePlus className="size-5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Take photo"
                  title="Take photo"
                  disabled={isUploadingImage || isSendingMessage}
                  onClick={() => cameraInputRef.current?.click()}
                  className="min-h-12 min-w-11 rounded-xl text-[var(--primary)] hover:bg-[var(--primary-soft)]"
                >
                  <Camera className="size-5" />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Show image and camera options"
                title="Show image and camera options"
                onClick={() => setAttachmentControlsOpen(true)}
                className="min-h-12 min-w-10 shrink-0 rounded-xl text-[var(--primary)] hover:bg-[var(--primary-soft)]"
              >
                <ChevronRight className="size-5" />
              </Button>
            )}
            <textarea
              ref={messageInputRef}
              value={messageText}
              onChange={(e) => {
                const nextText = e.target.value;
                setMessageText(nextText);
                setAttachmentControlsOpen(nextText.length === 0);
                e.currentTarget.style.height = '48px';
                e.currentTarget.style.height = `${Math.min(e.currentTarget.scrollHeight, 144)}px`;
              }}
              placeholder={
                isUploadingImage
                  ? 'Uploading image...'
                  : pendingImage?.conversationId === activeConversation.id
                    ? 'Add a caption (optional)...'
                    : 'Type your message...'
              }
              rows={1}
              disabled={isSendingMessage}
              aria-label="Message" className="scrollbar-hide min-h-12 max-h-36 min-w-0 flex-1 overflow-y-auto px-4 py-3 border border-[var(--border)] rounded-xl focus:outline-none focus:ring-2 focus:ring-[var(--primary)] focus:border-transparent resize-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            {/* Wrapped, not passed directly: `onClick={sendMessage}` handed the
                click event in as the message text. See sendMessage. */}
            <Button
              aria-label="Send message"
              onClick={() => sendMessage()}
              disabled={
                (!messageText.trim() && pendingImage?.conversationId !== activeConversation.id) ||
                isUploadingImage ||
                isSendingMessage
              }
              className="min-h-12 shrink-0 rounded-xl bg-[var(--primary)] hover:bg-[var(--primary)] px-4"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  if (isDirectMode) {
    return (
      <div className={`${driverLayout || customerLayout ? 'h-dvh overflow-hidden' : businessLayout ? 'h-[calc(100dvh-4.5rem)] overflow-hidden' : 'min-h-screen'} bg-[var(--muted)] flex flex-col`}>
        {renderThread()}
        {renderReportDialog()}
        {renderDeleteConversationDialog()}
      </div>
    );
  }

  return (
    <div className={`${driverLayout || customerLayout ? 'h-dvh overflow-hidden' : businessLayout ? 'h-[calc(100dvh-4.5rem)] overflow-hidden' : 'min-h-screen'} bg-[var(--muted)] flex flex-col`}>
      {!activeConversationId ? (
        <>
          <div className="bg-card border-b border-line px-4 py-3 sm:px-6 flex items-center gap-3 sticky top-0 z-10">

            <Button variant="ghost" size="icon" aria-label="Back to home" className="size-11 shrink-0 rounded-xl" onClick={() => navigate(backPath)}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl font-extrabold text-[var(--primary)]" style={{ letterSpacing: '-0.02em' }}>{title}</h1>
              <p className="text-xs text-[var(--muted-foreground)]">{customerLayout ? 'Your rides, deliveries, and conversations' : 'Message customers, drivers, and business owners'}</p>
            </div>

          </div>

          <main className={`flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 ${enhancedInbox ? 'mx-auto w-full max-w-5xl space-y-4' : 'space-y-3'} ${customerLayout ? 'pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-8' : ''}`}>
            <label className="block rounded-2xl border border-line bg-surface px-4 focus-within:ring-2 focus-within:ring-[var(--primary)]">
              <span className="sr-only">Search conversations</span>
              <input
                type="search"
                value={inboxQuery}
                onChange={event => setInboxQuery(event.target.value)}
                placeholder="Search a name or conversation…"
                className="min-h-12 w-full bg-transparent text-base text-[var(--ink)] placeholder:text-[var(--muted-foreground)] focus-visible:outline-none"
              />
            </label>
            {loading ? (
              <div className="text-center py-12 text-sm text-[var(--muted-foreground)]">Loading conversations...</div>
            ) : conversations.length === 0 ? (
              <div className="rounded-3xl border border-line bg-surface px-5 py-12 text-center">
                <MessageCircle className="w-12 h-12 text-[var(--border)] mx-auto mb-3" />
                <h3 className="font-bold text-[var(--ink)] mb-1">No conversations yet</h3>
                <p className="text-sm text-[var(--muted-foreground)]">Start a conversation from an order or ride.</p>
              </div>
            ) : (
              conversations.filter(conversation => `${getConversationPeer(conversation).name} ${conversation.subject || ''} ${conversation.last_message_preview || ''}`.toLowerCase().includes(inboxQuery.trim().toLowerCase())).map((conversation) => {
                const peer = getConversationPeer(conversation);
                const peerTheme = getRoleTheme(peer.role);
                // `_collapsedUnread` carries the total from every thread this card
                // stands in for, so merging duplicates never hides a message.
                const unread =
                  (conversation as any)._collapsedUnread ??
                  (conversation.participant_a_id === user.id
                    ? conversation.unread_count_a
                    : conversation.unread_count_b);
                const isUnread = unread > 0;

                return (
                  <Card
                    key={conversation.id}
                    className={`min-w-0 gap-0 rounded-2xl p-4 sm:p-5 bg-surface border transition-colors ${isUnread ? 'border-[var(--primary)] bg-[var(--muted)] shadow-sm' : 'border-[var(--border)] hover:border-[var(--primary)]'}`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        aria-label={`Open conversation with ${peer.name}`}
                        onClick={() => void openConversation(conversation)}
                        className="flex min-w-0 flex-1 items-start gap-3 text-left"
                      >
                        {/* `overflow-hidden` keeps the photo clipped into its circle. */}
                        <div className={`relative w-12 h-12 overflow-hidden rounded-full border flex items-center justify-center text-2xl flex-shrink-0 shadow-sm ${peerTheme.avatarWrap}`}>
                          <PeerAvatar value={peer.avatar} name={peer.name} />
                          {isUnread && (
                            <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${peerTheme.unreadDot} animate-pulse`} />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
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
                          <div className={`min-w-0 flex gap-2 mt-2 ${enhancedInbox ? 'flex-col items-start sm:flex-row sm:items-end sm:justify-between' : 'items-end justify-between'}`}>
                            <p className="min-w-0 max-w-full text-sm text-[var(--muted-foreground)] truncate">{conversation.last_message_preview || 'No messages yet'}</p>
                            {conversation.last_message_at && (
                              <p className="text-[11px] text-[var(--muted-foreground)] whitespace-nowrap">
                                {new Date(conversation.last_message_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} {new Date(conversation.last_message_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                      <div className="relative shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Options for ${peer.name}`}
                          aria-expanded={openMenuConversationId === conversation.id}
                          onClick={() => setOpenMenuConversationId(open => open === conversation.id ? null : conversation.id)}
                          className="-mr-2 -mt-2 size-10 rounded-xl text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
                        >
                          <MoreVertical className="size-5" />
                        </Button>
                        {renderConversationActions(conversation)}
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
            {inboxQuery.trim() && conversations.length > 0 && !conversations.some(conversation => `${getConversationPeer(conversation).name} ${conversation.subject || ''} ${conversation.last_message_preview || ''}`.toLowerCase().includes(inboxQuery.trim().toLowerCase())) && <div role="status" className="rounded-3xl border border-line bg-card p-6 text-center"><p className="font-bold text-[var(--ink)]">No matching conversations</p><button type="button" onClick={() => setInboxQuery('')} className="mt-3 min-h-11 rounded-xl px-4 text-sm font-bold text-[var(--teal)]">Clear search</button></div>}
          </main>
        </>
      ) : renderThread()}
      {renderReportDialog()}
      {renderDeleteConversationDialog()}
      {minimizedConversation && !activeConversationId && (() => {
        const peer = getConversationPeer(minimizedConversation);
        return (
          <FloatingChatHead
            headId={minimizedConversation.id}
            storageKey={`trikeserve_chat_head_pos_${user.role}`}
            peerAvatar={peer.avatar}
            peerLabel={peer.name}
            unread={0}
            pulseKey={0}
            onOpen={() => toggleChatOverlay(minimizedConversation.id)}
          />
        );
      })()}
      {customerLayout && !activeConversationId && <BottomNav active="messages" />}
    </div>
  );
}

