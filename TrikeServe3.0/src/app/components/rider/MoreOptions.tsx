import { useNavigate } from "react-router";
import { ArrowLeft, Settings, Bell, Star, DollarSign, HelpCircle, FileText } from "lucide-react";
import { Button } from "../ui/button";
import ActiveRideButton from "./ActiveRideButton";

export default function MoreOptions() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F8F9FA]">
      {/* Header */}
      <div className="bg-white border-b-2 border-[#CBD5E1] px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/rider')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-extrabold text-[#E11D48]" style={{ letterSpacing: '-0.02em' }}>
          More Options
        </h1>
      </div>

      <div className="p-4 space-y-2">
        <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[#E11D48] transition-colors bg-white">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Settings className="w-5 h-5 text-[#64748B]" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-[#121212]">Settings</p>
            <p className="text-xs text-[#64748B]">App preferences & configurations</p>
          </div>
        </button>

        <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[#E11D48] transition-colors bg-white">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Bell className="w-5 h-5 text-[#64748B]" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-[#121212]">Notifications</p>
            <p className="text-xs text-[#64748B]">Manage notification settings</p>
          </div>
        </button>

        <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[#E11D48] transition-colors bg-white">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Star className="w-5 h-5 text-[#64748B]" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-[#121212]">My Rating</p>
            <p className="text-xs text-[#64748B]">View your performance rating</p>
          </div>
        </button>

        <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[#E11D48] transition-colors bg-white">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-[#64748B]" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-[#121212]">Payment Methods</p>
            <p className="text-xs text-[#64748B]">Manage GCash & cash options</p>
          </div>
        </button>

        <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[#E11D48] transition-colors bg-white">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <HelpCircle className="w-5 h-5 text-[#64748B]" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-[#121212]">Help & Support</p>
            <p className="text-xs text-[#64748B]">Get help and contact support</p>
          </div>
        </button>

        <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[#E11D48] transition-colors bg-white">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <FileText className="w-5 h-5 text-[#64748B]" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-[#121212]">Terms & Privacy</p>
            <p className="text-xs text-[#64748B]">View legal documents</p>
          </div>
        </button>
      </div>
      <ActiveRideButton />
    </div>
  );
}
