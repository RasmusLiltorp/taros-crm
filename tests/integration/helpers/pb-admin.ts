/**
 * Integration test helpers for PocketBase on localhost:8091
 *
 * Requires docker-compose.test.yml to be running:
 *   docker compose -f docker-compose.test.yml up -d pocketbase
 */

import PocketBase from "pocketbase";

export const PB_URL = process.env.INTEGRATION_PB_URL ?? "http://localhost:8091";
export const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL ?? "admin@test.local";
export const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD ?? "testpassword123";

/** Returns a PocketBase client authenticated as the superuser. */
export async function adminAuth(): Promise<PocketBase> {
  const pb = new PocketBase(PB_URL);
  await pb.collection("_superusers").authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  return pb;
}

/** SHA-256 helper — mirrors the implementation in route.ts */
export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Creates a team and owner user, returns their IDs. */
export async function seedTeam(
  pb: PocketBase,
  opts: { teamName?: string; ownerEmail?: string; ownerPassword?: string } = {}
): Promise<{ teamId: string; userId: string }> {
  const email = opts.ownerEmail ?? `owner-${Date.now()}@test.com`;
  const password = opts.ownerPassword ?? "testpassword1234";
  const teamName = opts.teamName ?? `Test Team ${Date.now()}`;

  const user = await pb.collection("users").create({
    email,
    password,
    passwordConfirm: password,
    name: "Test Owner",
    verified: true,
  });

  const team = await pb.collection("teams").create({
    name: teamName,
    created_by: user.id,
  });

  await pb.collection("team_members").create({
    team: team.id,
    user: user.id,
    role: "owner",
  });

  return { teamId: team.id, userId: user.id };
}

/** Creates a pending invite record. Returns { inviteId, rawToken }. */
export async function seedInvite(
  pb: PocketBase,
  opts: {
    teamId: string;
    email?: string;
    expiresOffsetMs?: number;
    accepted?: boolean;
  }
): Promise<{ inviteId: string; rawToken: string }> {
  const rawToken = crypto.randomUUID();
  const tokenHash = await sha256(rawToken);
  const expiresMs = opts.expiresOffsetMs ?? 24 * 60 * 60 * 1000;
  const expires = new Date(Date.now() + expiresMs).toISOString();

  const invite = await pb.collection("invites").create({
    team: opts.teamId,
    email: opts.email ?? `invitee-${Date.now()}@test.com`,
    token: tokenHash,
    accepted: opts.accepted ?? false,
    expires,
  });

  return { inviteId: invite.id, rawToken };
}

/** Creates a plain (unverified) user for use as an invite acceptor. */
export async function seedUser(
  pb: PocketBase,
  opts: { email?: string; password?: string } = {}
): Promise<{ userId: string; email: string; password: string }> {
  const email = opts.email ?? `user-${Date.now()}@test.com`;
  const password = opts.password ?? "testpassword1234";

  const user = await pb.collection("users").create({
    email,
    password,
    passwordConfirm: password,
    name: "Test User",
    verified: true,
  });

  return { userId: user.id, email, password };
}

/** Deletes a list of records by collection + id. Silently ignores missing. */
export async function cleanup(
  pb: PocketBase,
  records: Array<{ collection: string; id: string }>
): Promise<void> {
  await Promise.allSettled(
    records.map(({ collection, id }) =>
      pb.collection(collection).delete(id)
    )
  );
}
