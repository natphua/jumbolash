/**
 * Route: POST /api/room/[code]/transition
 *
 * Description: Transitions the room from a Prompt state to a Vote state. It
 * pairs submitted responses into matchups and updates the room's game state
 * accordingly. If there are fewer than 2 responses, the room transitions
 * directly to the Results state.
 *
 * Request body: None
 *
 * Responses:
 * 200 OK - Transition successful
 * 400 Bad Request - Missing required parameters or invalid state
 * 404 Not Found - Room not found
 * 500 Internal Server Error - Database operational failure
 *
 * Created on 2026-07-22 by Natalie Phua.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/supabase/admin";
import {
  GameState,
  MatchupStatus,
  parseGameTimestamp,
  VOTING_SECONDS,
} from "@/lib/game-state";

interface ResponseRecord {
  id: string;
  roomCode: string;
  playerId: string;
  promptId: string;
}

interface RoomRecord {
  roomCode: string;
  gameState: string;
  roundNumber: number;
  totalRounds: number;
  timerLimit: number;
  roundStartedAt: string | null;
  activePromptId: string | null;
  activeMatchupIndex: number;
  votingStartedAt: string | null;
  usedPromptIds: string[];
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

async function advanceVotingMatchup(roomCode: string, room: RoomRecord) {
  if (!room.votingStartedAt) {
    return NextResponse.json({ ok: true, gameState: GameState.Voting });
  }

  const elapsedSeconds = Math.floor(
    (Date.now() - parseGameTimestamp(room.votingStartedAt)) / 1000,
  );

  if (elapsedSeconds < VOTING_SECONDS) {
    return NextResponse.json({ ok: true, gameState: GameState.Voting });
  }

  const activeIndex = room.activeMatchupIndex || 0;
  const nextIndex = activeIndex + 1;

  const { data: nextMatchup, error: nextError } = await supabaseAdmin
    .from("Matchup")
    .select("id")
    .eq("roomCode", roomCode)
    .eq("roundNumber", room.roundNumber)
    .eq("matchupIndex", nextIndex)
    .maybeSingle();

  if (nextError) throw nextError;

  const { error: completeError } = await supabaseAdmin
    .from("Matchup")
    .update({ status: MatchupStatus.Complete })
    .eq("roomCode", roomCode)
    .eq("roundNumber", room.roundNumber)
    .eq("matchupIndex", activeIndex);

  if (completeError) throw completeError;

  if (!nextMatchup) {
    const { error } = await supabaseAdmin
      .from("Room")
      .update({
        gameState: GameState.Results,
        votingStartedAt: null,
        revealStartedAt: new Date().toISOString(),
      })
      .eq("roomCode", roomCode);

    if (error) throw error;

    return NextResponse.json({ ok: true, gameState: GameState.Results });
  }

  const [{ error: matchupError }, { error: roomError }] = await Promise.all([
    supabaseAdmin
      .from("Matchup")
      .update({ status: MatchupStatus.Active })
      .eq("id", nextMatchup.id),
    supabaseAdmin
      .from("Room")
      .update({
        activeMatchupIndex: nextIndex,
        votingStartedAt: new Date().toISOString(),
        revealStartedAt: null,
      })
      .eq("roomCode", roomCode),
  ]);

  if (matchupError) throw matchupError;
  if (roomError) throw roomError;

  return NextResponse.json({ ok: true, gameState: GameState.Voting });
}

async function startNextPromptRound(roomCode: string, room: RoomRecord) {
  const { data: prompts, error: promptsError } = await supabaseAdmin
    .from("Prompt")
    .select("id, text");

  if (promptsError) throw promptsError;

  const usedPromptIds = room.usedPromptIds || [];
  const usedPromptSet = new Set(usedPromptIds);
  const availablePrompts = (prompts || []).filter(
    (prompt) => !usedPromptSet.has(prompt.id),
  );

  if (availablePrompts.length === 0) {
    return NextResponse.json(
      { error: "No unused prompts remain for this room." },
      { status: 400 },
    );
  }

  const nextPrompt =
    availablePrompts[Math.floor(Math.random() * availablePrompts.length)];

  const { error } = await supabaseAdmin
    .from("Room")
    .update({
      gameState: GameState.Prompting,
      roundNumber: room.roundNumber + 1,
      activePromptId: nextPrompt.id,
      roundStartedAt: new Date().toISOString(),
      activeMatchupIndex: 0,
      votingStartedAt: null,
      revealStartedAt: null,
      usedPromptIds: [...usedPromptIds, nextPrompt.id],
    })
    .eq("roomCode", roomCode);

  if (error) throw error;

  return NextResponse.json({
    ok: true,
    gameState: GameState.Prompting,
    activePrompt: nextPrompt,
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const { code } = await context.params;
    const roomCode = code?.toUpperCase();

    if (!roomCode) {
      return NextResponse.json(
        { error: "Room code is required." },
        { status: 400 },
      );
    }

    const { data: room, error: roomError } = await supabaseAdmin
      .from("Room")
      .select("*")
      .eq("roomCode", roomCode)
      .maybeSingle();

    if (roomError) throw roomError;

    if (!room) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    if (room.gameState === GameState.Voting) {
      return advanceVotingMatchup(roomCode, room);
    }

    if (room.gameState === GameState.Results) {
      return NextResponse.json({ ok: true, gameState: room.gameState });
    }

    if (room.gameState !== GameState.Prompting || !room.activePromptId) {
      return NextResponse.json(
        { error: "Room is not ready to transition to voting." },
        { status: 400 },
      );
    }

    const [
      { data: responses, error: responsesError },
      { data: players, error: playersError },
    ] = await Promise.all([
      supabaseAdmin
        .from("Response")
        .select("id, roomCode, playerId, promptId")
        .eq("roomCode", roomCode)
        .eq("promptId", room.activePromptId),
      supabaseAdmin.from("Player").select("id").eq("roomCode", roomCode),
    ]);

    if (responsesError) throw responsesError;
    if (playersError) throw playersError;

    const submittedResponses = (responses || []) as ResponseRecord[];
    const totalPlayers = players?.length || 0;
    const roundStartedAt = room.roundStartedAt
      ? parseGameTimestamp(room.roundStartedAt)
      : null;
    const timerExpired = roundStartedAt
      ? Date.now() >= roundStartedAt + room.timerLimit * 1000
      : false;
    const everyoneSubmitted =
      totalPlayers > 0 && submittedResponses.length >= totalPlayers;

    if (!timerExpired && !everyoneSubmitted) {
      return NextResponse.json(
        {
          error:
            "Prompting is still active. Waiting for all submissions or timer expiration.",
        },
        { status: 409 },
      );
    }

    if (room.roundNumber < room.totalRounds) {
      return startNextPromptRound(roomCode, room);
    }

    const { data: allRoundResponses, error: allResponsesError } =
      await supabaseAdmin
        .from("Response")
        .select("id, roomCode, playerId, promptId")
        .eq("roomCode", roomCode)
        .in("promptId", room.usedPromptIds || [room.activePromptId]);

    if (allResponsesError) throw allResponsesError;

    const responsesForVoting = (allRoundResponses || []) as ResponseRecord[];

    if (responsesForVoting.length < 2) {
      const { error: updateError } = await supabaseAdmin
        .from("Room")
        .update({
          gameState: GameState.Results,
          votingStartedAt: null,
          revealStartedAt: null,
        })
        .eq("roomCode", roomCode);

      if (updateError) throw updateError;

      return NextResponse.json({
        ok: true,
        gameState: GameState.Results,
        matchupCount: 0,
      });
    }

    const { error: deleteMatchupsError } = await supabaseAdmin
      .from("Matchup")
      .delete()
      .eq("roomCode", roomCode);

    if (deleteMatchupsError) throw deleteMatchupsError;

    const matchups = [];
    let matchupIndex = 0;
    const promptIds = room.usedPromptIds || [room.activePromptId];

    for (const promptId of promptIds) {
      const promptResponses = shuffle(
        responsesForVoting.filter((response) => response.promptId === promptId),
      );

      for (let i = 0; i < promptResponses.length; i += 2) {
        matchups.push({
          id: randomUUID(),
          roomCode,
          promptId,
          responseAId: promptResponses[i].id,
          responseBId: promptResponses[i + 1]?.id || null,
          roundNumber: room.roundNumber,
          matchupIndex,
          status: matchupIndex === 0 ? MatchupStatus.Active : MatchupStatus.Pending,
        });
        matchupIndex += 1;
      }
    }

    const { error: matchupError } = await supabaseAdmin
      .from("Matchup")
      .insert(matchups);

    if (matchupError) throw matchupError;

    const { error: updateError } = await supabaseAdmin
      .from("Room")
      .update({
        gameState: GameState.Voting,
        activeMatchupIndex: 0,
        votingStartedAt: new Date().toISOString(),
        revealStartedAt: null,
      })
      .eq("roomCode", roomCode);

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      gameState: GameState.Voting,
      matchupCount: matchups.length,
    });
  } catch (error: unknown) {
    console.error("Error transitioning room:", error);
    return NextResponse.json(
      { error: "Internal server error transitioning room." },
      { status: 500 },
    );
  }
}
