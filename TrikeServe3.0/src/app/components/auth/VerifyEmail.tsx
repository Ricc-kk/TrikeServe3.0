import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router";
import { ArrowLeft, CheckCircle, Loader2, Mail, RefreshCw, Smartphone } from "lucide-react";
import { Button } from "../ui/button";
import { supabase } from "../../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";
import { getAuthLinkParams, waitForSession } from "../../../lib/authLink";

/** Detect if user is on a mobile device (browser on phone, not inside the app) */
function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
}

export default function VerifyEmail() {
  const navigate = useNavigate();
  const { resendVerificationEmail } = useAuth();
  const [status, setStatus] = useState<"loading" | "success" | "error" | "waiting">("loading");
  const [message, setMessage] = useState("");
  const [resendEmail, setResendEmail] = useState("");
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  useEffect(() => {
    const invalidLink =
      "Verification link is invalid or has expired. Please request a new one.";

    const showWaiting = () => {
      setStatus("waiting");
      setMessage("Check your inbox and click the verification link to activate your account.");
    };

    const verifySignup = async () => {
      // Read the callback params from the snapshot taken at module load —
      // supabase-js clears window.location.hash while it consumes them.
      const { kind, tokenHash, code, hasToken } = getAuthLinkParams();

      // Nothing in the URL — the user just opened this page directly.
      if (!hasToken) {
        showWaiting();
        return;
      }

      // Password-recovery links belong on /set-password, not here.
      if (kind !== "signup" && kind !== "none") {
        showWaiting();
        return;
      }

      const succeed = () => {
        setStatus("success");
        setMessage("Your email has been verified successfully!");
      };
      const fail = (error: unknown, context: string) => {
        console.error(`[VerifyEmail] ${context}:`, error);
        setStatus("error");
        setMessage(invalidLink);
      };

      // Link style A: ?token_hash=...&type=signup (custom email templates)
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "signup" });
        return error ? fail(error, "verifyOtp failed") : succeed();
      }

      // Link style B: ?code=... (PKCE flow)
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        return error ? fail(error, "exchangeCodeForSession failed") : succeed();
      }

      // Link style C (Supabase's default template): #access_token=...&type=signup
      // supabase-js has already consumed that hash and created the session, so
      // there is no token left to exchange — just confirm the session exists.
      // Calling verifyOtp with the access token here would always fail.
      const session = await waitForSession();
      return session ? succeed() : fail(new Error("No session established"), "No session");
    };

    verifySignup().catch((err) => {
      console.error("[VerifyEmail] Verification error:", err);
      setStatus("error");
      setMessage("An error occurred while verifying your email.");
    });
  }, []);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsResending(true);
    setResendSuccess(false);

    const trimmed = resendEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setIsResending(false);
      return;
    }

    const result = await resendVerificationEmail(trimmed);
    setIsResending(false);

    if (result.success) {
      setResendSuccess(true);
      setMessage("A new verification email has been sent.");
    } else {
      setMessage(result.error || "Failed to resend verification email.");
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side — branding */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-[#E11D48] via-[#BE123C] to-[#121212] relative overflow-hidden">
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
            Verify Email
          </h1>
          <p className="text-3xl font-bold mb-8 text-white/90">
            One Last Step<br />To Get Started
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold text-[#E11D48]">1</span>
              </div>
              <div>
                <p className="text-lg font-semibold">Check Your Inbox</p>
                <p className="text-sm text-white/70">Find the verification email</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold">2</span>
              </div>
              <div>
                <p className="text-lg font-semibold">Click the Link</p>
                <p className="text-sm text-white/70">Verify your account instantly</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold">3</span>
              </div>
              <div>
                <p className="text-lg font-semibold">Start Using TrikeServe</p>
                <p className="text-sm text-white/70">Book rides & order food</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side — form */}
      <div className="flex-1 lg:max-w-xl flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="mb-6">
            <Link to="/">
              <Button variant="ghost" size="sm" className="mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Sign In
              </Button>
            </Link>
            <h2 className="text-3xl font-bold text-[#121212] mb-2">
              {status === "loading" && "Verifying Email..."}
              {status === "success" && "Email Verified!"}
              {status === "error" && "Verification Failed"}
              {status === "waiting" && "Check Your Email"}
            </h2>
            <p className="text-[#64748B]">{message}</p>
          </div>

          {/* Loading State */}
          {status === "loading" && (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
              </div>
              <p className="text-[#64748B]">Please wait while we verify your email...</p>
            </div>
          )}

          {/* Success State */}
          {status === "success" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-2xl font-bold text-[#121212] mb-2">Welcome Aboard!</h3>
                <p className="text-[#64748B] text-sm">
                  Your email is now verified. You can log in to your account.
                </p>
              </div>

              {/* Mobile hint */}
              {isMobileDevice() && (
                <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Smartphone className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-semibold text-blue-800">Using the mobile app?</p>
                      <p className="text-xs text-blue-600 mt-1">
                        Open the TrikeServe app and log in with your email and password.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <Link to="/">
                <Button className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase text-base py-6">
                  GO TO LOGIN
                </Button>
              </Link>
            </div>
          )}

          {/* Error State */}
          {status === "error" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-10 h-10 text-red-600" />
                </div>
              </div>

              <form onSubmit={handleResend} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[#121212] mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                    <input
                      type="email"
                      placeholder="your.email@example.com"
                      autoComplete="off"
                      value={resendEmail}
                      onChange={(e) => {
                        setResendEmail(e.target.value);
                        setResendSuccess(false);
                      }}
                      className="w-full border-2 border-[#CBD5E1] focus:border-[#E11D48] rounded-lg h-12 pl-11 pr-4 text-sm outline-none"
                      required
                    />
                  </div>
                </div>

                {resendSuccess && (
                  <div className="p-3 bg-green-50 border-2 border-green-200 rounded-lg">
                    <p className="text-sm text-green-800">✅ Verification email sent! Check your inbox.</p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isResending}
                  className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase text-base py-6"
                >
                  {isResending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4" />
                      RESEND VERIFICATION EMAIL
                    </span>
                  )}
                </Button>
              </form>

              <Link to="/">
                <Button variant="outline" className="w-full border-2 border-[#CBD5E1] hover:border-[#E11D48]">
                  BACK TO LOGIN
                </Button>
              </Link>
            </div>
          )}

          {/* Waiting State — user landed here but has no token */}
          {status === "waiting" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-10 h-10 text-blue-600" />
                </div>
                <p className="text-[#64748B] text-sm mb-2">
                  We've sent a verification link to your email address. Click the link to activate your account.
                </p>
                <p className="text-[#64748B] text-xs">
                  The link may take a few minutes to arrive. Check your spam folder if needed.
                </p>
              </div>

              <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>⚠️ Check Spam/Junk Folder:</strong> Gmail and other providers may flag this email as spam. Look in your <strong>Spam</strong> or <strong>Junk</strong> folder and mark it as "Not Spam" so future emails arrive in your inbox.
                </p>
              </div>

              <form onSubmit={handleResend} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-[#121212] mb-2">
                    Didn't receive the email? Enter your email to resend:
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                    <input
                      type="email"
                      placeholder="your.email@example.com"
                      autoComplete="off"
                      value={resendEmail}
                      onChange={(e) => {
                        setResendEmail(e.target.value);
                        setResendSuccess(false);
                      }}
                      className="w-full border-2 border-[#CBD5E1] focus:border-[#E11D48] rounded-lg h-12 pl-11 pr-4 text-sm outline-none"
                      required
                    />
                  </div>
                </div>

                {resendSuccess && (
                  <div className="p-3 bg-green-50 border-2 border-green-200 rounded-lg">
                    <p className="text-sm text-green-800">✅ Verification email resent! Check your inbox.</p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isResending}
                  className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase text-base py-6"
                >
                  {isResending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span className="flex items-center justify-center gap-2">
                      <RefreshCw className="w-4 h-4" />
                      RESEND VERIFICATION EMAIL
                    </span>
                  )}
                </Button>
              </form>

              <Link to="/">
                <Button variant="outline" className="w-full border-2 border-[#CBD5E1] hover:border-[#E11D48]">
                  BACK TO LOGIN
                </Button>
              </Link>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm text-[#64748B]">
              Already verified?{" "}
              <Link to="/" className="text-[#E11D48] font-semibold hover:underline">
                Sign In
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
