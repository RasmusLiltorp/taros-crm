import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { ClientResponseError } from "pocketbase";
import type * as PocketBaseModule from "pocketbase";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/accept-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Shared mutable state for the PocketBase mock — replaced per-test
let mockPbInstance: ReturnType<typeof makeMockPb>;

function makeMockPb(overrides: {
  authWithPassword?: ReturnType<typeof vi.fn>;
  invitesGetOne?: ReturnType<typeof vi.fn>;
  teamMembersGetFirst?: ReturnType<typeof vi.fn>;
  teamMembersCreate?: ReturnType<typeof vi.fn>;
  invitesUpdate?: ReturnType<typeof vi.fn>;
  usersGetOne?: ReturnType<typeof vi.fn>;
  usersUpdate?: ReturnType<typeof vi.fn>;
} = {}) {
  const authWithPassword = overrides.authWithPassword ?? vi.fn().mockResolvedValue({});
  const invitesGetOne = overrides.invitesGetOne ?? vi.fn();
  const teamMembersGetFirst = overrides.teamMembersGetFirst ?? vi.fn();
  const teamMembersCreate = overrides.teamMembersCreate ?? vi.fn().mockResolvedValue({});
  const invitesUpdate = overrides.invitesUpdate ?? vi.fn().mockResolvedValue({});
  // Default: user is already verified (verified=true), so update is not called
  const usersGetOne = overrides.usersGetOne ?? vi.fn().mockResolvedValue({ id: "u1", verified: true });
  const usersUpdate = overrides.usersUpdate ?? vi.fn().mockResolvedValue({});

  return {
    authWithPassword,
    invitesGetOne,
    teamMembersGetFirst,
    teamMembersCreate,
    invitesUpdate,
    usersGetOne,
    usersUpdate,
    collection: vi.fn().mockImplementation((name: string) => {
      if (name === "_superusers") return { authWithPassword };
      if (name === "invites") return { getOne: invitesGetOne, update: invitesUpdate };
      if (name === "team_members") return { getFirstListItem: teamMembersGetFirst, create: teamMembersCreate };
      if (name === "users") return { getOne: usersGetOne, update: usersUpdate };
      return {};
    }),
  };
}

// Mock pocketbase as a constructor class
vi.mock("pocketbase", async (importOriginal) => {
  const original = await importOriginal<typeof PocketBaseModule>();
  const MockPocketBase = vi.fn().mockImplementation(function () {
    return mockPbInstance;
  });
  return {
    default: MockPocketBase,
    ClientResponseError: original.ClientResponseError,
  };
});

