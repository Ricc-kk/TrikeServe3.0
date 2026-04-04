import { useState, useEffect, useRef } from "react";
import { X, Send, MessageCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { useAuth } from "../../contexts/AuthContext";

interface Message {
  id: string;
  senderId: string;
  senderName: string;
  senderType: 'driver' | 'passenger';
  message: string;
  timestamp: number;
  read: boolean;
}

interface PassengerMessagingProps {
  passengerId: string;
  passengerName: string;
  passengerEmoji: string;
  rideId: string;
  onClose: () => void;
}

export default function PassengerMessaging({ 
  passengerId, 
  passengerName, 
  passengerEmoji, 
  rideId, 
  onClose 
}: PassengerMessagingProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatKey = `chat_${rideId}_${passengerId}`;

  // Load messages from localStorage
  useEffect(() => {
    const loadMessages = () => {
      const savedMessages = localStorage.getItem(chatKey);
      if (savedMessages) {
        try {
          const parsed = JSON.parse(savedMessages);
          setMessages(parsed);
        } catch (error) {
          console.error('Error loading messages:', error);
        }
      }
    };

    loadMessages();

    // Poll for new messages every 2 seconds
    const interval = setInterval(loadMessages, 2000);

    // Listen for storage events (cross-tab sync)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === chatKey) {
        loadMessages();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [chatKey]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!newMessage.trim() || !user) return;

    const message: Message = {
      id: `msg_${Date.now()}_${Math.random()}`,
      senderId: user.id,
      senderName: user.name || 'Driver',
      senderType: 'driver',
      message: newMessage.trim(),
      timestamp: Date.now(),
      read: false
    };

    const updatedMessages = [...messages, message];
    setMessages(updatedMessages);
    localStorage.setItem(chatKey, JSON.stringify(updatedMessages));

    // Trigger storage event for cross-tab sync
    window.dispatchEvent(new StorageEvent('storage', {
      key: chatKey,
      newValue: JSON.stringify(updatedMessages)
    }));

    // Send notification to passenger
    const customerId = passengerId.split('_companion_')[0];
    const customerNotificationsKey = `notifications_${customerId}`;
    const existingNotifications = localStorage.getItem(customerNotificationsKey);
    const notifications = existingNotifications ? JSON.parse(existingNotifications) : [];

    const notification = {
      id: `msg-${message.id}`,
      type: 'message',
      title: `Message from Driver`,
      message: newMessage.trim().length > 50 ? newMessage.trim().substring(0, 50) + '...' : newMessage.trim(),
      time: 'Just now',
      timestamp: Date.now(),
      unread: true,
      icon: '💬',
    };

    notifications.unshift(notification);
    localStorage.setItem(customerNotificationsKey, JSON.stringify(notifications));

    setNewMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
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
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end md:items-center md:justify-center">
      <div className="bg-white w-full md:w-[500px] md:rounded-2xl rounded-t-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-[#E11D48] text-white px-4 py-4 flex items-center justify-between rounded-t-3xl md:rounded-t-2xl">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{passengerEmoji}</span>
            <div>
              <h3 className="font-bold text-lg">{passengerName}</h3>
              <p className="text-xs text-white/80">Passenger Chat</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="text-white hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F8F9FA]">
          {messages.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No messages yet</p>
              <p className="text-gray-400 text-xs mt-1">Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div 
                key={msg.id}
                className={`flex ${msg.senderType === 'driver' ? 'justify-end' : 'justify-start'}`}
              >
                <div 
                  className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                    msg.senderType === 'driver' 
                      ? 'bg-[#E11D48] text-white' 
                      : 'bg-white border border-gray-200'
                  }`}
                >
                  <p className="text-sm break-words">{msg.message}</p>
                  <p className={`text-[10px] mt-1 ${
                    msg.senderType === 'driver' ? 'text-white/70' : 'text-gray-400'
                  }`}>
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 bg-white border-t border-gray-200">
          <div className="flex gap-2">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type a message..."
              className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#E11D48] focus:border-transparent"
            />
            <Button
              onClick={sendMessage}
              disabled={!newMessage.trim()}
              className="bg-[#E11D48] hover:bg-[#BE123C] px-6"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
