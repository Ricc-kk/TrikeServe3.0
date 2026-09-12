import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import { ChevronDown, Users } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useAuth } from "../contexts/AuthContext";
import { supabase } from "../../utils/supabase";
import tagalagImage from "../../assets/trikserve_loginpage.jpg";

interface TestAccount {
  email: string;
  name: string;
  role: string;
  subrole?: string;
  password?: string;
}

// Styling per role (matches the admin panel's role colors)
const ROLE_BADGE: Record<string, string> = {
  admin: "bg-[#FFF1F2] text-[#E11D48]",
  rider: "bg-[#DBEAFE] text-[#3B82F6]",
  business: "bg-[#F3E8FF] text-[#9333EA]",
  customer: "bg-[#D1FAE5] text-[#10B981]",
};

const ROLE_ORDER: Record<string, number> = {
  admin: 0,
  rider: 1,
  business: 2,
  customer: 3,
};

function roleLabel(acc: TestAccount): string {
  if (acc.role === "admin") {
    if (acc.subrole === "rider") return "Driver Admin";
    if (acc.subrole === "business_customer") return "Business & Customer Admin";
    return "Admin";
  }
  if (acc.role === "rider") return "Driver";
  return acc.role;
}

export default function Login() {
  const navigate = useNavigate();
  const { login, resendVerificationEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  const [accounts, setAccounts] = useState<TestAccount[]>([]);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendMessage, setResendMessage] = useState("");


  // Load all created accounts (localStorage users + Supabase admins/users)
  // so testers can fill the login form with one click.
  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    const list: TestAccount[] = [];
    const seen = new Set<string>();

    const add = (acc: TestAccount) => {
      const key = (acc.email || "").toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      list.push(acc);
    };

    // 1. LocalStorage users (these carry their password, unlike Supabase rows)
    try {
      const raw = localStorage.getItem("trikeserve_users");
      if (raw) {
        const stored = JSON.parse(raw);
        (Array.isArray(stored) ? stored : []).forEach((u: any) => {
          const name =
            u.name ||
            [u.first_name, u.last_name].filter(Boolean).join(" ") ||
            u.email ||
            "User";
          add({ email: u.email, name, role: u.role || "customer", password: u.password || "" });
        });
      }
    } catch {
      /* ignore malformed storage */
    }

    // 2. Supabase admins (password_hash is the plaintext password in this app)
    try {
      const { data, error } = await supabase
        .from("admins")
        .select("email, name, admin_type, password_hash");
      if (!error && data) {
        data.forEach((a: any) => {
          add({
            email: a.email,
            name: a.name || "Admin",
            role: "admin",
            subrole: a.admin_type,
            password: a.password_hash || "admin123",
          });
        });
      }
    } catch {
      /* supabase unavailable */
    }

    // 3. Supabase users (no server-side password; login skips the check for them)
    try {
      const { data, error } = await supabase
        .from("users")
        .select("email, name, role");
      if (!error && data) {
        data.forEach((u: any) => {
          add({ email: u.email, name: u.name || u.email || "User", role: u.role || "customer" });
        });
      }
    } catch {
      /* supabase unavailable */
    }

    // Admins first, then grouped by role, then by name
    list.sort((a, b) => {
      const byRole = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9);
      if (byRole !== 0) return byRole;
      return a.name.localeCompare(b.name);
    });

    setAccounts(list);
  };

  const useAccount = (acc: TestAccount) => {
    setEmail(acc.email);
    // Supabase users have no server-side password (login accepts any value), so
    // fill a dummy to satisfy the required field.
    setPassword(acc.password || "demo123");
    setError("");
    setShowAccounts(false);
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    
    const result = await login(email, password);
    
    setIsLoading(false);
    
    if (result.success) {
      // Redirect immediately, then show welcome popup on destination page
      // Store welcome data for the popup
      const matched = accounts.find(a => a.email.toLowerCase() === email.toLowerCase());
      const displayName = matched?.name || email.split('@')[0];
      sessionStorage.setItem('trikeserve_welcome_name', displayName);
      sessionStorage.setItem('trikeserve_show_welcome', 'true');
      navigate('/redirect');
    } else {
      setError(result.error || "Login failed");
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      setResendMessage("Please enter your email address above first.");
      setResendStatus("error");
      return;
    }

    setResendStatus("sending");
    setResendMessage("");

    const result = await resendVerificationEmail(email);

    if (result.success) {
      setResendStatus("sent");
      setResendMessage("Verification email sent! Check your inbox.");
    } else {
      setResendStatus("error");
      setResendMessage(result.error || "Failed to send verification email.");
    }
  };

  const isVerificationError = error.includes("verify your email");

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Background Design (hidden on mobile) */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden">
        {/* Background Image */}
        <img 
          src={tagalagImage} 
          alt="Gen T Deleon" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#E11D48]/90 via-[#BE123C]/85 to-[#121212]/90" />

        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <h1 className="text-7xl font-extrabold mb-6" style={{ letterSpacing: '-0.02em' }}>
            TrikeServe
          </h1>
          <p className="text-3xl font-bold mb-4 text-white/90">
            Community-Based<br />Tricycle Platform
          </p>
          <div className="space-y-3 mb-8">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-white rounded-full" />
              <p className="text-lg text-white/80">Shared & Private Rides</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-white rounded-full" />
              <p className="text-lg text-white/80">Food Delivery Service</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-white rounded-full" />
              <p className="text-lg text-white/80">Fixed TODA Rates</p>
            </div>
          </div>
          
          <div className="bg-white/20 text-white border border-white/30 backdrop-blur-sm w-fit px-3 py-1 rounded-md text-sm">
            Serving Gen T Deleon, Philippines
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 lg:max-w-xl flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-5xl font-extrabold mb-2" style={{ letterSpacing: '-0.02em', color: '#E11D48' }}>
              TrikeServe
            </h1>
            <p className="text-sm text-[#64748B]">Community-Based Tricycle Platform</p>
          </div>

          <div className="mb-6">
            <h2 className="text-3xl font-bold text-[#121212] mb-2">Welcome Back</h2>
            <p className="text-[#64748B]">Sign in to your TrikeServe account</p>
          </div>

          <form onSubmit={handleManualLogin} className="space-y-5">
            {error && (
              <div className="border-2 border-red-200 rounded-lg p-4 bg-red-50">
                <p className="text-sm text-red-800">{error}</p>
                {isVerificationError && (
                  <div className="mt-3 pt-3 border-t border-red-200">
                    {resendStatus === "sent" ? (
                      <p className="text-sm text-green-700 font-medium">{resendMessage}</p>
                    ) : resendStatus === "error" ? (
                      <p className="text-sm text-red-600">{resendMessage}</p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={resendStatus === "sending"}
                        className="text-sm text-[#E11D48] font-semibold hover:underline disabled:opacity-50"
                      >
                        {resendStatus === "sending" ? "Sending..." : "Resend verification email"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-[#121212] mb-2">
                Email Address
              </label>
              <Input
                type="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border-2 border-[#CBD5E1] focus:border-[#E11D48] h-12"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[#121212] mb-2">
                Password
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-2 border-[#CBD5E1] focus:border-[#E11D48] h-12"
                required
                disabled={isLoading}
              />
              <div className="mt-2 text-right">
                <Link to="/forgot-password" className="text-xs text-[#E11D48] font-semibold hover:underline">
                  Forgot Password?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase text-base py-6"
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  SIGNING IN...
                </div>
              ) : (
                'SIGN IN'
              )}
            </Button>
          </form>

          {/* Quick Access - Test Accounts */}
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowAccounts(!showAccounts)}
              disabled={isLoading}
              className="w-full flex items-center justify-between px-4 py-3 border-2 border-[#CBD5E1] rounded-xl hover:border-[#E11D48] transition-all bg-[#F8F9FA]"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-[#121212]">
                <Users size={16} className="text-[#E11D48]" />
                Quick Access — Test Accounts ({accounts.length})
              </span>
              <ChevronDown
                size={16}
                className={`text-[#64748B] transition-transform ${showAccounts ? "rotate-180" : ""}`}
              />
            </button>

            {showAccounts && (
              <div className="mt-2 border-2 border-[#E2E8F0] rounded-xl bg-white max-h-72 overflow-y-auto divide-y divide-[#E2E8F0]">
                {accounts.length === 0 && (
                  <p className="p-4 text-sm text-[#64748B] italic">
                    No accounts found yet — create one via Sign Up.
                  </p>
                )}
                {accounts.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    onClick={() => useAccount(acc)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#F8F9FA] transition-all text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${ROLE_BADGE[acc.role] || "bg-[#F8F9FA] text-[#64748B]"}`}
                      >
                        {(acc.name || "?")[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#121212] truncate">{acc.name}</p>
                        <p className="text-xs text-[#64748B] truncate">{acc.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${ROLE_BADGE[acc.role] || "bg-[#F8F9FA] text-[#64748B]"}`}
                      >
                        {roleLabel(acc)}
                      </span>
                      {acc.password && (
                        <span className="text-[10px] text-[#64748B]">pw: {acc.password}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 pt-6 border-t-2 border-[#CBD5E1]">
            <p className="text-sm text-[#64748B] text-center mb-3">
              New to TrikeServe?
            </p>
            <Link to="/signup">
              <Button
                variant="outline"
                className="w-full border-2 border-[#CBD5E1] hover:border-[#E11D48]"
                disabled={isLoading}
              >
                Create Account
              </Button>
            </Link>
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs text-[#64748B]">
              TODA-regulated pricing • Community trust system
            </p>
          </div>
        </div>
      </div>


    </div>
  );
}