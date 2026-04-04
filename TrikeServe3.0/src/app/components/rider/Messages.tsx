import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, MessageCircle, Search, Clock } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { useAuth } from "../../contexts/AuthContext";

interface Conversation {
  passengerId: string;
  passengerName: string;
  passengerEmoji: string;
  rideId: string;
  lastMessage: string;
  lastMessageTime: number;
  unreadCount: number;
}

export default function Messages() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadConversations();

    // Poll for updates every 2 seconds
    const interval = setInterval(loadConversations, 2000);

    // Listen for storage events (cross-tab sync)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key?.startsWith('chat_')) {
        loadConversations();
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

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

            // Get passenger info from active ride or ride history
            const passengerInfo = getPassengerInfo(passengerId, rideId);
            
            if (passengerInfo) {
              const lastMessage = messages[messages.length - 1];
              const unreadCount = messages.filter((m: any) => 
                m.senderType === 'passenger' && !m.read
              ).length;

              allConversations.push({
                passengerId,
                passengerName: passengerInfo.name,
                passengerEmoji: passengerInfo.emoji,
                rideId,
                lastMessage: lastMessage.message,
                lastMessageTime: lastMessage.timestamp,
                unreadCount
              });
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

  const getPassengerInfo = (passengerId: string, rideId: string) => {
    // Check active ride
    const activeRideData = localStorage.getItem('trikeserve_active_ride');
    if (activeRideData) {
      try {
        const activeRide = JSON.parse(activeRideData);
        if (activeRide.id === rideId && activeRide.passengerDetails) {
          const passenger = activeRide.passengerDetails.find((p: any) => p.id === passengerId);
          if (passenger) {
            return { name: passenger.name, emoji: passenger.emoji };
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
            return { name: passenger.name, emoji: passenger.emoji };
          }
        }
      } catch (error) {
        console.error('Error checking ride history:', error);
      }
    }

    return null;
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

  const filteredConversations = conversations.filter(conv =>
    conv.passengerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-20">
      {/* Header */}
      <div className="bg-[#E11D48] text-white px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between mb-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/rider')}
            className="text-white hover:bg-white/20"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-xl font-extrabold" style={{ letterSpacing: '-0.02em' }}>
            MESSAGES
          </h1>
          <div className="w-10" /> {/* Spacer for alignment */}
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border-0 focus:outline-none focus:ring-2 focus:ring-white/50 text-[#121212]"
          />
        </div>
      </div>

      {/* Conversations List */}
      <div className="p-4 space-y-3">
        {filteredConversations.length === 0 ? (
          <Card className="p-12 text-center border-2 border-dashed border-gray-300">
            <MessageCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="font-bold text-[#121212] mb-2">No Messages Yet</h3>
            <p className="text-sm text-[#64748B]">
              {searchQuery 
                ? 'No conversations match your search'
                : 'Your passenger conversations will appear here'}
            </p>
          </Card>
        ) : (
          filteredConversations.map((conv) => (
            <Card
              key={`${conv.rideId}_${conv.passengerId}`}
              onClick={() => navigate(`/rider/messages/${conv.rideId}/${conv.passengerId}`)}
              className="p-4 border-2 border-[#E2E8F0] hover:border-[#E11D48] hover:shadow-lg transition-all cursor-pointer"
            >
              <div className="flex items-start gap-3">
                {/* Passenger Emoji */}
                <div className="text-4xl">{conv.passengerEmoji}</div>

                {/* Conversation Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-bold text-[#121212] truncate">{conv.passengerName}</h3>
                    <div className="flex items-center gap-2 ml-2">
                      {conv.unreadCount > 0 && (
                        <Badge className="bg-[#E11D48] text-white h-5 px-1.5 text-xs">
                          {conv.unreadCount}
                        </Badge>
                      )}
                      <div className="flex items-center gap-1 text-xs text-[#64748B] whitespace-nowrap">
                        <Clock className="w-3 h-3" />
                        {formatTime(conv.lastMessageTime)}
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-sm text-[#64748B] truncate mb-2">
                    {conv.lastMessage.length > 60 
                      ? conv.lastMessage.substring(0, 60) + '...' 
                      : conv.lastMessage}
                  </p>

                  <Badge variant="outline" className="text-xs text-[#64748B]">
                    Ride #{conv.rideId.substring(0, 8)}
                  </Badge>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}