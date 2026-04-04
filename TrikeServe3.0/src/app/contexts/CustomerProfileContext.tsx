import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';

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

interface CustomerProfileContextType {
  activeProfile: CustomerProfile | null;
  allProfiles: CustomerProfile[];
  switchProfile: (profileId: string) => void;
  refreshProfiles: () => void;
}

const CustomerProfileContext = createContext<CustomerProfileContextType | undefined>(undefined);

export function CustomerProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeProfile, setActiveProfile] = useState<CustomerProfile | null>(null);
  const [allProfiles, setAllProfiles] = useState<CustomerProfile[]>([]);

  const loadProfiles = () => {
    if (!user?.id) return;

    const storageKey = `customer_profiles_${user.id}`;
    const savedProfiles = localStorage.getItem(storageKey);

    if (savedProfiles) {
      const parsed = JSON.parse(savedProfiles);
      setAllProfiles(parsed);

      // Get active profile
      const activeId = localStorage.getItem(`active_profile_${user.id}`);
      const active = parsed.find((p: CustomerProfile) => p.id === activeId);
      setActiveProfile(active || parsed[0]);
    } else {
      // Create default profile if none exists
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
      setAllProfiles([defaultProfile]);
      setActiveProfile(defaultProfile);
      localStorage.setItem(storageKey, JSON.stringify([defaultProfile]));
      localStorage.setItem(`active_profile_${user.id}`, defaultProfile.id);
    }
  };

  useEffect(() => {
    loadProfiles();
  }, [user?.id]);

  const switchProfile = (profileId: string) => {
    if (!user?.id) return;

    const profile = allProfiles.find(p => p.id === profileId);
    if (profile) {
      setActiveProfile(profile);
      localStorage.setItem(`active_profile_${user.id}`, profileId);
    }
  };

  const refreshProfiles = () => {
    loadProfiles();
  };

  return (
    <CustomerProfileContext.Provider value={{ activeProfile, allProfiles, switchProfile, refreshProfiles }}>
      {children}
    </CustomerProfileContext.Provider>
  );
}

export function useCustomerProfile() {
  const context = useContext(CustomerProfileContext);
  if (context === undefined) {
    throw new Error('useCustomerProfile must be used within a CustomerProfileProvider');
  }
  return context;
}
