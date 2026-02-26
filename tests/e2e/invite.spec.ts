/**
 * E2E: Invite flow
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *   npm run dev (or let Playwright webServer start it)
 */

import { test, expect } from "@playwright/test";
import {
  seedOwnerSession,
  seedInvite,
  getLatestOtp,
  cleanup,
  clearMailpit,
  getAdminPb,
} from "./helpers/seed";

test.describe("Invite flow", () => {
  test.beforeEach(async () => {
    await clearMailpit();
  });

  test("new user registers via invite link, enters OTP, lands on dashboard", async ({ page }) => {
    // ── Seed ───────────────────────────────────────────────────────────────────
    const { teamId, userId: ownerId } = await seedOwnerSession();
    const inviteeEmail = `invitee-${Date.now()}@test.com`;
    const { inviteUrl, inviteId } = await seedInvite({ teamId, email: inviteeEmail });

    const toClean: Array<{ collection: string; id: string }> = [
      { collection: "invites", id: inviteId },
    ];

    try {
      // ── Navigate to invite page ────────────────────────────────────────────
      await page.goto(inviteUrl);
      await expect(page.getByText("You've been invited")).toBeVisible({ timeout: 10000 });

      // Email field should be pre-filled and read-only
      await expect(page.locator("#invite-email")).toHaveValue(inviteeEmail);

      // ── Fill in registration form ──────────────────────────────────────────
      await page.locator("#invite-name").fill("E2E Invitee");
      await page.locator("#invite-password").fill("testpassword1234");
      await page.getByRole("button", { name: "Create account & join" }).click();

      // ── OTP step ──────────────────────────────────────────────────────────
      await expect(page.getByText("Check your email")).toBeVisible({ timeout: 10000 });

      const otp = await getLatestOtp(inviteeEmail, { timeoutMs: 20000 });
      await page.locator("#otp").fill(otp);
      await page.getByRole("button", { name: "Verify & join team" }).click();

      // ── Success ───────────────────────────────────────────────────────────
      await expect(page.getByText("Joined team. Redirecting...")).toBeVisible({ timeout: 10000 });
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

      // ── Verify DB state ───────────────────────────────────────────────────
      const pb = await getAdminPb();
      const invite = await pb.collection("invites").getOne(inviteId);
      expect(invite.accepted).toBe(true);

      const membership = await pb
        .collection("team_members")
        .getFirstListItem(`team="${teamId}" && user.email="${inviteeEmail}"`);
      expect(membership.role).toBe("member");
      toClean.push({ collection: "team_members", id: membership.id });

      // Get created user id for cleanup
      const user = await pb
        .collection("users")
        .getFirstListItem(`email="${inviteeEmail}"`);
      toClean.push({ collection: "users", id: user.id });
    } finally {
      // Always cleanup owner + team
      toClean.push({ collection: "users", id: ownerId });
      const pb = await getAdminPb();
      const ownerMembership = await pb
        .collection("team_members")
        .getFirstListItem(`team="${teamId}" && role="owner"`)
        .catch(() => null);
      if (ownerMembership) toClean.push({ collection: "team_members", id: ownerMembership.id });
      toClean.push({ collection: "teams", id: teamId });
      await cleanup(toClean);
    }
  });

  test("existing user logs in via invite link, enters OTP, lands on dashboard", async ({ page }) => {
    // ── Seed: owner + a second already-registered user ────────────────────────
    const { teamId, userId: ownerId } = await seedOwnerSession();
    const pb = await getAdminPb();
    const inviteeEmail = `existing-${Date.now()}@test.com`;
    const inviteePassword = "testpassword1234";
    const existingUser = await pb.collection("users").create({
      email: inviteeEmail,
      password: inviteePassword,
      passwordConfirm: inviteePassword,
      name: "Existing User",
      verified: true,
    });

    const { inviteUrl, inviteId } = await seedInvite({ teamId, email: inviteeEmail });

    const toClean: Array<{ collection: string; id: string }> = [
      { collection: "invites", id: inviteId },
      { collection: "users", id: existingUser.id },
    ];

    try {
      await page.goto(inviteUrl);
      await expect(page.getByText("You've been invited")).toBeVisible({ timeout: 10000 });

      // Switch to login form
      await page.getByRole("button", { name: /Already have an account/ }).click();
      await expect(page.getByRole("button", { name: "Log in & join" })).toBeVisible();

      await page.locator("#invite-password").fill(inviteePassword);
      await page.getByRole("button", { name: "Log in & join" }).click();

      // OTP step
      await expect(page.getByText("Check your email")).toBeVisible({ timeout: 10000 });
      const otp = await getLatestOtp(inviteeEmail, { timeoutMs: 20000 });
      await page.locator("#otp").fill(otp);
      await page.getByRole("button", { name: "Verify & join team" }).click();

      await expect(page.getByText("Joined team. Redirecting...")).toBeVisible({ timeout: 10000 });
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });

      // Verify DB
      const membership = await pb
        .collection("team_members")
        .getFirstListItem(`team="${teamId}" && user="${existingUser.id}"`);
      expect(membership.role).toBe("member");
      toClean.push({ collection: "team_members", id: membership.id });
    } finally {
      toClean.push({ collection: "users", id: ownerId });
      const ownerMembership = await pb
        .collection("team_members")
        .getFirstListItem(`team="${teamId}" && role="owner"`)
        .catch(() => null);
      if (ownerMembership) toClean.push({ collection: "team_members", id: ownerMembership.id });
      toClean.push({ collection: "teams", id: teamId });
      await cleanup(toClean);
    }
  });

  test("shows error page for an invalid invite token", async ({ page }) => {
    await page.goto("http://localhost:3000/invite/totally-invalid-token-that-does-not-exist");
    await expect(
      page.getByText("This invite link is invalid or has expired.")
    ).toBeVisible({ timeout: 10000 });
  });
});
