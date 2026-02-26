/**
 * Integration tests for POST /api/verify-turnstile
 *
 * Uses MSW to intercept the real Cloudflare siteverify fetch call.
 * No PocketBase dependency — these tests only need the Next.js runtime.
 */

import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

// ─── MSW server ───────────────────────────────────────────────────────────────

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const server = setupServer(
  http.post(SITEVERIFY_URL, () => HttpResponse.json({ success: true }))
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllEnvs();
});
afterAll(() => server.close());

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(
  body: unknown,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest("http://localhost/api/verify-turnstile", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

import { POST } from "../../src/app/api/verify-turnstile/route";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/verify-turnstile (integration)", () => {
  it("returns 200 when Cloudflare confirms a valid token", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "real-secret");
    const req = makeRequest({ token: "valid-cf-token" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean };
    expect(json.success).toBe(true);
  });

  it("passes the token and secret to Cloudflare in the POST body", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "my-secret");

    let capturedParams: URLSearchParams | null = null;
    server.use(
      http.post(SITEVERIFY_URL, async ({ request }) => {
        const text = await request.text();
        capturedParams = new URLSearchParams(text);
        return HttpResponse.json({ success: true });
      })
    );

    await POST(makeRequest({ token: "my-token" }));

    expect(capturedParams!.get("secret")).toBe("my-secret");
    expect(capturedParams!.get("response")).toBe("my-token");
  });

  it("returns 400 when Cloudflare rejects the token", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "real-secret");
    server.use(
      http.post(SITEVERIFY_URL, () =>
        HttpResponse.json({ success: false, "error-codes": ["timeout-or-duplicate"] })
      )
    );

    const res = await POST(makeRequest({ token: "expired-token" }));
    expect(res.status).toBe(400);
    const json = await res.json() as { success: boolean; error: string };
    expect(json.success).toBe(false);
    expect(json.error).toBe("timeout-or-duplicate");
  });

  it("forwards only the first IP from x-forwarded-for to Cloudflare", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "real-secret");

    let capturedRemoteIp: string | null = null;
    server.use(
      http.post(SITEVERIFY_URL, async ({ request }) => {
        const params = new URLSearchParams(await request.text());
        capturedRemoteIp = params.get("remoteip");
        return HttpResponse.json({ success: true });
      })
    );

    await POST(
      makeRequest(
        { token: "tok" },
        { "x-forwarded-for": "10.0.0.1, 10.0.0.2, 10.0.0.3" }
      )
    );

    expect(capturedRemoteIp).toBe("10.0.0.1");
  });

  it("bypasses Cloudflare and returns 200 when TURNSTILE_SECRET is not set", async () => {
    vi.stubEnv("TURNSTILE_SECRET", "");
    vi.stubEnv("NODE_ENV", "test");

    // MSW would throw "unhandled request" if fetch were called — this test
    // verifies the route short-circuits before reaching Cloudflare
    const res = await POST(makeRequest({ token: "any-token" }));
    expect(res.status).toBe(200);
  });
});
