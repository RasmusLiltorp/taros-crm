"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { login, requestMfaOtp, verifyMfaOtp } from "@/lib/auth";
import { Turnstile } from "@/components/auth/Turnstile";

type Step = "credentials" | "otp";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("credentials");

  // credentials step
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileVerified, setTurnstileVerified] = useState(false);

  // otp step
  const [mfaId, setMfaId] = useState("");
  const [otpId, setOtpId] = useState("");
  const [otpCode, setOtpCode] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCredentials(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (siteKey && !turnstileVerified && !turnstileToken) {
      setError("Please complete the security check.");
      return;
    }

    setLoading(true);
    try {
      if (siteKey && !turnstileVerified && turnstileToken) {
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
        // Keep verification state for retries on this page, so bad
        // credentials don't force solving Turnstile again.
        setTurnstileVerified(true);
      }

      const result = await login(email, password);

      if (result.type === "ok") {
        router.push("/dashboard");
      } else {
        // MFA required — request OTP and show code entry
        const id = await requestMfaOtp(email);
        setOtpId(id);
        setMfaId(result.mfaId);
        setStep("otp");
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid email or password.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await verifyMfaOtp(otpId, otpCode, mfaId);
      router.push("/dashboard");
    } catch {
      setError("Invalid or expired code. Check your email and try again.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "otp") {
    return (
      <div className="w-full max-w-sm">
        <div className="border border-[#e5e5e5] p-8">
          <h1 className="text-base font-medium mb-2">Check your email</h1>
          <p className="text-xs text-[#737373] mb-6">
            We sent an 8-digit code to <strong>{email}</strong>. Enter it below to continue.
          </p>
          <form onSubmit={handleOtp} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#737373]" htmlFor="otp">
                One-time code
              </label>
              <input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={8}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                className="border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black tracking-widest font-mono"
                placeholder="12345678"
              />
            </div>
            {error && <p className="text-xs text-[#cc0000]">{error}</p>}
            <button
              type="submit"
              disabled={loading || otpCode.length < 6}
              className="mt-2 border border-black bg-black text-white text-sm py-2 hover:bg-white hover:text-black transition-none disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify"}
            </button>
          </form>
        </div>
        <button
          onClick={() => { setStep("credentials"); setError(null); setOtpCode(""); }}
          className="text-xs text-[#737373] mt-4 w-full text-center underline"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="border border-[#e5e5e5] p-8">
        <h1 className="text-base font-medium mb-6">Log in</h1>
        <form onSubmit={handleCredentials} className="flex flex-col gap-4">
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
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs text-[#737373]" htmlFor="password">
                Password
              </label>
              <Link href="/forgot-password" className="text-xs text-[#737373] underline hover:text-black">
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black"
            />
          </div>
          <Turnstile
            onToken={(token) => {
              setTurnstileToken(token);
              setTurnstileVerified(false);
            }}
            onExpire={() => setTurnstileToken(null)}
          />
          {error && <p className="text-xs text-[#cc0000]">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="mt-2 border border-black bg-black text-white text-sm py-2 hover:bg-white hover:text-black transition-none disabled:opacity-50"
          >
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>
      </div>
      <p className="text-xs text-[#737373] mt-4 text-center">
        No account?{" "}
        <Link href="/register" className="text-black underline">
          Sign up
        </Link>
      </p>
    </div>
  );
}
