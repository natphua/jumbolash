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
import { GameState, MatchupStatus, VOTING_SECONDS } from "@/lib/game-state";

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
  activePromptId: string | null;
  activeMatchupIndex: number;
  votingStartedAt: string | null;
}

function shuffle<T>(items: T[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

async function advanceVotingMatchup(roomCode: string, room: RoomRecord) {
  if (!room.votingStartedAt) {
    return NextResponse.json({ ok: true, gameState: GameState.Voting });
  }

  const elapsedSeconds = Math.floor(
    (Date.now() - new Date(room.votingStartedAt).getTime()) / 1000,
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

    const { data: responses, error: responsesError } = await supabaseAdmin
      .from("Response")
      .select("id, roomCode, playerId, promptId")
      .eq("roomCode", roomCode)
      .eq("promptId", room.activePromptId);

    if (responsesError) throw responsesError;

    const submittedResponses = (responses || []) as ResponseRecord[];

    if (submittedResponses.length < 2) {
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
      .eq("roomCode", roomCode)
      .eq("roundNumber", room.roundNumber);

    if (deleteMatchupsError) throw deleteMatchupsError;

    const pairedResponses = shuffle(submittedResponses);
    const matchups = [];

    for (let i = 0; i < pairedResponses.length; i += 2) {
      matchups.push({
        id: randomUUID(),
        roomCode,
        promptId: room.activePromptId,
        responseAId: pairedResponses[i].id,
        responseBId: pairedResponses[i + 1]?.id || null,
        roundNumber: room.roundNumber,
        matchupIndex: Math.floor(i / 2),
        status: i === 0 ? MatchupStatus.Active : MatchupStatus.Pending,
      });
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
