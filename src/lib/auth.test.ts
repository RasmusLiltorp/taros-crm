import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ClientResponseError } from "pocketbase";

// Mock the pocketbase module before importing auth
vi.mock("@/lib/pocketbase");

import { login, register, ensureTeam } from "./auth";
import { getPocketBase } from "./pocketbase";

// Helper to build a minimal ClientResponseError
function pbError(status: number, response: Record<string, unknown> = {}): ClientResponseError {
  const err = new ClientResponseError({ status, response, url: "", data: response });
  return err;
}

// Typed mock of getPocketBase
const mockGetPocketBase = vi.mocked(getPocketBase);

function makePbStub(overrides: Record<string, unknown> = {}) {
  return {
    authStore: {
      record: null as { id: string; name: string; email: string } | null,
      isValid: false,
    },
    collection: vi.fn().mockReturnValue({
      authWithPassword: vi.fn(),
      requestOTP: vi.fn(),
      authWithOTP: vi.fn(),
      create: vi.fn(),
      requestVerification: vi.fn(),
      getFirstListItem: vi.fn(),
    }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset sessionStorage before each test
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── login ────────────────────────────────────────────────────────────────────

describe("login", () => {
  it("returns { type: 'ok' } when authWithPassword resolves", async () => {
    const stub = makePbStub();
    stub.collection("users").authWithPassword = vi.fn().mockResolvedValue({ record: { id: "u1" } });
    mockGetPocketBase.mockReturnValue(stub as unknown as ReturnType<typeof getPocketBase>);

    const result = await login("user@test.com", "pass");
    expect(result).toEqual({ type: "ok" });
  });

  it("returns { type: 'mfa', mfaId } when authWithPassword throws 401 with mfaId", async () => {
    const stub = makePbStub();
    stub.collection("users").authWithPassword = vi.fn().mockRejectedValue(
      pbError(401, { mfaId: "mfa-abc" })
    );
    mockGetPocketBase.mockReturnValue(stub as unknown as ReturnType<typeof getPocketBase>);

    const result = await login("user@test.com", "pass");
    expect(result).toEqual({ type: "mfa", mfaId: "mfa-abc" });
  });

  it("re-throws errors that are not MFA challenges", async () => {
    const stub = makePbStub();
    stub.collection("users").authWithPassword = vi.fn().mockRejectedValue(
      pbError(400, { message: "invalid credentials" })
    );
    mockGetPocketBase.mockReturnValue(stub as unknown as ReturnType<typeof getPocketBase>);

    await expect(login("user@test.com", "wrongpass")).rejects.toThrow();
  });
});

// ─── register ─────────────────────────────────────────────────────────────────

describe("register", () => {
  it("returns { user } on success and sets pendingTeamName in sessionStorage", async () => {
    const stub = makePbStub();
    const fakeUser = { id: "u1", email: "user@test.com", name: "Alice" };
    stub.collection("users").create = vi.fn().mockResolvedValue(fakeUser);
    stub.collection("users").requestVerification = vi.fn().mockResolvedValue(undefined);
    mockGetPocketBase.mockReturnValue(stub as unknown as ReturnType<typeof getPocketBase>);

    const result = await register("user@test.com", "password123", "Alice", "Acme Inc");

    expect(result.user).toEqual(fakeUser);
    expect(sessionStorage.getItem("pendingTeamName")).toBe("Acme Inc");
  });

  it("throws 'already in use' for duplicate email (unique constraint)", async () => {
    const stub = makePbStub();
    stub.collection("users").create = vi.fn().mockRejectedValue(
      pbError(400, { data: { email: { message: "Value must be unique" } } })
    );
    mockGetPocketBase.mockReturnValue(stub as unknown as ReturnType<typeof getPocketBase>);

    await expect(register("dup@test.com", "pass", "Bob", "Co")).rejects.toThrow(
      "That email address is already in use."
    );
  });

  it("throws password length message for 400 with empty data when password > 70 chars", async () => {
    const stub = makePbStub();
    stub.collection("users").create = vi.fn().mockRejectedValue(
      pbError(400, { data: {} })
    );
    mockGetPocketBase.mockReturnValue(stub as unknown as ReturnType<typeof getPocketBase>);

    const longPassword = "a".repeat(71);
    await expect(register("user@test.com", longPassword, "Bob", "Co")).rejects.toThrow(
      "Password must be 70 characters or fewer."
    );
  });

  it("throws joined field-level error message", async () => {
    const stub = makePbStub();
    stub.collection("users").create = vi.fn().mockRejectedValue(
      pbError(400, { data: { name: { message: "too short" } } })
    );
    mockGetPocketBase.mockReturnValue(stub as unknown as ReturnType<typeof getPocketBase>);

    await expect(register("user@test.com", "pass", "B", "Co")).rejects.toThrow("name: too short");
  });

  it("does not throw if requestVerification fails (SMTP errors are swallowed)", async () => {
    const stub = makePbStub();
    stub.collection("users").create = vi.fn().mockResolvedValue({ id: "u1" });
    stub.collection("users").requestVerification = vi.fn().mockRejectedValue(new Error("SMTP down"));
    mockGetPocketBase.mockReturnValue(stub as unknown as ReturnType<typeof getPocketBase>);

    await expect(register("user@test.com", "pass", "Alice", "Co")).resolves.toBeDefined();
  });
});

// ─── ensureTeam ───────────────────────────────────────────────────────────────

describe("ensureTeam", () => {
  it("does nothing when user already has a team", async () => {
    const stub = makePbStub();
    stub.authStore.record = { id: "u1", name: "Alice", email: "alice@test.com" };
    stub.authStore.isValid = true;
    const teamsCreate = vi.fn();
    const teamMembersCreate = vi.fn();
    const contactSheetsCreate = vi.fn();
    stub.collection = vi.fn().mockImplementation((name: string) => {
      if (name === "team_members") {
        return {
          getFirstListItem: vi.fn().mockResolvedValue({
            id: "tm1",
            expand: { team: { id: "t1", name: "Existing Team" } },
          }),
          create: teamMembersCreate,
        };
      }
      if (name === "contact_sheets") {
        return { create: contactSheetsCreate };
      }
      return { create: teamsCreate };
    });
    mockGetPocketBase.mockReturnValue(stub as unknown as ReturnType<typeof getPocketBase>);

    await ensureTeam();

    expect(teamsCreate).not.toHaveBeenCalled();
    expect(teamMembersCreate).not.toHaveBeenCalled();
    expect(contactSheetsCreate).not.toHaveBeenCalled();
  });

  it("creates team and team_members when no team exists", async () => {
    const stub = makePbStub();
    stub.authStore.record = { id: "u1", name: "Alice", email: "alice@test.com" };
    stub.authStore.isValid = true;
    const teamsCreate = vi.fn().mockResolvedValue({ id: "t1", name: "Alice's Team" });
    const teamMembersCreate = vi.fn().mockResolvedValue({ id: "tm1" });
    const contactSheetsCreate = vi.fn().mockResolvedValue({ id: "s1" });
    stub.collection = vi.fn().mockImplementation((name: string) => {
      if (name === "team_members") {
        return {
          getFirstListItem: vi.fn().mockRejectedValue(pbError(404)),
          create: teamMembersCreate,
        };
      }
      if (name === "contact_sheets") {
        return { create: contactSheetsCreate };
      }
      return { create: teamsCreate };
    });
    mockGetPocketBase.mockReturnValue(stub as unknown as ReturnType<typeof getPocketBase>);

    await ensureTeam();

    expect(teamsCreate).toHaveBeenCalledOnce();
    expect(teamMembersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ team: "t1", user: "u1", role: "owner" })
    );
    expect(contactSheetsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ team: "t1", name: "Main" })
    );
  });

  it("reads pendingTeamName from sessionStorage", async () => {
    sessionStorage.setItem("pendingTeamName", "My Startup");
    const stub = makePbStub();
    stub.authStore.record = { id: "u1", name: "Alice", email: "alice@test.com" };
    stub.authStore.isValid = true;
    const teamsCreate = vi.fn().mockResolvedValue({ id: "t1" });
    const teamMembersCreate = vi.fn().mockResolvedValue({ id: "tm1" });
    const contactSheetsCreate = vi.fn().mockResolvedValue({ id: "s1" });
    stub.collection = vi.fn().mockImplementation((name: string) => {
      if (name === "team_members") {
        return {
          getFirstListItem: vi.fn().mockRejectedValue(pbError(404)),
          create: teamMembersCreate,
        };
      }
      if (name === "contact_sheets") {
        return { create: contactSheetsCreate };
      }
      return { create: teamsCreate };
    });
    mockGetPocketBase.mockReturnValue(stub as unknown as ReturnType<typeof getPocketBase>);

    await ensureTeam();

    expect(teamsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My Startup" })
    );
    expect(sessionStorage.getItem("pendingTeamName")).toBeNull();
  });

  it("falls back to user name when no pendingTeamName in sessionStorage", async () => {
    const stub = makePbStub();
    stub.authStore.record = { id: "u1", name: "Alice", email: "alice@test.com" };
    stub.authStore.isValid = true;
    const teamsCreate = vi.fn().mockResolvedValue({ id: "t1" });
    const teamMembersCreate = vi.fn().mockResolvedValue({ id: "tm1" });
    const contactSheetsCreate = vi.fn().mockResolvedValue({ id: "s1" });
    stub.collection = vi.fn().mockImplementation((name: string) => {
      if (name === "team_members") {
        return {
          getFirstListItem: vi.fn().mockRejectedValue(pbError(404)),
          create: teamMembersCreate,
        };
      }
      if (name === "contact_sheets") {
        return { create: contactSheetsCreate };
      }
      return { create: teamsCreate };
    });
    mockGetPocketBase.mockReturnValue(stub as unknown as ReturnType<typeof getPocketBase>);

    await ensureTeam();

    expect(teamsCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Alice's Team" })
    );
  });
});
