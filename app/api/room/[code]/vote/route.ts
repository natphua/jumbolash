/**
 * Route: POST /api/room/[code]/vote
 *
 * Description: Handles voting for a specific matchup in a room. Accounts for
 * self-vote blocking, vote counting, and matchup advancement.
 *
 * Request body:
 *   - playerId (string): The ID of the player casting the vote
 *   - matchupId (string): The ID of the matchup being voted on
 *   - selectedResponseId (string): The ID of the response being selected
 *
 * Responses:
 * 200 OK - Vote successfully recorded and game state updated
 * 400 Bad Request - Missing required parameters or invalid matchup/response
 * 403 Forbidden - Player attempting to vote on their own matchup or has already voted
 * 404 Not Found - Room, matchup, or player not found
 * 500 Internal Server Error - Database operational failure
 *
 * Created on 2026-07-22 by Natalie Phua.
 */

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/supabase/admin";
import { GameState, MatchupStatus, POINTS_PER_VOTE } from "@/lib/game-state";

interface PlayerRecord {
  id: string;
  points: number;
}

interface ResponseRecord {
  id: string;
  playerId: string;
  votes: number;
}

interface RoomRecord {
  roundNumber: number;
}

async function advanceMatchup(
  roomCode: string,
  room: RoomRecord,
  matchupIndex: number,
) {
  const nextIndex = matchupIndex + 1;
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
    .eq("matchupIndex", matchupIndex);

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
    return GameState.Results;
  }

  const [{ error: activeError }, { error: roomError }] = await Promise.all([
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

  if (activeError) throw activeError;
  if (roomError) throw roomError;

  return GameState.Voting;
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

    const { playerId, matchupId, selectedResponseId } = await req.json();

    if (!playerId || !matchupId || !selectedResponseId) {
      return NextResponse.json(
        { error: "Missing playerId, matchupId, or selectedResponseId." },
        { status: 400 },
      );
    }

    const [
      { data: room, error: roomError },
      { data: matchup, error: matchupError },
    ] = await Promise.all([
      supabaseAdmin
        .from("Room")
        .select("*")
        .eq("roomCode", roomCode)
        .maybeSingle(),
      supabaseAdmin
        .from("Matchup")
        .select("*")
        .eq("id", matchupId)
        .eq("roomCode", roomCode)
        .maybeSingle(),
    ]);

    if (roomError) throw roomError;
    if (matchupError) throw matchupError;

    if (!room || room.gameState !== GameState.Voting) {
      return NextResponse.json(
        { error: "Room is not currently accepting votes." },
        { status: 403 },
      );
    }

    if (!matchup || matchup.matchupIndex !== room.activeMatchupIndex) {
      return NextResponse.json(
        { error: "This matchup is not active." },
        { status: 403 },
      );
    }

    const responseIds = [matchup.responseAId, matchup.responseBId].filter(
      Boolean,
    ) as string[];

    if (!responseIds.includes(selectedResponseId)) {
      return NextResponse.json(
        { error: "Selected response is not part of this matchup." },
        { status: 400 },
      );
    }

    const [
      { data: responses, error: responsesError },
      { data: players, error: playersError },
      { data: existingVote, error: existingVoteError },
    ] = await Promise.all([
      supabaseAdmin
        .from("Response")
        .select("id, playerId, votes")
        .in("id", responseIds),
      supabaseAdmin
        .from("Player")
        .select("id, points")
        .eq("roomCode", roomCode),
      supabaseAdmin
        .from("Vote")
        .select("id")
        .eq("matchupId", matchupId)
        .eq("voterPlayerId", playerId)
        .maybeSingle(),
    ]);

    if (responsesError) throw responsesError;
    if (playersError) throw playersError;
    if (existingVoteError) throw existingVoteError;

    if (existingVote) {
      return NextResponse.json(
        { error: "You have already voted on this matchup." },
        { status: 403 },
      );
    }

    const matchupResponses = (responses || []) as ResponseRecord[];
    const responseAuthorIds = new Set(
      matchupResponses.map((response) => response.playerId),
    );

    if (responseAuthorIds.has(playerId)) {
      return NextResponse.json(
        { error: "You cannot vote on your own matchup." },
        { status: 403 },
      );
    }

    const roomPlayers = (players || []) as PlayerRecord[];
    const voter = roomPlayers.find((player) => player.id === playerId);

    if (!voter) {
      return NextResponse.json(
        { error: "Voting player is not in this room." },
        { status: 404 },
      );
    }

    const selectedResponse = matchupResponses.find(
      (response) => response.id === selectedResponseId,
    );

    if (!selectedResponse) {
      return NextResponse.json(
        { error: "Selected response was not found." },
        { status: 404 },
      );
    }

    const [{ error: voteError }, { data: author, error: authorError }] =
      await Promise.all([
        supabaseAdmin.from("Vote").insert({
          id: randomUUID(),
          roomCode,
          matchupId,
          voterPlayerId: playerId,
          selectedResponseId,
        }),
        supabaseAdmin
          .from("Player")
          .select("id, points")
          .eq("id", selectedResponse.playerId)
          .single(),
      ]);

    if (voteError) throw voteError;
    if (authorError) throw authorError;

    const [{ error: responseError }, { error: pointsError }] =
      await Promise.all([
        supabaseAdmin
          .from("Response")
          .update({ votes: (selectedResponse.votes || 0) + 1 })
          .eq("id", selectedResponseId),
        supabaseAdmin
          .from("Player")
          .update({ points: (author.points || 0) + POINTS_PER_VOTE })
          .eq("id", author.id),
      ]);

    if (responseError) throw responseError;
    if (pointsError) throw pointsError;

    const { data: currentVotes, error: countError } = await supabaseAdmin
      .from("Vote")
      .select("id")
      .eq("matchupId", matchupId);

    if (countError) throw countError;

    const eligibleVoteCount = roomPlayers.filter(
      (player) => !responseAuthorIds.has(player.id),
    ).length;
    let gameState: string = GameState.Voting;

    if ((currentVotes || []).length >= eligibleVoteCount) {
      gameState = await advanceMatchup(
        roomCode,
        room,
        matchup.matchupIndex,
      );
    }

    return NextResponse.json({ ok: true, gameState }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error processing vote:", error);
    return NextResponse.json(
      { error: "Internal server error processing vote." },
      { status: 500 },
    );
  }
}
