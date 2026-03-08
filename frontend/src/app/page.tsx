"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { Video, Mic, Users, LogIn, UserPlus, LayoutDashboard, Plus } from "lucide-react";

import Image from "next/image";

export default function Home() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { 
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  // Avoid hydration mismatch — render nothing auth-specific until mounted
  if (!mounted) return null;

  /* ── LOGGED IN ───────────────────────────────────────────────── */
  if (user) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-4 py-16">
        {/* Greeting card */}
        <div className="bg-surface border border-gray-100 shadow-flat rounded-2xl p-6 sm:p-10 max-w-md w-full text-center flex flex-col items-center gap-5 sm:gap-6">
          {/* Avatar circle */}
          <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center">
            <span className="text-primary font-bold text-2xl">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>

          <div>
            <h1 className="text-2xl font-semibold text-text-main">
              Welcome back, <span className="text-primary">{user.name}</span>
            </h1>
            <p className="text-text-muted mt-1 text-sm">
              What would you like to do today?
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full mt-2">
            <button
              onClick={() => router.push("/dashboard")}
              className="sm:flex-1 flex items-center justify-center gap-2 h-14 sm:h-11 rounded-xl bg-surface border border-gray-200 text-text-main font-medium text-base sm:text-sm hover:bg-gray-50 transition-colors shadow-flat"
            >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </button>
            <button
              onClick={() => {
                const roomId = `room-${Math.random().toString(36).slice(2, 7)}`;
                router.push(`/room/${roomId}`);
              }}
              className="sm:flex-1 flex items-center justify-center gap-2 h-14 sm:h-11 rounded-xl bg-primary text-white font-medium text-base sm:text-sm hover:bg-[#E0484D] transition-colors shadow-active-speaker"
            >
              <Plus className="w-4 h-4" />
              Create Room
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── LOGGED OUT ──────────────────────────────────────────────── */
  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-4 py-16">
      {/* Hero */}
      <div className="max-w-2xl w-full text-center flex flex-col items-center gap-6 sm:gap-8">
        {/* Badge */}
        <span className="inline-flex items-center gap-1.5 bg-primary/8 border border-primary/15 text-primary text-xs font-semibold px-3 py-1 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          Real-time Voice &amp; Video
        </span>

        <div className="flex items-center gap-3 sm:gap-6 justify-center">
          <Image src="/logo.png" alt="Voxely Logo" width={96} height={96} className="w-16 h-16 sm:w-24 sm:h-24 object-contain" />
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold text-text-main tracking-tight leading-[1.1]">
            Voxely
          </h1>
        </div>

        <p className="text-base sm:text-lg text-text-muted leading-relaxed max-w-lg">
          Secure real-time communication, minimally designed. Create
          rooms, invite friends and communicate — without distractions.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-3 mt-2 w-full sm:max-w-sm">
          <button
            onClick={() => router.push("/register")}
            className="sm:flex-1 flex items-center justify-center gap-2 h-14 rounded-xl bg-primary text-white font-semibold text-base hover:bg-[#E0484D] transition-colors shadow-active-speaker"
          >
            <UserPlus className="w-4 h-4" />
            Create Account
          </button>
          <button
            onClick={() => router.push("/login")}
            className="sm:flex-1 flex items-center justify-center gap-2 h-14 rounded-xl bg-surface border border-gray-200 text-text-main font-semibold text-base hover:bg-gray-50 transition-colors shadow-flat"
          >
            <LogIn className="w-4 h-4" />
            Sign In
          </button>
        </div>
      </div>

      {/* Feature cards */}
      <div className="mt-12 sm:mt-20 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5 max-w-2xl w-full">
        {[
          {
            icon: <Video className="w-5 h-5 text-primary" />,
            title: "HD Video",
            desc: "Crystal-clear video powered by WebRTC technology",
          },
          {
            icon: <Mic className="w-5 h-5 text-primary" />,
            title: "Active Speaker",
            desc: "Automatic detection of who is currently speaking",
          },
          {
            icon: <Users className="w-5 h-5 text-primary" />,
            title: "Rooms",
            desc: "Create rooms and share the link with your contacts",
          },
        ].map(({ icon, title, desc }) => (
          <div
            key={title}
            className="bg-surface border border-gray-100 rounded-2xl p-6 shadow-flat flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-default"
          >
            <div className="w-9 h-9 rounded-xl bg-primary/8 flex items-center justify-center">
              {icon}
            </div>
            <h3 className="font-semibold text-text-main text-sm">{title}</h3>
            <p className="text-text-muted text-xs leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
