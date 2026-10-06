import { useState, useRef } from "react";
import { useNavigate, Link } from "react-router";
import { ArrowLeft, User, Mail, Phone, Lock, Check, MapPin, Store, UserCircle, Eye, EyeOff, AlertCircle } from "lucide-react";

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

/** The password requirements, declared once so the checklist and
 *  `handleSubmitForm` can't drift apart — the form must not reject a password
 *  the checklist just told the user was good, or accept one it flagged. */
const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (v: string) => v.length >= 8 },
  { label: "One uppercase letter", test: (v: string) => /[A-Z]/.test(v) },
  { label: "One lowercase letter", test: (v: string) => /[a-z]/.test(v) },
  { label: "One number", test: (v: string) => /[0-9]/.test(v) },
] as const;

/** Per-field validators. Each returns an error string, or null when the value
 *  is acceptable. Kept next to PASSWORD_RULES so the blur-time messages, the
 *  submit-time guard and the visible checklist all read from one place. */
const FIELD_VALIDATORS: Partial<
  Record<keyof SignUpFormData, (data: SignUpFormData) => string | null>
> = {
  firstName: (d) => {
    const v = d.firstName?.trim() ?? "";
    if (!v) return "First name is required";
    if (v.length < 2) return "First name must be at least 2 characters";
    if (v.length > 50) return "First name must be 50 characters or fewer";
    if (!/^[\p{L}][\p{L}\s'’-]*$/u.test(v))
      return "Use letters only (spaces, hyphens and apostrophes are fine)";
    return null;
  },
  lastName: (d) => {
    const v = d.lastName?.trim() ?? "";
    if (!v) return "Last name is required";
    if (v.length < 2) return "Last name must be at least 2 characters";
    if (v.length > 50) return "Last name must be 50 characters or fewer";
    if (!/^[\p{L}][\p{L}\s'’-]*$/u.test(v))
      return "Use letters only (spaces, hyphens and apostrophes are fine)";
    return null;
  },
  email: (d) => {
    const v = d.email?.trim() ?? "";
    if (!v) return "Email address is required";
    if (v.length > 254) return "Email address is too long";
    // Deliberately stricter than the browser's type="email": that one accepts
    // "a@b" with no dot, which no real mail provider will issue.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))
      return "Enter a valid email address, e.g. name@example.com";
    return null;
  },
  phoneNumber: (d) => {
    const v = d.phoneNumber?.trim() ?? "";
    if (!v) return "Phone number is required";
    if (!/^09\d{9}$/.test(v)) return "Phone number must be in format: 09XXXXXXXXX";
    return null;
  },
  password: (d) => {
    const unmet = PASSWORD_RULES.filter((rule) => !rule.test(d.password ?? ""));
    if (unmet.length === 0) return null;
    return `Password needs: ${unmet.map((r) => r.label.toLowerCase()).join(", ")}`;
  },
  confirmPassword: (d) => {
    if (!d.confirmPassword) return "Please confirm your password";
    if (d.confirmPassword !== d.password) return "Passwords do not match";
    return null;
  },
  todaPlate: (d) => {
    if (d.role !== "rider") return null;
    const v = d.todaPlate?.trim() ?? "";
    if (!v) return "TODA Plate Number is required for drivers";
    if (!/^[A-Za-z0-9][A-Za-z0-9 -]{2,14}$/.test(v))
      return "Use letters and numbers only, 3-15 characters (e.g. TV-1234)";
    return null;
  },
  businessName: (d) => {
    if (d.role !== "business") return null;
    const v = d.businessName?.trim() ?? "";
    if (!v) return "Business Name is required";
    if (v.length < 2) return "Business Name must be at least 2 characters";
    if (v.length > 80) return "Business Name must be 80 characters or fewer";
    return null;
  },
  businessAddress: (d) => {
    if (d.role !== "business") return null;
    if (!d.businessAddress?.trim()) {
      return "Pin your business location so drivers can be routed to you";
    }
    return null;
  },
};

/** Fields that apply to the currently selected role, in DOM order. Used to
 *  decide what to check on submit and which input to focus first. */
const FIELD_ORDER: (keyof SignUpFormData)[] = [
  "firstName",
  "lastName",
  "email",
  "phoneNumber",
  "todaPlate",
  "businessName",
  "businessAddress",
  "password",
  "confirmPassword",
];

function FieldError({ id, message }: { id: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p
      id={id}
      className="mt-1.5 flex items-start gap-1.5 text-xs text-[var(--error)]"
    >
      <AlertCircle className="mt-px w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

function PasswordChecklist({ value }: { value: string }) {
  // Nothing to report until there's something typed; an all-red list before
  // the first keystroke just reads as an error the user can't fix yet.
  const results = PASSWORD_RULES.map((rule) => ({ label: rule.label, met: rule.test(value) }));
  const metCount = results.filter((r) => r.met).length;
  const allMet = metCount === results.length;

  return (
    <ul className="mt-2 space-y-1" aria-live="polite">
      {results.map(({ label, met }) => (
        <li
          key={label}
          className={`flex items-center gap-1.5 text-xs transition-colors ${
            met ? "text-[var(--success-ink)]" : "text-[var(--muted-foreground)]"
          }`}
        >
          <Check
            className={`w-3.5 h-3.5 flex-shrink-0 ${met ? "opacity-100" : "opacity-40"}`}
            aria-hidden="true"
            strokeWidth={3}
          />
          <span>{label}</span>
        </li>
      ))}
      <li className="sr-only" aria-live="assertive">
        {allMet ? "Password meets all requirements" : `${metCount} of ${results.length} password requirements met`}
      </li>
    </ul>
  );
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
  // Password and confirm each toggle independently, so you can reveal one to
  // check it against the other without exposing both at once.
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  /** Fields the user has left at least once. Errors are only shown for touched
   *  fields so a pristine form isn't painted red before it's been filled in. */
  const [touched, setTouched] = useState<Partial<Record<keyof SignUpFormData, boolean>>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const errorFor = (field: keyof SignUpFormData): string | null => {
    if (!touched[field] && !submitAttempted) return null;
    return FIELD_VALIDATORS[field]?.(formData) ?? null;
  };

  const handleBlur = (field: keyof SignUpFormData) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handleInputChange = (field: keyof SignUpFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleRoleSelect = (role: UserRole) => {
    setFormData(prev => ({ ...prev, role }));
    // Role changes which fields are required, so clear the blur state —
    // otherwise errors from the previously selected role linger.
    setTouched({});
    setSubmitAttempted(false);
    setError("");
    setStep("form");
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitAttempted(true);

    // Walk every applicable field and collect what failed, rather than bailing
    // on the first one — the user gets the whole list in one pass instead of
    // discovering problems one submit at a time.
    const failures = FIELD_ORDER.map((field) => ({
      field,
      message: FIELD_VALIDATORS[field]?.(formData) ?? null,
    })).filter((f) => f.message);

    if (failures.length > 0) {
      setError(
        failures.length === 1
          ? "Please fix the highlighted field"
          : `Please fix ${failures.length} highlighted fields`
      );

      // Move focus to the first problem so keyboard and screen-reader users
      // land on it instead of guessing where submission stopped.
      const first = formRef.current?.querySelector<HTMLElement>(
        `[data-field="${failures[0].field}"]`
      );
      first?.focus();
      return;
    }

    setIsLoading(true);

    const result = await signup({
      email: formData.email,
      password: formData.password,
      name: `${formData.firstName} ${formData.lastName}`,
      phone: formData.phoneNumber,
      role: formData.role,
      todaPlate: formData.todaPlate,
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
            <form onSubmit={handleSubmitForm} className="space-y-4" ref={formRef} noValidate>
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
                    onBlur={() => handleBlur("firstName")}
                    data-field="firstName"
                    aria-invalid={!!errorFor("firstName")}
                    aria-describedby={errorFor("firstName") ? "firstName-error" : undefined}
                    className={`border focus:border-[var(--primary)] ${
                      errorFor("firstName")
                        ? "border-[var(--error)]"
                        : "border-line"
                    }`}
                    required
                    disabled={isLoading}
                  />
                  <FieldError id="firstName-error" message={errorFor("firstName")} />
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
                    onBlur={() => handleBlur("lastName")}
                    data-field="lastName"
                    aria-invalid={!!errorFor("lastName")}
                    aria-describedby={errorFor("lastName") ? "lastName-error" : undefined}
                    className={`border focus:border-[var(--primary)] ${
                      errorFor("lastName")
                        ? "border-[var(--error)]"
                        : "border-line"
                    }`}
                    required
                    disabled={isLoading}
                  />
                  <FieldError id="lastName-error" message={errorFor("lastName")} />
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
                    onBlur={() => handleBlur("email")}
                    data-field="email"
                    aria-invalid={!!errorFor("email")}
                    aria-describedby={errorFor("email") ? "email-error" : undefined}
                    className={`border focus:border-[var(--primary)] pl-11 ${
                      errorFor("email") ? "border-[var(--error)]" : "border-line"
                    }`}
                    required
                    disabled={isLoading}
                  />
                </div>
                <FieldError id="email-error" message={errorFor("email")} />
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
                    onBlur={() => handleBlur("phoneNumber")}
                    data-field="phoneNumber"
                    aria-invalid={!!errorFor("phoneNumber")}
                    aria-describedby={errorFor("phoneNumber") ? "phoneNumber-error" : undefined}
                    className={`border focus:border-[var(--primary)] pl-11 ${
                      errorFor("phoneNumber") ? "border-[var(--error)]" : "border-line"
                    }`}
                    required
                    disabled={isLoading}
                  />
                </div>
                <FieldError id="phoneNumber-error" message={errorFor("phoneNumber")} />
                {!errorFor("phoneNumber") && (
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">Format: 09XXXXXXXXX</p>
                )}
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
                      onBlur={() => handleBlur("todaPlate")}
                      data-field="todaPlate"
                      aria-invalid={!!errorFor("todaPlate")}
                      aria-describedby={errorFor("todaPlate") ? "todaPlate-error" : undefined}
                      className={`border focus:border-[var(--primary)] ${
                        errorFor("todaPlate") ? "border-[var(--error)]" : "border-line"
                      }`}
                      required
                      disabled={isLoading}
                    />
                    <FieldError id="todaPlate-error" message={errorFor("todaPlate")} />
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
                      onBlur={() => handleBlur("businessName")}
                      data-field="businessName"
                      aria-invalid={!!errorFor("businessName")}
                      aria-describedby={errorFor("businessName") ? "businessName-error" : undefined}
                      className={`border focus:border-[var(--primary)] ${
                        errorFor("businessName") ? "border-[var(--error)]" : "border-line"
                      }`}
                      required
                      disabled={isLoading}
                    />
                    <FieldError id="businessName-error" message={errorFor("businessName")} />
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
                      onClick={() => {
                        setShowMapPicker(true);
                        setTouched(prev => ({ ...prev, businessAddress: true }));
                      }}
                      disabled={isLoading}
                      data-field="businessAddress"
                      aria-invalid={!!errorFor("businessAddress")}
                      aria-describedby={errorFor("businessAddress") ? "businessAddress-error" : undefined}
                      className={`w-full min-h-12 flex items-center gap-3 p-3 text-left bg-surface rounded-xl transition-colors disabled:opacity-50 ${
                        errorFor("businessAddress")
                          ? "border-2 border-[var(--error)]"
                          : "border border-line hover:border-[var(--primary)]"
                      }`}
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
                    <FieldError id="businessAddress-error" message={errorFor("businessAddress")} />
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
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => handleInputChange("password", e.target.value)}
                    onBlur={() => handleBlur("password")}
                    data-field="password"
                    aria-invalid={!!errorFor("password")}
                    aria-describedby={errorFor("password") ? "password-error" : undefined}
                    className={`border focus:border-[var(--primary)] pl-11 pr-11 ${
                      errorFor("password") ? "border-[var(--error)]" : "border-line"
                    }`}
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--ink)] disabled:opacity-50"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <PasswordChecklist value={formData.password} />
                <FieldError id="password-error" message={errorFor("password")} />
              </div>

              <div>
                <label className="block text-sm font-semibold text-[var(--ink)] mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--muted-foreground)]" />
                  <Input
                    type={showConfirm ? "text" : "password"}
                    placeholder="••••••••"
                    value={formData.confirmPassword}
                    onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                    onBlur={() => handleBlur("confirmPassword")}
                    data-field="confirmPassword"
                    aria-invalid={!!errorFor("confirmPassword")}
                    aria-describedby={errorFor("confirmPassword") ? "confirmPassword-error" : undefined}
                    className={`border focus:border-[var(--primary)] pl-11 pr-11 ${
                      errorFor("confirmPassword") ? "border-[var(--error)]" : "border-line"
                    }`}
                    required
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    disabled={isLoading}
                    aria-label={showConfirm ? "Hide password confirmation" : "Show password confirmation"}
                    aria-pressed={showConfirm}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] hover:text-[var(--ink)] disabled:opacity-50"
                  >
                    {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <FieldError id="confirmPassword-error" message={errorFor("confirmPassword")} />
              </div>

              {error && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="p-3 bg-[var(--error-soft)] border-2 border-[var(--error-soft)] rounded-lg"
                >
                  <p className="text-sm font-semibold text-[var(--error)] flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </p>
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
                  <p className="text-xs text-[var(--amber-ink)]">
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
                    <p className="text-xs text-[var(--amber-ink)]">
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

              {/* Rider/Business: email verification AND admin F2F approval both required */}
              {(formData.role === "rider" || formData.role === "business") && (
                <>
                  <div className="p-4 bg-[var(--info-soft)] border-2 border-[var(--info-soft)] rounded-lg">
                    <p className="text-sm font-semibold text-[var(--info)] mb-2">
                      <strong>📧 Check Your Email!</strong>
                    </p>
                    <p className="text-sm text-[var(--info)]">
                      We sent a verification link to <strong>{formData.email}</strong>. Click it to confirm your email address — you won&apos;t be able to log in until you do.
                    </p>
                  </div>

                  <div className="p-3 bg-[var(--amber-soft)] border-2 border-[var(--amber-soft)] rounded-lg">
                    <p className="text-xs text-[var(--amber-ink)]">
                      <strong>Didn&apos;t receive the email?</strong> Check your spam folder, or contact support if the problem persists.
                    </p>
                  </div>

                  <div className="p-4 bg-[var(--amber-soft)] border-2 border-[var(--amber-soft)] rounded-lg">
                    <p className="text-sm text-[var(--amber-ink)] mb-3">
                      <strong>⏳ Admin Verification Required</strong>
                    </p>
                    <p className="text-sm text-[var(--amber-ink)] mb-3">
                      You must visit the Barangay Hall for face-to-face verification before you can log in.
                    </p>
                    <ol className="text-sm text-[var(--amber-ink)] space-y-2 list-decimal list-inside">
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