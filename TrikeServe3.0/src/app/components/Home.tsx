import { Link } from "react-router";
import { Store, User, Shield } from "lucide-react";

import { Tricycle } from "./ui/Tricycle";

export default function Home() {
  const modules = [
    {
      path: "/customer",
      title: "Customer",
      description: "Book rides & order food",
      icon: User,
      gradient: "from-[var(--primary)] to-[var(--primary)]",
      bgAccent: "bg-[var(--primary)]/5"
    },
    {
      path: "/rider",
      title: "Driver",
      description: "Accept deliveries & rides",
      icon: Tricycle,
      gradient: "from-[var(--ink)] to-[var(--ink)]",
      bgAccent: "bg-[var(--ink-solid)]/5"
    },
    {
      path: "/business",
      title: "Business Owner",
      description: "Manage menu & orders",
      icon: Store,
      gradient: "from-[var(--primary)] to-[var(--ink)]",
      bgAccent: "bg-gradient-to-br from-[var(--primary)]/5 to-[var(--ink)]/5"
    },
    {
      path: "/admin",
      title: "Admin",
      description: "System monitoring & control",
      icon: Shield,
      gradient: "from-[var(--ink)] to-[var(--primary)]",
      bgAccent: "bg-gradient-to-br from-[var(--ink)]/5 to-[var(--primary)]/5"
    },
  ];

  return (
    <div className="min-h-screen bg-[var(--ink-solid)] flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Animated Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-[var(--primary)] rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-[var(--primary)] rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="max-w-5xl w-full relative z-10">
        {/* Header Section */}
        <div className="text-center mb-16">
          <div className="inline-block mb-6">
            <div className="w-20 h-20 bg-[var(--primary)] rounded-2xl flex items-center justify-center shadow-2xl shadow-[var(--primary)]/30">
              <Tricycle className="w-10 h-10 text-white" />
            </div>
          </div>
          <h1 className="text-6xl font-extrabold mb-4 bg-gradient-to-r from-white to-[var(--primary)] bg-clip-text text-transparent" style={{ letterSpacing: '-0.02em' }}>
            TrikeServe
          </h1>
          <p className="text-xl text-white/60 font-medium">
            Community-Based Tricycle Platform for Gen T Deleon
          </p>
          <div className="mt-6 flex items-center justify-center gap-4 text-sm text-white/40">
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[var(--primary)] rounded-full"></div>
              Fixed rates
            </span>
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[var(--primary)] rounded-full"></div>
              Face-to-face verification
            </span>
            <span className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[var(--primary)] rounded-full"></div>
              Community trust
            </span>
          </div>
        </div>

        {/* Module Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Link
                key={module.path}
                to={module.path}
                className="group relative overflow-hidden rounded-2xl bg-white/5 backdrop-blur-xl p-8 hover:bg-white/10 transition-all duration-300 border-2 border-white/10 hover:border-[var(--primary)] hover:shadow-2xl hover:shadow-[var(--primary)]/20"
                style={{
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)'
                }}
              >
                {/* Glassmorphism Background Accent */}
                <div className={`absolute inset-0 ${module.bgAccent} opacity-0 group-hover:opacity-100 transition-opacity duration-300`} />
                
                <div className="relative z-10">
                  <div className="flex items-start justify-between mb-6">
                    <div className={`p-4 rounded-xl bg-gradient-to-br ${module.gradient} shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    
                    {/* Arrow Indicator */}
                    <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1">
                      <span className="text-[var(--primary)] text-xl font-bold">→</span>
                    </div>
                  </div>
                  
                  <h3 className="text-2xl font-bold text-white mb-2 tracking-tight" style={{ letterSpacing: '-0.01em' }}>
                    {module.title}
                  </h3>
                  <p className="text-white/60 font-medium">
                    {module.description}
                  </p>
                </div>

                {/* Hover Glow Effect */}
                <div className="absolute -bottom-20 -right-20 w-40 h-40 bg-[var(--primary)] rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-500" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}