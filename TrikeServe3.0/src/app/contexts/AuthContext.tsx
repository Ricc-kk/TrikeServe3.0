import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { supabase } from '../../utils/supabase';

export type UserRole = 'customer' | 'rider' | 'business' | 'admin';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string;
  isVerified: boolean;
  createdAt: string;
  adminType?: 'business_customer' | 'rider';
  todaPlate?: string;
  licenseNumber?: string;
  pickupLocation?: string;
  dropoffLocation?: string;
  isOnline?: boolean;
  serviceTypes?: string[];
  currentSeats?: number;
  terminalId?: string;
  terminalName?: string;
  businessName?: string;
  businessAddress?: string;
  /** What the shop serves, declared at sign-up. Seeds `restaurants.cuisine`. */
  businessCuisine?: string[];
  restaurantId?: string;
  address?: string;
  avatarUrl?: string;
  // Only set for admins (from admins table) so Edge Functions can verify them
  password?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  signup: (data: SignupData) => Promise<{ success: boolean; error?: string; userId?: string }>;
  updateProfile: (data: Partial<User>) => Promise<{ success: boolean; error?: string }>;
  switchUiRole: (role: User['role']) => void;
  restoreOriginalRole: () => void;
  resendVerificationEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
}

interface SignupData {
  email: string;
  password: string;
  name: string;
  phone: string;
  role: UserRole;
  todaPlate?: string;
  licenseNumber?: string;
  businessName?: string;
  businessAddress?: string;
  businessLat?: number;
  businessLng?: number;
  businessCuisine?: string[];
  address?: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Whether an account counts as superadmin-approved when the stored flag is
 * missing.
 *
 * A missing flag used to mean `true` for everyone, which quietly granted
 * business access to any account whose `is_verified` column was null — exactly
 * the accounts that had never been through approval. Only roles that are never
 * approval-gated (customer, admin) default to approved; business and rider
 * default to not, so the safe reading wins whenever the column is absent.
 */
function defaultIsVerified(role: string): boolean {
  return role !== 'business' && role !== 'rider';
}

function mapSupabaseUser(row: any): User {
  const role = row.role || 'customer';
  return {
    id: row.id,
    email: row.email,
    name: row.name || row.email?.split('@')[0] || 'User',
    role,
    phone: row.phone || '',
    isVerified: row.is_verified ?? defaultIsVerified(role),
    createdAt: row.created_at || new Date().toISOString(),
    adminType: row.admin_type,
    todaPlate: row.toda_plate,
    licenseNumber: row.license_number,
    businessName: row.business_name,
    businessAddress: row.business_address,
    businessCuisine: Array.isArray(row.business_cuisine) ? row.business_cuisine : [],
    restaurantId: row.restaurant_id,
    address: row.address,
    isOnline: row.is_online,
    serviceTypes: row.service_types,
    currentSeats: row.current_seats,
    pickupLocation: row.pickup_location,
    dropoffLocation: row.dropoff_location,
    terminalId: row.terminal_id,
    terminalName: row.terminal_name,
    avatarUrl: row.avatar_url,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Set while logout() is running, so the SIGNED_OUT it causes is read as a
  // deliberate sign-out rather than a token refresh that failed.
  const signOutRequestedRef = useRef(false);

  // Listen for Supabase auth state changes
  useEffect(() => {
    let mounted = true;

    /**
     * Last resort on a reload: the cached user.
     *
     * Every failure path below ends here rather than at `setUser(null)`. The
     * route guard sends a null user to the sign-in screen, so ending a slow or
     * failed restore with null logged people out on every refresh even though
     * their session was still good. A stale profile beats a spurious logout;
     * a fresh profile load will overwrite this once it lands.
     */
    const restoreFromStorage = (why: string) => {
      const raw = localStorage.getItem('trikeserve_current_user');
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw);
        console.log(`[AuthContext] Restoring stored user (${why}):`, parsed.email);
        setUser(parsed);
        return true;
      } catch (e) {
        console.warn('[AuthContext] Failed to parse stored user:', e);
        // Unreadable cache is worse than none: it would throw on every reload.
        localStorage.removeItem('trikeserve_current_user');
        return false;
      }
    };

    // Safety timeout — always stop loading after 3 seconds max
    const safetyTimeout = setTimeout(() => {
      if (mounted) {
        console.warn('[AuthContext] Safety timeout — forcing loading to stop');
        // Show the cached user rather than resolving to null, so a slow profile
        // query cannot bounce a signed-in person to the login screen.
        restoreFromStorage('safety timeout');
        setIsLoading(false);
      }
    }, 3000);

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        loadUserProfile(session.user.id).finally(() => {
          clearTimeout(safetyTimeout);
          if (mounted) setIsLoading(false);
        });
      } else {
        // No Supabase session — fall back to stored user in localStorage.
        // This keeps the user logged in on Capacitor after app restart, and on
        // the web for accounts (admins) that never had an Auth session.
        restoreFromStorage('no session');
        clearTimeout(safetyTimeout);
        setIsLoading(false);
      }
    }).catch(() => {
      // On error, try to restore from localStorage as fallback
      restoreFromStorage('session error');
      clearTimeout(safetyTimeout);
      if (mounted) setIsLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[AuthContext] Auth event:', event);
        if (!mounted) return;
        // SIGNED_IN is handled by the login() function directly.
        if (event === 'INITIAL_SESSION') {
          /*
           * Emitted on every page load. The getSession() call above owns the
           * initial restore; without this, a load where that promise is slow
           * would fall through to the guard and bounce the user out.
           *
           * The session is known here, but the profile behind it is not:
           * `loadUserProfile` is still in flight, so `user` is null. Ending the
           * restore anyway handed the route guard exactly that null with
           * isLoading already false, and ProtectedRoute read it as "signed out"
           * and sent the person to the login form. Because the guard navigates
           * imperatively, the redirect stuck even once the profile landed, so
           * every refresh, deep link, new tab and app restart opened the
           * sign-in screen instead of the page that was asked for --
           * notifications, the business overview, orders, all of them.
           *
           * So the restore ends when the profile does, exactly as the getSession
           * branch above already does. Two loads of the same profile are
           * harmless: both resolve to the same user.
           */
          if (session?.user) {
            loadUserProfile(session.user.id).finally(() => {
              clearTimeout(safetyTimeout);
              if (mounted) setIsLoading(false);
            });
          } else {
            restoreFromStorage('initial session');
            clearTimeout(safetyTimeout);
            setIsLoading(false);
          }
          return;
        }
        if (event === 'SIGNED_OUT') {
          // Distinguish a real sign-out from a token that merely failed to
          // refresh. An explicit logout() clears the cache itself, so a
          // SIGNED_OUT arriving with a cached user still present is a refresh
          // failure — wiping the key there is what made accounts vanish on
          // reload even though they were still signed in.
          const stillCached = localStorage.getItem('trikeserve_current_user');
          if (stillCached && !signOutRequestedRef.current) {
            console.warn('[AuthContext] SIGNED_OUT with a cached user — treating as a refresh failure');
            restoreFromStorage('sign-out with cached user');
            setIsLoading(false);
            return;
          }
          setUser(null);
          localStorage.removeItem('trikeserve_current_user');
          setIsLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(safetyTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const loadUserProfile = async (authUserId: string) => {
    try {
      console.log('[AuthContext] Loading profile for:', authUserId);
      const { data: profile, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', authUserId)
        .maybeSingle();

      if (error) {
        console.warn('[AuthContext] Profile query error:', error.message);
      }

      if (profile) {
        const mappedUser = mapSupabaseUser(profile);
        setUser(mappedUser);
        localStorage.setItem('trikeserve_current_user', JSON.stringify(mappedUser));
        console.log('[AuthContext] Profile loaded:', mappedUser.email, mappedUser.role);
      } else {
        console.warn('[AuthContext] No profile found for auth user:', authUserId);
        // Try localStorage fallback
        const storedUser = localStorage.getItem('trikeserve_current_user');
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
      }
    } catch (err) {
      console.error('[AuthContext] Error loading profile:', err);
      // A failed profile read must not read as a logged-out user. Falling back
      // to the cached copy keeps the session alive until the next reload gets a
      // clean read.
      const raw = localStorage.getItem('trikeserve_current_user');
      if (raw) {
        try {
          setUser(JSON.parse(raw));
        } catch {
          localStorage.removeItem('trikeserve_current_user');
        }
      }
    }
  };

  // Initialize default admin accounts
  useEffect(() => {
    if (isLoading) return;

    const initializeAdmins = async () => {
      try {
        const { data: existingAdmins } = await supabase
          .from('admins')
          .select('email')
          .in('email', ['admin@gmail.com', 'admin1@gmail.com']);

        const existingEmails = (existingAdmins || []).map((a: any) => a.email);

        if (!existingEmails.includes('admin@gmail.com')) {
          await supabase.from('admins').insert([{
            email: 'admin@gmail.com',
            name: 'Business & Customer Admin',
            phone: '09171234567',
            admin_type: 'business_customer',
            password_hash: 'admin123',
            is_verified: true,
            created_at: new Date().toISOString(),
          }]);
        }

        if (!existingEmails.includes('admin1@gmail.com')) {
          await supabase.from('admins').insert([{
            email: 'admin1@gmail.com',
            name: 'Driver Admin',
            phone: '09171234568',
            admin_type: 'rider',
            password_hash: 'admin123',
            is_verified: true,
            created_at: new Date().toISOString(),
          }]);
        }
      } catch (error) {
        console.warn('[AuthContext] Admin init failed (non-critical):', error);
      }
    };

    initializeAdmins();
  }, [isLoading]);

  // Legacy account fallback: users registered before Supabase Auth have no
  // auth account, so signInWithPassword fails for them. Their credentials are
  // stored in this device's localStorage (trikeserve_users) from the old
  // signup flow, while their profile lives in the users table. Returns null
  // when there is no matching legacy account (caller shows the normal error).
  const loginLegacyFromLocalStorage = async (
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string } | null> => {
    try {
      const usersJson = localStorage.getItem('trikeserve_users');
      if (!usersJson) return null;

      const storedUsers: any[] = JSON.parse(usersJson);
      const match = storedUsers.find(
        (u) => (u.email || '').toLowerCase() === email.toLowerCase() && u.password === password
      );
      if (!match) return null;

      // Load the profile from the users table (source of truth)
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (profile) {
        const mappedUser = mapSupabaseUser(profile);

        setUser(mappedUser);
        localStorage.setItem('trikeserve_current_user', JSON.stringify(mappedUser));
        console.log('[AuthContext] Legacy login successful (users table profile):', mappedUser.email);
        return { success: true };
      }

      // Profile missing from the users table — build one from the localStorage record
      const legacyRole = match.role || 'customer';
      const mappedUser: User = {
        id: match.id || `legacy-${Date.now()}`,
        email: match.email,
        name: match.name || match.email.split('@')[0],
        role: legacyRole,
        phone: match.phone || '',
        // Same rule as the database read: an absent flag means "not approved"
        // for business and rider, so a stale localStorage record can't stand in
        // for a superadmin decision that was never made.
        isVerified: match.isVerified ?? defaultIsVerified(legacyRole),
        createdAt: match.createdAt || new Date().toISOString(),
        todaPlate: match.todaPlate,
        licenseNumber: match.licenseNumber,
        businessName: match.businessName,
        businessAddress: match.businessAddress,
        address: match.address,
      };
      setUser(mappedUser);
      localStorage.setItem('trikeserve_current_user', JSON.stringify(mappedUser));
      console.log('[AuthContext] Legacy login successful (localStorage profile):', mappedUser.email);
      return { success: true };
    } catch (error) {
      console.error('[AuthContext] Legacy fallback error:', error);
      return null;
    }
  };

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // First, check if user is an admin
      let adminUser = null;
      try {
        const { data, error } = await supabase
          .from('admins')
          .select('*')
          .eq('email', email.toLowerCase())
          .single();

        adminUser = data;
        if (error && error.code !== 'PGRST116') {
          console.warn('[AuthContext] Admin query failed:', error.message);
        }
      } catch (adminQueryError) {
        console.warn('[AuthContext] Admin table error:', adminQueryError);
      }

      if (adminUser) {
        if (adminUser.password_hash !== password) {
          return { success: false, error: 'Invalid email or password' };
        }

        const userToSet: User = {
          id: adminUser.id,
          email: adminUser.email,
          name: adminUser.name,
          role: 'admin',
          phone: adminUser.phone,
          isVerified: adminUser.is_verified,
          createdAt: adminUser.created_at,
          adminType: adminUser.admin_type,
          // Rider Admins are scoped to the terminal the Super Admin assigned.
          terminalId: adminUser.terminal_id,
          terminalName: adminUser.terminal_name,
          // Kept so admin-only Edge Functions (e.g. delete-user) can verify
          // the caller, since admins have no Supabase Auth session.
          password: adminUser.password_hash,
        } as User;

        setUser(userToSet);
        localStorage.setItem('trikeserve_current_user', JSON.stringify(userToSet));
        // Store admin credentials separately so Edge Functions can verify them
        localStorage.setItem('trikeserve_admin_credentials', JSON.stringify({
          email: adminUser.email,
          password: adminUser.password_hash,
        }));
        return { success: true };
      }

      // Regular users: use Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password: password,
      });

      if (authError) {
        if (authError.message.includes('Email not confirmed')) {
          return {
            success: false,
            error: 'Please verify your email address first. Check your inbox for the verification link.',
          };
        }
        if (authError.message.includes('Invalid login')) {
          // Not in Supabase Auth — try legacy localStorage accounts before failing
          const legacyResult = await loginLegacyFromLocalStorage(email, password);
          if (legacyResult) return legacyResult;
          return { success: false, error: 'Invalid email or password' };
        }
        return { success: false, error: authError.message };
      }

      if (authData.user) {
        console.log('[AuthContext] Login successful, loading profile for:', authData.user.id);

        // Load profile from users table
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('id', authData.user.id)
          .maybeSingle();

        if (profile) {
          const mappedUser = mapSupabaseUser(profile);
          setUser(mappedUser);
          localStorage.setItem('trikeserve_current_user', JSON.stringify(mappedUser));

          // A business or rider awaiting superadmin approval is still signed in.
          // Their role stays 'business'/'rider' in the database — that is what
          // approval keys off — but ProtectedRoute routes them as a customer, so
          // their own UI stays locked while the rest of the app still works.
          // Email confirmation is already enforced above: Supabase rejects the
          // sign-in with "Email not confirmed" until the link is clicked.
          console.log('[AuthContext] Login complete:', mappedUser.email, mappedUser.role);
          return { success: true };
        } else {
          // Profile doesn't exist — create a basic one from auth metadata
          console.warn('[AuthContext] No profile found, creating one from auth metadata');
          const authMeta = authData.user.user_metadata || {};
          const metaRole = authMeta.role || 'customer';
          const newProfile: any = {
            id: authData.user.id,
            email: email.toLowerCase(),
            name: authMeta.name || authMeta.full_name || email.split('@')[0],
            phone: authMeta.phone || '',
            role: metaRole,
            // Rebuilding a missing profile must not imply superadmin approval.
            // It used to hardcode is_verified: true, so deleting a pending
            // business's row and logging back in promoted it straight to full
            // business access with nobody ever approving it.
            is_verified: defaultIsVerified(metaRole),
            email_verified: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          // Restore role-specific details captured at signup
          if (authMeta.role === 'customer' && authMeta.address) {
            newProfile.address = authMeta.address;
          }
          if (authMeta.role === 'business') {
            if (authMeta.business_name) newProfile.business_name = authMeta.business_name;
            if (authMeta.business_address) newProfile.business_address = authMeta.business_address;
          }
          if (authMeta.role === 'rider') {
            if (authMeta.toda_plate) newProfile.toda_plate = authMeta.toda_plate;
            if (authMeta.license_number) newProfile.license_number = authMeta.license_number;
          }

          const { error: insertError } = await supabase
            .from('users')
            .insert([newProfile]);

          if (insertError) {
            console.error('[AuthContext] Failed to create profile:', insertError);
            // If insert fails (e.g., duplicate email with different ID), update the existing row
            const { error: updateError } = await supabase
              .from('users')
              .update({
                id: authData.user.id,
                email_verified: true,
                updated_at: new Date().toISOString(),
              })
              .eq('email', email.toLowerCase());

            if (updateError) {
              console.error('[AuthContext] Failed to update existing profile:', updateError);
            }
          }

          const mappedUser = mapSupabaseUser(newProfile);
          setUser(mappedUser);
          localStorage.setItem('trikeserve_current_user', JSON.stringify(mappedUser));
          return { success: true };
        }
      }

      return { success: false, error: 'Login failed' };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'An error occurred during login' };
    }
  };

  const logout = async () => {
    signOutRequestedRef.current = true;
    await supabase.auth.signOut();
    setUser(null);
    localStorage.removeItem('trikeserve_current_user');
    localStorage.removeItem('trikeserve_original_role');
    localStorage.removeItem('trikeserve_post_switch_route');
  };

  const switchUiRole = async (role: User['role']) => {
    if (!user) return;
    if (user.role === role) return;

    const existingOriginal = localStorage.getItem('trikeserve_original_role');
    if (!existingOriginal) {
      localStorage.setItem('trikeserve_original_role', user.role);
    }

    try {
      await supabase.from('users').update({ role }).eq('id', user.id);
    } catch (error) {
      console.error('Error switching role:', error);
    }

    const updatedUser = { ...user, role };
    setUser(updatedUser);
    localStorage.setItem('trikeserve_current_user', JSON.stringify(updatedUser));
  };

  const restoreOriginalRole = async () => {
    if (!user) return;
    const original = localStorage.getItem('trikeserve_original_role');
    if (!original) return;

    const originalRole = original as User['role'];

    try {
      await supabase.from('users').update({ role: originalRole }).eq('id', user.id);
    } catch (error) {
      console.error('Error restoring role:', error);
    }

    const updatedUser = { ...user, role: originalRole };
    setUser(updatedUser);
    localStorage.setItem('trikeserve_current_user', JSON.stringify(updatedUser));
    localStorage.removeItem('trikeserve_original_role');
  };

  const signup = async (data: SignupData): Promise<{ success: boolean; error?: string; userId?: string }> => {
    try {
      // Check if email already exists
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', data.email.toLowerCase())
        .single();

      if (existingUser) {
        return { success: false, error: 'Email already registered' };
      }

      const isAutoVerified = data.role === 'customer';

      // Sign up with Supabase Auth
      // Always redirect verification emails to the hosted web app so mobile
      // (Capacitor) users can complete verification in the browser.
      const WEB_APP_URL = import.meta.env.VITE_WEB_APP_URL || "https://trike-serve.vercel.app";
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email.toLowerCase(),
        password: data.password,
        options: {
          emailRedirectTo: `${WEB_APP_URL}/verify-email`,
          data: {
            name: data.name,
            role: data.role,
            phone: data.phone,
            address: data.address || '',
            business_name: data.businessName || '',
            business_address: data.businessAddress || '',
            business_cuisine: data.businessCuisine || [],
            toda_plate: data.todaPlate || '',
            license_number: data.licenseNumber || '',
          },
        },
      });

      if (authError) {
        console.error('Supabase Auth signup error:', authError);
        if (authError.message.includes('already registered')) {
          return { success: false, error: 'Email already registered' };
        }
        return { success: false, error: authError.message || 'Failed to create account' };
      }

      if (authData.user) {
        // Create profile in users table
        const { error: insertError } = await supabase
          .from('users')
          .insert([{
            id: authData.user.id,
            email: data.email.toLowerCase(),
            name: data.name,
            phone: data.phone,
            role: data.role,
            is_verified: isAutoVerified,
            email_verified: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...(data.role === 'rider' && {
              toda_plate: data.todaPlate,
              license_number: data.licenseNumber,
              is_online: false,
              service_types: ['shared'],
              current_seats: 0,
            }),
            ...(data.role === 'business' && {
              business_name: data.businessName,
              business_address: data.businessAddress,
              business_cuisine: data.businessCuisine ?? [],
            }),
            ...(data.role === 'customer' && {
              address: data.address,
            }),
          }]);

        if (insertError) {
          console.error('Error creating profile:', insertError);
        }

        // Every role must confirm its own email by clicking the link Supabase
        // just sent. Riders and businesses used to be auto-confirmed here via
        // the signup-confirm-email edge function, which let anyone register a
        // driver or shop under an address they don't control — the F2F check at
        // the Barangay Hall never sees that the email was never proven.
        // `email_verified: false` above now stands for all roles, and login
        // surfaces Supabase's "Email not confirmed" until the link is clicked.

        // Also save to localStorage
        const usersJson = localStorage.getItem('trikeserve_users');
        const users: any[] = usersJson ? JSON.parse(usersJson) : [];
        users.push({
          id: authData.user.id,
          email: data.email,
          name: data.name,
          phone: data.phone,
          role: data.role,
          password: data.password,
          isVerified: isAutoVerified,
          createdAt: new Date().toISOString(),
          ...(data.role === 'customer' && { address: data.address }),
          ...(data.role === 'business' && { businessName: data.businessName, businessAddress: data.businessAddress, businessCuisine: data.businessCuisine ?? [] }),
          ...(data.role === 'rider' && { todaPlate: data.todaPlate, licenseNumber: data.licenseNumber }),
        });
        localStorage.setItem('trikeserve_users', JSON.stringify(users));

        if (data.role === 'business') {
          localStorage.setItem(`restaurantData_${data.email}`, JSON.stringify({
            name: data.businessName || "My Restaurant",
            subtitle: data.businessAddress || "Gen T Deleon, Valenzuela",
            logo: "🍽️",
            heroImage: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800",
            deliveryTime: "25-35 min",
            deliveryFee: 35,
            rating: 0,
            ratingCount: 0,
            address: data.businessAddress || "",
            // Carried from sign-up so the shop's own map opens on the pin it
            // chose while registering, not the default city centre.
            latitude: data.businessLat ?? null,
            longitude: data.businessLng ?? null,
            cuisine: data.businessCuisine ?? [],
            operatingHours: "8:00 AM - 10:00 PM"
          }));
          localStorage.setItem(`menuItems_${data.email}`, JSON.stringify([]));
        }

        return { success: true, userId: authData.user.id };
      }

      return { success: false, error: 'Failed to create account' };
    } catch (error) {
      console.error('Signup error:', error);
      return { success: false, error: 'An error occurred during signup. Please try again.' };
    }
  };

  const resendVerificationEmail = async (email: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // Send the resent link to the same page as the original signup email.
      // Without this Supabase falls back to the project Site URL and the user
      // lands on the app root instead of the verification screen.
      const WEB_APP_URL = import.meta.env.VITE_WEB_APP_URL || "https://trike-serve.vercel.app";
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email.toLowerCase(),
        options: {
          emailRedirectTo: `${WEB_APP_URL}/verify-email`,
        },
      });

      if (error) {
        return { success: false, error: error.message || 'Failed to resend verification email.' };
      }

      return { success: true };
    } catch (error) {
      console.error('Resend verification error:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const updateProfile = async (data: Partial<User>): Promise<{ success: boolean; error?: string }> => {
    try {
      if (!user) {
        return { success: false, error: 'No user logged in' };
      }

      const updatePayload: Record<string, any> = { updated_at: new Date().toISOString() };
      if (data.name !== undefined) updatePayload.name = data.name;
      if (data.phone !== undefined) updatePayload.phone = data.phone;
      if (data.address !== undefined) updatePayload.address = data.address;
      if (data.todaPlate !== undefined) updatePayload.toda_plate = data.todaPlate;
      if (data.licenseNumber !== undefined) updatePayload.license_number = data.licenseNumber;
      if (data.pickupLocation !== undefined) updatePayload.pickup_location = data.pickupLocation;
      if (data.dropoffLocation !== undefined) updatePayload.dropoff_location = data.dropoffLocation;
      if (data.isOnline !== undefined) updatePayload.is_online = data.isOnline;
      if (data.serviceTypes !== undefined) updatePayload.service_types = data.serviceTypes;
      if (data.currentSeats !== undefined) updatePayload.current_seats = data.currentSeats;
      if (data.businessName !== undefined) updatePayload.business_name = data.businessName;
      if (data.businessAddress !== undefined) updatePayload.business_address = data.businessAddress;
      if (data.avatarUrl !== undefined) updatePayload.avatar_url = data.avatarUrl;

      const { error: updateError } = await supabase
        .from('users')
        .update(updatePayload)
        .eq('id', user.id);

      // A failed write must not be reported as a success. This used to log the
      // error and then fall through to `return { success: true }`, so the UI
      // showed "Saved" while the row was unchanged — a profile edit that looked
      // like it worked and silently wasn't.
      if (updateError) {
        console.error('Error updating profile:', updateError);
        return { success: false, error: 'Could not save your details. Please try again.' };
      }

      const updatedUser = { ...user, ...data };
      setUser(updatedUser);
      localStorage.setItem('trikeserve_current_user', JSON.stringify(updatedUser));

      return { success: true };
    } catch (error) {
      console.error('Update profile error:', error);
      return { success: false, error: 'An error occurred while updating profile' };
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, signup, updateProfile, switchUiRole, restoreOriginalRole, resendVerificationEmail }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
