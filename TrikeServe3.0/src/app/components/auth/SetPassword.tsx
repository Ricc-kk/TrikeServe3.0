import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router";
import { ArrowLeft, Lock, CheckCircle, Loader2, Eye, EyeOff, Smartphone } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { supabase } from "../../../lib/supabase";
import { getAuthLinkParams, waitForSession } from "../../../lib/authLink";

/** Detect if user is on a mobile device (browser on phone, not inside the app) */
function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
}

export default function SetPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"loading" | "form" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const invalidLink =
      "Invalid or expired reset link. Please request a new one from the login page.";

    const fail = (message: string) => {
      if (cancelled) return;
      setStep("error");
      setMessage(message);
    };

    const resolveRecoverySession = async () => {
      // Read the callback params from the snapshot taken at module load —
      // supabase-js clears window.location.hash while it consumes them.
      const { kind, tokenHash, code, hasToken } = getAuthLinkParams();

      // No token in the URL. Someone who already has a session can still change
      // their password; otherwise this isn't a valid reset link.
      if (!hasToken) {
        const { data } = await supabase.auth.getSession();
        if (cancelled) return;
        if (data.session) {
          setStep("form");
        } else {
          fail(invalidLink);
        }
        return;
      }

      if (kind !== "recovery" && kind !== "none") {
        fail(invalidLink);
        return;
      }

      // Link style A: ?token_hash=...&type=recovery (custom email templates)
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        if (error) {
          console.error("[SetPassword] verifyOtp failed:", error);
          fail(invalidLink);
          return;
        }
      }

      // Link style B: ?code=... (PKCE flow)
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error("[SetPassword] exchangeCodeForSession failed:", error);
          fail(invalidLink);
          return;
        }
      }

      // Link style C (Supabase's default template): #access_token=...&type=recovery
      // supabase-js has already turned that into a session, so just wait for it.
      const session = await waitForSession();
      if (cancelled) return;
      if (session) {
        setStep("form");
      } else {
        fail(invalidLink);
      }
    };

    resolveRecoverySession().catch((err) => {
      console.error("[SetPassword] Reset link handling failed:", err);
      fail("Failed to establish session. Please try again.");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!/[A-Z]/.test(newPassword)) {
      setError("Password must contain at least one uppercase letter");
      return;
    }
    if (!/[a-z]/.test(newPassword)) {
      setError("Password must contain at least one lowercase letter");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setError("Password must contain at least one number");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsUpdating(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        console.error("[SetPassword] Update error:", updateError);
        setError(updateError.message || "Failed to update password");
        setIsUpdating(false);
        return;
      }

      setStep("success");
    } catch (err) {
      console.error("[SetPassword] Network error:", err);
      setError("An error occurred. Please try again.");
      setIsUpdating(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side — branding */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-[var(--primary)] via-[var(--primary)] to-[var(--ink)] relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 opacity-10">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />
          </div>
          <div className="absolute top-20 left-20 w-64 h-64 bg-white/10 rounded-full blur-3xl animate-pulse" />
          <div
            className="absolute bottom-20 right-20 w-96 h-96 bg-white/5 rounded-full blur-3xl animate-pulse"
            style={{ animationDelay: "1s" }}
          />
        </div>

        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <h1 className="text-7xl font-extrabold mb-6" style={{ letterSpacing: "-0.02em" }}>
            Set Password
          </h1>
          <p className="text-3xl font-bold mb-8 text-white/90">
            Create a New<br />Secure Password
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold text-[var(--primary)]">1</span>
              </div>
              <div>
                <p className="text-lg font-semibold">Enter New Password</p>
                <p className="text-sm text-white/70">At least 8 characters with mixed case</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold">2</span>
              </div>
              <div>
                <p className="text-lg font-semibold">Confirm Password</p>
                <p className="text-sm text-white/70">Make sure both match</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold">3</span>
              </div>
              <div>
                <p className="text-lg font-semibold">Log In</p>
                <p className="text-sm text-white/70">Access your account with the new password</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side — form */}
      <div className="flex-1 lg:max-w-xl flex items-center justify-center p-6 bg-surface">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="mb-6">
            <Link to="/">
              <Button variant="ghost" size="sm" className="mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Sign In
              </Button>
            </Link>
            <h2 className="text-3xl font-bold text-[var(--ink)] mb-2">
              {step === "loading" && "Verifying Link..."}
              {step === "form" && "Set New Password"}
              {step === "success" && "Password Updated!"}
              {step === "error" && "Reset Failed"}
            </h2>
            <p className="text-[var(--muted-foreground)]">
              {step === "loading" && "Please wait..."}
              {step === "form" && "Create a new password for your account"}
              {step === "success" && "Your password has been updated successfully."}
              {step === "error" && message}
            </p>
          </div>

          {/* Loading State */}
          {step === "loading" && (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-[var(--info-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-10 h-10 text-[var(--info)] animate-spin" />
              </div>
              <p className="text-[var(--muted-foreground)]">Verifying your reset link...</p>
            </div>
          )}

          {/* Password Form */}
          {step === "form" && (
            <form onSubmit={handleSetPassword} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setError("");
                    }}
                    className="border border-line focus:border-[var(--primary)] h-12 pl-11 pr-11"
                    required
                    disabled={isUpdating}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--ink)]"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-[var(--muted-foreground)] mt-2">
                  At least 8 characters, 1 uppercase, 1 lowercase, 1 number
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                  <Input
                    type={showConfirm ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError("");
                    }}
                    className="border border-line focus:border-[var(--primary)] h-12 pl-11 pr-11"
                    required
                    disabled={isUpdating}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--ink)]"
                  >
                    {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-[var(--error-soft)] border-2 border-[var(--error-soft)] rounded-lg">
                  <p className="text-sm text-[var(--error)]">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isUpdating}
                className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-base py-6"
              >
                {isUpdating ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "UPDATE PASSWORD"
                )}
              </Button>
            </form>
          )}

          {/* Success State */}
          {step === "success" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-[var(--success-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-10 h-10 text-[var(--success)]" />
                </div>
                <h3 className="text-2xl font-bold text-[var(--ink)] mb-2">All Done!</h3>
                <p className="text-[var(--muted-foreground)] text-sm">
                  Your password has been updated. You can now log in with your new password.
                </p>
              </div>

              {/* Mobile hint */}
              {isMobileDevice() && (
                <div className="p-4 bg-[var(--info-soft)] border-2 border-[var(--info-soft)] rounded-lg">
                  <div className="flex items-start gap-3">
                    <Smartphone className="w-5 h-5 text-[var(--info)] mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-[var(--info)]">Using the mobile app?</p>
                      <p className="text-xs text-[var(--info)] mt-1">
                        Open the TrikeServe app and log in with your new password.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Link to="/">
                <Button className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-base py-6">
                  GO TO LOGIN
                </Button>
              </Link>
            </div>
          )}

          {/* Error State */}
          {step === "error" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-[var(--error-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-10 h-10 text-[var(--error)]" />
                </div>
              </div>

              <Link to="/forgot-password">
                <Button className="w-full bg-[var(--primary)] hover:bg-[var(--primary)] text-base py-6">
                  REQUEST NEW RESET LINK
                </Button>
              </Link>

              <Link to="/">
                <Button variant="outline" className="w-full border border-line hover:border-[var(--primary)]">
                  BACK TO LOGIN
                </Button>
              </Link>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm text-[var(--muted-foreground)]">
              Remember your password?{" "}
              <Link to="/" className="text-[var(--primary)] font-semibold hover:underline">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
