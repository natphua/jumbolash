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
  test("VE-1: transition creates matchups and vote scoring advances the flow", async ({
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
          activePromptId: prompt.id,
          roundStartedAt: new Date(),
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
      expect(matchups).toHaveLength(2);

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
      expect(roomAfterVote.activeMatchupIndex).toBe(1);
    } finally {
      await prisma.room.deleteMany({ where: { roomCode } });
      await prisma.prompt.deleteMany({ where: { id: prompt.id } });
    }
  });
});
