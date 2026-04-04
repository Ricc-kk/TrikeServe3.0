import { Plus, Check, User, Trash2, Edit2, Star, ChevronRight, Home as HomeIcon, MessageCircle, ShoppingCart, ClipboardList, X } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useState, useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";

interface CustomerProfile {
  id: string;
  name: string;
  emoji: string;
  phone: string;
  email: string;
  address: string;
  isPrimary: boolean;
  createdAt: string;
}

export default function AccountManagement() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<CustomerProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string>("");
  const [showAddProfile, setShowAddProfile] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [newProfile, setNewProfile] = useState({
    name: "",
    emoji: "👤",
    phone: "",
    email: "",
    address: ""
  });

  const emojis = ["👤", "👨", "👩", "🧑", "👦", "👧", "👶", "👨‍💼", "👩‍💼", "👨‍🎓", "👩‍🎓", "🧔", "👱"];

  useEffect(() => {
    if (!user?.id) return;

    const storageKey = `customer_profiles_${user.id}`;
    const savedProfiles = localStorage.getItem(storageKey);

    if (savedProfiles) {
      const parsed = JSON.parse(savedProfiles);
      setProfiles(parsed);
      
      // Get active profile
      const activeId = localStorage.getItem(`active_profile_${user.id}`);
      if (activeId) {
        setActiveProfileId(activeId);
      } else if (parsed.length > 0) {
        setActiveProfileId(parsed[0].id);
        localStorage.setItem(`active_profile_${user.id}`, parsed[0].id);
      }
    } else {
      // Create default profile
      const defaultProfile: CustomerProfile = {
        id: `profile_${Date.now()}`,
        name: user.name || "Primary Profile",
        emoji: "👤",
        phone: user.phone || "",
        email: user.email || "",
        address: "",
        isPrimary: true,
        createdAt: new Date().toISOString()
      };
      setProfiles([defaultProfile]);
      setActiveProfileId(defaultProfile.id);
      localStorage.setItem(storageKey, JSON.stringify([defaultProfile]));
      localStorage.setItem(`active_profile_${user.id}`, defaultProfile.id);
    }
  }, [user]);

  const handleAddProfile = () => {
    if (!user?.id || !newProfile.name.trim()) return;

    const profile: CustomerProfile = {
      id: `profile_${Date.now()}`,
      name: newProfile.name,
      emoji: newProfile.emoji,
      phone: newProfile.phone,
      email: newProfile.email,
      address: newProfile.address,
      isPrimary: false,
      createdAt: new Date().toISOString()
    };

    const updatedProfiles = [...profiles, profile];
    setProfiles(updatedProfiles);
    
    const storageKey = `customer_profiles_${user.id}`;
    localStorage.setItem(storageKey, JSON.stringify(updatedProfiles));
    
    setShowAddProfile(false);
    setNewProfile({
      name: "",
      emoji: "👤",
      phone: "",
      email: "",
      address: ""
    });
  };

  const handleSwitchProfile = (profileId: string) => {
    if (!user?.id) return;

    setActiveProfileId(profileId);
    localStorage.setItem(`active_profile_${user.id}`, profileId);

    // Clear profile-specific data when switching
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
      // You can add logic here to load profile-specific cart, favorites, etc.
    }
  };

  const handleDeleteProfile = (profileId: string) => {
    if (!user?.id) return;

    const profile = profiles.find(p => p.id === profileId);
    if (profile?.isPrimary) {
      alert("Cannot delete primary profile");
      return;
    }

    const updatedProfiles = profiles.filter(p => p.id !== profileId);
    setProfiles(updatedProfiles);
    
    const storageKey = `customer_profiles_${user.id}`;
    localStorage.setItem(storageKey, JSON.stringify(updatedProfiles));

    // If deleted active profile, switch to primary
    if (activeProfileId === profileId) {
      const primaryProfile = updatedProfiles.find(p => p.isPrimary);
      if (primaryProfile) {
        handleSwitchProfile(primaryProfile.id);
      }
    }

    setShowDeleteConfirm(null);
  };

  const activeProfile = profiles.find(p => p.id === activeProfileId);

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-20">
      {/* Header */}
      <div className="bg-white px-4 py-4 border-b border-[#E2E8F0]">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold text-[#121212]">Manage Accounts</h1>
          <Button
            onClick={() => setShowAddProfile(true)}
            size="sm"
            className="bg-[#E11D48] hover:bg-[#BE123C]"
          >
            <Plus className="w-4 h-4 mr-1" />
            ADD
          </Button>
        </div>
        <p className="text-sm text-[#64748B] mt-1">Switch between different profiles</p>
      </div>

      {/* Active Profile Card */}
      {activeProfile && (
        <div className="p-4">
          <Card className="p-4 border-2 border-[#E11D48] bg-white">
            <div className="flex items-center justify-between mb-2">
              <Badge className="bg-[#E11D48] text-white">ACTIVE PROFILE</Badge>
              {activeProfile.isPrimary && (
                <Badge variant="outline" className="border-[#10B981] text-[#10B981]">PRIMARY</Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-3">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#E11D48] to-[#BE123C] flex items-center justify-center text-3xl">
                {activeProfile.emoji}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-[#121212]">{activeProfile.name}</h3>
                {activeProfile.phone && (
                  <p className="text-sm text-[#64748B]">📱 {activeProfile.phone}</p>
                )}
                {activeProfile.email && (
                  <p className="text-xs text-[#64748B]">📧 {activeProfile.email}</p>
                )}
              </div>
            </div>
            {activeProfile.address && (
              <div className="mt-3 p-2 bg-[#F8F9FA] rounded-lg">
                <p className="text-xs text-[#64748B]">📍 {activeProfile.address}</p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* All Profiles List */}
      <div className="px-4 pb-4">
        <h2 className="text-sm font-bold text-[#64748B] uppercase mb-3 tracking-wide">All Profiles</h2>
        <div className="space-y-2">
          {profiles.map((profile) => (
            <Card
              key={profile.id}
              className={`p-4 cursor-pointer transition-all ${
                activeProfileId === profile.id
                  ? 'border-2 border-[#E11D48] bg-red-50'
                  : 'border border-[#E2E8F0] hover:border-[#E11D48]'
              }`}
              onClick={() => handleSwitchProfile(profile.id)}
            >
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${
                  activeProfileId === profile.id
                    ? 'bg-gradient-to-br from-[#E11D48] to-[#BE123C]'
                    : 'bg-gray-200'
                }`}>
                  {profile.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-[#121212]">{profile.name}</h3>
                    {profile.isPrimary && (
                      <Badge variant="outline" className="border-[#10B981] text-[#10B981] text-[10px]">
                        PRIMARY
                      </Badge>
                    )}
                    {activeProfileId === profile.id && (
                      <Check className="w-5 h-5 text-[#E11D48]" />
                    )}
                  </div>
                  <p className="text-xs text-[#64748B] truncate">{profile.phone || profile.email}</p>
                </div>
                {!profile.isPrimary && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteConfirm(profile.id);
                    }}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Add Profile Modal */}
      {showAddProfile && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-end">
          <div className="bg-white w-full rounded-t-3xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-[#121212]">Add New Profile</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowAddProfile(false)}
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="space-y-4">
              {/* Emoji Selector */}
              <div>
                <label className="block text-sm font-semibold text-[#121212] mb-2">Choose Avatar</label>
                <div className="flex flex-wrap gap-2">
                  {emojis.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => setNewProfile({ ...newProfile, emoji })}
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl transition-all ${
                        newProfile.emoji === emoji
                          ? 'bg-gradient-to-br from-[#E11D48] to-[#BE123C] scale-110'
                          : 'bg-gray-200 hover:scale-105'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-semibold text-[#121212] mb-2">Profile Name *</label>
                <input
                  type="text"
                  value={newProfile.name}
                  onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })}
                  placeholder="e.g., Work, Family, Shopping"
                  className="w-full px-4 py-3 border border-[#E2E8F0] rounded-lg focus:border-[#E11D48] focus:ring-2 focus:ring-[#E11D48]/20 outline-none"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-semibold text-[#121212] mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={newProfile.phone}
                  onChange={(e) => setNewProfile({ ...newProfile, phone: e.target.value })}
                  placeholder="+63 XXX XXX XXXX"
                  className="w-full px-4 py-3 border border-[#E2E8F0] rounded-lg focus:border-[#E11D48] focus:ring-2 focus:ring-[#E11D48]/20 outline-none"
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-semibold text-[#121212] mb-2">Email</label>
                <input
                  type="email"
                  value={newProfile.email}
                  onChange={(e) => setNewProfile({ ...newProfile, email: e.target.value })}
                  placeholder="email@example.com"
                  className="w-full px-4 py-3 border border-[#E2E8F0] rounded-lg focus:border-[#E11D48] focus:ring-2 focus:ring-[#E11D48]/20 outline-none"
                />
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-semibold text-[#121212] mb-2">Default Address</label>
                <input
                  type="text"
                  value={newProfile.address}
                  onChange={(e) => setNewProfile({ ...newProfile, address: e.target.value })}
                  placeholder="Street, Barangay, City"
                  className="w-full px-4 py-3 border border-[#E2E8F0] rounded-lg focus:border-[#E11D48] focus:ring-2 focus:ring-[#E11D48]/20 outline-none"
                />
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => setShowAddProfile(false)}
                  className="flex-1"
                >
                  CANCEL
                </Button>
                <Button
                  onClick={handleAddProfile}
                  disabled={!newProfile.name.trim()}
                  className="flex-1 bg-[#E11D48] hover:bg-[#BE123C] disabled:bg-gray-300"
                >
                  ADD PROFILE
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[2000] flex items-center justify-center p-4">
          <Card className="bg-white p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-[#121212] mb-2">Delete Profile?</h3>
            <p className="text-sm text-[#64748B] mb-6">
              This action cannot be undone. All data associated with this profile will be removed.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowDeleteConfirm(null)}
                className="flex-1"
              >
                CANCEL
              </Button>
              <Button
                onClick={() => handleDeleteProfile(showDeleteConfirm)}
                className="flex-1 bg-red-500 hover:bg-red-600"
              >
                DELETE
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E2E8F0] z-[1000]">
        <div className="flex justify-around items-center py-2">
          <Link to="/customer" className="flex flex-col items-center gap-1 p-2">
            <HomeIcon className="w-5 h-5 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Home</span>
          </Link>
          <Link to="/customer/activity" className="flex flex-col items-center gap-1 p-2">
            <ClipboardList className="w-5 h-5 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Activity</span>
          </Link>
          <Link to="/customer/messages" className="flex flex-col items-center gap-1 p-2">
            <MessageCircle className="w-5 h-5 text-[#64748B]" />
            <span className="text-xs text-[#64748B]">Messages</span>
          </Link>
          <Link to="/customer/account" className="flex flex-col items-center gap-1 p-2">
            <User className="w-5 h-5 text-[#18B5A4]" />
            <span className="text-xs text-[#18B5A4] font-semibold">Account</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
