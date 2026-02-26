/**
 * E2E: Settings page — invite send + revoke
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 */

import { test, expect, type Page } from "@playwright/test";
import {
  seedOwnerSession,
  getLatestOtp,
  cleanup,
  clearMailpit,
  getAdminPb,
  type SeededOwner,
} from "./helpers/seed";

// ─── Helper: log in as an owner and reach the settings page ──────────────────

async function loginAndGoToSettings(page: Page, owner: SeededOwner): Promise<void> {
  await page.goto("http://localhost:3000/login");
  await page.locator("#email").fill(owner.email);
  await page.locator("#password").fill(owner.password);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText("Check your email")).toBeVisible({ timeout: 10000 });
  const otp = await getLatestOtp(owner.email, { timeoutMs: 20000 });
  await page.locator("#otp").fill(otp);
  await page.getByRole("button", { name: "Verify" }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
  await page.goto("http://localhost:3000/settings");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 10000 });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Settings: invite management", () => {
  test.beforeEach(async () => {
    await clearMailpit();
  });

  test("owner can send an invite and see the invite link", async ({ page }) => {
    const owner = await seedOwnerSession();
    const pb = await getAdminPb();
    const membership = await pb
      .collection("team_members")
      .getFirstListItem(`team="${owner.teamId}" && user="${owner.userId}"`);

    try {
      await loginAndGoToSettings(page, owner);

      const inviteeEmail = `settings-invitee-${Date.now()}@test.com`;
      await page.getByPlaceholder("colleague@company.com").fill(inviteeEmail);
      await page.getByRole("button", { name: "Send invite" }).click();

      // Invite link panel appears
      await expect(
        page.getByText("Invite link (share manually")
      ).toBeVisible({ timeout: 10000 });

      // Invite URL contains /invite/
      const linkText = await page.locator("p.font-mono.break-all").textContent();
      expect(linkText).toMatch(/\/invite\//);

      // Pending invites list shows the email
      await expect(page.getByText(inviteeEmail)).toBeVisible({ timeout: 5000 });

      // Cleanup: delete invite from DB
      const invite = await pb
        .collection("invites")
        .getFirstListItem(`email="${inviteeEmail}" && team="${owner.teamId}"`);
      await cleanup([{ collection: "invites", id: invite.id }]);
    } finally {
      await cleanup([
        { collection: "team_members", id: membership.id },
        { collection: "teams", id: owner.teamId },
        { collection: "users", id: owner.userId },
      ]);
    }
  });

  test("owner can revoke a pending invite", async ({ page }) => {
    const owner = await seedOwnerSession();
    const pb = await getAdminPb();
    const membership = await pb
      .collection("team_members")
      .getFirstListItem(`team="${owner.teamId}" && user="${owner.userId}"`);

    // Seed an invite directly in DB (no email needed)
    const { seedInvite } = await import("./helpers/seed");
    const inviteeEmail = `revoke-test-${Date.now()}@test.com`;
    const { inviteId } = await seedInvite({ teamId: owner.teamId, email: inviteeEmail });

    try {
      await loginAndGoToSettings(page, owner);

      // Invite should appear in the pending list
      await expect(page.getByText(inviteeEmail)).toBeVisible({ timeout: 10000 });

      // Click Revoke
      const row = page.locator("div").filter({ hasText: inviteeEmail }).last();
      await row.getByRole("button", { name: "Revoke" }).click();

      // Invite row disappears
      await expect(page.getByText(inviteeEmail)).not.toBeVisible({ timeout: 5000 });

      // Verify invite is gone from DB
      const count = await pb
        .collection("invites")
        .getList(1, 1, { filter: `id="${inviteId}"` });
      expect(count.totalItems).toBe(0);
    } finally {
      // Best-effort: invite may already be deleted
      await cleanup([
        { collection: "invites", id: inviteId },
        { collection: "team_members", id: membership.id },
        { collection: "teams", id: owner.teamId },
        { collection: "users", id: owner.userId },
      ]);
    }
  });

  test("owner can rename the team", async ({ page }) => {
    const owner = await seedOwnerSession({ teamName: "Original Name" });
    const pb = await getAdminPb();
    const membership = await pb
      .collection("team_members")
      .getFirstListItem(`team="${owner.teamId}" && user="${owner.userId}"`);

    try {
      await loginAndGoToSettings(page, owner);

      // Current team name is visible (scoped to main to avoid matching the header span)
      await expect(page.getByRole("main").getByText("Original Name")).toBeVisible();

      // Type new name and save
      await page.getByPlaceholder("New team name").fill("Renamed Team");
      await page.getByRole("button", { name: "Rename" }).click();

      // Updated name appears
      await expect(page.getByText("Renamed Team")).toBeVisible({ timeout: 5000 });

      // Verify in DB
      const team = await pb.collection("teams").getOne(owner.teamId);
      expect(team.name).toBe("Renamed Team");
    } finally {
      await cleanup([
        { collection: "team_members", id: membership.id },
        { collection: "teams", id: owner.teamId },
        { collection: "users", id: owner.userId },
      ]);
    }
  });
});
