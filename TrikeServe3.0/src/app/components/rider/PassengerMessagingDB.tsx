import { useEffect, useMemo, useRef, useState } from "react";
import { X, Send, MessageCircle } from "lucide-react";
import { Button } from "../ui/button";
import { useAuth } from "../../contexts/AuthContext";
import { supabaseHelpers } from "@/lib/supabase";
import { buildChatThreadKey } from "../../../lib/chat";

interface Message {
  id: string;
  sender_id: string;
  sender_name: string;
  sender_role: string;
  receiver_id: string;
  receiver_role: string;
  message: string;
  read: boolean;
  created_at: string;
}

interface PassengerMessagingProps {
  passengerId: string;
  passengerName: string;
  passengerEmoji: string;
  rideId: string;
  onClose: () => void;
}

export default function PassengerMessagingDB({ passengerId, passengerName, passengerEmoji, rideId, onClose }: PassengerMessagingProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const threadKey = useMemo(() => {
    if (!user?.id) return '';
    return buildChatThreadKey({ participantAId: user.id, participantBId: passengerId, contextType: 'ride', contextId: rideId });
  }, [user?.id, passengerId, rideId]);

  useEffect(() => {
    const setupConversation = async () => {
      if (!user?.id || !threadKey) return;

      const { data, error } = await supabaseHelpers.ensureChatConversation({
        threadKey,
        threadType: 'ride',
        contextType: 'ride',
        contextId: rideId,
        participantAId: user.id,
        participantBId: passengerId,
        participantARole: user.role,
        participantBRole: 'customer',
        participantAName: user.name,
        participantBName: passengerName,
        participantAAvatar: user.name?.[0]?.toUpperCase() || '🚲',
        participantBAvatar: passengerEmoji,
        subject: `Ride ${rideId.substring(0, 8)}`,
      });

      if (error || !data) {
        console.error('[PassengerMessagingDB] Failed to create conversation:', error);
        return;
      }

      setConversationId(data.id);
    };

    setupConversation();
  }, [user?.id, passengerId, passengerName, passengerEmoji, rideId, threadKey]);

  useEffect(() => {
    if (!conversationId) return;

    const loadMessages = async () => {
      const { data, error } = await supabaseHelpers.getChatMessages(conversationId);
      if (!error) {
        setMessages((data || []) as Message[]);
        if (user?.id) await supabaseHelpers.markChatConversationRead(conversationId, user.id);
      }
    };

    loadMessages();

    const interval = setInterval(loadMessages, 2000);
    const unsubscribe = supabaseHelpers.subscribeToChatConversation(conversationId, loadMessages);

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [conversationId, user?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!user?.id || !newMessage.trim() || !conversationId) return;

    const { error } = await supabaseHelpers.sendChatMessage({
      conversationId,
      senderId: user.id,
      receiverId: passengerId,
      senderName: user.name,
      senderRole: user.role,
      receiverRole: 'customer',
      message: newMessage.trim(),
    });

    if (error) {
      alert('Failed to send message. Please try again.');
      return;
    }

    setNewMessage('');
    const { data } = await supabaseHelpers.getChatMessages(conversationId);
    setMessages((data || []) as Message[]);
  };

  if (!user) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center md:justify-center">
      <div className="bg-white w-full md:w-[500px] md:rounded-2xl rounded-t-3xl max-h-[90vh] flex flex-col">
        <div className="bg-[#E11D48] text-white px-4 py-4 flex items-center justify-between rounded-t-3xl md:rounded-t-2xl">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{passengerEmoji}</span>
            <div>
              <h3 className="font-bold text-lg">{passengerName}</h3>
              <p className="text-xs text-white/80">Ride Chat</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F8F9FA]">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No messages yet</p>
              <p className="text-gray-400 text-xs mt-1">Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_id === user.id;
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${isMine ? 'bg-[#E11D48] text-white' : 'bg-white border border-gray-200'}`}>
                    <p className="text-sm break-words">{msg.message}</p>
                    <p className={`text-[10px] mt-1 ${isMine ? 'text-white/70' : 'text-gray-400'}`}>
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="p-4 bg-white border-t border-gray-200">
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type a message..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E11D48] focus:border-transparent"
            />
            <Button onClick={sendMessage} disabled={!newMessage.trim()} className="bg-[#E11D48] hover:bg-[#BE123C] px-6">
              <Send className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

