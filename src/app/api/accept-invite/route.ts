import { type NextRequest, NextResponse } from "next/server";
import PocketBase, { ClientResponseError } from "pocketbase";
import { sha256 } from "@/lib/utils";
import type { Invite } from "@/lib/types";

const POCKETBASE_URL =
  process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090";

/**
 * POST /api/accept-invite
 *
 * Server-side invite acceptance. Verifies the invite token, creates the
 * team_members record, and marks the invite as accepted — all using admin
 * credentials so the calling user's session is not required to have write
 * access to those collections.
 *
 * Body: { inviteId: string; token: string; userId: string }
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    typeof (body as Record<string, unknown>).inviteId !== "string" ||
    typeof (body as Record<string, unknown>).token !== "string" ||
    typeof (body as Record<string, unknown>).userId !== "string"
  ) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const { inviteId, token, userId } = body as {
    inviteId: string;
    token: string;
    userId: string;
  };

  const adminEmail = process.env.PB_ADMIN_EMAIL;
  const adminPassword = process.env.PB_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return NextResponse.json(
      { error: "server_misconfigured" },
      { status: 500 }
    );
  }

  const pb = new PocketBase(POCKETBASE_URL);

  // Authenticate as superuser so we can bypass collection rules
  try {
    await pb.collection("_superusers").authWithPassword(adminEmail, adminPassword);
  } catch {
    return NextResponse.json({ error: "admin_auth_failed" }, { status: 500 });
  }

  // Fetch and verify the invite server-side
  let invite: Invite;
  try {
    invite = await pb.collection("invites").getOne<Invite>(inviteId);
  } catch {
    return NextResponse.json({ error: "invite_not_found" }, { status: 404 });
  }

  // Token must match — compare stored hash with hash of provided token
  const providedHash = await sha256(token);
  if (providedHash !== invite.token) {
    return NextResponse.json({ error: "invalid_token" }, { status: 403 });
  }

  if (invite.accepted) {
    return NextResponse.json({ error: "already_accepted" }, { status: 409 });
  }

  if (new Date(invite.expires) < new Date()) {
    return NextResponse.json({ error: "invite_expired" }, { status: 410 });
  }

  // Check user is not already a member of this team
  try {
    const existing = await pb
      .collection("team_members")
      .getFirstListItem(`team="${invite.team}" && user="${userId}"`);
    if (existing) {
      return NextResponse.json({ error: "already_member" }, { status: 409 });
    }
  } catch (err) {
    // 404 means no existing membership — that's expected, continue
    if (!(err instanceof ClientResponseError && err.status === 404)) {
      return NextResponse.json({ error: "member_check_failed" }, { status: 500 });
    }
  }

  // If the user is not yet verified (new registrant via invite), mark them verified.
  // This is safe because the invite token proves ownership of the email address.
  try {
    const user = await pb.collection("users").getOne(userId);
    if (!user.verified) {
      await pb.collection("users").update(userId, { verified: true });
    }
  } catch {
    return NextResponse.json({ error: "user_verify_failed" }, { status: 500 });
  }

  // Create team membership
  try {
    await pb.collection("team_members").create({
      team: invite.team,
      user: userId,
      role: "member",
    });
  } catch {
    return NextResponse.json({ error: "create_member_failed" }, { status: 500 });
  }

  // Mark invite as accepted
  try {
    await pb.collection("invites").update(inviteId, { accepted: true });
  } catch {
    // Non-fatal — membership was already created
  }

  return NextResponse.json({ success: true });
}
