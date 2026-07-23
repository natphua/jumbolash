/**
 * prompting.spec.ts
 *
 * End-to-end tests for the prompting phase of the game. Tests include:
 * - Player answer submission after admin launches a prompt
 * - Same-browser player tabs maintaining separate identities
 *
 * Created on 2026-07-20 by Natalie Phua.
 */

import { test, expect, BrowserContext, Locator, Page } from "@playwright/test";
import { prisma } from "../lib/prisma";

test.describe("Prompting Round Flow", () => {
  test.describe.configure({ mode: "serial" });

  let adminContext: BrowserContext;
  let adminPage: Page;
  let playerOneContext: BrowserContext;
  let playerOnePage: Page;
  let playerTwoContext: BrowserContext;
  let playerTwoPage: Page;
  let playerThreeContext: BrowserContext;
  let playerThreePage: Page;

  test.beforeEach(async ({ browser }) => {
    adminContext = await browser.newContext();
    adminPage = await adminContext.newPage();

    playerOneContext = await browser.newContext();
    playerOnePage = await playerOneContext.newPage();

    playerTwoContext = await browser.newContext();
    playerTwoPage = await playerTwoContext.newPage();

    playerThreeContext = await browser.newContext();
    playerThreePage = await playerThreeContext.newPage();
  });

  test.afterEach(async () => {
    await Promise.allSettled([
      adminContext.close(),
      playerOneContext.close(),
      playerTwoContext.close(),
      playerThreeContext.close(),
    ]);
  });

  test("PR-1: player can submit an answer after admin launches a prompt", async () => {
    const prompt = await prisma.prompt.create({
      data: { text: "A test prompt for the JumboLash launch flow." },
    });

    let roomCode = "";
    let playerId = "";

    try {
      await adminPage.goto("/");
      await adminPage.click("button:has-text('HOST GAME (ADMIN)')");

      await adminPage.waitForSelector("[data-testid='room-code-display']");
      roomCode =
        (
          await adminPage
            .locator("[data-testid='room-code-display']")
            .textContent()
        )?.trim() || "";
      expect(roomCode).toHaveLength(4);

      await joinRoom(playerOnePage, roomCode, "PromptPlayerOne");
      await joinRoom(playerTwoPage, roomCode, "PromptPlayerTwo");
      await joinRoom(playerThreePage, roomCode, "PromptPlayer3");

      const playerCookies = await playerOneContext.cookies();
      playerId =
        playerCookies.find((cookie) => cookie.name === "player_id")?.value ||
        "";
      expect(playerId).toBeTruthy();

      await expect(adminPage.locator("text=PromptPlayerOne")).toBeVisible({
        timeout: 7000,
      });
      await expect(adminPage.locator("text=PromptPlayerTwo")).toBeVisible();
      await expect(adminPage.locator("text=PromptPlayer3")).toBeVisible();

      await adminPage.click("button:has-text('LAUNCH MATCH')");

      await expect(adminPage.locator("text=PHASE: PROMPTING")).toBeVisible({
        timeout: 7000,
      });
      await expect(
        playerOnePage.locator("text=SUBMIT YOUR ANSWER"),
      ).toBeVisible({
        timeout: 12000,
      });

      await playerOnePage
        .locator("textarea")
        .fill("The recursive lab partner nobody warned you about.");
      await playerOnePage.click("button:has-text('SUBMIT ANSWER')");
      await expect(
        playerOnePage.locator("text=SUBMISSION RECEIVED"),
      ).toBeVisible({
        timeout: 7000,
      });

      const dbResponse = await prisma.response.findFirst({
        where: {
          playerId,
          roomCode,
          text: "The recursive lab partner nobody warned you about.",
        },
      });
      expect(dbResponse).not.toBeNull();
    } finally {
      if (roomCode) {
        await prisma.room.deleteMany({ where: { roomCode } });
      }

      await prisma.prompt.deleteMany({ where: { id: prompt.id } });
    }
  });

  test("PR-2: same-browser player tabs keep separate player identities", async ({
    browser,
  }) => {
    const prompt = await prisma.prompt.create({
      data: { text: "A same-browser identity isolation prompt." },
    });
    const sharedPlayerContext = await browser.newContext();
    const sameBrowserPlayerOne = await sharedPlayerContext.newPage();
    const sameBrowserPlayerTwo = await sharedPlayerContext.newPage();
    const sameBrowserPlayerThree = await sharedPlayerContext.newPage();

    let roomCode = "";

    try {
      await adminPage.goto("/");
      await adminPage.click("button:has-text('HOST GAME (ADMIN)')");

      await adminPage.waitForSelector("[data-testid='room-code-display']");
      roomCode =
        (
          await adminPage
            .locator("[data-testid='room-code-display']")
            .textContent()
        )?.trim() || "";
      expect(roomCode).toHaveLength(4);

      await joinRoom(sameBrowserPlayerOne, roomCode, "SameTabOne");
      await joinRoom(sameBrowserPlayerTwo, roomCode, "SameTabTwo");
      await joinRoom(sameBrowserPlayerThree, roomCode, "SameTabThree");

      await expect(adminPage.locator("text=SameTabOne")).toBeVisible({
        timeout: 7000,
      });
      await expect(adminPage.locator("text=SameTabTwo")).toBeVisible();
      await expect(adminPage.locator("text=SameTabThree")).toBeVisible();

      await adminPage.click("button:has-text('LAUNCH MATCH')");

      await expect(
        sameBrowserPlayerOne.locator("text=SUBMIT ANSWER"),
      ).toBeVisible({ timeout: 12000 });
      await expect(
        sameBrowserPlayerTwo.locator("text=SUBMIT ANSWER"),
      ).toBeVisible({ timeout: 12000 });

      await sameBrowserPlayerOne
        .locator("textarea")
        .fill("First same-browser answer.");
      await sameBrowserPlayerOne.click("button:has-text('SUBMIT ANSWER')");
      await expect(
        sameBrowserPlayerOne.locator("text=SUBMISSION RECEIVED"),
      ).toBeVisible({ timeout: 7000 });

      await sameBrowserPlayerTwo
        .locator("textarea")
        .fill("Second same-browser answer.");
      await sameBrowserPlayerTwo.click("button:has-text('SUBMIT ANSWER')");
      await expect(
        sameBrowserPlayerTwo.locator("text=SUBMISSION RECEIVED"),
      ).toBeVisible({ timeout: 7000 });

      const responses = await prisma.response.findMany({
        where: {
          roomCode,
          text: {
            in: ["First same-browser answer.", "Second same-browser answer."],
          },
        },
        select: { playerId: true, text: true },
      });

      expect(responses).toHaveLength(2);
      expect(new Set(responses.map((response) => response.playerId)).size).toBe(
        2,
      );
    } finally {
      await sharedPlayerContext.close();

      if (roomCode) {
        await prisma.room.deleteMany({ where: { roomCode } });
      }

      await prisma.prompt.deleteMany({ where: { id: prompt.id } });
    }
  });

  test("PR-3: saved timer setting renders as seconds on admin and player prompt screens", async () => {
    const prompt = await prisma.prompt.create({
      data: { text: "A timer settings regression prompt." },
    });

    let roomCode = "";
    const configuredSeconds = 45;

    try {
      await adminPage.goto("/");
      await adminPage.click("button:has-text('HOST GAME (ADMIN)')");

      await adminPage.waitForSelector("[data-testid='room-code-display']");
      roomCode =
        (
          await adminPage
            .locator("[data-testid='room-code-display']")
            .textContent()
        )?.trim() || "";
      expect(roomCode).toHaveLength(4);

      const roundsInput = adminPage.locator('input[type="number"]').first();
      const timerInput = adminPage.locator('input[type="number"]').last();
      await roundsInput.fill("1");
      await timerInput.fill(String(configuredSeconds));
      await expect(roundsInput).toHaveValue("1");
      await expect(timerInput).toHaveValue(String(configuredSeconds));

      const settingsDialog = adminPage.waitForEvent("dialog");
      await adminPage.click("button:has-text('UPDATE GAME RULES')");
      const dialog = await settingsDialog;
      expect(dialog.message()).toContain(
        "Match configurations updated successfully.",
      );
      await dialog.accept();
      await expect
        .poll(async () => {
          const room = await prisma.room.findUnique({ where: { roomCode } });
          return room?.timerLimit;
        })
        .toBe(configuredSeconds);

      await joinRoom(playerOnePage, roomCode, "TimerPlayer1");
      await joinRoom(playerTwoPage, roomCode, "TimerPlayer2");
      await joinRoom(playerThreePage, roomCode, "TimerPlayer3");

      await expect(adminPage.locator("text=TimerPlayer3")).toBeVisible({
        timeout: 7000,
      });

      await adminPage.click("button:has-text('LAUNCH MATCH')");

      const adminTimer = adminPage.locator("[data-testid='admin-prompt-timer']");
      const playerTimer = playerOnePage.locator(
        "[data-testid='player-prompt-timer']",
      );

      await expect(adminTimer).toBeVisible({ timeout: 12000 });
      await expect(playerTimer).toBeVisible({ timeout: 12000 });

      const adminSeconds = await readTimerSeconds(adminTimer);
      const playerSeconds = await readTimerSeconds(playerTimer);

      expect(adminSeconds).toBeGreaterThan(0);
      expect(playerSeconds).toBeGreaterThan(0);
      expect(adminSeconds).toBeLessThanOrEqual(configuredSeconds);
      expect(playerSeconds).toBeLessThanOrEqual(configuredSeconds);
    } finally {
      if (roomCode) {
        await prisma.room.deleteMany({ where: { roomCode } });
      }

      await prisma.prompt.deleteMany({ where: { id: prompt.id } });
    }
  });

  test("PR-4: player answer form resets and unlocks on the next prompt round", async () => {
    const prompts = await Promise.all([
      prisma.prompt.create({
        data: { text: "A first multi-round reset prompt." },
      }),
      prisma.prompt.create({
        data: { text: "A second multi-round reset prompt." },
      }),
    ]);

    let roomCode = "";

    try {
      await adminPage.goto("/");
      await adminPage.click("button:has-text('HOST GAME (ADMIN)')");

      await adminPage.waitForSelector("[data-testid='room-code-display']");
      roomCode =
        (
          await adminPage
            .locator("[data-testid='room-code-display']")
            .textContent()
        )?.trim() || "";
      expect(roomCode).toHaveLength(4);

      const roundsInput = adminPage.locator('input[type="number"]').first();
      await roundsInput.fill("2");
      await expect(roundsInput).toHaveValue("2");

      const settingsDialog = adminPage.waitForEvent("dialog");
      await adminPage.click("button:has-text('UPDATE GAME RULES')");
      const dialog = await settingsDialog;
      expect(dialog.message()).toContain(
        "Match configurations updated successfully.",
      );
      await dialog.accept();

      await joinRoom(playerOnePage, roomCode, "ResetPlayer1");
      await joinRoom(playerTwoPage, roomCode, "ResetPlayer2");
      await joinRoom(playerThreePage, roomCode, "ResetPlayer3");

      await expect(adminPage.locator("text=ResetPlayer3")).toBeVisible({
        timeout: 7000,
      });
      await adminPage.click("button:has-text('LAUNCH MATCH')");

      await expect(
        playerOnePage.locator("button:has-text('SUBMIT ANSWER')"),
      ).toBeVisible({ timeout: 12000 });

      await submitPromptAnswer(playerOnePage, "Round one answer from one.");
      await submitPromptAnswer(playerTwoPage, "Round one answer from two.");
      await submitPromptAnswer(playerThreePage, "Round one answer from three.");

      await expect(adminPage.locator("text=QUESTION 2 OF 2")).toBeVisible({
        timeout: 10000,
      });
      await expect(
        playerOnePage.locator("button:has-text('SUBMIT ANSWER')"),
      ).toBeVisible({ timeout: 12000 });
      await expect(playerOnePage.locator("textarea")).toBeEnabled();
      await expect(playerOnePage.locator("textarea")).toHaveValue("");

      await submitPromptAnswer(playerOnePage, "Round two answer from one.");
      await expect(
        playerOnePage.locator("text=SUBMISSION RECEIVED"),
      ).toBeVisible({ timeout: 7000 });
    } finally {
      if (roomCode) {
        await prisma.room.deleteMany({ where: { roomCode } });
      }

      await prisma.prompt.deleteMany({
        where: { id: { in: prompts.map((prompt) => prompt.id) } },
      });
    }
  });
});

async function joinRoom(page: Page, roomCode: string, nickname: string) {
  await page.goto("/");
  await page.click("button:has-text('JOIN GAME (TEAMS)')");
  await page.fill('input[placeholder*="ROOM CODE"]', roomCode);
  await page.fill('input[placeholder*="NICKNAME"]', nickname);
  await page.click("button:has-text('ENTER ROOM')");
  await page.waitForURL(`**/room/${roomCode}`, { timeout: 7000 });
}

async function readTimerSeconds(locator: Locator) {
  const text = (await locator.textContent()) || "";
  const seconds = Number(text.match(/\d+/)?.[0] || Number.NaN);
  expect(Number.isFinite(seconds)).toBeTruthy();
  return seconds;
}

async function submitPromptAnswer(page: Page, answer: string) {
  await page.locator("textarea").fill(answer);
  await page.click("button:has-text('SUBMIT ANSWER')");
}
