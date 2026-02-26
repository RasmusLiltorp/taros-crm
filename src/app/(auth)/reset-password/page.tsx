"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { confirmPasswordReset } from "@/lib/auth";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Missing or invalid reset link. Please request a new one.");
    }
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== passwordConfirm) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await confirmPasswordReset(token, password);
      setDone(true);
    } catch {
      setError("Reset link is invalid or has expired. Please request a new one.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="w-full max-w-sm">
        <div className="border border-[#e5e5e5] p-8">
          <h1 className="text-base font-medium mb-2">Password updated</h1>
          <p className="text-xs text-[#737373] mb-6">
            Your password has been reset. You can now log in with your new password.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="w-full border border-black bg-black text-white text-sm py-2 hover:bg-white hover:text-black transition-none"
          >
            Go to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="border border-[#e5e5e5] p-8">
        <h1 className="text-base font-medium mb-6">Set new password</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#737373]" htmlFor="password">
              New password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={70}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-[#737373]" htmlFor="password-confirm">
              Confirm password
            </label>
            <input
              id="password-confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={70}
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              className="border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black"
            />
          </div>
          {error && <p className="text-xs text-[#cc0000]">{error}</p>}
          <button
            type="submit"
            disabled={loading || !token}
            className="mt-2 border border-black bg-black text-white text-sm py-2 hover:bg-white hover:text-black transition-none disabled:opacity-50"
          >
            {loading ? "Saving..." : "Set new password"}
          </button>
        </form>
      </div>
      <p className="text-xs text-[#737373] mt-4 text-center">
        <Link href="/forgot-password" className="text-black underline">
          Request a new link
        </Link>
      </p>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
