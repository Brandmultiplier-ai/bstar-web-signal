"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { createBrowserSupabase } from "@/lib/supabase/client";
import { getSupabasePublicConfig } from "@/lib/supabase/public-config";
import { GradientButton } from "@/components/vision";

const FIELD_CLASS =
  "w-full rounded-xl border border-[var(--border)] bg-white/5 px-3.5 py-3 text-sm text-white placeholder:text-[var(--nos-text-muted)] outline-none transition-colors focus:border-[var(--nos-accent-2)]";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const configured = getSupabasePublicConfig().ready;

  if (!configured) {
    return (
      <div className="mt-6 space-y-3 rounded-xl border border-[var(--nos-signal-warm)]/40 bg-white/5 p-4 text-sm text-[var(--nos-text-secondary)]">
        <p className="font-bold text-white">Supabase is not configured yet</p>
        <p>
          Copy <code className="text-xs text-[var(--nos-accent-2)]">.env.example</code> to{" "}
          <code className="text-xs text-[var(--nos-accent-2)]">.env.local</code>, set{" "}
          <code className="text-xs text-[var(--nos-accent-2)]">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="text-xs text-[var(--nos-accent-2)]">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>{" "}
          from{" "}
          <a
            href="https://supabase.com/dashboard/project/_/settings/api"
            target="_blank"
            rel="noreferrer"
            className="underline"
            style={{ color: "var(--nos-accent-2)" }}
          >
            Project Settings &rarr; API
          </a>
          , then restart <code className="text-xs text-[var(--nos-accent-2)]">npm run dev</code>.
        </p>
      </div>
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const supabase = createBrowserSupabase();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(signInError.message);
      setPending(false);
      return;
    }

    // Only relative paths, so a crafted `next` cannot bounce us off-site.
    const next = searchParams.get("next");
    const destination = next?.startsWith("/") ? next : "/";
    // Refresh so middleware re-runs with the session cookie now set.
    router.replace(destination);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 space-y-4">
      <label className="block">
        <span className="text-label-caps">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={`mt-1.5 ${FIELD_CLASS}`}
        />
      </label>

      <label className="block">
        <span className="text-label-caps">Password</span>
        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Your password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className={`mt-1.5 ${FIELD_CLASS}`}
        />
      </label>

      {error && <p className="text-sm text-[var(--nos-negative)]">{error}</p>}

      <GradientButton type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in..." : "Sign in"}
      </GradientButton>
    </form>
  );
}
