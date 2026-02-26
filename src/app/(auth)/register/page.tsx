"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register } from "@/lib/auth";
import { Turnstile } from "@/components/auth/Turnstile";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    teamName: "",
  });
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (siteKey && !turnstileToken) {
      setError("Please complete the security check.");
      return;
    }

    setLoading(true);
    try {
      if (turnstileToken) {
        const res = await fetch("/api/verify-turnstile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: turnstileToken }),
        });
        if (!res.ok) {
          setError("Security check failed. Please try again.");
          setTurnstileToken(null);
          return;
        }
      }

      await register(form.email, form.password, form.name, form.teamName);
      router.push("/verify-email");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong. Try again.";
      // If the account already exists, send them to verify-email anyway —
      // they may have registered before but not verified yet.
      if (msg.toLowerCase().includes("already in use")) {
        router.push("/verify-email");
        return;
      }
      setError(msg);
      setTurnstileToken(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="border border-[#e5e5e5] p-8">
        <h1 className="text-base font-medium mb-6">Create an account</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#737373]" htmlFor="name">
              Your name
            </label>
            <input
              id="name"
              type="text"
              required
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              className="border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#737373]" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              className="border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#737373]" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={70}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              className="border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black"
            />
            <p className="text-xs text-[#a3a3a3]">8–70 characters</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#737373]" htmlFor="teamName">
              Team name
            </label>
            <input
              id="teamName"
              type="text"
              required
              placeholder="e.g. Acme Sales"
              value={form.teamName}
              onChange={(e) => set("teamName", e.target.value)}
              className="border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black placeholder:text-[#d4d4d4]"
            />
          </div>
          <Turnstile
            onToken={setTurnstileToken}
            onExpire={() => setTurnstileToken(null)}
          />
          {error && <p className="text-xs text-[#cc0000]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 border border-black bg-black text-white text-sm py-2 hover:bg-white hover:text-black transition-none disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>
      </div>
      <p className="text-xs text-[#737373] mt-4 text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-black underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
