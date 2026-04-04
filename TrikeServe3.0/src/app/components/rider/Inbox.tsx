import { ArrowLeft, Bell, MessageCircle, AlertCircle, CheckCircle, Info } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";

export default function Inbox() {
  const navigate = useNavigate();

  const messages = [
    {
      id: '1',
      type: 'notification',
      icon: 'bell',
      title: 'New Passenger Request Available',
      message: '3 passengers looking for service near your location',
      time: '5 mins ago',
      read: false,
      priority: 'high'
    },
    {
      id: '2',
      type: 'success',
      icon: 'check',
      title: 'Trip Completed Successfully',
      message: 'You earned ₱35 from your delivery to BLK 12 L3, Tagalag Road',
      time: '30 mins ago',
      read: false,
      priority: 'normal'
    },
    {
      id: '3',
      type: 'info',
      icon: 'info',
      title: 'Weekly Earnings Summary',
      message: 'You earned ₱2,850 this week. Great job!',
      time: '2 hours ago',
      read: true,
      priority: 'normal'
    },
    {
      id: '4',
      type: 'message',
      icon: 'message',
      title: 'Message from Customer',
      message: 'Thank you for the safe ride! -Maria Santos',
      time: '3 hours ago',
      read: true,
      priority: 'normal'
    },
    {
      id: '5',
      type: 'alert',
      icon: 'alert',
      title: 'Document Renewal Reminder',
      message: 'Your tricycle registration expires in 30 days. Please renew at the office.',
      time: '1 day ago',
      read: true,
      priority: 'high'
    },
    {
      id: '6',
      type: 'success',
      icon: 'check',
      title: 'Payment Received',
      message: 'Weekly payout of ₱2,450 has been processed',
      time: '2 days ago',
      read: true,
      priority: 'normal'
    },
    {
      id: '7',
      type: 'info',
      icon: 'info',
      title: 'New Feature Available',
      message: 'Auto Accept is now available! Configure it in your dashboard.',
      time: '3 days ago',
      read: true,
      priority: 'normal'
    },
  ];

  const getIcon = (iconType: string) => {
    switch(iconType) {
      case 'bell': return <Bell className="w-5 h-5" />;
      case 'check': return <CheckCircle className="w-5 h-5" />;
      case 'info': return <Info className="w-5 h-5" />;
      case 'message': return <MessageCircle className="w-5 h-5" />;
      case 'alert': return <AlertCircle className="w-5 h-5" />;
      default: return <Bell className="w-5 h-5" />;
    }
  };

  const getIconColor = (type: string) => {
    switch(type) {
      case 'notification': return 'text-[#E11D48]';
      case 'success': return 'text-green-600';
      case 'info': return 'text-blue-600';
      case 'message': return 'text-purple-600';
      case 'alert': return 'text-orange-600';
      default: return 'text-gray-600';
    }
  };

  const unreadCount = messages.filter(m => !m.read).length;

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-20">
      {/* Header */}
      <div className="bg-white border-b-2 border-[#CBD5E1] px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/rider')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold text-[#E11D48]" style={{ letterSpacing: '-0.02em' }}>
            Inbox
          </h1>
          <p className="text-xs text-[#64748B]">{unreadCount} unread messages</p>
        </div>
        <Button variant="ghost" size="sm" className="text-[#E11D48] text-xs">
          Mark all read
        </Button>
      </div>

      <div className="p-4 space-y-3">
        {messages.map((msg) => (
          <Card 
            key={msg.id} 
            className={`p-4 border-2 transition-colors ${
              !msg.read 
                ? 'bg-red-50 border-[#E11D48] hover:bg-red-100' 
                : 'bg-white border-[#CBD5E1] hover:border-gray-300'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-full ${
                !msg.read ? 'bg-[#E11D48]' : 'bg-gray-100'
              } flex items-center justify-center flex-shrink-0`}>
                <div className={!msg.read ? 'text-white' : getIconColor(msg.type)}>
                  {getIcon(msg.icon)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className={`font-bold text-[#121212] ${!msg.read ? 'text-[#E11D48]' : ''}`}>
                    {msg.title}
                  </p>
                  {!msg.read && (
                    <Badge className="bg-[#E11D48] text-xs flex-shrink-0">
                      NEW
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-[#64748B] mb-2">{msg.message}</p>
                <p className="text-xs text-[#94A3B8]">{msg.time}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
