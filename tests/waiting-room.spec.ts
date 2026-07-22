/**
 * waiting-room.spec.ts
 *
 * End-to-end tests for the waiting room and real-time synchronization of the game lobby.
 * Tests include:
 * - 10-player cap limit enforcement
 * - Real-time roster synchronization between admin and player views
 * - Player leaving the room and admin ending the session
 *
 * Created on 2026-07-19 by Natalie Phua.
 */

import { test, expect, BrowserContext, Page } from "@playwright/test";
import { prisma } from "../lib/prisma";
import { generateRoomCode } from "../lib/helpers/room-code";

test.describe("Waiting Room and Real-time Sync", () => {
  let adminContext: BrowserContext;
  let adminPage: Page;
  let playerContext: BrowserContext;
  let playerPage: Page;

  test.beforeEach(async ({ browser }) => {
    // 1. Create fully isolated browser sessions to simulate real, distinct users
    adminContext = await browser.newContext();
    adminPage = await adminContext.newPage();

    playerContext = await browser.newContext();
    playerPage = await playerContext.newPage();
  });

  test.afterEach(async () => {
    await adminContext.close();
    await playerContext.close();
  });

  test("WR-1: 10-player cap limit", async () => {
    const targetRoomCode = generateRoomCode();

    await prisma.room.deleteMany({
      where: { roomCode: targetRoomCode },
    });

    try {
      await prisma.room.create({
        data: {
          roomCode: targetRoomCode,
          gameState: "LOBBY",
        },
      });

      await prisma.player.createMany({
        data: Array.from({ length: 10 }, (_, i) => ({
          nickname: `Player${i + 1}`,
          roomCode: targetRoomCode,
          points: 0,
        })),
      });

      // Seed a mock database setup or target an existing room context.
      await playerPage.goto(`/`);
      await playerPage.click("button:has-text('JOIN GAME (TEAMS)')");
      await playerPage.fill('input[placeholder*="ROOM CODE"]', targetRoomCode);
      await playerPage.fill('input[placeholder*="NICKNAME"]', "EleventhPlayer");

      const dialogPromise = playerPage.waitForEvent("dialog");
      await playerPage.click("button:has-text('ENTER ROOM')");

      const dialog = await dialogPromise;
      expect(dialog.message()).toBe("This room is full (max 10 players).");
      await dialog.accept();

      // Ensure the browser URL did not accidentally push into the waiting room
      expect(playerPage.url()).not.toContain(`/room/${targetRoomCode}`);
    } finally {
      await prisma.room.deleteMany({
        where: { roomCode: targetRoomCode },
      });
    }
  });

  // TODO: uncomment this once transition is implemented
  //   test("WR-2: Real-time lobby synchronization and match transition", async () => {
  //     // 1. Host creates a fresh room via Admin Portal
  //     await adminPage.goto("/");
  //     await adminPage.click("button:has-text('HOST GAME (ADMIN)')");

  //     // Grab the dynamically generated room code from the admin header dashboard
  //     await adminPage.waitForSelector("[data-testid='room-code-display']");
  //     const roomCode =
  //       (
  //         await adminPage
  //           .locator("[data-testid='room-code-display']")
  //           .textContent()
  //       )?.trim() || "";
  //     expect(roomCode).toBeTruthy();

  //     // 2. Player opens the landing screen and keys into the freshly built room
  //     await playerPage.goto("/");
  //     await playerPage.click("button:has-text('JOIN GAME (TEAMS)')");
  //     await playerPage.fill('input[placeholder*="ROOM CODE"]', roomCode);
  //     await playerPage.fill('input[placeholder*="NICKNAME"]', "ChallengerOne");
  //     await playerPage.click("button:has-text('ENTER ROOM')");

  //     // 3. Verify real-time roster synchronization on both viewports
  //     // The player's name should pop into the grid layout automatically via Supabase replication
  //     const playerCardOnAdmin = adminPage.locator(`text=ChallengerOne`);
  //     const playerCardOnPlayer = playerPage.locator(`text=ChallengerOne`);

  //     await expect(playerCardOnAdmin).toBeVisible({ timeout: 5000 });
  //     await expect(playerCardOnPlayer).toBeVisible();

  //     // 4. Admin launches the match state to trigger group navigation
  //     await adminPage.click("button:has-text('LAUNCH MATCH STATE')");

  //     // Verify the player's single-page listener catches the Room UPDATE event
  //     // and seamlessly routes their client view to the interactive prompt workspace
  //     await playerPage.waitForURL(`**/game/${roomCode}`, { timeout: 7000 });
  //     expect(playerPage.url()).toContain(`/game/${roomCode}`);
  //   });

  test("WR-3: leaving room", async () => {
    // 1. Setup: Host creates a room and a player joins
    await adminPage.goto("/");
    await adminPage.click("button:has-text('HOST GAME (ADMIN)')");

    await adminPage.waitForSelector("[data-testid='room-code-display']");
    const roomCode =
      (
        await adminPage
          .locator("[data-testid='room-code-display']")
          .textContent()
      )?.trim() || "";

    await playerPage.goto("/");
    await playerPage.click("button:has-text('JOIN GAME (TEAMS)')");
    await playerPage.fill('input[placeholder*="ROOM CODE"]', roomCode);
    await playerPage.fill('input[placeholder*="NICKNAME"]', "LeaverLeigh");
    await playerPage.click("button:has-text('ENTER ROOM')");

    // Verify player is visible in the lobby grid before executing the drop
    await expect(adminPage.locator("text=LeaverLeigh")).toBeVisible({
      timeout: 5000,
    });

    // 2. Intercept confirmation dialogs so Playwright automatically accepts the choice
    playerPage.on("dialog", async (dialog) => {
      expect(dialog.message()).toContain(
        "Are you sure you want to leave this game lobby?",
      );
      await dialog.accept();
    });

    adminPage.on("dialog", async (dialog) => {
      expect(dialog.message()).toContain(
        "Are you sure you want to end this game session? All players will be disconnected.",
      );
      await dialog.accept();
    });

    // 3. Action A: Player drops out using the top-left Leave button
    await playerPage.click("button:has-text('LEAVE ROOM')");
    await playerPage.waitForURL("/");
    expect(playerPage.url()).toBe("http://localhost:3000/");

    // Assert player disappears from Host's active lobby via Supabase Realtime sync
    await expect(adminPage.locator("text=LeaverLeigh")).not.toBeVisible({
      timeout: 5000,
    });

    // Database Verification: Check player entry was deleted from PostgreSQL
    const dbPlayer = await prisma.player.findFirst({
      where: { nickname: "LeaverLeigh", roomCode: roomCode },
    });
    expect(dbPlayer).toBeNull();

    // 4. Action B: Admin clicks End Room to dissolve the game state entirely
    await adminPage.click("button:has-text('END ROOM')");
    await adminPage.waitForURL("/");
    expect(adminPage.url()).toBe("http://localhost:3000/");

    // Database Verification: Confirm cascade deletion eliminated the Room record entirely
    const dbRoom = await prisma.room.findUnique({
      where: { roomCode: roomCode },
    });
    expect(dbRoom).toBeNull();
  });
});
