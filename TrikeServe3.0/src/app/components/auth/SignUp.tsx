import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { ArrowLeft, User, Mail, Phone, Lock, Check, Bike, Store, UserCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { useAuth, UserRole } from "../../contexts/AuthContext";

interface SignUpFormData {
  email: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  password: string;
  confirmPassword: string;
  role: UserRole;
  // Rider specific
  todaPlate?: string;
  licenseNumber?: string;
  // Business specific
  businessName?: string;
  businessAddress?: string;
  // Customer specific
  address?: string;
}

export default function SignUp() {
  const navigate = useNavigate();
  const { signup, login } = useAuth();
  const [step, setStep] = useState<"role" | "form" | "success">("role");
  const [formData, setFormData] = useState<SignUpFormData>({
    email: "",
    phoneNumber: "",
    firstName: "",
    lastName: "",
    password: "",
    confirmPassword: "",
    role: "customer",
  });
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleInputChange = (field: keyof SignUpFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleRoleSelect = (role: UserRole) => {
    setFormData(prev => ({ ...prev, role }));
    setStep("form");
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (!formData.phoneNumber.match(/^09\d{9}$/)) {
      setError("Phone number must be in format: 09XXXXXXXXX");
      return;
    }

    // Role-specific validation
    if (formData.role === "rider") {
      if (!formData.todaPlate || !formData.licenseNumber) {
        setError("TODA Plate and License Number are required for riders");
        return;
      }
    }

    if (formData.role === "business") {
      if (!formData.businessName || !formData.businessAddress) {
        setError("Business Name and Address are required for business owners");
        return;
      }
    }

    setIsLoading(true);

    const result = await signup({
      email: formData.email,
      password: formData.password,
      name: `${formData.firstName} ${formData.lastName}`,
      phone: formData.phoneNumber,
      role: formData.role,
      todaPlate: formData.todaPlate,
      licenseNumber: formData.licenseNumber,
      businessName: formData.businessName,
      businessAddress: formData.businessAddress,
      address: formData.address,
    });

    setIsLoading(false);

    if (result.success) {
      setStep("success");
    } else {
      setError(result.error || "Registration failed");
    }
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
            Join TrikeServe
          </h1>
          <p className="text-3xl font-bold mb-8 text-white/90">
            Face-to-Face<br />Verification Required
          </p>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-1">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <p className="text-lg font-semibold">Step 1: Register Online</p>
                <p className="text-sm text-white/70">Fill out your information</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-1">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <p className="text-lg font-semibold">Step 2: Visit Barangay Hall</p>
                <p className="text-sm text-white/70">Bring valid ID for verification</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 mt-1">
                <Check className="w-5 h-5" />
              </div>
              <div>
                <p className="text-lg font-semibold">Step 3: Get Activated</p>
                <p className="text-sm text-white/70">Admin approves after F2F verification</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Sign Up Form */}
      <div className="flex-1 lg:max-w-xl flex items-center justify-center p-6 bg-white overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="mb-6">
            <Link to="/">
              <Button variant="ghost" size="sm" className="mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Sign In
              </Button>
            </Link>
            <h2 className="text-3xl font-bold text-[#121212] mb-2">Create Account</h2>
            <p className="text-[#64748B]">
              {step === "role" && "Choose your account type"}
              {step === "form" && "Fill in your information"}
              {step === "success" && "Registration successful!"}
            </p>
          </div>

          {/* Role Selection */}
          {step === "role" && (
            <div className="space-y-4">
              <button
                onClick={() => handleRoleSelect("customer")}
                className="w-full p-6 border-2 border-[#CBD5E1] hover:border-[#E11D48] rounded-xl text-left transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-[#FFF1F2] rounded-xl flex items-center justify-center group-hover:bg-[#E11D48] transition-colors">
                    <UserCircle className="w-8 h-8 text-[#E11D48] group-hover:text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-[#121212]">Customer</h3>
                    <p className="text-sm text-[#64748B]">Book rides & order food</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleRoleSelect("rider")}
                className="w-full p-6 border-2 border-[#CBD5E1] hover:border-[#E11D48] rounded-xl text-left transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-[#F0F9FF] rounded-xl flex items-center justify-center group-hover:bg-[#3B82F6] transition-colors">
                    <Bike className="w-8 h-8 text-[#3B82F6] group-hover:text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-[#121212]">Rider</h3>
                    <p className="text-sm text-[#64748B]">Accept deliveries & rides</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleRoleSelect("business")}
                className="w-full p-6 border-2 border-[#CBD5E1] hover:border-[#E11D48] rounded-xl text-left transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-[#FEF3C7] rounded-xl flex items-center justify-center group-hover:bg-[#F59E0B] transition-colors">
                    <Store className="w-8 h-8 text-[#F59E0B] group-hover:text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-[#121212]">Business Owner</h3>
                    <p className="text-sm text-[#64748B]">Manage menu & orders</p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Registration Form */}
          {step === "form" && (
            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div className="p-3 bg-blue-50 border-2 border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>Registering as:</strong> {formData.role.charAt(0).toUpperCase() + formData.role.slice(1)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[#121212] mb-2">
                    First Name
                  </label>
                  <Input
                    type="text"
                    placeholder="Juan"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange("firstName", e.target.value)}
                    className="border-2 border-[#CBD5E1] focus:border-[#E11D48]"
                    required
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[#121212] mb-2">
                    Last Name
                  </label>
                  <Input
                    type="text"
                    placeholder="Dela Cruz"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange("lastName", e.target.value)}
                    className="border-2 border-[#CBD5E1] focus:border-[#E11D48]"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#121212] mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                  <Input
                    type="email"
                    placeholder="your.email@example.com"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    className="border-2 border-[#CBD5E1] focus:border-[#E11D48] pl-11"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#121212] mb-2">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                  <Input
                    type="tel"
                    placeholder="09XXXXXXXXX"
                    value={formData.phoneNumber}
                    onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                    className="border-2 border-[#CBD5E1] focus:border-[#E11D48] pl-11"
                    required
                    disabled={isLoading}
                  />
                </div>
                <p className="text-xs text-[#64748B] mt-1">Format: 09XXXXXXXXX</p>
              </div>

              {/* Rider-specific fields */}
              {formData.role === "rider" && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-[#121212] mb-2">
                      TODA Plate Number
                    </label>
                    <Input
                      type="text"
                      placeholder="ABC 1234"
                      value={formData.todaPlate || ""}
                      onChange={(e) => handleInputChange("todaPlate", e.target.value)}
                      className="border-2 border-[#CBD5E1] focus:border-[#E11D48]"
                      required
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#121212] mb-2">
                      License Number
                    </label>
                    <Input
                      type="text"
                      placeholder="N01-23-456789"
                      value={formData.licenseNumber || ""}
                      onChange={(e) => handleInputChange("licenseNumber", e.target.value)}
                      className="border-2 border-[#CBD5E1] focus:border-[#E11D48]"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </>
              )}

              {/* Business-specific fields */}
              {formData.role === "business" && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-[#121212] mb-2">
                      Business Name
                    </label>
                    <Input
                      type="text"
                      placeholder="Kuya J's Eatery"
                      value={formData.businessName || ""}
                      onChange={(e) => handleInputChange("businessName", e.target.value)}
                      className="border-2 border-[#CBD5E1] focus:border-[#E11D48]"
                      required
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[#121212] mb-2">
                      Business Address
                    </label>
                    <Input
                      type="text"
                      placeholder="123 Main St, Tagalag"
                      value={formData.businessAddress || ""}
                      onChange={(e) => handleInputChange("businessAddress", e.target.value)}
                      className="border-2 border-[#CBD5E1] focus:border-[#E11D48]"
                      required
                      disabled={isLoading}
                    />
                  </div>
                </>
              )}

              {/* Customer-specific fields */}
              {formData.role === "customer" && (
                <div>
                  <label className="block text-sm font-semibold text-[#121212] mb-2">
                    Address (Optional)
                  </label>
                  <Input
                    type="text"
                    placeholder="123 Main St, Tagalag"
                    value={formData.address || ""}
                    onChange={(e) => handleInputChange("address", e.target.value)}
                    className="border-2 border-[#CBD5E1] focus:border-[#E11D48]"
                    disabled={isLoading}
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-[#121212] mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => handleInputChange("password", e.target.value)}
                    className="border-2 border-[#CBD5E1] focus:border-[#E11D48] pl-11"
                    required
                    disabled={isLoading}
                  />
                </div>
                <p className="text-xs text-[#64748B] mt-1">Minimum 6 characters</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[#121212] mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                    className="border-2 border-[#CBD5E1] focus:border-[#E11D48] pl-11"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border-2 border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              {/* Show note only for rider and business */}
              {(formData.role === "rider" || formData.role === "business") && (
                <div className="p-3 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                  <p className="text-xs text-yellow-800">
                    <strong>Note:</strong> After registration, you must visit the Barangay Hall for face-to-face verification before your account can be activated.
                  </p>
                </div>
              )}

              {/* Show different note for customers */}
              {formData.role === "customer" && (
                <div className="p-3 bg-green-50 border-2 border-green-200 rounded-lg">
                  <p className="text-xs text-green-800">
                    <strong>Note:</strong> Customer accounts are automatically activated after registration. You can login immediately!
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={() => setStep("role")}
                  variant="outline"
                  className="flex-1 border-2 border-[#CBD5E1] hover:border-[#E11D48]"
                  disabled={isLoading}
                >
                  BACK
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-[#E11D48] hover:bg-[#BE123C] uppercase text-base"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      REGISTERING...
                    </div>
                  ) : (
                    'REGISTER'
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* Success State */}
          {step === "success" && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-10 h-10 text-green-600" />
                </div>
                <h3 className="text-2xl font-bold text-[#121212] mb-2">Registration Complete!</h3>
                <p className="text-[#64748B]">Your account has been created successfully.</p>
              </div>

              {/* Customer: Auto-verified, can login immediately */}
              {formData.role === "customer" && (
                <>
                  <div className="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
                    <p className="text-sm text-green-800">
                      <strong>✓ Account Activated!</strong> You can now login and start using TrikeServe.
                    </p>
                  </div>

                  <Link to="/">
                    <Button className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase">
                      GO TO LOGIN
                    </Button>
                  </Link>
                </>
              )}

              {/* Rider/Business: Need admin verification */}
              {(formData.role === "rider" || formData.role === "business") && (
                <>
                  <div className="p-4 bg-yellow-50 border-2 border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800 mb-3">
                      <strong>⏳ Admin Verification Required</strong>
                    </p>
                    <p className="text-sm text-yellow-800 mb-3">
                      Your account needs to be verified by an administrator before you can login.
                    </p>
                    <ol className="text-sm text-yellow-800 space-y-2 list-decimal list-inside">
                      <li>Visit the TrikeServe Office at Barangay Hall</li>
                      <li>Bring your valid ID and required documents:
                        {formData.role === "rider" && (
                          <ul className="ml-6 mt-1 space-y-1 list-disc list-inside">
                            <li>Driver's License</li>
                            <li>TODA Registration</li>
                            <li>Tricycle OR/CR</li>
                          </ul>
                        )}
                        {formData.role === "business" && (
                          <ul className="ml-6 mt-1 space-y-1 list-disc list-inside">
                            <li>Business Permit</li>
                            <li>Sanitary Permit (for food business)</li>
                            <li>Valid ID</li>
                          </ul>
                        )}
                      </li>
                      <li>Complete face-to-face verification with staff</li>
                      <li>Wait for admin approval (usually within 24 hours)</li>
                      <li>You'll receive a notification once approved</li>
                    </ol>
                  </div>

                  <Link to="/">
                    <Button className="w-full bg-[#E11D48] hover:bg-[#BE123C] uppercase">
                      BACK TO LOGIN
                    </Button>
                  </Link>
                </>
              )}
            </div>
          )}

          {/* Footer */}
          {step !== "success" && (
            <div className="mt-6 text-center">
              <p className="text-sm text-[#64748B]">
                Already have an account?{" "}
                <Link to="/" className="text-[#E11D48] font-semibold hover:underline">
                  Sign In
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}