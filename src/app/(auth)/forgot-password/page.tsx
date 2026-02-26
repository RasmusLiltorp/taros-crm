"use client";

import { useState } from "react";
import Link from "next/link";
import { requestPasswordReset } from "@/lib/auth";
import { Turnstile } from "@/components/auth/Turnstile";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      await requestPasswordReset(email);
      setSent(true);
    } catch {
      // Always show success to avoid email enumeration
      setSent(true);
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm">
        <div className="border border-[#e5e5e5] p-8">
          <h1 className="text-base font-medium mb-2">Check your email</h1>
          <p className="text-xs text-[#737373]">
            If an account exists for <strong>{email}</strong>, we sent a password reset link. Check your inbox.
          </p>
        </div>
        <p className="text-xs text-[#737373] mt-4 text-center">
          <Link href="/login" className="text-black underline">
            Back to login
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="border border-[#e5e5e5] p-8">
        <h1 className="text-base font-medium mb-2">Reset password</h1>
        <p className="text-xs text-[#737373] mb-6">
          Enter your email address and we will send you a reset link.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#737373]" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black"
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
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>
      </div>
      <p className="text-xs text-[#737373] mt-4 text-center">
        <Link href="/login" className="text-black underline">
          Back to login
        </Link>
      </p>
    </div>
  );
}
