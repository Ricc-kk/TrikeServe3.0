export type ChatRole = 'customer' | 'rider' | 'business' | 'admin';
export type ChatContextType = 'direct' | 'ride' | 'order' | 'support' | 'general';

export interface ChatUserRef {
  id: string;
  name?: string;
  role?: ChatRole;
  avatar?: string;
}

export interface ChatThreadKeyInput {
  participantAId: string;
  participantBId: string;
  contextType?: ChatContextType;
  contextId?: string | null;
}

export function sortChatParticipants(aId: string, bId: string) {
  return [aId.toLowerCase(), bId.toLowerCase()].sort();
}

/**
 * There is one persistent direct conversation per pair of users. Ride/order
 * context remains metadata on the conversation; it must not create another
 * thread for the same two people.
 */
export function buildChatThreadKey({ participantAId, participantBId }: ChatThreadKeyInput) {
  const [first, second] = sortChatParticipants(participantAId, participantBId);
  return `direct:${first}:${second}`;
}

export function getPeerName(currentUserId: string, a: ChatUserRef | null, b: ChatUserRef | null) {
  if (!a && !b) return 'Conversation';
  if (!a) return b?.name || 'Conversation';
  if (!b) return a?.name || 'Conversation';
  return a.id === currentUserId ? (b.name || 'Conversation') : (a.name || 'Conversation');
}

export function getPeerAvatar(currentUserId: string, a: ChatUserRef | null, b: ChatUserRef | null) {
  if (!a && !b) return '💬';
  if (!a) return b?.avatar || '💬';
  if (!b) return a?.avatar || '💬';
  return a.id === currentUserId ? (b.avatar || '💬') : (a.avatar || '💬');
}

export function getRoleLabel(role?: string) {
  switch (role) {
    case 'customer': return 'Customer';
    case 'rider': return 'Driver';
    case 'business': return 'Business Owner';
    case 'admin': return 'Admin';
    default: return 'User';
  }
}