// Import route AFTER mock is set up
import { POST } from "./route";

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockPbInstance = makeMockPb();
  vi.stubEnv("PB_ADMIN_EMAIL", "admin@test.com");
  vi.stubEnv("PB_ADMIN_PASSWORD", "testpass");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("POST /api/accept-invite", () => {
  describe("request validation", () => {
    it("returns 400 for invalid JSON body", async () => {
      const req = new NextRequest("http://localhost/api/accept-invite", {
        method: "POST",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json() as { error: string };
      expect(json.error).toBe("invalid_body");
    });

    it("returns 400 for missing required fields", async () => {
      const res = await POST(makeRequest({ inviteId: "x" }));
      expect(res.status).toBe(400);
      const json = await res.json() as { error: string };
      expect(json.error).toBe("missing_fields");
    });
  });

  describe("environment configuration", () => {
    it("returns 500 server_misconfigured when PB_ADMIN_EMAIL is missing", async () => {
      vi.stubEnv("PB_ADMIN_EMAIL", "");
      const res = await POST(makeRequest({ inviteId: "x", token: "t", userId: "u" }));
      expect(res.status).toBe(500);
      const json = await res.json() as { error: string };
      expect(json.error).toBe("server_misconfigured");
    });
  });

  describe("admin authentication", () => {
    it("returns 500 admin_auth_failed when superuser auth fails", async () => {
      mockPbInstance = makeMockPb({
        authWithPassword: vi.fn().mockRejectedValue(new Error("bad credentials")),
      });
      const res = await POST(makeRequest({ inviteId: "x", token: "t", userId: "u" }));
      expect(res.status).toBe(500);
      const json = await res.json() as { error: string };
      expect(json.error).toBe("admin_auth_failed");
    });
  });

  describe("invite verification", () => {
    it("returns 404 invite_not_found when invite does not exist", async () => {
      mockPbInstance = makeMockPb({
        invitesGetOne: vi.fn().mockRejectedValue(new Error("not found")),
      });
      const res = await POST(makeRequest({ inviteId: "missing", token: "t", userId: "u" }));
      expect(res.status).toBe(404);
      const json = await res.json() as { error: string };
      expect(json.error).toBe("invite_not_found");
    });

    it("returns 403 invalid_token when token hash does not match", async () => {
      const storedHash = await sha256("correct-token");
      mockPbInstance = makeMockPb({
        invitesGetOne: vi.fn().mockResolvedValue({
          id: "inv1", token: storedHash, accepted: false,
          expires: new Date(Date.now() + 86400000).toISOString(),
          team: "t1",
        }),
      });
      const res = await POST(makeRequest({ inviteId: "inv1", token: "wrong-token", userId: "u1" }));
      expect(res.status).toBe(403);
      const json = await res.json() as { error: string };
      expect(json.error).toBe("invalid_token");
    });

    it("returns 409 already_accepted when invite is already accepted", async () => {
      const rawToken = "my-raw-token";
      const storedHash = await sha256(rawToken);
      mockPbInstance = makeMockPb({
        invitesGetOne: vi.fn().mockResolvedValue({
          id: "inv1", token: storedHash, accepted: true,
          expires: new Date(Date.now() + 86400000).toISOString(),
          team: "t1",
        }),
      });
      const res = await POST(makeRequest({ inviteId: "inv1", token: rawToken, userId: "u1" }));
      expect(res.status).toBe(409);
      const json = await res.json() as { error: string };
      expect(json.error).toBe("already_accepted");
    });

    it("returns 410 invite_expired when invite has expired", async () => {
      const rawToken = "my-raw-token";
      const storedHash = await sha256(rawToken);
      mockPbInstance = makeMockPb({
        invitesGetOne: vi.fn().mockResolvedValue({
          id: "inv1", token: storedHash, accepted: false,
          expires: new Date(Date.now() - 1000).toISOString(),
          team: "t1",
        }),
      });
      const res = await POST(makeRequest({ inviteId: "inv1", token: rawToken, userId: "u1" }));
      expect(res.status).toBe(410);
      const json = await res.json() as { error: string };
      expect(json.error).toBe("invite_expired");
    });

    it("returns 409 already_member when user is already in the team", async () => {
      const rawToken = "my-raw-token";
      const storedHash = await sha256(rawToken);
      mockPbInstance = makeMockPb({
        invitesGetOne: vi.fn().mockResolvedValue({
          id: "inv1", token: storedHash, accepted: false,
          expires: new Date(Date.now() + 86400000).toISOString(),
          team: "t1",
        }),
        teamMembersGetFirst: vi.fn().mockResolvedValue({ id: "tm1" }),
      });
      const res = await POST(makeRequest({ inviteId: "inv1", token: rawToken, userId: "u1" }));
      expect(res.status).toBe(409);
      const json = await res.json() as { error: string };
      expect(json.error).toBe("already_member");
    });

    it("returns 500 member_check_failed on non-404 error during membership check", async () => {
      const rawToken = "my-raw-token";
      const storedHash = await sha256(rawToken);
      mockPbInstance = makeMockPb({
        invitesGetOne: vi.fn().mockResolvedValue({
          id: "inv1", token: storedHash, accepted: false,
          expires: new Date(Date.now() + 86400000).toISOString(),
          team: "t1",
        }),
        teamMembersGetFirst: vi.fn().mockRejectedValue(
          new ClientResponseError({ status: 500, url: "", data: {} })
        ),
      });
      const res = await POST(makeRequest({ inviteId: "inv1", token: rawToken, userId: "u1" }));
      expect(res.status).toBe(500);
      const json = await res.json() as { error: string };
      expect(json.error).toBe("member_check_failed");
    });

    it("returns 500 create_member_failed when team_members.create throws", async () => {
      const rawToken = "my-raw-token";
      const storedHash = await sha256(rawToken);
      mockPbInstance = makeMockPb({
        invitesGetOne: vi.fn().mockResolvedValue({
          id: "inv1", token: storedHash, accepted: false,
          expires: new Date(Date.now() + 86400000).toISOString(),
          team: "t1",
        }),
        teamMembersGetFirst: vi.fn().mockRejectedValue(
          new ClientResponseError({ status: 404, url: "", data: {} })
        ),
        teamMembersCreate: vi.fn().mockRejectedValue(new Error("DB error")),
      });
      const res = await POST(makeRequest({ inviteId: "inv1", token: rawToken, userId: "u1" }));
      expect(res.status).toBe(500);
      const json = await res.json() as { error: string };
      expect(json.error).toBe("create_member_failed");
    });

    it("returns 500 user_verify_failed when users.getOne throws", async () => {
      const rawToken = "my-raw-token";
      const storedHash = await sha256(rawToken);
      mockPbInstance = makeMockPb({
        invitesGetOne: vi.fn().mockResolvedValue({
          id: "inv1", token: storedHash, accepted: false,
          expires: new Date(Date.now() + 86400000).toISOString(),
          team: "t1",
        }),
        teamMembersGetFirst: vi.fn().mockRejectedValue(
          new ClientResponseError({ status: 404, url: "", data: {} })
        ),
        usersGetOne: vi.fn().mockRejectedValue(new Error("user not found")),
      });
      const res = await POST(makeRequest({ inviteId: "inv1", token: rawToken, userId: "u1" }));
      expect(res.status).toBe(500);
      const json = await res.json() as { error: string };
      expect(json.error).toBe("user_verify_failed");
    });

    it("returns 200 and calls create/update with correct args on happy path", async () => {
      const rawToken = "my-raw-token";
      const storedHash = await sha256(rawToken);
      const teamMembersCreate = vi.fn().mockResolvedValue({ id: "tm-new" });
      const invitesUpdate = vi.fn().mockResolvedValue({});
      mockPbInstance = makeMockPb({
        invitesGetOne: vi.fn().mockResolvedValue({
          id: "inv1", token: storedHash, accepted: false,
          expires: new Date(Date.now() + 86400000).toISOString(),
          team: "t1",
        }),
        teamMembersGetFirst: vi.fn().mockRejectedValue(
          new ClientResponseError({ status: 404, url: "", data: {} })
        ),
        teamMembersCreate,
        invitesUpdate,
      });

      const res = await POST(makeRequest({ inviteId: "inv1", token: rawToken, userId: "u1" }));

      expect(res.status).toBe(200);
      const json = await res.json() as { success: boolean };
      expect(json.success).toBe(true);
      expect(teamMembersCreate).toHaveBeenCalledWith({ team: "t1", user: "u1", role: "member" });
      expect(invitesUpdate).toHaveBeenCalledWith("inv1", { accepted: true });
    });

    it("marks unverified user as verified on happy path", async () => {
      const rawToken = "my-raw-token";
      const storedHash = await sha256(rawToken);
      const usersUpdate = vi.fn().mockResolvedValue({});
      mockPbInstance = makeMockPb({
        invitesGetOne: vi.fn().mockResolvedValue({
          id: "inv1", token: storedHash, accepted: false,
          expires: new Date(Date.now() + 86400000).toISOString(),
          team: "t1",
        }),
        teamMembersGetFirst: vi.fn().mockRejectedValue(
          new ClientResponseError({ status: 404, url: "", data: {} })
        ),
        usersGetOne: vi.fn().mockResolvedValue({ id: "u1", verified: false }),
        usersUpdate,
      });

      const res = await POST(makeRequest({ inviteId: "inv1", token: rawToken, userId: "u1" }));

      expect(res.status).toBe(200);
      expect(usersUpdate).toHaveBeenCalledWith("u1", { verified: true });
    });
  });
});
