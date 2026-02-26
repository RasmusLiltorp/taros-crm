import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

// ─── MSW server — intercepts Cloudflare Turnstile siteverify ─────────────────

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Default handler: success
const handlers = [
  http.post(SITEVERIFY_URL, () =>
    HttpResponse.json({ success: true })
  ),
];

const server = setupServer(...handlers);

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

// Import route after MSW is set up
import { POST } from "./route";

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv("TURNSTILE_SECRET", "test-secret");
  vi.stubEnv("NODE_ENV", "test");
});

describe("POST /api/verify-turnstile", () => {
  describe("origin validation", () => {
    it("returns 403 when Origin header is set to an unknown origin", async () => {
      const req = makeRequest(
        { token: "tok" },
        { origin: "https://evil.example.com" }
      );
      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json() as { success: boolean; error: string };
      expect(json.success).toBe(false);
      expect(json.error).toBe("forbidden");
    });

    it("allows requests from localhost:3000", async () => {
      const req = makeRequest(
        { token: "tok" },
        { origin: "http://localhost:3000" }
      );
      const res = await POST(req);
      expect(res.status).toBe(200);
    });

    it("allows requests with no Origin header", async () => {
      const req = makeRequest({ token: "tok" });
      const res = await POST(req);
      expect(res.status).toBe(200);
    });
  });

  describe("token validation", () => {
    it("returns 400 when token is missing", async () => {
      const req = makeRequest({});
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json() as { success: boolean; error: string };
      expect(json.success).toBe(false);
      expect(json.error).toBe("missing_token");
    });
  });

  describe("missing TURNSTILE_SECRET", () => {
    it("passes through (returns 200) when secret is not set in non-production", async () => {
      vi.stubEnv("TURNSTILE_SECRET", "");
      vi.stubEnv("NODE_ENV", "test");
      const req = makeRequest({ token: "tok" });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json() as { success: boolean };
      expect(json.success).toBe(true);
    });

    it("passes through (returns 200) and logs a warning in production", async () => {
      vi.stubEnv("TURNSTILE_SECRET", "");
      vi.stubEnv("NODE_ENV", "production");
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const req = makeRequest({ token: "tok" });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json() as { success: boolean };
      expect(json.success).toBe(true);
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(warnSpy.mock.calls[0]?.[0] as string).toContain("TURNSTILE_SECRET");
      warnSpy.mockRestore();
    });
  });

  describe("Cloudflare siteverify", () => {
    it("returns 200 when Cloudflare responds with success: true", async () => {
      const req = makeRequest({ token: "valid-token" });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json() as { success: boolean };
      expect(json.success).toBe(true);
    });

    it("returns 400 when Cloudflare responds with success: false", async () => {
      server.use(
        http.post(SITEVERIFY_URL, () =>
          HttpResponse.json({ success: false, "error-codes": ["invalid-input-response"] })
        )
      );
      const req = makeRequest({ token: "bad-token" });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json() as { success: boolean; error: string };
      expect(json.success).toBe(false);
      expect(json.error).toBe("invalid-input-response");
    });

    it("returns 400 with 'invalid_token' when Cloudflare returns no error-codes", async () => {
      server.use(
        http.post(SITEVERIFY_URL, () =>
          HttpResponse.json({ success: false })
        )
      );
      const req = makeRequest({ token: "bad-token" });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json() as { success: boolean; error: string };
      expect(json.error).toBe("invalid_token");
    });

    it("uses only the first IP from x-forwarded-for header", async () => {
      let capturedBody: string | null = null;
      server.use(
        http.post(SITEVERIFY_URL, async ({ request }) => {
          capturedBody = await request.text();
          return HttpResponse.json({ success: true });
        })
      );
      const req = makeRequest(
        { token: "tok" },
        { "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" }
      );
      await POST(req);
      expect(capturedBody).toContain("remoteip=1.2.3.4");
      expect(capturedBody).not.toContain("5.6.7.8");
    });
  });
});
