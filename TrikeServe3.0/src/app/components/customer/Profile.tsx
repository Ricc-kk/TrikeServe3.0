import { X, Camera, Star, ChevronRight } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { useState } from "react";
import profilePlaceholder from "figma:asset/46984638ac5e8b0cdd6b13a34400903427e5c56b.png";

export default function Profile() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: "User12345",
    mobile: "+63 • 9613483404",
    email: "",
    gender: ""
  });

  const [linkedAccounts, setLinkedAccounts] = useState({
    facebook: false,
    google: false
  });

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="sticky top-0 bg-white z-10 px-5 py-4">
        <button 
          onClick={() => navigate(-1)}
          className="w-10 h-10 flex items-center justify-center -ml-2"
        >
          <X className="w-6 h-6 text-[#121212]" />
        </button>
      </div>

      {/* Profile Photo Section */}
      <div className="flex flex-col items-center px-5 pb-6">
        <div className="relative mb-3">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-[#18B5A4]">
            <img 
              src={profilePlaceholder} 
              alt="Profile" 
              className="w-full h-full object-cover"
            />
          </div>
          <button className="absolute bottom-0 right-0 w-9 h-9 bg-[#18B5A4] rounded-full flex items-center justify-center shadow-lg border-3 border-white">
            <Camera className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Not enough ratings */}
        <button className="flex items-center gap-1.5 text-[#64748B]">
          <Star className="w-4 h-4 fill-[#F59E0B] text-[#F59E0B]" />
          <span className="text-sm">Not enough ratings</span>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Form Fields */}
      <div className="px-5 space-y-6">
        {/* Name */}
        <div>
          <label className="block text-sm text-[#64748B] mb-2">Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="w-full text-base text-[#121212] pb-2 border-b border-[#E2E8F0] focus:border-[#18B5A4] outline-none transition-colors"
          />
        </div>

        {/* Mobile Number */}
        <div>
          <label className="block text-sm text-[#64748B] mb-2">Mobile Number</label>
          <input
            type="text"
            value={formData.mobile}
            readOnly
            className="w-full text-base text-[#121212] pb-2 border-b border-[#E2E8F0] bg-transparent"
          />
        </div>

        {/* Email */}
        <div>
          <input
            type="email"
            placeholder="Enter your email address"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="w-full text-base text-[#121212] placeholder:text-[#CBD5E1] pb-2 border-b border-[#E2E8F0] focus:border-[#18B5A4] outline-none transition-colors"
          />
          <p className="text-xs text-[#94A3B8] mt-2 leading-relaxed">
            We'll reach out to you via email for account-related issues and product communication purposes.
          </p>
        </div>

        {/* Gender */}
        <div>
          <label className="block text-sm font-medium text-[#121212] mb-2">Gender</label>
          <div className="relative">
            <select
              value={formData.gender}
              onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
              className="w-full text-base text-[#CBD5E1] pb-2 border-b border-[#E2E8F0] focus:border-[#18B5A4] outline-none transition-colors appearance-none bg-transparent pr-8"
            >
              <option value="">Please select your gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer-not-to-say">Prefer not to say</option>
            </select>
            <ChevronRight className="w-5 h-5 text-[#CBD5E1] absolute right-0 bottom-2 pointer-events-none -rotate-90" />
          </div>
        </div>
      </div>

      {/* Profiles Section */}
      <div className="px-5 pt-8 pb-6">
        <h3 className="text-base font-medium text-[#94A3B8] mb-4">Profiles</h3>
        <button className="w-full text-left">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base text-[#18B5A4] font-medium">Add a business profile</p>
              <p className="text-xs text-[#CBD5E1] mt-0.5">Better manage your ride expenses</p>
            </div>
          </div>
        </button>
      </div>

      {/* Linked Accounts */}
      <div className="px-5 pb-6">
        <h3 className="text-base font-medium text-[#94A3B8] mb-4">Linked Accounts</h3>
        
        {/* Facebook */}
        <div className="flex items-center justify-between py-4 border-b border-[#F1F5F9]">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 flex items-center justify-center">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#1877F2">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </div>
            <span className="text-base text-[#121212]">Facebook</span>
          </div>
          <button
            onClick={() => setLinkedAccounts({ ...linkedAccounts, facebook: !linkedAccounts.facebook })}
            className={`relative w-12 h-7 rounded-full transition-colors ${
              linkedAccounts.facebook ? 'bg-[#18B5A4]' : 'bg-[#E2E8F0]'
            }`}
          >
            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
              linkedAccounts.facebook ? 'right-1' : 'left-1'
            }`} />
          </button>
        </div>

        {/* Google */}
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 flex items-center justify-center">
              <svg className="w-6 h-6" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </div>
            <span className="text-base text-[#121212]">Google</span>
          </div>
          <button
            onClick={() => setLinkedAccounts({ ...linkedAccounts, google: !linkedAccounts.google })}
            className={`relative w-12 h-7 rounded-full transition-colors ${
              linkedAccounts.google ? 'bg-[#18B5A4]' : 'bg-[#E2E8F0]'
            }`}
          >
            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
              linkedAccounts.google ? 'right-1' : 'left-1'
            }`} />
          </button>
        </div>
      </div>

      {/* Log out Button */}
      <div className="px-5 py-6">
        <button className="w-full py-3 text-base font-medium text-[#64748B] border border-[#E2E8F0] rounded-lg hover:bg-[#F8FAFC] transition-colors">
          Log out
        </button>
      </div>

      {/* Version Info */}
      <div className="text-center text-xs text-[#CBD5E1] pb-8">
        v5.401.0(54010000) Build ; Build 142713298
      </div>

      {/* Bottom spacing for navigation */}
      <div className="h-20" />
    </div>
  );
}
