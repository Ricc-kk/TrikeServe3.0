import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { ArrowLeft, Mail, Phone, Lock, Check } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"email" | "otp" | "reset">("email");
  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  // Mock OTP for demo
  const mockOTP = "123456";

  const handleSubmitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validate email or phone
    const isEmail = emailOrPhone.includes("@");
    const isPhone = /^09\d{9}$/.test(emailOrPhone);

    if (!isEmail && !isPhone) {
      setError("Please enter a valid email address or phone number (09XXXXXXXXX)");
      return;
    }

    // Mock: Send OTP
    console.log("Sending OTP to:", emailOrPhone);
    setStep("otp");
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length <= 1 && /^\d*$/.test(value)) {
      const newOtp = [...otp];
      newOtp[index] = value;
      setOtp(newOtp);

      // Auto-focus next input
      if (value && index < 5) {
        const nextInput = document.getElementById(`otp-${index + 1}`);
        nextInput?.focus();
      }
    }
  };

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault();
    const enteredOtp = otp.join("");

    if (enteredOtp === mockOTP) {
      setError("");
      setStep("reset");
    } else {
      setError("Invalid OTP code. Please try again.");
      setOtp(["", "", "", "", "", ""]);
    }
  };

  const handleResetPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    // Mock: Save new password
    console.log("Password reset successful for:", emailOrPhone);
    alert("Password reset successful! Redirecting to sign in...");
    navigate("/");
  };

  const handleResendOtp = () => {
    setOtp(["", "", "", "", "", ""]);
    setError("");
    alert(`OTP resent! Demo OTP: ${mockOTP}`);
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Background Design (hidden on mobile) */}
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-[#E11D48] via-[#BE123C] to-[#121212] relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{
              backgroundImage: `
                linear-gradient(to right, white 1px, transparent 1px),
                linear-gradient(to bottom, white 1px, transparent 1px)
              `,
              backgroundSize: '40px 40px'
            }} />
          </div>
          <div className="absolute top-20 left-20 w-64 h-64 bg-white/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-20 w-96 h-96 bg-white/5 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        </div>

        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <h1 className="text-7xl font-extrabold mb-6" style={{ letterSpacing: '-0.02em' }}>
            Reset Password
          </h1>
          <p className="text-3xl font-bold mb-8 text-white/90">
            Secure Password<br />Recovery Process
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-full ${step !== "email" ? "bg-white" : "bg-white/20"} flex items-center justify-center flex-shrink-0 mt-1`}>
                {step !== "email" ? <Check className="w-5 h-5 text-[#E11D48]" /> : <span className="text-sm font-bold">1</span>}
              </div>
              <div>
                <p className="text-lg font-semibold">Enter Email/Phone</p>
                <p className="text-sm text-white/70">Registered contact info</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className={`w-8 h-8 rounded-full ${step === "reset" ? "bg-white" : step === "otp" ? "bg-white" : "bg-white/20"} flex items-center justify-center flex-shrink-0 mt-1`}>
                {step === "reset" ? <Check className="w-5 h-5 text-[#E11D48]" /> : <span className="text-sm font-bold">2</span>}
              </div>
              <div>
                <p className="text-lg font-semibold">Verify OTP</p>
                <p className="text-sm text-white/70">6-digit verification code</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-sm font-bold">3</span>
              </div>
              <div>
                <p className="text-lg font-semibold">Create New Password</p>
                <p className="text-sm text-white/70">Secure your account</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
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
              {step === "otp" && "Verify Code"}
              {step === "reset" && "Create New Password"}
            </h2>
            <p className="text-[#64748B]">
              {step === "email" && "Enter your registered email or phone number"}
              {step === "otp" && "Enter the verification code we sent"}
              {step === "reset" && "Choose a strong password"}
            </p>
          </div>

          {/* Step 1: Enter Email/Phone */}
          {step === "email" && (
            <form onSubmit={handleSubmitEmail} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[#121212] mb-2">
                  Email Address or Phone Number
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                  <Input
                    type="text"
                    placeholder="your.email@example.com or 09XXXXXXXXX"
                    value={emailOrPhone}
                    onChange={(e) => {
                      setEmailOrPhone(e.target.value);
                      setError("");
                    }}
                    className="border-2 border-[#CBD5E1] focus:border-[#E11D48] h-12 pl-11"
                    required
                  />
                </div>
                <p className="text-xs text-[#64748B] mt-2">
                  Enter the email or phone number you used to register
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border-2 border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="p-3 bg-blue-50 border-2 border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800">
                  We'll send a verification code to your registered email and phone number
                </p>
              </div>

              <Button
                type="submit"
                className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase text-base py-6"
              >
                SEND VERIFICATION CODE
              </Button>
            </form>
          )}

          {/* Step 2: OTP Verification */}
          {step === "otp" && (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800 mb-2">
                  We've sent a 6-digit code to:
                </p>
                <p className="text-sm font-semibold text-blue-900">{emailOrPhone}</p>
                <p className="text-xs text-blue-700 mt-2">
                  <strong>Demo OTP:</strong> {mockOTP}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#121212] mb-3">
                  Enter 6-Digit Code
                </label>
                <div className="flex gap-2 justify-center">
                  {otp.map((digit, index) => (
                    <Input
                      key={index}
                      id={`otp-${index}`}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      className="w-12 h-14 text-center text-xl font-bold border-2 border-[#CBD5E1] focus:border-[#E11D48]"
                      required
                    />
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border-2 border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase text-base py-6"
              >
                VERIFY CODE
              </Button>

              <Button
                type="button"
                onClick={handleResendOtp}
                variant="outline"
                className="w-full border-2 border-[#CBD5E1] hover:border-[#E11D48]"
              >
                Resend Code
              </Button>
            </form>
          )}

          {/* Step 3: Reset Password */}
          {step === "reset" && (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-[#121212] mb-2">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      setError("");
                    }}
                    className="border-2 border-[#CBD5E1] focus:border-[#E11D48] h-12 pl-11"
                    required
                  />
                </div>
                <p className="text-xs text-[#64748B] mt-1">
                  Minimum 6 characters
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#121212] mb-2">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setError("");
                    }}
                    className="border-2 border-[#CBD5E1] focus:border-[#E11D48] h-12 pl-11"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border-2 border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="p-3 bg-green-50 border-2 border-green-200 rounded-lg">
                <p className="text-xs text-green-800">
                  <strong>Tip:</strong> Use a strong password with letters, numbers, and symbols
                </p>
              </div>

              <Button
                type="submit"
                className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase text-base py-6"
              >
                RESET PASSWORD
              </Button>
            </form>
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
