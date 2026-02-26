/**
 * E2E: Auth flows (login + MFA OTP)
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 */

import { test, expect } from "@playwright/test";
import {
  seedOwnerSession,
  getLatestOtp,
  cleanup,
  clearMailpit,
} from "./helpers/seed";

test.describe("Auth: login with MFA", () => {
  test.beforeEach(async () => {
    await clearMailpit();
  });

  test("user can log in, complete OTP, and reach the dashboard", async ({ page }) => {
    const { userId, teamId, email, password } = await seedOwnerSession();

    // Get owner membership id for cleanup
    const { getAdminPb } = await import("./helpers/seed");
    const pb = await getAdminPb();
    const membership = await pb
      .collection("team_members")
      .getFirstListItem(`team="${teamId}" && user="${userId}"`);

    try {
      // ── Navigate to login ──────────────────────────────────────────────────
      await page.goto("http://localhost:3000/login");
      await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible({ timeout: 10000 });

      // ── Submit credentials ─────────────────────────────────────────────────
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: "Log in" }).click();

      // ── OTP step ──────────────────────────────────────────────────────────
      await expect(page.getByText("Check your email")).toBeVisible({ timeout: 10000 });

      const otp = await getLatestOtp(email, { timeoutMs: 20000 });
      await page.locator("#otp").fill(otp);
      await page.getByRole("button", { name: "Verify" }).click();

      // ── Dashboard ─────────────────────────────────────────────────────────
      await expect(page).toHaveURL(/\/dashboard/, { timeout: 10000 });
    } finally {
      await cleanup([
        { collection: "team_members", id: membership.id },
        { collection: "teams", id: teamId },
        { collection: "users", id: userId },
      ]);
    }
  });

  test("shows an error for wrong password", async ({ page }) => {
    const { userId, teamId, email } = await seedOwnerSession();
    const { getAdminPb } = await import("./helpers/seed");
    const pb = await getAdminPb();
    const membership = await pb
      .collection("team_members")
      .getFirstListItem(`team="${teamId}" && user="${userId}"`);

    try {
      await page.goto("http://localhost:3000/login");
      await page.locator("#email").fill(email);
      await page.locator("#password").fill("wrong-password-xyz");
      await page.getByRole("button", { name: "Log in" }).click();

      await expect(
        page.getByText("Invalid email or password.")
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await cleanup([
        { collection: "team_members", id: membership.id },
        { collection: "teams", id: teamId },
        { collection: "users", id: userId },
      ]);
    }
  });

  test("shows an error for an invalid OTP code", async ({ page }) => {
    const { userId, teamId, email, password } = await seedOwnerSession();
    const { getAdminPb } = await import("./helpers/seed");
    const pb = await getAdminPb();
    const membership = await pb
      .collection("team_members")
      .getFirstListItem(`team="${teamId}" && user="${userId}"`);

    try {
      await page.goto("http://localhost:3000/login");
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: "Log in" }).click();

      await expect(page.getByText("Check your email")).toBeVisible({ timeout: 10000 });

      // Enter a clearly wrong code
      await page.locator("#otp").fill("00000000");
      await page.getByRole("button", { name: "Verify" }).click();

      await expect(
        page.getByText("Invalid or expired code")
      ).toBeVisible({ timeout: 10000 });
    } finally {
      await cleanup([
        { collection: "team_members", id: membership.id },
        { collection: "teams", id: teamId },
        { collection: "users", id: userId },
      ]);
    }
  });

  test("Back to login link returns to credentials form", async ({ page }) => {
    const { userId, teamId, email, password } = await seedOwnerSession();
    const { getAdminPb } = await import("./helpers/seed");
    const pb = await getAdminPb();
    const membership = await pb
      .collection("team_members")
      .getFirstListItem(`team="${teamId}" && user="${userId}"`);

    try {
      await page.goto("http://localhost:3000/login");
      await page.locator("#email").fill(email);
      await page.locator("#password").fill(password);
      await page.getByRole("button", { name: "Log in" }).click();

      await expect(page.getByText("Check your email")).toBeVisible({ timeout: 10000 });
      await page.getByRole("button", { name: "Back to login" }).click();

      await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
    } finally {
      await cleanup([
        { collection: "team_members", id: membership.id },
        { collection: "teams", id: teamId },
        { collection: "users", id: userId },
      ]);
    }
  });
});
