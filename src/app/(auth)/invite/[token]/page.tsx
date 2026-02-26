"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { getPocketBase } from "@/lib/pocketbase";
import { login, requestMfaOtp, verifyMfaOtp } from "@/lib/auth";
import { sha256 } from "@/lib/utils";
import type { Invite } from "@/lib/types";

type Step = "loading" | "register" | "login" | "otp" | "error" | "accepted";

export default function InvitePage() {
  const router = useRouter();
  const params = useParams();
  const token = params.token as string;

  const [invite, setInvite] = useState<Invite | null>(null);
  const [step, setStep] = useState<Step>("loading");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // MFA state
  const [mfaId, setMfaId] = useState("");
  const [otpId, setOtpId] = useState("");
  const [otpCode, setOtpCode] = useState("");
  // userId is needed to call acceptInvite after OTP is verified
  const [pendingUserId, setPendingUserId] = useState("");
  // True when the invite was already accepted before the OTP step (new-user register flow)
  const [inviteAlreadyAccepted, setInviteAlreadyAccepted] = useState(false);

  useEffect(() => {
    async function loadInvite() {
      try {
        const pb = getPocketBase();
        // Token in URL is plaintext; DB stores SHA-256 hash
        const tokenHash = await sha256(token);
        const inv = await pb
          .collection("invites")
          .getFirstListItem<Invite>(
            `token="${tokenHash}" && accepted=false && expires > @now`
          );

        setInvite(inv);
        setForm((prev) => ({ ...prev, email: inv.email }));
        setStep("register");
      } catch {
        setStep("error");
      }
    }
    loadInvite();
  }, [token]);

  function set(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  /**
   * Invite acceptance is performed server-side via /api/accept-invite.
   * The route authenticates as superuser, verifies the token hash server-side,
   * and creates the team_members record.
   */
  async function acceptInvite(userId: string) {
    if (!invite) return;

    const res = await fetch("/api/accept-invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteId: invite.id, token, userId }),
    });

    if (!res.ok) {
      const data = await res.json() as { error?: string };
      throw new Error(data.error ?? "Failed to accept invite.");
    }

    setStep("accepted");
    setTimeout(() => router.push("/dashboard"), 1500);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const pb = getPocketBase();
      const user = await pb.collection("users").create({
        email: form.email,
        password: form.password,
        passwordConfirm: form.password,
        name: form.name,
      });

      // Accept the invite server-side first — this also marks the new user as
      // verified, which is required before authWithPassword will succeed.
      await acceptInvite(user.id);
      setInviteAlreadyAccepted(true);

      // Now login — the user is verified so PocketBase will issue an MFA challenge.
      const result = await login(form.email, form.password);
      if (result.type === "ok") {
        // MFA not triggered (shouldn't happen with MFA enabled, but handle gracefully)
        setStep("accepted");
        setTimeout(() => router.push("/dashboard"), 1500);
      } else {
        // MFA required — request OTP and show code entry
        const id = await requestMfaOtp(form.email);
        setOtpId(id);
        setMfaId(result.mfaId);
        setPendingUserId(user.id);
        setStep("otp");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const pb = getPocketBase();
      // Use login() which handles the MFA challenge
      const result = await login(form.email, form.password);
      if (result.type === "ok") {
        const userId = pb.authStore.record?.id;
        if (!userId) throw new Error("Auth succeeded but no user record found.");
        await acceptInvite(userId);
      } else {
        // MFA required — request OTP and show code entry
        const id = await requestMfaOtp(form.email);
        setOtpId(id);
        setMfaId(result.mfaId);
        // We don't have the userId yet — will read from authStore after OTP
        setPendingUserId("");
        setStep("otp");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid password.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await verifyMfaOtp(otpId, otpCode, mfaId);
      if (inviteAlreadyAccepted) {
        // New-user register flow: invite was accepted before the OTP step.
        setStep("accepted");
        setTimeout(() => router.push("/dashboard"), 1500);
      } else {
        // Existing-user login flow: accept the invite now that auth is complete.
        const pb = getPocketBase();
        const userId = pendingUserId || pb.authStore.record?.id;
        if (!userId) throw new Error("Could not determine user ID after verification.");
        await acceptInvite(userId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired code. Check your email and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "loading") {
    return <p className="text-sm text-[#737373]">Validating invite...</p>;
  }

  if (step === "error") {
    return (
      <div className="w-full max-w-sm text-center">
        <p className="text-sm text-[#cc0000] mb-3">
          This invite link is invalid or has expired.
        </p>
        <Link href="/" className="text-sm underline">
          Back to home
        </Link>
      </div>
    );
  }

  if (step === "accepted") {
    return (
      <p className="text-sm text-[#737373]">Joined team. Redirecting...</p>
    );
  }

  if (step === "otp") {
    return (
      <div className="w-full max-w-sm">
        <div className="border border-[#e5e5e5] p-8">
          <h1 className="text-base font-medium mb-2">Check your email</h1>
          <p className="text-xs text-[#737373] mb-6">
            We sent an 8-digit code to <strong>{form.email}</strong>. Enter it below to continue.
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
              disabled={submitting || otpCode.length < 6}
              className="mt-2 border border-black bg-black text-white text-sm py-2 hover:bg-white hover:text-black transition-none disabled:opacity-50"
            >
              {submitting ? "Verifying..." : "Verify & join team"}
            </button>
          </form>
        </div>
        <button
          onClick={() => { setStep("register"); setError(null); setOtpCode(""); }}
          className="text-xs text-[#737373] mt-4 w-full text-center underline"
        >
          Back
        </button>
      </div>
    );
  }

  const isRegister = step === "register";

  return (
    <div className="w-full max-w-sm">
      <div className="border border-[#e5e5e5] p-8">
        <h1 className="text-base font-medium mb-1">You&apos;ve been invited</h1>
        <p className="text-xs text-[#737373] mb-6">
          {isRegister ? "Create an account to join the team." : "Log in to join the team."}
        </p>
        <form
          onSubmit={isRegister ? handleRegister : handleLogin}
          className="flex flex-col gap-4"
        >
          {isRegister && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="invite-name" className="text-xs text-[#737373]">Your name</label>
              <input
                id="invite-name"
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className="border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-email" className="text-xs text-[#737373]">Email</label>
            <input
              id="invite-email"
              type="email"
              required
              value={form.email}
              readOnly={!!invite?.email}
              onChange={(e) => set("email", e.target.value)}
              className="border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black bg-[#fafafa]"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-password" className="text-xs text-[#737373]">Password</label>
            <input
              id="invite-password"
              type="password"
              required
              minLength={8}
              maxLength={70}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              className="border border-[#e5e5e5] px-3 py-2 text-sm outline-none focus:border-black"
            />
          </div>
          {error && <p className="text-xs text-[#cc0000]">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 border border-black bg-black text-white text-sm py-2 hover:bg-white hover:text-black transition-none disabled:opacity-50"
          >
            {submitting ? "..." : isRegister ? "Create account & join" : "Log in & join"}
          </button>
        </form>
        <button
          onClick={() => setStep(isRegister ? "login" : "register")}
          className="mt-3 text-xs text-[#737373] underline w-full text-center"
        >
          {isRegister ? "Already have an account? Log in" : "New here? Register instead"}
        </button>
      </div>
    </div>
  );
}
