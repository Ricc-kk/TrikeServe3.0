import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router";
import { ArrowLeft, Lock, CheckCircle, Loader2, Eye, EyeOff, Smartphone } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { supabase } from "../../../lib/supabase";

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
    // Supabase password reset redirects with a hash containing access_token & type=recovery
    const hash = window.location.hash;
    const params = Object.fromEntries(new URLSearchParams(hash.substring(1)));
    const accessToken = params.access_token;
    const type = params.type;

    if (type === "recovery" && accessToken) {
      // The session is already established by Supabase's magic link flow.
      // We just need to let the user set a new password.
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          setStep("form");
        } else {
          setStep("error");
          setMessage("Session expired. Please request a new password reset link.");
        }
      }).catch(() => {
        setStep("error");
        setMessage("Failed to establish session. Please try again.");
      });
    } else {
      setStep("error");
      setMessage("Invalid or expired reset link. Please request a new one from the login page.");
    }
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
            Set Password
          </h1>
          <p className="text-3xl font-bold mb-8 text-white/90">
            Create a New<br />Secure Password
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold text-[#E11D48]">1</span>
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
              {step === "loading" && "Verifying Link..."}
              {step === "form" && "Set New Password"}
              {step === "success" && "Password Updated!"}
              {step === "error" && "Reset Failed"}
            </h2>
            <p className="text-[#64748B]">
              {step === "loading" && "Please wait..."}
              {step === "form" && "Create a new password for your account"}
              {step === "success" && "Your password has been updated successfully."}
              {step === "error" && message}
            </p>
          </div>

          {/* Loading State */}
          {step === "loading" && (
            <div className="text-center py-12">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
              </div>
              <p className="text-[#64748B]">Verifying your reset link...</p>
            </div>
          )}

          {/* Password Form */}
          {step === "form" && (
            <form onSubmit={handleSetPassword} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[#121212] mb-2">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setError("");
                    }}
                    className="border-2 border-[#CBD5E1] focus:border-[#E11D48] h-12 pl-11 pr-11"
                    required
                    disabled={isUpdating}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#121212]"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-[#64748B] mt-2">
                  At least 8 characters, 1 uppercase, 1 lowercase, 1 number
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#121212] mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                  <Input
                    type={showConfirm ? "text" : "password"}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError("");
                    }}
                    className="border-2 border-[#CBD5E1] focus:border-[#E11D48] h-12 pl-11 pr-11"
                    required
                    disabled={isUpdating}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#121212]"
                  >
                    {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border-2 border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                disabled={isUpdating}
                className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase text-base py-6"
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
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-2xl font-bold text-[#121212] mb-2">All Done!</h3>
                <p className="text-[#64748B] text-sm">
                  Your password has been updated. You can now log in with your new password.
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
                        Open the TrikeServe app and log in with your new password.
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
          {step === "error" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Lock className="w-10 h-10 text-red-600" />
                </div>
              </div>

              <Link to="/forgot-password">
                <Button className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase text-base py-6">
                  REQUEST NEW RESET LINK
                </Button>
              </Link>

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
