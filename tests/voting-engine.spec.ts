/**
 * voting-engine.spec.ts
 *
 * End-to-end tests for the voting engine of the game. Tests include:
 * - Matchup creation upon transition from prompting to voting phase
 * - Vote submission and scoring, including self-vote blocking
 * - Advancement of matchups and game state after votes are cast
 *
 * Created on 2026-07-22 by Natalie Phua.
 */

import { test, expect } from "@playwright/test";
import { prisma } from "../lib/prisma";
import { GameState, POINTS_PER_VOTE } from "../lib/game-state";

test.describe("Voting Engine", () => {
  test("VE-1: transition creates one matchup per prompt and vote scoring advances the flow", async ({
    request,
  }) => {
    const roomCode = `V${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const prompt = await prisma.prompt.create({
      data: { text: "A voting engine test prompt." },
    });
    let players: Awaited<ReturnType<typeof prisma.player.findMany>> = [];

    try {
      await prisma.room.create({
        data: {
          roomCode,
          gameState: GameState.Prompting,
          totalRounds: 1,
          activePromptId: prompt.id,
          roundStartedAt: new Date(),
          usedPromptIds: [prompt.id],
        },
      });

      players = await Promise.all([
        prisma.player.create({
          data: { nickname: "VoteAlpha", roomCode, points: 0 },
        }),
        prisma.player.create({
          data: { nickname: "VoteBravo", roomCode, points: 0 },
        }),
        prisma.player.create({
          data: { nickname: "VoteCharlie", roomCode, points: 0 },
        }),
      ]);

      await prisma.response.createMany({
        data: players.map((player, index) => ({
          text: `Answer ${index + 1}`,
          roomCode,
          promptId: prompt.id,
          playerId: player.id,
        })),
      });

      const transitionResponse = await request.post(
        `/api/room/${roomCode}/transition`,
      );
      expect(transitionResponse.ok()).toBeTruthy();

      const roomAfterTransition = await prisma.room.findUniqueOrThrow({
        where: { roomCode },
      });
      expect(roomAfterTransition.gameState).toBe(GameState.Voting);

      const matchups = await prisma.matchup.findMany({
        where: { roomCode },
        orderBy: { matchupIndex: "asc" },
        include: {
          responseA: true,
          responseB: true,
        },
      });
      expect(matchups).toHaveLength(1);

      const firstMatchup = matchups[0];
      expect(firstMatchup.responseB).not.toBeNull();

      const authorVoteResponse = await request.post(
        `/api/room/${roomCode}/vote`,
        {
          data: {
            playerId: firstMatchup.responseA.playerId,
            matchupId: firstMatchup.id,
            selectedResponseId: firstMatchup.responseAId,
          },
        },
      );
      expect(authorVoteResponse.status()).toBe(403);

      const eligibleVoter = players.find(
        (player) =>
          player.id !== firstMatchup.responseA.playerId &&
          player.id !== firstMatchup.responseB?.playerId,
      );
      expect(eligibleVoter).toBeTruthy();

      const eligibleVoteResponse = await request.post(
        `/api/room/${roomCode}/vote`,
        {
          data: {
            playerId: eligibleVoter!.id,
            matchupId: firstMatchup.id,
            selectedResponseId: firstMatchup.responseAId,
          },
        },
      );
      expect(eligibleVoteResponse.ok()).toBeTruthy();

      const selectedAuthor = await prisma.player.findUniqueOrThrow({
        where: { id: firstMatchup.responseA.playerId },
      });
      expect(selectedAuthor.points).toBe(POINTS_PER_VOTE);

      const selectedResponse = await prisma.response.findUniqueOrThrow({
        where: { id: firstMatchup.responseAId },
      });
      expect(selectedResponse.votes).toBe(1);

      const roomAfterVote = await prisma.room.findUniqueOrThrow({
        where: { roomCode },
      });
      expect(roomAfterVote.gameState).toBe(GameState.Results);
    } finally {
      await prisma.room.deleteMany({ where: { roomCode } });
      await prisma.prompt.deleteMany({ where: { id: prompt.id } });
    }
  });

  test("VE-2: transition starts the next prompt before voting until all rounds are answered", async ({
    request,
  }) => {
    const roomCode = `N${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const firstPrompt = await prisma.prompt.create({
      data: { text: "A first round prompt before voting." },
    });
    const secondPrompt = await prisma.prompt.create({
      data: { text: "A second round prompt before voting." },
    });
    let players: Awaited<ReturnType<typeof prisma.player.findMany>> = [];

    try {
      await prisma.room.create({
        data: {
          roomCode,
          gameState: GameState.Prompting,
          roundNumber: 1,
          totalRounds: 2,
          activePromptId: firstPrompt.id,
          roundStartedAt: new Date(),
          usedPromptIds: [firstPrompt.id],
        },
      });

      players = await Promise.all([
        prisma.player.create({
          data: { nickname: "NextAlpha", roomCode, points: 0 },
        }),
        prisma.player.create({
          data: { nickname: "NextBravo", roomCode, points: 0 },
        }),
        prisma.player.create({
          data: { nickname: "NextCharlie", roomCode, points: 0 },
        }),
      ]);

      await prisma.response.createMany({
        data: players.map((player, index) => ({
          text: `Round one answer ${index + 1}`,
          roomCode,
          promptId: firstPrompt.id,
          playerId: player.id,
        })),
      });

      const transitionResponse = await request.post(
        `/api/room/${roomCode}/transition`,
      );
      expect(transitionResponse.ok()).toBeTruthy();

      const roomAfterTransition = await prisma.room.findUniqueOrThrow({
        where: { roomCode },
      });
      expect(roomAfterTransition.gameState).toBe(GameState.Prompting);
      expect(roomAfterTransition.roundNumber).toBe(2);
      expect(roomAfterTransition.activePromptId).not.toBe(firstPrompt.id);
      expect(roomAfterTransition.usedPromptIds).toContain(firstPrompt.id);
      expect(roomAfterTransition.usedPromptIds).toContain(
        roomAfterTransition.activePromptId!,
      );

      const matchups = await prisma.matchup.findMany({ where: { roomCode } });
      expect(matchups).toHaveLength(0);
    } finally {
      await prisma.room.deleteMany({ where: { roomCode } });
      await prisma.prompt.deleteMany({
        where: { id: { in: [firstPrompt.id, secondPrompt.id] } },
      });
    }
  });

  test("VE-3: final transition creates one random 1v1 matchup per answered prompt", async ({
    request,
  }) => {
    const roomCode = `O${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
    const prompts = await Promise.all([
      prisma.prompt.create({
        data: { text: "A one-matchup first prompt." },
      }),
      prisma.prompt.create({
        data: { text: "A one-matchup second prompt." },
      }),
    ]);
    let players: Awaited<ReturnType<typeof prisma.player.findMany>> = [];

    try {
      await prisma.room.create({
        data: {
          roomCode,
          gameState: GameState.Prompting,
          roundNumber: 2,
          totalRounds: 2,
          activePromptId: prompts[1].id,
          roundStartedAt: new Date(),
          usedPromptIds: prompts.map((prompt) => prompt.id),
        },
      });

      players = await Promise.all(
        ["OneAlpha", "OneBravo", "OneCharlie", "OneDelta"].map((nickname) =>
          prisma.player.create({
            data: { nickname, roomCode, points: 0 },
          }),
        ),
      );

      await prisma.response.createMany({
        data: prompts.flatMap((prompt, promptIndex) =>
          players.map((player, playerIndex) => ({
            text: `Prompt ${promptIndex + 1} answer ${playerIndex + 1}`,
            roomCode,
            promptId: prompt.id,
            playerId: player.id,
          })),
        ),
      });

      const transitionResponse = await request.post(
        `/api/room/${roomCode}/transition`,
      );
      expect(transitionResponse.ok()).toBeTruthy();

      const matchups = await prisma.matchup.findMany({
        where: { roomCode },
        orderBy: { matchupIndex: "asc" },
      });

      expect(matchups).toHaveLength(prompts.length);
      expect(new Set(matchups.map((matchup) => matchup.promptId)).size).toBe(
        prompts.length,
      );
      for (const matchup of matchups) {
        expect(matchup.responseAId).toBeTruthy();
        expect(matchup.responseBId).toBeTruthy();
      }
    } finally {
      await prisma.room.deleteMany({ where: { roomCode } });
      await prisma.prompt.deleteMany({
        where: { id: { in: prompts.map((prompt) => prompt.id) } },
      });
    }
  });
});
