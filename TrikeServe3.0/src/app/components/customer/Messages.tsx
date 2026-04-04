import { Trash2, Home as HomeIcon, Calendar, MessageCircle, User, Navigation, Search, ShoppingCart, ClipboardList, ArrowLeft, Clock, Send, X } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Card } from "../ui/card";
import { useState, useEffect } from "react";
import { useCart } from "../../contexts/CartContext";
import { useAuth } from "../../contexts/AuthContext";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderType: 'driver' | 'passenger';
  message: string;
  timestamp: number;
  read: boolean;
}

interface Conversation {
  rideId: string;
  passengerId: string;
  driverName: string;
  lastMessage: string;
  lastMessageTime: number;
  unreadCount: number;
}

export default function Messages() {
  const navigate = useNavigate();
  const { getTotalItems } = useCart();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    loadConversations();

    // Poll for updates every 2 seconds
    const interval = setInterval(loadConversations, 2000);

    // Listen for storage events (cross-tab sync)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith('chat_')) {
        loadConversations();
        if (activeChat) {
          loadChatMessages(activeChat.rideId, activeChat.passengerId);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [activeChat]);

  const loadConversations = () => {
    const allConversations: Conversation[] = [];
    
    // Scan localStorage for all chat keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('chat_')) {
        try {
          const messages = JSON.parse(localStorage.getItem(key) || '[]');
          if (messages.length > 0) {
            // Extract rideId and passengerId from key: chat_${rideId}_${passengerId}
            const parts = key.replace('chat_', '').split('_');
            const rideId = parts[0];
            const passengerId = parts.slice(1).join('_');

            // Only show conversations where the customer is the MAIN passenger (not companions)
            // Companions (like user_123_companion_1) should not have their own conversations
            if (passengerId === user?.id && !passengerId.includes('_companion_')) {
              // Get driver info from active ride or ride history
              const driverInfo = getDriverInfo(rideId);
              
              if (driverInfo) {
                const lastMessage = messages[messages.length - 1];
                const unreadCount = messages.filter((m: any) => 
                  m.senderType === 'driver' && !m.read
                ).length;

                allConversations.push({
                  rideId,
                  passengerId,
                  driverName: driverInfo.name,
                  lastMessage: lastMessage.message,
                  lastMessageTime: lastMessage.timestamp,
                  unreadCount
                });
              }
            }
          }
        } catch (error) {
          console.error('Error loading conversation:', error);
        }
      }
    }

    // Sort by most recent message
    allConversations.sort((a, b) => b.lastMessageTime - a.lastMessageTime);
    setConversations(allConversations);
  };

  const getDriverInfo = (rideId: string) => {
    // Check active ride
    const activeRideData = localStorage.getItem('trikeserve_active_ride');
    if (activeRideData) {
      try {
        const activeRide = JSON.parse(activeRideData);
        if (activeRide.id === rideId && activeRide.driverName) {
          return { name: activeRide.driverName };
        }
      } catch (error) {
        console.error('Error checking active ride:', error);
      }
    }

    // Check ride history (customer's completed rides)
    const historyKey = `ride_history_${user?.id}`;
    const historyData = localStorage.getItem(historyKey);
    if (historyData) {
      try {
        const history = JSON.parse(historyData);
        const ride = history.find((r: any) => r.id === rideId);
        if (ride && ride.driverName) {
          return { name: ride.driverName };
        }
      } catch (error) {
        console.error('Error checking ride history:', error);
      }
    }

    // Fallback
    return { name: 'Driver' };
  };

  const loadChatMessages = (rideId: string, passengerId: string) => {
    const chatKey = `chat_${rideId}_${passengerId}`;
    const savedMessages = localStorage.getItem(chatKey);
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages);
        setMessages(parsed);
        
        // Mark messages as read
        const updatedMessages = parsed.map((m: Message) => ({
          ...m,
          read: true
        }));
        localStorage.setItem(chatKey, JSON.stringify(updatedMessages));
      } catch (error) {
        console.error('Error loading messages:', error);
      }
    }
  };

  const sendMessage = () => {
    if (!newMessage.trim() || !user || !activeChat) return;

    const message: Message = {
      id: `msg_${Date.now()}_${Math.random()}`,
      senderId: user.id,
      senderName: user.name || 'Customer',
      senderType: 'passenger',
      message: newMessage.trim(),
      timestamp: Date.now(),
      read: false
    };

    const chatKey = `chat_${activeChat.rideId}_${activeChat.passengerId}`;
    const updatedMessages = [...messages, message];
    setMessages(updatedMessages);
    localStorage.setItem(chatKey, JSON.stringify(updatedMessages));

    // Trigger storage event for cross-tab sync
    window.dispatchEvent(new StorageEvent('storage', {
      key: chatKey,
      newValue: JSON.stringify(updatedMessages)
    }));

    setNewMessage('');
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) {
      return 'Just now';
    } else if (diff < 3600000) {
      const mins = Math.floor(diff / 60000);
      return `${mins}m ago`;
    } else if (diff < 86400000) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diff < 172800000) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  // If a chat is active, show the chat interface
  if (activeChat) {
    return (
      <div className="min-h-screen bg-white flex flex-col">
        {/* Chat Header */}
        <div className="bg-gradient-to-r from-[#E11D48] to-[#BE123C] px-5 py-4 sticky top-0 z-50 shadow-lg">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => {
                setActiveChat(null);
                setMessages([]);
              }}
              className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center active:scale-90 transition-all"
            >
              <ArrowLeft className="w-6 h-6 text-white" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-white">{activeChat.driverName}</h1>
              <p className="text-xs text-white/80">Driver</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="w-16 h-16 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-[#64748B]">No messages yet</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isOwnMessage = msg.senderType === 'passenger';
              return (
                <div
                  key={msg.id}
                  className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                      isOwnMessage
                        ? 'bg-[#E11D48] text-white rounded-br-sm'
                        : 'bg-[#F1F5F9] text-[#121212] rounded-bl-sm'
                    }`}
                  >
                    <p className="text-sm break-words">{msg.message}</p>
                    <p
                      className={`text-xs mt-1 ${
                        isOwnMessage ? 'text-white/70' : 'text-[#64748B]'
                      }`}
                    >
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Message Input */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] p-4">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  sendMessage();
                }
              }}
              placeholder="Type a message..."
              className="flex-1 border-2 border-[#E2E8F0] rounded-full px-4 py-2 focus:outline-none focus:border-[#E11D48]"
            />
            <button
              onClick={sendMessage}
              disabled={!newMessage.trim()}
              className="w-10 h-10 bg-[#E11D48] rounded-full flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed active:scale-90 transition-all"
            >
              <Send className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#E11D48] to-[#BE123C] px-5 py-4 sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => navigate(-1)}
            className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center active:scale-90 transition-all"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">Messages</h1>
          </div>
          <button className="w-10 h-10 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center active:scale-90 transition-all">
            <Search className="w-5 h-5 text-white" />
          </button>
        </div>
      </div>

      {/* Chats List */}
      {conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-5">
          <div className="w-24 h-24 bg-[#F1F5F9] rounded-full flex items-center justify-center mb-4">
            <MessageCircle className="w-12 h-12 text-[#94A3B8]" />
          </div>
          <h3 className="text-xl font-bold text-[#121212] mb-2">No Messages Yet</h3>
          <p className="text-sm text-[#64748B] text-center">
            Start a conversation with your riders or restaurants
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[#F1F5F9]">
          {conversations.map((chat) => (
            <div
              key={`${chat.rideId}_${chat.passengerId}`}
              className="px-5 py-4 flex items-start gap-4 hover:bg-[#F8F9FA] active:bg-[#F1F5F9] cursor-pointer transition-colors"
              onClick={() => {
                setActiveChat(chat);
                loadChatMessages(chat.rideId, chat.passengerId);
              }}
            >
              {/* Avatar */}
              <div className="w-12 h-12 bg-gradient-to-br from-[#E11D48] to-[#BE123C] rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-lg font-bold">
                  {chat.driverName.charAt(0)}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-bold text-[#121212] text-base leading-tight truncate">
                    {chat.driverName}
                  </h3>
                  <span className="text-xs text-[#94A3B8] whitespace-nowrap">
                    {formatTime(chat.lastMessageTime)}
                  </span>
                </div>
                <p className="text-sm text-[#64748B] line-clamp-1">{chat.lastMessage}</p>
              </div>

              {/* Unread Badge */}
              {chat.unreadCount > 0 && (
                <div className="w-6 h-6 bg-[#E11D48] rounded-full flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-white">{chat.unreadCount}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t-2 border-[#E2E8F0] px-4 py-3 z-50">
        <div className="max-w-6xl mx-auto grid grid-cols-5 gap-2">
          <Link to="/customer/food" className="flex flex-col items-center gap-1">
            <HomeIcon className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Home</span>
          </Link>
          <Link to="/customer/cart" className="flex flex-col items-center gap-1">
            <ShoppingCart className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Cart</span>
          </Link>
          <Link to="/customer/messages" className="flex flex-col items-center gap-1">
            <MessageCircle className="w-6 h-6 text-[#E11D48]" />
            <span className="text-xs font-semibold text-[#E11D48]">Messages</span>
          </Link>
          <Link to="/customer/activity" className="flex flex-col items-center gap-1">
            <ClipboardList className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Activity</span>
          </Link>
          <Link to="/customer/account" className="flex flex-col items-center gap-1">
            <User className="w-6 h-6 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Account</span>
          </Link>
        </div>
      </div>
    </div>
  );
}