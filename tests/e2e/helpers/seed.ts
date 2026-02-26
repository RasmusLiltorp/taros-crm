/**
 * E2E test seed helpers
 *
 * All helpers target PocketBase on localhost:8091 (docker-compose.test.yml)
 * and Mailpit on localhost:8025.
 */

import PocketBase from "pocketbase";

export const PB_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL ?? "http://localhost:8091";
export const ADMIN_EMAIL = process.env.PB_ADMIN_EMAIL ?? "admin@test.local";
export const ADMIN_PASSWORD = process.env.PB_ADMIN_PASSWORD ?? "testpassword123";
export const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

// ─── PocketBase admin client ──────────────────────────────────────────────────

let _adminPb: PocketBase | null = null;

/** Returns a cached, authenticated admin PocketBase client. */
export async function getAdminPb(): Promise<PocketBase> {
  if (_adminPb && _adminPb.authStore.isValid) return _adminPb;
  _adminPb = new PocketBase(PB_URL);
  await _adminPb.collection("_superusers").authWithPassword(ADMIN_EMAIL, ADMIN_PASSWORD);
  return _adminPb;
}

// ─── SHA-256 ──────────────────────────────────────────────────────────────────

export async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Seed: owner with team ────────────────────────────────────────────────────

export interface SeededOwner {
  userId: string;
  teamId: string;
  email: string;
  password: string;
}

/**
 * Creates a verified owner user + team + owner membership.
 * Returns credentials so E2E tests can log in as this user.
 */
export async function seedOwnerSession(opts: {
  email?: string;
  password?: string;
  teamName?: string;
} = {}): Promise<SeededOwner> {
  const pb = await getAdminPb();
  const email = opts.email ?? `owner-${Date.now()}@test.com`;
  const password = opts.password ?? "testpassword1234";
  const teamName = opts.teamName ?? `E2E Team ${Date.now()}`;

  const user = await pb.collection("users").create({
    email,
    password,
    passwordConfirm: password,
    name: "E2E Owner",
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

  return { userId: user.id, teamId: team.id, email, password };
}

// ─── Seed: invite ─────────────────────────────────────────────────────────────

export interface SeededInvite {
  inviteId: string;
  rawToken: string;
  inviteUrl: string;
  email: string;
}

/**
 * Creates a pending invite for the given team.
 * Returns the raw token and the full invite URL ready for Playwright navigation.
 */
export async function seedInvite(opts: {
  teamId: string;
  email?: string;
  expiresOffsetMs?: number;
  baseUrl?: string;
}): Promise<SeededInvite> {
  const pb = await getAdminPb();
  const rawToken = crypto.randomUUID();
  const tokenHash = await sha256(rawToken);
  const email = opts.email ?? `invitee-${Date.now()}@test.com`;
  const expiresMs = opts.expiresOffsetMs ?? 24 * 60 * 60 * 1000;
  const expires = new Date(Date.now() + expiresMs).toISOString();
  const baseUrl = opts.baseUrl ?? "http://localhost:3000";

  const invite = await pb.collection("invites").create({
    team: opts.teamId,
    email,
    token: tokenHash,
    accepted: false,
    expires,
  });

  return {
    inviteId: invite.id,
    rawToken,
    inviteUrl: `${baseUrl}/invite/${rawToken}`,
    email,
  };
}

// ─── Mailpit OTP retrieval ────────────────────────────────────────────────────

interface MailpitMessage {
  ID: string;
  To: Array<{ Address: string }>;
  Subject: string;
  Snippet: string;
}

interface MailpitListResponse {
  messages: MailpitMessage[];
  total: number;
}

/**
 * Polls Mailpit until an email arrives addressed to `toEmail` whose snippet
 * contains a numeric OTP. Returns the OTP string.
 *
 * Mailpit retains emails in memory only — this assumes the test environment
 * sends OTPs via SMTP to Mailpit (smtp://localhost:1025).
 */
export async function getLatestOtp(
  toEmail: string,
  opts: { pollMs?: number; timeoutMs?: number } = {}
): Promise<string> {
  const pollMs = opts.pollMs ?? 500;
  const timeoutMs = opts.timeoutMs ?? 15000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    if (res.ok) {
      const data = await res.json() as MailpitListResponse;
      const match = data.messages?.find(
        (m) =>
          m.To?.some((t) => t.Address.toLowerCase() === toEmail.toLowerCase()) &&
          /\b\d{6,8}\b/.test(m.Snippet)
      );
      if (match) {
        const otp = match.Snippet.match(/\b(\d{6,8})\b/)?.[1];
        if (otp) return otp;
      }
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new Error(`OTP email for ${toEmail} not found in Mailpit within ${timeoutMs}ms`);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

/**
 * Deletes PocketBase records by collection + id. Silently ignores missing records.
 */
export async function cleanup(
  records: Array<{ collection: string; id: string }>
): Promise<void> {
  const pb = await getAdminPb();
  await Promise.allSettled(
    records.map(({ collection, id }) => pb.collection(collection).delete(id))
  );
}

/**
 * Clears all messages from Mailpit.
 */
export async function clearMailpit(): Promise<void> {
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: "DELETE" });
}
