import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, Link } from "react-router";
import { ChevronDown, Eye, EyeOff, Users } from "lucide-react";
import { armWelcomeGreeting } from "../../lib/welcomeGreeting";
import { useDevModeFeature, useDevModeStatus } from "../hooks/useDevModeSettings";
import TrikeServeLogo from "../../assets/TRIKESERVE_logo.jpg";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import TrimmedLogo from "./ui/TrimmedLogo";
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

/**
 * Password Quick Access fills in for customer, driver and business accounts.
 *
 * Those roles are signed in through Supabase Auth, which verifies the real
 * password — so this only logs an account in if its password genuinely is
 * Admin12345. It is a developer convenience for accounts seeded with that
 * password, not a bypass.
 *
 * "admin" is in the set now too, and that needs saying plainly, because the role
 * used to be excluded on the grounds that an admin's password is known already.
 * That is true of a row in the `admins` table, whose `password_hash` this file
 * reads — and those rows keep it, because Quick Access only fills in a blank.
 * It is not true of a driver-admin: someone who drives for a TODA and runs it as
 * a terminal admin is a `users` row whose `role` flips to 'admin' while they are
 * inside the admin app. They have no `admins.password_hash` at all, so excluding
 * the role left their Quick Access entry with no password and nothing to click.
 *
 * Quick Access still never overrides a password it knows; the fill is guarded on
 * the password being absent, so this only reaches accounts with nothing stored.
 */
const QUICK_ACCESS_PASSWORD = "Admin12345";
const DEV_MODE_HOLD_MS = 5000;

/** Roles Quick Access supplies QUICK_ACCESS_PASSWORD for. */
const QUICK_ACCESS_ROLES = new Set(["customer", "rider", "business", "admin"]);

