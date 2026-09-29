import { useNavigate } from "react-router";
import { ArrowLeft, Settings, Bell, Star, DollarSign, HelpCircle, FileText } from "lucide-react";
import { Button } from "../ui/button";
import ActiveRideButton from "./ActiveRideButton";

export default function MoreOptions() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[var(--muted)]">
      {/* Header */}
      <div className="bg-white border-b-2 border-[var(--border)] px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/rider')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <h1 className="text-xl font-extrabold text-[var(--primary)]" style={{ letterSpacing: '-0.02em' }}>
          More Options
        </h1>
      </div>

      <div className="p-4 space-y-2">
        <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[var(--primary)] transition-colors bg-white">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Settings className="w-5 h-5 text-[var(--muted-foreground)]" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-[var(--ink)]">Settings</p>
            <p className="text-xs text-[var(--muted-foreground)]">App preferences & configurations</p>
          </div>
        </button>

        <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[var(--primary)] transition-colors bg-white">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Bell className="w-5 h-5 text-[var(--muted-foreground)]" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-[var(--ink)]">Notifications</p>
            <p className="text-xs text-[var(--muted-foreground)]">Manage notification settings</p>
          </div>
        </button>

        <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[var(--primary)] transition-colors bg-white">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <Star className="w-5 h-5 text-[var(--muted-foreground)]" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-[var(--ink)]">My Rating</p>
            <p className="text-xs text-[var(--muted-foreground)]">View your performance rating</p>
          </div>
        </button>

        <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[var(--primary)] transition-colors bg-white">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <DollarSign className="w-5 h-5 text-[var(--muted-foreground)]" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-[var(--ink)]">Payment Methods</p>
            <p className="text-xs text-[var(--muted-foreground)]">Manage GCash & cash options</p>
          </div>
        </button>

        <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[var(--primary)] transition-colors bg-white">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <HelpCircle className="w-5 h-5 text-[var(--muted-foreground)]" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-[var(--ink)]">Help & Support</p>
            <p className="text-xs text-[var(--muted-foreground)]">Get help and contact support</p>
          </div>
        </button>

        <button className="w-full flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-[var(--primary)] transition-colors bg-white">
          <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
            <FileText className="w-5 h-5 text-[var(--muted-foreground)]" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-semibold text-[var(--ink)]">Terms & Privacy</p>
            <p className="text-xs text-[var(--muted-foreground)]">View legal documents</p>
          </div>
        </button>
      </div>
      <ActiveRideButton />
    </div>
  );
}
