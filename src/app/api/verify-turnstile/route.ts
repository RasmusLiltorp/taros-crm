import { type NextRequest, NextResponse } from "next/server";

const ALLOWED_ORIGINS = new Set([
  process.env.NEXT_PUBLIC_APP_URL ?? "",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

export async function POST(req: NextRequest) {
  // Reject requests whose Origin doesn't match the app URL
  const origin = req.headers.get("origin") ?? "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return NextResponse.json({ success: false, error: "forbidden" }, { status: 403 });
  }

  const { token } = await req.json();

  if (!token) {
    return NextResponse.json({ success: false, error: "missing_token" }, { status: 400 });
  }

  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) {
    // Warn loudly in production so misconfigured deployments are visible
    if (process.env.NODE_ENV === "production") {
      // eslint-disable-next-line no-console
      console.warn(
        "[verify-turnstile] TURNSTILE_SECRET is not set — bot protection is DISABLED. " +
        "Set TURNSTILE_SECRET in your environment to enable Cloudflare Turnstile."
      );
    }
    // Pass through in non-production (local dev convenience)
    return NextResponse.json({ success: true });
  }

  // Take only the first IP from x-forwarded-for to prevent header injection
  const rawForwardedFor = req.headers.get("x-forwarded-for") ?? "";
  const remoteIp =
    rawForwardedFor.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "";

  const body = new URLSearchParams({
    secret,
    response: token,
    remoteip: remoteIp,
  });

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  const data = await res.json() as { success: boolean; "error-codes"?: string[] };

  if (!data.success) {
    return NextResponse.json(
      { success: false, error: data["error-codes"]?.[0] ?? "invalid_token" },
      { status: 400 }
    );
  }

  return NextResponse.json({ success: true });
}
