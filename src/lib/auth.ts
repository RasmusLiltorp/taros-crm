import { getPocketBase } from "./pocketbase";
import type { ClientResponseError } from "pocketbase";
import type { Team, TeamMember } from "./types";
import { DEFAULT_SHEET_TEMPLATE } from "./sheetTemplates";

export async function getCurrentUser() {
  const pb = getPocketBase();
  return pb.authStore.record;
}

export function isAuthenticated(): boolean {
  const pb = getPocketBase();
  return pb.authStore.isValid;
}

export type LoginResult =
  | { type: "ok" }
  | { type: "mfa"; mfaId: string };

export async function login(email: string, password: string): Promise<LoginResult> {
  const pb = getPocketBase();
  try {
    await pb.collection("users").authWithPassword(email, password);
    return { type: "ok" };
  } catch (err) {
    const pbErr = err as ClientResponseError;
    if (pbErr?.status === 401 && pbErr?.response?.mfaId) {
      return { type: "mfa", mfaId: pbErr.response.mfaId as string };
    }
    throw err;
  }
}

/**
 * Step 2 of MFA login:
 *  1. Request an OTP to be sent to the user's email
 *  2. Exchange the otp + mfaId for a session token
 */
export async function requestMfaOtp(email: string): Promise<string> {
  const pb = getPocketBase();
  const res = await pb.collection("users").requestOTP(email);
  return res.otpId;
}

export async function verifyMfaOtp(
  otpId: string,
  otpCode: string,
  mfaId: string
) {
  const pb = getPocketBase();
  await pb.collection("users").authWithOTP(otpId, otpCode, { mfaId });
}

export async function register(
  email: string,
  password: string,
  name: string,
  teamName: string
) {
  const pb = getPocketBase();

  // Create user account
  let user;
  try {
    user = await pb.collection("users").create({
      email,
      password,
      passwordConfirm: password,
      name,
    });
  } catch (err) {
    const pbErr = err as ClientResponseError;
    // Detect duplicate email
    const emailError = pbErr?.response?.data?.email?.message as string | undefined;
    const isEmailDupe =
      emailError?.toLowerCase().includes("unique") ||
      (pbErr?.status === 400 && JSON.stringify(pbErr?.response ?? {}).toLowerCase().includes("unique"));
    if (isEmailDupe) {
      throw new Error("That email address is already in use.");
    }
    // Surface field-level validation errors
    if (pbErr?.status === 400) {
      const data = pbErr?.response?.data as Record<string, { message?: string }> | undefined;
      if (data) {
        const fieldErrors = Object.entries(data)
          .map(([field, v]) => `${field}: ${v?.message ?? "invalid"}`)
          .join(", ");
        if (fieldErrors) throw new Error(fieldErrors);
      }
      // PocketBase returns empty data:{} when the password exceeds its internal
      // limit (~70 chars). Surface a clear message instead of a generic one.
      if (password.length > 70) {
        throw new Error("Password must be 70 characters or fewer.");
      }
      throw new Error(pbErr?.response?.message ?? "Failed to create account. Please try again.");
    }
    throw err;
  }

  // Send verification email — non-fatal if it fails (user can re-request later)
  try {
    await pb.collection("users").requestVerification(email);
  } catch {
    // Swallow — SMTP errors should not block account creation
  }

  // Store teamName + credentials so we can auto-login after email verification
  if (typeof sessionStorage !== "undefined") {
    sessionStorage.setItem("pendingTeamName", teamName);
    sessionStorage.setItem("pendingEmail", email);
    sessionStorage.setItem("pendingPassword", password);
  }

  return { user };
}

/**
 * Called after a successful login. If the authenticated user has no team,
 * creates one using the pending team name from sessionStorage (set during
 * registration), then clears it.
 */
export async function ensureTeam(): Promise<void> {
  const pb = getPocketBase();
  const user = pb.authStore.record;
  if (!user) return;

  // Check if team already exists
  const existing = await getUserTeam();
  if (existing) return;

  // Retrieve the pending team name stored during registration
  const teamName =
    (typeof sessionStorage !== "undefined" && sessionStorage.getItem("pendingTeamName")) ||
    `${user.name || user.email}'s Team`;

  try {
    const team = await pb.collection("teams").create<Team>({
      name: teamName,
      created_by: user.id,
    });
    await pb.collection("team_members").create<TeamMember>({
      team: team.id,
      user: user.id,
      role: "owner",
    });
    // Non-fatal bootstrap: create a default spreadsheet for the new team.
    try {
      await pb.collection("contact_sheets").create({
        team: team.id,
        name: "Main",
        template: DEFAULT_SHEET_TEMPLATE,
        description: "Default spreadsheet",
        created_by: user.id,
      });
    } catch {
      // Ignore if the collection does not exist yet or creation fails.
    }
  } finally {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("pendingTeamName");
    }
  }
}

/**
 * Provisions a team for a new user via the server-side /api/provision-team
 * route, which uses superuser credentials to bypass collection rules.
 * Should be called after first login for new registrants.
 */
export async function provisionTeam(): Promise<void> {
  const pb = getPocketBase();
  if (!pb.authStore.isValid) return;

  const teamName =
    (typeof sessionStorage !== "undefined" && sessionStorage.getItem("pendingTeamName")) || "";

  try {
    await fetch("/api/provision-team", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pb.authStore.token}`,
      },
      body: JSON.stringify({ teamName }),
    });
  } catch {
    // Non-fatal
  } finally {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.removeItem("pendingTeamName");
    }
  }
}


export function logout() {
  const pb = getPocketBase();
  pb.authStore.clear();
}

export async function getUserTeam(): Promise<Team | null> {
  const pb = getPocketBase();
  const user = pb.authStore.record;
  if (!user) return null;

  try {
    const membership = await pb
      .collection("team_members")
      .getFirstListItem(`user="${user.id}"`, {
        expand: "team",
      });
    return membership.expand?.team as Team ?? null;
  } catch {
    return null;
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  const pb = getPocketBase();
  await pb.collection("users").requestPasswordReset(email);
}

export async function confirmPasswordReset(
  token: string,
  newPassword: string
): Promise<void> {
  const pb = getPocketBase();
  await pb.collection("users").confirmPasswordReset(token, newPassword, newPassword);
}
