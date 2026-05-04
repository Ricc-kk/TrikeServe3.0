import { useState } from "react";
import { useNavigate, Link } from "react-router";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useAuth } from "../contexts/AuthContext";
import tagalagImage from "../../assets/49624c6fb8f504041a2a91198a581a109cd5507d.png";

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    
    const result = await login(email, password);
    
    setIsLoading(false);
    
    if (result.success) {
      // Redirect to /redirect which will handle role-based navigation
      navigate('/redirect');
    } else {
      setError(result.error || "Login failed");
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Background Design (hidden on mobile) */}
      <div className="hidden lg:flex lg:flex-1 relative overflow-hidden">
        {/* Background Image */}
        <img 
          src={tagalagImage} 
          alt="Tagalag" 
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
            Serving Tagalag, Philippines
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