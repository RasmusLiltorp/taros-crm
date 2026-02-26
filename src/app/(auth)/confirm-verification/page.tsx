"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getPocketBase } from "@/lib/pocketbase";
import type { ClientResponseError } from "pocketbase";
import { provisionTeam } from "@/lib/auth";
import { Suspense } from "react";

function ConfirmVerificationInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "logging-in" | "error">(
    token ? "loading" : "error"
  );
  const [message, setMessage] = useState(
    token ? "" : "Missing verification token."
  );

  useEffect(() => {
    if (!token) return;

    const pb = getPocketBase();
    pb.collection("users")
      .confirmVerification(token)
      .then(async () => {
        // Try to auto-login with credentials stored during registration
        const email = sessionStorage.getItem("pendingEmail");
        const password = sessionStorage.getItem("pendingPassword");

        if (email && password) {
          setStatus("logging-in");
          try {
            await pb.collection("users").authWithPassword(email, password);
            sessionStorage.removeItem("pendingEmail");
            sessionStorage.removeItem("pendingPassword");
            await provisionTeam();
            router.replace("/dashboard");
            return;
          } catch {
            // Credentials no longer valid — fall through to login
            sessionStorage.removeItem("pendingEmail");
            sessionStorage.removeItem("pendingPassword");
          }
        }

        // Different browser/session: go to login with a success indicator
        router.replace("/login?verified=1");
      })
      .catch((err: ClientResponseError) => {
        setStatus("error");
        setMessage(err?.message ?? "Verification failed. The link may have expired.");
      });
  }, [token, router]);

  if (status === "error") {
    return (
      <div className="w-full max-w-sm">
        <div className="border border-[#e5e5e5] p-8">
          <h1 className="text-base font-medium mb-3">Verification failed</h1>
          <p className="text-sm text-[#737373]">{message}</p>
          <p className="text-xs text-[#a3a3a3] mt-4">
            <Link href="/register" className="text-black underline">
              Register again
            </Link>{" "}
            to get a new link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="border border-[#e5e5e5] p-8">
        <h1 className="text-base font-medium mb-3">
          {status === "logging-in" ? "Signing you in…" : "Verifying your email…"}
        </h1>
        <p className="text-sm text-[#737373]">Just a moment.</p>
      </div>
    </div>
  );
}

export default function ConfirmVerificationPage() {
  return (
    <Suspense>
      <ConfirmVerificationInner />
    </Suspense>
  );
}
