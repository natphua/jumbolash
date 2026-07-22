/**
 * prompting.spec.ts
 *
 * End-to-end tests for the prompting phase of the game. Tests include:
 * - Player answer submission after admin launches a prompt
 * - Same-browser player tabs maintaining separate identities
 *
 * Created on 2026-07-20 by Natalie Phua.
 */

import { test, expect, BrowserContext, Page } from "@playwright/test";
import { prisma } from "../lib/prisma";

test.describe("Prompting Round Flow", () => {
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
    await adminContext.close();
    await playerOneContext.close();
    await playerTwoContext.close();
    await playerThreeContext.close();
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
        timeout: 7000,
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
      ).toBeVisible({ timeout: 7000 });
      await expect(
        sameBrowserPlayerTwo.locator("text=SUBMIT ANSWER"),
      ).toBeVisible({ timeout: 7000 });

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
});

async function joinRoom(page: Page, roomCode: string, nickname: string) {
  await page.goto("/");
  await page.click("button:has-text('JOIN GAME (TEAMS)')");
  await page.fill('input[placeholder*="ROOM CODE"]', roomCode);
  await page.fill('input[placeholder*="NICKNAME"]', nickname);
  await page.click("button:has-text('ENTER ROOM')");
  await page.waitForURL(`**/room/${roomCode}`, { timeout: 7000 });
}
