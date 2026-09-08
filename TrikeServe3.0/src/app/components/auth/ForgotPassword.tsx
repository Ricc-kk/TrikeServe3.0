import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { ArrowLeft, Mail, Lock, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { supabase } from "../../../lib/supabase";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "sent">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [confirmEmail, setConfirmEmail] = useState("");

  const handleShowConfirm = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    setConfirmEmail(trimmed);
    setStep("confirm");
  };

  const handleSendReset = async () => {
    setIsLoading(true);
    setError("");

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        confirmEmail,
        {
          redirectTo: `${window.location.origin}/set-password`,
        }
      );

      if (resetError) {
        console.error("[ForgotPassword] Reset error:", resetError);
      }

      setStep("sent");
    } catch (err) {
      console.error("[ForgotPassword] Network error:", err);
      setStep("sent");
    } finally {
      setIsLoading(false);
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
            Reset Password
          </h1>
          <p className="text-3xl font-bold mb-8 text-white/90">
            Secure Password<br />Recovery
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold text-[#E11D48]">1</span>
              </div>
              <div>
                <p className="text-lg font-semibold">Enter Your Email</p>
                <p className="text-sm text-white/70">The one you registered with</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold">2</span>
              </div>
              <div>
                <p className="text-lg font-semibold">Check Your Inbox</p>
                <p className="text-sm text-white/70">Click the reset link in the email</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold">3</span>
              </div>
              <div>
                <p className="text-lg font-semibold">Create New Password</p>
                <p className="text-sm text-white/70">Choose a strong password</p>
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
              {step === "email" && "Forgot Password?"}
              {step === "confirm" && "Confirm Email"}
              {step === "sent" && "Check Your Email"}
            </h2>
            <p className="text-[#64748B]">
              {step === "email" && "Enter your registered email address"}
              {step === "confirm" && "Is this the correct email?"}
              {step === "sent" && "We've sent a password reset link"}
            </p>
          </div>

          {/* Step 1: Enter Email */}
          {step === "email" && (
            <form onSubmit={handleShowConfirm} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[#121212] mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                  <Input
                    type="email"
                    placeholder="your.email@example.com"
                    autoComplete="off"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                    className="border-2 border-[#CBD5E1] focus:border-[#E11D48] h-12 pl-11"
                    required
                  />
                </div>
                <p className="text-xs text-[#64748B] mt-2">
                  Enter the email address you used to register
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border-2 border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="p-3 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                <p className="text-xs text-yellow-800">
                  <strong>⚠️ Important:</strong> The reset email may land in your <strong>spam/junk folder</strong>. If you don't see it within 2 minutes, check spam and mark it as "Not Spam".
                </p>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase text-base py-6"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "SEND RESET LINK"
                )}
              </Button>
            </form>
          )}

          {/* Step 1.5: Confirm Email */}
          {step === "confirm" && (
            <div className="space-y-6">
              <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 mb-1">We'll send a password reset link to:</p>
                <p className="text-base font-bold text-blue-900">{confirmEmail}</p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border-2 border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <Button
                onClick={handleSendReset}
                disabled={isLoading}
                className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase text-base py-6"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "YES, SEND RESET LINK"
                )}
              </Button>

              <Button
                onClick={() => { setStep("email"); setError(""); }}
                variant="outline"
                className="w-full border-2 border-[#CBD5E1] hover:border-[#E11D48]"
              >
                Go Back & Edit Email
              </Button>
            </div>
          )}

          {/* Step 2: Email Sent */}
          {step === "sent" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-2xl font-bold text-[#121212] mb-2">Email Sent!</h3>
                <p className="text-[#64748B] text-sm mb-2">
                  If an account exists for <strong>{confirmEmail}</strong>, you'll receive a password reset link shortly.
                </p>
                <p className="text-[#64748B] text-xs">
                  The link will expire in 1 hour. Check your spam folder if you don't see it.
                </p>
              </div>

              <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>⚠️ Check Spam/Junk Folder:</strong> Gmail and other providers may flag this email as spam. Look in your <strong>Spam</strong> or <strong>Junk</strong> folder and mark it as "Not Spam" so future emails arrive in your inbox.
                </p>
              </div>

              <Button
                onClick={() => {
                  setStep("email");
                  setEmail("");
                  setError("");
                }}
                variant="outline"
                className="w-full border-2 border-[#CBD5E1] hover:border-[#E11D48]"
              >
                Try a Different Email
              </Button>

              <Link to="/">
                <Button className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase">
                  BACK TO LOGIN
                </Button>
              </Link>
            </div>
          )}

          {/* Footer */}
          <div className="mt-6 text-center">
            <p className="text-sm text-[#64748B]">
              Remember your password?{" "}
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
