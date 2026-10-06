import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { ArrowLeft, User, Mail, Phone, Lock, Check, MapPin, Store, UserCircle } from "lucide-react";

import { Tricycle } from "../ui/Tricycle";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { useAuth, UserRole } from "../../contexts/AuthContext";
import { CUISINES, type CuisineId } from "../../../lib/foodTaxonomy";
import BusinessMapSelector from "../business/BusinessMapSelector";

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
  /** Where the shop is pinned, carried through signup so the shop's own map
   *  opens on it instead of the hardcoded city centre. */
  businessLat?: number;
  businessLng?: number;
  /** What the shop serves. Seeds `restaurants.cuisine` at first shop load. */
  businessCuisine?: CuisineId[];
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
  const [showMapPicker, setShowMapPicker] = useState(false);

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

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!/[A-Z]/.test(formData.password)) {
      setError("Password must contain at least one uppercase letter");
      return;
    }
    if (!/[a-z]/.test(formData.password)) {
      setError("Password must contain at least one lowercase letter");
      return;
    }
    if (!/[0-9]/.test(formData.password)) {
      setError("Password must contain at least one number");
      return;
    }

    if (!formData.phoneNumber.match(/^09\d{9}$/)) {
      setError("Phone number must be in format: 09XXXXXXXXX");
      return;
    }

    // Role-specific validation
    if (formData.role === "rider") {
      if (!formData.todaPlate || !formData.licenseNumber) {
        setError("TODA Plate and License Number are required for drivers");
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
      businessLat: formData.businessLat,
      businessLng: formData.businessLng,
      businessCuisine: formData.businessCuisine ?? [],
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
      <div className="hidden lg:flex lg:flex-1 bg-gradient-to-br from-[var(--primary)] via-[var(--primary)] to-[var(--ink)] relative overflow-hidden">
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
      <div className="flex-1 lg:max-w-xl flex items-start justify-center p-6 pt-10 bg-surface overflow-y-auto">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="mb-6">
            <Link to="/">
              <Button variant="ghost" size="sm" className="mb-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Sign In
              </Button>
            </Link>
            <h2 className="text-3xl font-bold text-[var(--ink)] mb-2">Create Account</h2>
            <p className="text-[var(--muted-foreground)]">
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
                className="w-full p-6 border border-line hover:border-[var(--primary)] rounded-xl text-left transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-[var(--primary-soft)] rounded-xl flex items-center justify-center group-hover:bg-[var(--primary)] transition-colors">
                    <UserCircle className="w-8 h-8 text-[var(--primary)] group-hover:text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-[var(--ink)]">Customer</h3>
                    <p className="text-sm text-[var(--muted-foreground)]">Book rides & order food</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleRoleSelect("rider")}
                className="w-full p-6 border border-line hover:border-[var(--primary)] rounded-xl text-left transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-[var(--info-soft)] rounded-xl flex items-center justify-center group-hover:bg-[var(--info)] transition-colors">
                    <Tricycle className="w-8 h-8 text-[var(--info)] group-hover:text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-[var(--ink)]">Driver</h3>
                    <p className="text-sm text-[var(--muted-foreground)]">Accept deliveries & rides</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleRoleSelect("business")}
                className="w-full p-6 border border-line hover:border-[var(--primary)] rounded-xl text-left transition-all group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-[var(--amber-soft)] rounded-xl flex items-center justify-center group-hover:bg-[var(--amber)] transition-colors">
                    <Store className="w-8 h-8 text-[var(--amber)] group-hover:text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-[var(--ink)]">Business Owner</h3>
                    <p className="text-sm text-[var(--muted-foreground)]">Manage menu & orders</p>
                  </div>
                </div>
              </button>
            </div>
          )}

          {/* Registration Form */}
          {step === "form" && (
            <form onSubmit={handleSubmitForm} className="space-y-4">
              <div className="p-3 bg-[var(--info-soft)] border-2 border-[var(--info-soft)] rounded-lg">
                <p className="text-sm text-[var(--info)]">
                  <strong>Registering as:</strong> {formData.role.charAt(0).toUpperCase() + formData.role.slice(1)}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                    First Name
                  </label>
                  <Input
                    type="text"
                    placeholder="Juan"
                    value={formData.firstName}
                    onChange={(e) => handleInputChange("firstName", e.target.value)}
                    className="border border-line focus:border-[var(--primary)]"
                    required
                    disabled={isLoading}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                    Last Name
                  </label>
                  <Input
                    type="text"
                    placeholder="Dela Cruz"
                    value={formData.lastName}
                    onChange={(e) => handleInputChange("lastName", e.target.value)}
                    className="border border-line focus:border-[var(--primary)]"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                  <Input
                    type="email"
                    placeholder="your.email@example.com"
                    value={formData.email}
                    onChange={(e) => handleInputChange("email", e.target.value)}
                    className="border border-line focus:border-[var(--primary)] pl-11"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                  Phone Number
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                  <Input
                    type="tel"
                    inputMode="numeric"
                    placeholder="09XXXXXXXXX"
                    value={formData.phoneNumber}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
                      handleInputChange("phoneNumber", digits);
                    }}
                    maxLength={11}
                    className="border border-line focus:border-[var(--primary)] pl-11"
                    required
                    disabled={isLoading}
                  />
                </div>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">Format: 09XXXXXXXXX</p>
              </div>

              {/* Rider-specific fields */}
              {formData.role === "rider" && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                      TODA Plate Number
                    </label>
                    <Input
                      type="text"
                      placeholder="ABC 1234"
                      value={formData.todaPlate || ""}
                      onChange={(e) => handleInputChange("todaPlate", e.target.value)}
                      className="border border-line focus:border-[var(--primary)]"
                      required
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                      License Number
                    </label>
                    <Input
                      type="text"
                      placeholder="N01-23-456789"
                      value={formData.licenseNumber || ""}
                      onChange={(e) => handleInputChange("licenseNumber", e.target.value)}
                      className="border border-line focus:border-[var(--primary)]"
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
                    <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                      Business Name
                    </label>
                    <Input
                      type="text"
                      placeholder="Kuya J's Eatery"
                      value={formData.businessName || ""}
                      onChange={(e) => handleInputChange("businessName", e.target.value)}
                      className="border border-line focus:border-[var(--primary)]"
                      required
                      disabled={isLoading}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                      Business Address
                    </label>
                    {/* Addresses here are coordinates, not prose: the shop has to be
                        pinned so drivers can be routed to it, so this opens the map
                        rather than accepting a typed line. */}
                    <button
                      type="button"
                      onClick={() => setShowMapPicker(true)}
                      disabled={isLoading}
                      className="w-full min-h-12 flex items-center gap-3 p-3 text-left bg-surface border border-line rounded-xl transition-colors hover:border-[var(--primary)] disabled:opacity-50"
                    >
                      <MapPin className="w-5 h-5 text-[var(--primary)] flex-shrink-0" aria-hidden="true" />
                      <span className="flex-1 min-w-0">
                        {formData.businessAddress ? (
                          <>
                            <span className="block text-sm font-semibold text-[var(--ink)] truncate">
                              {formData.businessAddress}
                            </span>
                            <span className="block text-xs text-[var(--muted-foreground)]">
                              Tap to move the pin
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="block text-sm font-semibold text-[var(--ink)]">
                              Pin your business location
                            </span>
                            <span className="block text-xs text-[var(--muted-foreground)]">
                              Search for it, or use where you are now
                            </span>
                          </>
                        )}
                      </span>
                      <span className="text-xs font-semibold text-[var(--primary)] flex-shrink-0">
                        {formData.businessAddress ? "Change" : "Set"}
                      </span>
                    </button>
                  </div>

                  {/* Declared here, once, rather than guessed later. Customers
                      filter on this, and an undeclared shop is invisible to
                      every filter until someone opens the settings modal. */}
                  <div>
                    <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                      What do you serve?
                    </label>
                    <p className="text-xs text-[var(--muted-foreground)] mb-2">
                      Pick everything that describes your shop. Customers filter by this.
                    </p>
                    <div
                      role="group"
                      aria-label="What do you serve?"
                      className="flex flex-wrap gap-2"
                    >
                      {CUISINES.map(({ id, label, Icon }) => {
                        const selected = (formData.businessCuisine ?? []).includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            disabled={isLoading}
                            aria-pressed={selected}
                            onClick={() => {
                              const current = formData.businessCuisine ?? [];
                              setFormData({
                                ...formData,
                                businessCuisine: selected
                                  ? current.filter((c) => c !== id)
                                  : [...current, id],
                              });
                            }}
                            className={[
                              "min-h-11 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-50",
                              selected
                                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                                : "border-line text-[var(--muted-foreground)] hover:border-[var(--primary)]",
                            ].join(" ")}
                          >
                            <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Declared here, once, rather than guessed later. Customers
                      filter on this, and an undeclared shop is invisible to
                      every filter until someone opens the settings modal. */}
                  <div>
                    <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                      What do you serve?
                    </label>
                    <p className="text-xs text-[var(--muted-foreground)] mb-2">
                      Pick everything that describes your shop. Customers filter by this.
                    </p>
                    <div
                      role="group"
                      aria-label="What do you serve?"
                      className="flex flex-wrap gap-2"
                    >
                      {CUISINES.map(({ id, label, Icon }) => {
                        const selected = (formData.businessCuisine ?? []).includes(id);
                        return (
                          <button
                            key={id}
                            type="button"
                            disabled={isLoading}
                            aria-pressed={selected}
                            onClick={() => {
                              const current = formData.businessCuisine ?? [];
                              setFormData({
                                ...formData,
                                businessCuisine: selected
                                  ? current.filter((c) => c !== id)
                                  : [...current, id],
                              });
                            }}
                            className={[
                              "min-h-11 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-50",
                              selected
                                ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                                : "border-line text-[var(--muted-foreground)] hover:border-[var(--primary)]",
                            ].join(" ")}
                          >
                            <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => handleInputChange("password", e.target.value)}
                    className="border border-line focus:border-[var(--primary)] pl-11"
                    required
                    disabled={isLoading}
                  />
                </div>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">At least 8 characters, 1 uppercase, 1 lowercase, 1 number</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                    className="border border-line focus:border-[var(--primary)] pl-11"
                    required
                    disabled={isLoading}
                  />
                </div>
              </div>

              {error && (
                <div className="p-3 bg-[var(--error-soft)] border-2 border-[var(--error-soft)] rounded-lg">
                  <p className="text-sm text-[var(--error)]">{error}</p>
                </div>
              )}

              {/* Email verification note for all roles */}
              <div className="p-3 bg-[var(--info-soft)] border-2 border-[var(--info-soft)] rounded-lg">
                <p className="text-xs text-[var(--info)]">
                  <strong>📧 Email Verification:</strong> After registration, you'll receive a verification email. Click the link to verify your account before logging in.
                </p>
              </div>

              {/* Show additional note for rider and business */}
              {(formData.role === "rider" || formData.role === "business") && (
                <div className="p-3 bg-[var(--amber-soft)] border-2 border-[var(--amber-soft)] rounded-lg">
                  <p className="text-xs text-[var(--amber-dark)]">
                    <strong>📋 Additional Step:</strong> You must also visit the Barangay Hall for face-to-face verification before your account can be fully activated.
                  </p>
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  type="button"
                  onClick={() => setStep("role")}
                  variant="outline"
                  className="flex-1 border border-line hover:border-[var(--primary)]"
                  disabled={isLoading}
                >
                  BACK
                </Button>
                <Button
                  type="submit"
                  className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary)] text-base"
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
                <div className="w-20 h-20 bg-[var(--success-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-10 h-10 text-[var(--success)]" />
                </div>
                <h3 className="text-2xl font-bold text-[var(--ink)] mb-2">Registration Complete!</h3>
                <p className="text-[var(--muted-foreground)]">Your account has been created successfully.</p>
              </div>

              {/* Customer: Email verification required */}
              {formData.role === "customer" && (
                <>
                  <div className="p-4 bg-[var(--info-soft)] border-2 border-[var(--info-soft)] rounded-lg">
                    <p className="text-sm text-[var(--info)] mb-2">
                      <strong>📧 Check Your Email!</strong>
                    </p>
                    <p className="text-sm text-[var(--info)]">
                      We sent a verification link to <strong>{formData.email}</strong>. Please click the link in your email to verify your account before logging in.
                    </p>
                  </div>

                  <div className="p-3 bg-[var(--amber-soft)] border-2 border-[var(--amber-soft)] rounded-lg">
                    <p className="text-xs text-[var(--amber-dark)]">
                      <strong>Didn't receive the email?</strong> Check your spam folder, or contact support if the problem persists.
                    </p>
                  </div>

                  <Link to="/">
                    <Button className="w-full bg-[var(--primary)] hover:bg-[var(--primary)]">
                      GO TO LOGIN
                    </Button>
                  </Link>
                </>
              )}

              {/* Rider/Business: Admin verification required (no email verification needed) */}
              {(formData.role === "rider" || formData.role === "business") && (
                <>
                  <div className="p-4 bg-[var(--info-soft)] border-2 border-[var(--info-soft)] rounded-lg">
                    <p className="text-sm text-[var(--info)] mb-2">
                      <strong>📧 Email Verified Automatically</strong>
                    </p>
                    <p className="text-sm text-[var(--info)]">
                      Your email has been confirmed. No need to check your inbox.
                    </p>
                  </div>

                  <div className="p-4 bg-[var(--amber-soft)] border-2 border-[var(--amber-soft)] rounded-lg">
                    <p className="text-sm text-[var(--amber-dark)] mb-3">
                      <strong>⏳ Admin Verification Required</strong>
                    </p>
                    <p className="text-sm text-[var(--amber-dark)] mb-3">
                      You must visit the Barangay Hall for face-to-face verification before you can log in.
                    </p>
                    <ol className="text-sm text-[var(--amber-dark)] space-y-2 list-decimal list-inside">
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
                      <li>You'll receive a notification once approved — then you can log in!</li>
                    </ol>
                  </div>

                  <Link to="/">
                    <Button className="w-full bg-[var(--primary)] hover:bg-[var(--primary)]">
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
              <p className="text-sm text-[var(--muted-foreground)]">
                Already have an account?{" "}
                <Link to="/" className="text-[var(--primary)] font-semibold hover:underline">
                  Sign In
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>

      {showMapPicker && (
        <BusinessMapSelector
          currentAddress={formData.businessAddress || ""}
          initialLat={formData.businessLat ?? null}
          initialLng={formData.businessLng ?? null}
          centerOnCurrentLocation
          onClose={() => setShowMapPicker(false)}
          onSelectLocation={(location) => {
            setFormData((prev) => ({
              ...prev,
              businessAddress: location.full || location.name,
              businessLat: location.lat,
              businessLng: location.lng,
            }));
            setShowMapPicker(false);
            setError("");
          }}
        />
      )}
    </div>
  );
}