// Styling per role (matches the admin panel's role colors)
const ROLE_BADGE: Record<string, string> = {
  admin: "bg-[var(--primary-soft)] text-[var(--primary)]",
  rider: "bg-[var(--info-soft)] text-[var(--info)]",
  business: "bg-[var(--violet-soft)] text-[var(--violet)]",
  customer: "bg-[var(--success-soft)] text-[var(--success)]",
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
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDevMode, setIsDevMode] = useDevModeStatus();
  const [quickAccessEnabled] = useDevModeFeature("quickAccess");
  const [showAccounts, setShowAccounts] = useState(false);
  const [accounts, setAccounts] = useState<TestAccount[]>([]);
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [resendMessage, setResendMessage] = useState("");
  const [loginSessionNotice, setLoginSessionNotice] = useState<{
    displayName: string;
    otherSessionWillBeSignedOut: boolean;
  } | null>(null);
  const loginSessionNoticeRef = useRef<HTMLElement>(null);
  const devModeHoldTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!loginSessionNotice) return;
    const dialog = loginSessionNoticeRef.current;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusableElements = () => dialog?.querySelectorAll<HTMLElement>(focusableSelector);
    getFocusableElements()?.[0]?.focus();

    const keepNoticeFocused = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements();
      if (!focusable?.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', keepNoticeFocused, true);
    return () => {
      document.removeEventListener('keydown', keepNoticeFocused, true);
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [loginSessionNotice !== null]);

  const startDevModeHold = () => {
    if (devModeHoldTimer.current !== null) return;

    devModeHoldTimer.current = window.setTimeout(() => {
      const nextMode = !isDevMode;
      setIsDevMode(nextMode);
      setShowAccounts(false);
      devModeHoldTimer.current = null;
    }, DEV_MODE_HOLD_MS);
  };

  const cancelDevModeHold = () => {
    if (devModeHoldTimer.current !== null) {
      window.clearTimeout(devModeHoldTimer.current);
      devModeHoldTimer.current = null;
    }
  };

  const exitDevMode = () => {
    setIsDevMode(false);
    setShowAccounts(false);
  };


  useEffect(() => () => {
    if (devModeHoldTimer.current !== null) {
      window.clearTimeout(devModeHoldTimer.current);
    }
  }, []);

  const loadAccounts = useCallback(async () => {
    const list: TestAccount[] = [];
    const seen = new Set<string>();

    const add = (acc: TestAccount) => {
      const key = (acc.email || "").toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      // A password we already know is left alone. Overwriting a real stored
      // password with the shared one would guarantee the quick-access click
      // fails for that account, which is the opposite of the point.
      if (!acc.password && QUICK_ACCESS_ROLES.has(acc.role)) {
        list.push({ ...acc, password: QUICK_ACCESS_PASSWORD });
        return;
      }
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
  }, []);

  useEffect(() => {
    if (!isDevMode || !quickAccessEnabled) {
      setShowAccounts(false);
      return;
    }

    // Load account shortcuts only while Dev Mode is enabled.
    void loadAccounts();
  }, [isDevMode, quickAccessEnabled, loadAccounts]);

  const useAccount = (acc: TestAccount) => {
    setEmail(acc.email);
    setPassword(
      acc.password ||
      (QUICK_ACCESS_ROLES.has(acc.role) ? QUICK_ACCESS_PASSWORD : "demo123")
    );
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
      // Redirect immediately, then show welcome popup on destination page.
      //
      // Held in memory rather than sessionStorage: sessionStorage survives a page
      // reload, so a flag written here could be replayed much later on a screen
      // the customer had merely navigated to, greeting them for a sign-in that
      // happened minutes or hours ago. See welcomeGreeting.ts.
      const matched = accounts.find(a => a.email.toLowerCase() === email.toLowerCase());
      const displayName = matched?.name || email.split('@')[0];
      if (result.otherSessionActive) {
        setLoginSessionNotice({
          displayName,
          otherSessionWillBeSignedOut: Boolean(result.otherSessionWillBeSignedOut),
        });
        return;
      }
      armWelcomeGreeting(displayName);
      navigate('/redirect');
    } else {
      setError(result.error || "Login failed");
    }
  };

  const continueAfterSessionNotice = () => {
    if (!loginSessionNotice) return;
    armWelcomeGreeting(loginSessionNotice.displayName);
    setLoginSessionNotice(null);
    navigate('/redirect');
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
      {loginSessionNotice && (
        <div className="fixed inset-0 z-[10060] grid place-items-center bg-black/55 px-4 backdrop-blur-sm" role="presentation">
          <section
            ref={loginSessionNoticeRef}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="login-session-notice-title"
            aria-describedby="login-session-notice-description"
            className="w-full max-w-sm rounded-2xl border border-line bg-card p-6 text-center shadow-2xl"
          >
            <h2 id="login-session-notice-title" className="text-lg font-bold text-[var(--ink)]">Account already signed in</h2>
            <p id="login-session-notice-description" className="mt-2 text-sm text-[var(--muted-foreground)]">
              {loginSessionNotice.otherSessionWillBeSignedOut
                ? "Another session is already active. The other signed-in device will be signed out so you can continue here."
                : "Another session is active. Both devices can stay signed in under the current session limit."}
            </p>
            <Button
              type="button"
              onClick={continueAfterSessionNotice}
              className="mt-5 w-full bg-[var(--primary)] text-base"
            >
              Continue to home
            </Button>
          </section>
        </div>
      )}
      {/* Left Side - Background Design (hidden on mobile) */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden">
        {/* Background Image */}
        <img 
          src={tagalagImage} 
          alt="Gen T Deleon" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary)]/90 via-[var(--primary)]/85 to-[var(--ink)]/90" />

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
              <div className="w-2 h-2 bg-surface rounded-full" />
              <p className="text-lg text-white/80">Shared & Private Rides</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-surface rounded-full" />
              <p className="text-lg text-white/80">Food Delivery Service</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-surface rounded-full" />
              <p className="text-lg text-white/80">Fixed TODA Rates</p>
            </div>
          </div>
          
          <div className="bg-white/20 text-white border border-white/30 backdrop-blur-sm w-fit px-3 py-1 rounded-md text-sm">
            Serving Gen T Deleon, Philippines
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="min-w-0 flex-1 lg:max-w-xl flex items-start justify-center p-6 pt-10 bg-surface">
        <div className="w-full max-w-md">
          <div className="mb-7 flex justify-center lg:justify-start">
            <button
              type="button"
              aria-label="Hold the TrikeServe logo for 5 seconds to toggle developer mode"
              aria-pressed={isDevMode}
              title="Hold for 5 seconds to toggle developer mode"
              onPointerDown={startDevModeHold}
              onPointerUp={cancelDevModeHold}
              onPointerLeave={cancelDevModeHold}
              onPointerCancel={cancelDevModeHold}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  startDevModeHold();
                }
              }}
              onKeyUp={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  cancelDevModeHold();
                }
              }}
              onContextMenu={(event) => event.preventDefault()}
              className="relative h-24 w-36 touch-none select-none overflow-hidden rounded-2xl bg-[#EBEBEB] text-left ring-1 ring-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
            >
              <TrimmedLogo
                src={TrikeServeLogo}
                alt="TrikeServe logo"
                className="size-full object-contain p-1"
              />
            </button>
          </div>

          {isDevMode && quickAccessEnabled && (
            <section aria-label="Developer mode tools" className="mb-6 space-y-3">
              <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-[var(--primary)]/30 bg-[var(--primary-soft)] px-4 py-3">
                <span className="text-sm font-semibold text-[var(--primary)]">Developer mode enabled</span>
                <button
                  type="button"
                  onClick={exitDevMode}
                  className="shrink-0 text-sm font-semibold text-[var(--primary)] underline underline-offset-2"
                >
                  Turn off
                </button>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowAccounts(!showAccounts)}
                  aria-expanded={showAccounts}
                  aria-controls="dev-mode-test-accounts"
                  disabled={isLoading}
                  className="w-full flex items-center justify-between px-4 py-3 border border-line rounded-xl hover:border-[var(--primary)] transition-all bg-[var(--muted)]"
                >
                  <span className="flex min-w-0 items-center gap-2 text-left text-sm font-semibold text-[var(--ink)]">
                    <Users size={16} className="text-[var(--primary)]" />
                    Quick Access — Test Accounts ({accounts.length})
                  </span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 text-[var(--muted-foreground)] transition-transform ${showAccounts ? "rotate-180" : ""}`}
                  />
                </button>

                <div id="dev-mode-test-accounts" hidden={!showAccounts} className="mt-2 w-full min-w-0 border border-line rounded-xl bg-surface max-h-72 overflow-y-auto divide-y divide-[var(--border)]">
                    {accounts.length === 0 && (
                      <p className="p-4 text-sm text-[var(--muted-foreground)] italic">
                        No accounts found yet — create one via Sign Up.
                      </p>
                    )}
                    {accounts.map((acc) => (
                      <button
                        key={acc.email}
                        type="button"
                        onClick={() => useAccount(acc)}
                        className="w-full min-w-0 flex flex-col items-stretch gap-2 px-4 py-3 hover:bg-[var(--muted)] transition-all text-left sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex min-w-0 items-center gap-3 sm:flex-1">
                          <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${ROLE_BADGE[acc.role] || "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}
                          >
                            {(acc.name || "?")[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--ink)] truncate">{acc.name}</p>
                            <p className="text-xs text-[var(--muted-foreground)] truncate">{acc.email}</p>
                          </div>
                        </div>
                        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:flex-shrink-0 sm:flex-nowrap">
                          <span
                            className={`max-w-full truncate text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${ROLE_BADGE[acc.role] || "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}
                          >
                            {roleLabel(acc)}
                          </span>
                          {acc.password && (
                            <span className="shrink-0 text-[10px] text-[var(--muted-foreground)]">pw: {acc.password}</span>
                          )}
                        </div>
                      </button>
                    ))}
                </div>
              </div>
            </section>
          )}

          <div className="mb-6">
            <h2 className="text-3xl font-bold text-[var(--ink)] mb-2">Welcome Back</h2>
            <p className="text-[var(--muted-foreground)]">Sign in to your TrikeServe account</p>
          </div>

          <form onSubmit={handleManualLogin} className="space-y-5">
            {error && (
              <div className="border-2 border-[var(--error-soft)] rounded-lg p-4 bg-[var(--error-soft)]">
                <p className="text-sm text-[var(--error)]">{error}</p>
                {isVerificationError && (
                  <div className="mt-3 pt-3 border-t border-[var(--error-soft)]">
                    {resendStatus === "sent" ? (
                      <p className="text-sm text-[var(--success)] font-medium">{resendMessage}</p>
                    ) : resendStatus === "error" ? (
                      <p className="text-sm text-[var(--error)]">{resendMessage}</p>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResendVerification}
                        disabled={resendStatus === "sending"}
                        className="text-sm text-[var(--primary)] font-semibold hover:underline disabled:opacity-50"
                      >
                        {resendStatus === "sending" ? "Sending..." : "Resend verification email"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                Email Address
              </label>
              <Input
                type="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="border border-line focus:border-[var(--primary)] h-12"
                required
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                Password
              </label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="border border-line focus:border-[var(--primary)] h-12 pr-12"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  disabled={isLoading}
                  className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:text-[var(--primary)] disabled:opacity-50"
                >
                  {showPassword ? (
                    <EyeOff className="size-5" aria-hidden="true" />
                  ) : (
                    <Eye className="size-5" aria-hidden="true" />
                  )}
                </button>
              </div>
              <div className="mt-2 text-right">
                <Link to="/forgot-password" className="text-xs text-[var(--primary)] font-semibold hover:underline">
                  Forgot Password?
                </Link>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-base py-6"
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

          <div className="mt-6 pt-6 border-t-2 border-[var(--border)]">
            <p className="text-sm text-[var(--muted-foreground)] text-center mb-3">
              New to TrikeServe?
            </p>
            <Link to="/signup">
              <Button
                variant="outline"
                className="w-full border border-line hover:border-[var(--primary)]"
                disabled={isLoading}
              >
                Create Account
              </Button>
            </Link>
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs text-[var(--muted-foreground)]">
              TODA-regulated pricing • Community trust system
            </p>
          </div>
        </div>
      </div>


    </div>
  );
}
