/**
 * lobby.spec.ts
 *
 * Tests room generation, cookie configuration, setting modification boundary
 * validations, and security redirects for unauthenticated sessions.
 *
 * Created on 2026-07-17 by Natalie Phua.
 */

import { test, expect } from "@playwright/test";

test.describe("Admin Room Creation and Configuration Flow", () => {
  test("LB-1: Admin game hosting and settings configuration", async ({
    page,
    context,
  }) => {
    // 1. Navigate to the landing page
    await page.goto("/");

    // 2. Click the Host Game button to trigger the API route and redirect
    const hostButton = page.locator('button:has-text("Host Game (Admin)")');
    await expect(hostButton).toBeVisible();
    await hostButton.click({ timeout: 15000 });

    // 3. Verify page redirects to the Admin Dashboard
    await page.waitForURL("**/admin/dashboard", {
      timeout: 20000,
      waitUntil: "load",
    });
    await expect(page).toHaveURL(/.*\/admin\/dashboard/);

    // 4. Verify the 'hosted_room_code' cookie was successfully set
    const cookies = await context.cookies();
    const roomCookie = cookies.find((c) => c.name === "hosted_room_code");
    expect(roomCookie).toBeDefined();
    expect(roomCookie?.value).toHaveLength(4);

    const activeRoomCode = roomCookie?.value || "";

    // 5. Ensure the dashboard accurately displays the generated Room Code
    const displayedCode = page.locator("div.game-input").first();
    await expect(displayedCode).toContainText(activeRoomCode);

    // 6. Verify validation limits - Invalid total rounds (e.g., 11)
    const roundsInput = page.locator('input[type="number"]').first();
    await roundsInput.fill("11");
    // Force WebKit to wait until the DOM frame and React state sync the value completely
    await expect(roundsInput).toHaveValue("11");

    const updateButton = page.locator('button:has-text("UPDATE GAME RULES")');
    await updateButton.click();

    const errorMessage = page.locator("p.error-text");
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText(
      "Rounds must be between 1 and 10.",
    );

    // 7. Verify validation limits - Invalid countdown timer
    await roundsInput.fill("5");
    await expect(roundsInput).toHaveValue("5");

    const timerInput = page.locator('input[type="number"]').last();
    await timerInput.fill("20");
    await expect(timerInput).toHaveValue("20");

    await updateButton.click();
    await expect(errorMessage).toContainText(
      "Countdown timer must be between 30 and 120 seconds.",
    );

    // 8. Verify success path works with correct configurations
    await timerInput.fill("60");
    await expect(timerInput).toHaveValue("60");

    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain(
        "Match configurations updated successfully.",
      );
      await dialog.accept();
    });

    await updateButton.click();
    await expect(errorMessage).not.toBeVisible();
  });

  test("LB-2: Unauthenticated session dashboard redirect", async ({ page }) => {
    await page.goto("/admin/dashboard");
    await page.waitForURL("/", { timeout: 15000 });
    await expect(page).toHaveURL(/.*\/$/);
  });
});
