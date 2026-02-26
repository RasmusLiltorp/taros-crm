/**
 * Integration tests for POST /api/accept-invite
 *
 * Requires PocketBase running on localhost:8091:
 *   docker compose -f docker-compose.test.yml up -d pocketbase
 *
 * The route reads NEXT_PUBLIC_POCKETBASE_URL at module load time,
 * so we set that env var before importing.
 */

import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type PocketBase from "pocketbase";
import {
  adminAuth,
  seedTeam,
  seedInvite,
  seedUser,
  cleanup,
  PB_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
} from "./helpers/pb-admin";

// Point the route at the test PocketBase instance
process.env.NEXT_PUBLIC_POCKETBASE_URL = PB_URL;
process.env.PB_ADMIN_EMAIL = ADMIN_EMAIL;
process.env.PB_ADMIN_PASSWORD = ADMIN_PASSWORD;

// Import route AFTER env vars are set
import { POST } from "../../src/app/api/accept-invite/route";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/accept-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ─── State ────────────────────────────────────────────────────────────────────

let pb: PocketBase;

// Track created records for cleanup
const created: Array<{ collection: string; id: string }> = [];

beforeAll(async () => {
  pb = await adminAuth();
});

afterEach(async () => {
  if (created.length > 0) {
    await cleanup(pb, [...created]);
    created.length = 0;
  }
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/accept-invite (integration)", () => {
  it("creates a team_members record and marks invite accepted on happy path", async () => {
    const { teamId, userId: ownerId } = await seedTeam(pb);
    const { userId } = await seedUser(pb);
    const { inviteId, rawToken } = await seedInvite(pb, { teamId });

    created.push(
      { collection: "team_members", id: "" }, // placeholder, we'll find it
      { collection: "invites", id: inviteId },
      { collection: "users", id: userId },
      { collection: "users", id: ownerId },
      { collection: "teams", id: teamId },
    );

    const res = await POST(makeRequest({ inviteId, token: rawToken, userId }));
    expect(res.status).toBe(200);
    const json = await res.json() as { success: boolean };
    expect(json.success).toBe(true);

    // Verify team_members record was created
    const member = await pb
      .collection("team_members")
      .getFirstListItem(`team="${teamId}" && user="${userId}"`);
    expect(member.role).toBe("member");
    created[0] = { collection: "team_members", id: member.id };

    // Verify invite is marked accepted
    const invite = await pb.collection("invites").getOne(inviteId);
    expect(invite.accepted).toBe(true);
  });

  it("returns 404 for a non-existent invite ID", async () => {
    const res = await POST(
      makeRequest({ inviteId: "nonexistentid00000", token: "tok", userId: "uid" })
    );
    expect(res.status).toBe(404);
    const json = await res.json() as { error: string };
    expect(json.error).toBe("invite_not_found");
  });

  it("returns 403 when token does not match the stored hash", async () => {
    const { teamId, userId: ownerId } = await seedTeam(pb);
    const { inviteId } = await seedInvite(pb, { teamId });

    created.push(
      { collection: "invites", id: inviteId },
      { collection: "users", id: ownerId },
      { collection: "teams", id: teamId },
    );

    const res = await POST(
      makeRequest({ inviteId, token: "wrong-token", userId: "anyuser" })
    );
    expect(res.status).toBe(403);
    const json = await res.json() as { error: string };
    expect(json.error).toBe("invalid_token");
  });

  it("returns 409 already_accepted when invite is already accepted", async () => {
    const { teamId, userId: ownerId } = await seedTeam(pb);
    const { userId } = await seedUser(pb);
    const { inviteId, rawToken } = await seedInvite(pb, { teamId, accepted: true });

    created.push(
      { collection: "invites", id: inviteId },
      { collection: "users", id: userId },
      { collection: "users", id: ownerId },
      { collection: "teams", id: teamId },
    );

    const res = await POST(makeRequest({ inviteId, token: rawToken, userId }));
    expect(res.status).toBe(409);
    const json = await res.json() as { error: string };
    expect(json.error).toBe("already_accepted");
  });

  it("returns 410 invite_expired when invite has expired", async () => {
    const { teamId, userId: ownerId } = await seedTeam(pb);
    const { userId } = await seedUser(pb);
    const { inviteId, rawToken } = await seedInvite(pb, {
      teamId,
      expiresOffsetMs: -1000, // expired 1 second ago
    });

    created.push(
      { collection: "invites", id: inviteId },
      { collection: "users", id: userId },
      { collection: "users", id: ownerId },
      { collection: "teams", id: teamId },
    );

    const res = await POST(makeRequest({ inviteId, token: rawToken, userId }));
    expect(res.status).toBe(410);
    const json = await res.json() as { error: string };
    expect(json.error).toBe("invite_expired");
  });

  it("returns 409 already_member when user is already in the team", async () => {
    const { teamId, userId: ownerId } = await seedTeam(pb);
    const { userId } = await seedUser(pb);
    const { inviteId, rawToken } = await seedInvite(pb, { teamId });

    // Pre-create membership
    const membership = await pb.collection("team_members").create({
      team: teamId,
      user: userId,
      role: "member",
    });

    created.push(
      { collection: "team_members", id: membership.id },
      { collection: "invites", id: inviteId },
      { collection: "users", id: userId },
      { collection: "users", id: ownerId },
      { collection: "teams", id: teamId },
    );

    const res = await POST(makeRequest({ inviteId, token: rawToken, userId }));
    expect(res.status).toBe(409);
    const json = await res.json() as { error: string };
    expect(json.error).toBe("already_member");
  });

  it("returns 400 for missing fields", async () => {
    const res = await POST(makeRequest({ inviteId: "x" }));
    expect(res.status).toBe(400);
    const json = await res.json() as { error: string };
    expect(json.error).toBe("missing_fields");
  });
});
