import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import { ArrowLeft, Send, MessageCircle } from "lucide-react";
import { Button } from "../ui/button";
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

export default function RiderMessageChat() {
  const navigate = useNavigate();
  const { rideId, passengerId } = useParams();
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [passengerInfo, setPassengerInfo] = useState<{ name: string; emoji: string } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatKey = `chat_${rideId}_${passengerId}`;

  useEffect(() => {
    // Load passenger info
    const loadPassengerInfo = () => {
      // Check active ride
      const activeRideData = localStorage.getItem('trikeserve_active_ride');
      if (activeRideData) {
        try {
          const activeRide = JSON.parse(activeRideData);
          if (activeRide.id === rideId && activeRide.passengerDetails) {
            const passenger = activeRide.passengerDetails.find((p: any) => p.id === passengerId);
            if (passenger) {
              setPassengerInfo({ name: passenger.name, emoji: passenger.emoji });
              return;
            }
          }
        } catch (error) {
          console.error('Error checking active ride:', error);
        }
      }

      // Check ride history
      const historyKey = `ride_history_${user?.id}`;
      const historyData = localStorage.getItem(historyKey);
      if (historyData) {
        try {
          const history = JSON.parse(historyData);
          const ride = history.find((r: any) => r.id === rideId);
          if (ride && ride.passengerDetails) {
            const passenger = ride.passengerDetails.find((p: any) => p.id === passengerId);
            if (passenger) {
              setPassengerInfo({ name: passenger.name, emoji: passenger.emoji });
              return;
            }
          }
        } catch (error) {
          console.error('Error checking ride history:', error);
        }
      }

      // Fallback
      setPassengerInfo({ name: 'Passenger', emoji: '👤' });
    };

    loadPassengerInfo();
  }, [rideId, passengerId, user]);

  // Load messages from localStorage
  useEffect(() => {
    const loadMessages = () => {
      const savedMessages = localStorage.getItem(chatKey);
      if (savedMessages) {
        try {
          const parsed = JSON.parse(savedMessages);
          setMessages(parsed);
          
          // Mark driver's messages as read
          const updatedMessages = parsed.map((m: Message) => {
            if (m.senderType === 'passenger') {
              return { ...m, read: true };
            }
            return m;
          });
          localStorage.setItem(chatKey, JSON.stringify(updatedMessages));
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
    const customerId = passengerId?.split('_companion_')[0];
    if (customerId) {
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
      
      // Trigger storage event for notifications
      window.dispatchEvent(new StorageEvent('storage', {
        key: customerNotificationsKey,
        newValue: JSON.stringify(notifications)
      }));
    }

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

  if (!passengerInfo) {
    return null;
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      {/* Header */}
      <div className="bg-[#E11D48] text-white px-4 py-4 flex items-center gap-3 sticky top-0 z-10">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate('/rider/messages')}
          className="text-white hover:bg-white/20"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="text-3xl">{passengerInfo.emoji}</span>
        <div className="flex-1">
          <h3 className="font-bold text-lg">{passengerInfo.name}</h3>
          <p className="text-xs text-white/80">Passenger Chat</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
      <div className="bg-white border-t border-gray-200 p-4 sticky bottom-0">
        <div className="flex gap-2">
          <textarea
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-[#E11D48] focus:border-transparent"
            rows={1}
            style={{ minHeight: '42px', maxHeight: '120px' }}
          />
          <Button
            onClick={sendMessage}
            disabled={!newMessage.trim()}
            className="bg-[#E11D48] hover:bg-[#BE123C] text-white px-6 rounded-xl uppercase font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
