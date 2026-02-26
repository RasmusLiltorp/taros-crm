import { type NextRequest, NextResponse } from "next/server";
import PocketBase, { ClientResponseError } from "pocketbase";
import { DEFAULT_SHEET_TEMPLATE } from "@/lib/sheetTemplates";

const POCKETBASE_URL =
  process.env.NEXT_PUBLIC_POCKETBASE_URL || "http://127.0.0.1:8090";

/**
 * POST /api/provision-team
 *
 * Creates a team, team_members record, and default contact_sheet for a newly
 * registered user. Uses superuser credentials to bypass collection rules
 * (team_members.createRule = null requires admin access).
 *
 * The caller must be authenticated — we validate the user's auth token before
 * doing anything.
 *
 * Body: { teamName: string }
 * Headers: Authorization: <pb auth token>
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const teamName =
    typeof (body as Record<string, unknown>)?.teamName === "string"
      ? ((body as Record<string, unknown>).teamName as string).trim()
      : "";

  const authHeader = req.headers.get("authorization") ?? "";
  const userToken = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!userToken) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const adminEmail = process.env.PB_ADMIN_EMAIL;
  const adminPassword = process.env.PB_ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  // Verify the user's token and get their ID using an unprivileged client
  const userPb = new PocketBase(POCKETBASE_URL);
  let userId: string;
  let userEmail: string;
  let userName: string;
  try {
    // Load the token into authStore so we can make authenticated requests
    userPb.authStore.save(userToken, null);
    const authData = await userPb.collection("users").authRefresh();
    userId = authData.record.id;
    userEmail = authData.record.email as string;
    userName = (authData.record.name as string) || userEmail;
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Authenticate as superuser so we can bypass collection rules
  const pb = new PocketBase(POCKETBASE_URL);
  try {
    await pb.collection("_superusers").authWithPassword(adminEmail, adminPassword);
  } catch {
    return NextResponse.json({ error: "admin_auth_failed" }, { status: 500 });
  }

  // Check if user already has a team — idempotent
  try {
    await pb.collection("team_members").getFirstListItem(`user="${userId}"`);
    return NextResponse.json({ already_exists: true });
  } catch (err) {
    if (!(err instanceof ClientResponseError && err.status === 404)) {
      return NextResponse.json({ error: "member_check_failed" }, { status: 500 });
    }
    // 404 = no existing membership, proceed
  }

  const resolvedTeamName = teamName || `${userName}'s Team`;

  // Create team
  let teamId: string;
  try {
    const team = await pb.collection("teams").create({
      name: resolvedTeamName,
      created_by: userId,
    });
    teamId = team.id;
  } catch {
    return NextResponse.json({ error: "create_team_failed" }, { status: 500 });
  }

  // Create team_members record
  try {
    await pb.collection("team_members").create({
      team: teamId,
      user: userId,
      role: "owner",
    });
  } catch {
    return NextResponse.json({ error: "create_member_failed" }, { status: 500 });
  }

  // Create default spreadsheet — non-fatal
  try {
    await pb.collection("contact_sheets").create({
      team: teamId,
      name: "Main",
      template: DEFAULT_SHEET_TEMPLATE,
      description: "Default spreadsheet",
      created_by: userId,
    });
  } catch {
    // Ignore
  }

  return NextResponse.json({ success: true, teamId });
}
