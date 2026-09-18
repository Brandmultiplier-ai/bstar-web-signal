import { Suspense } from "react";
import { Sparkles } from "lucide-react";

import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Vision UI auth screens open with a wide brand glow behind the card. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background:
            "radial-gradient(60% 100% at 50% 0%, rgba(0,117,255,0.35) 0%, rgba(33,212,253,0.12) 45%, transparent 100%)",
        }}
      />

      <header className="relative flex items-center gap-2.5 px-6 py-6 lg:px-10">
        <span
          className="flex size-7 items-center justify-center rounded-lg"
          style={{ background: "var(--vui-gradient-brand)" }}
        >
          <Sparkles size={15} className="text-white" />
        </span>
        <span className="text-sm font-bold uppercase tracking-[0.12em] text-white">
          Web Signals
        </span>
      </header>

      <main className="relative flex items-start justify-center px-6 pb-16 pt-6 lg:pt-16">
        <div className="nos-card w-full max-w-[420px]">
          <h1 className="text-2xl font-bold text-white">Welcome back</h1>
          <p className="mt-1.5 text-sm text-[var(--nos-text-secondary)]">
            Sign in with your Brand Multiplier account to open reports.
          </p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
