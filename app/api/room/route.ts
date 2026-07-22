/**
 * route.ts (api/room)
 *
 * Core room management API endpoint. Handles administrative room initialization
 * via POST, incoming player lobby connections via PUT, and room profile
 * retrieval via GET.
 *
 * Created on 2026-07-15 by Natalie Phua.
 */

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/supabase/admin";
import { generateRoomCode } from "@/lib/helpers/room-code";
import { GameState } from "@/lib/game-state";

interface Player {
  id: string;
  nickname: string;
  roomCode: string;
  points: number;
}

interface ResponseRecord {
  id: string;
  text: string;
  playerId: string;
  promptId: string;
  roomCode: string;
}

interface VoteRecord {
  id: string;
  voterPlayerId: string;
  selectedResponseId: string;
}

function sortLeaderboard(players: Player[]) {
  return [...players].sort((a, b) => b.points - a.points);
}

/**
 * @description Creates a unique game room.
 * @route POST /api/room
 * @returns {Object} 200 - An object containing the generated roomCode.
 * @returns {Object} 500 - An error object with a failure msg if creation fails.
 */
export async function POST() {
  try {
    let roomCode = "";
    let isUnique = false;
    let attempts = 0;

    while (!isUnique && attempts < 5) {
      roomCode = generateRoomCode();
      const { data: existingRoom, error } = await supabaseAdmin
        .from("Room")
        .select("roomCode")
        .eq("roomCode", roomCode)
        .maybeSingle();

      if (error) throw error;
      if (!existingRoom) isUnique = true;
      attempts++;
    }

    if (!isUnique) {
      return NextResponse.json(
        { error: "Failed to generate a unique room code" },
        { status: 500 },
      );
    }

    const { data: newRoom, error } = await supabaseAdmin
      .from("Room")
      .insert({
        roomCode: roomCode,
        gameState: GameState.Lobby,
        totalRounds: 3,
        timerLimit: 90,
      })
      .select("roomCode")
      .single();

    if (error) throw error;

    const response = NextResponse.json(
      { roomCode: newRoom.roomCode },
      { status: 200 },
    );

    response.cookies.set("hosted_room_code", newRoom.roomCode, {
      path: "/",
      httpOnly: false,
    });

    return response;
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : "Failed to establish database room records";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * @description Validates capacity and registers a player to an existing room.
 * @route PUT /api/room
 * @returns {Object} 200 - Object containing the created player data.
 * @returns {Object} 400 - Error object w/ failure msg if registration fails.
 * @returns {Object} 404 - Error object w/ failure msg if the room DNE.
 */
export async function PUT(req: Request) {
  try {
    const { roomCode, nickname } = await req.json();

    if (!roomCode || !nickname) {
      return NextResponse.json(
        { error: "Room code and nickname are required." },
        { status: 400 },
      );
    }

    const formattedNickname = nickname.trim();

    const { data: room, error: roomError } = await supabaseAdmin
      .from("Room")
      .select("*")
      .eq("roomCode", roomCode)
      .maybeSingle();

    if (roomError) throw roomError;

    if (!room) {
      return NextResponse.json(
        { error: "The entered room code does not exist." },
        { status: 404 },
      );
    }

    const { data: players, error: playersError } = await supabaseAdmin
      .from("Player")
      .select("id, nickname, roomCode, points")
      .eq("roomCode", roomCode);

    if (playersError) throw playersError;

    const roomPlayers = (players || []) as Player[];

    if (roomPlayers.length >= 10) {
      return NextResponse.json(
        { error: "This room is full (max 10 players)." },
        { status: 400 },
      );
    }

    const isNameTaken = roomPlayers.some(
      (p) => p.nickname.toLowerCase() === formattedNickname.toLowerCase(),
    );

    if (isNameTaken) {
      return NextResponse.json(
        { error: "That nickname is already taken in this room." },
        { status: 400 },
      );
    }

    const { data: newPlayer, error: playerError } = await supabaseAdmin
      .from("Player")
      .insert({
        id: randomUUID(),
        nickname: formattedNickname,
        roomCode: roomCode,
        points: 0,
      })
      .select("id, nickname, roomCode, points")
      .single();

    if (playerError) throw playerError;

    const response = NextResponse.json(newPlayer, { status: 200 });

    response.cookies.set("player_id", newPlayer.id, {
      path: "/",
      maxAge: 60 * 60 * 4,
    });
    response.cookies.set("player_nickname", newPlayer.nickname, {
      path: "/",
      maxAge: 60 * 60 * 4,
    });
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to join room.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * @description Retrieves a room profile along with its connected players roster.
 * @route GET /api/room
 * @returns {Object} 200 - Object containing the room data and players.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomCode = searchParams.get("code")?.toUpperCase().trim();

    if (!roomCode) {
      return NextResponse.json(
        { error: "Missing room code parameter." },
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

    const [{ data: players, error: playersError }, { data: activePrompt, error: promptError }] =
      await Promise.all([
        supabaseAdmin
          .from("Player")
          .select("id, nickname, roomCode, points")
          .eq("roomCode", roomCode),
        room.activePromptId
          ? supabaseAdmin
              .from("Prompt")
              .select("id, text")
              .eq("id", room.activePromptId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

    if (playersError) throw playersError;
    if (promptError) throw promptError;

    const roomPlayers = (players || []) as Player[];
    let currentMatchup = null;

    if (room.gameState === GameState.Voting) {
      const { data: matchup, error: matchupError } = await supabaseAdmin
        .from("Matchup")
        .select("*")
        .eq("roomCode", roomCode)
        .eq("roundNumber", room.roundNumber)
        .eq("matchupIndex", room.activeMatchupIndex)
        .maybeSingle();

      if (matchupError) throw matchupError;

      if (matchup) {
        const responseIds = [matchup.responseAId, matchup.responseBId].filter(
          Boolean,
        ) as string[];
        const [{ data: responses, error: responsesError }, { data: votes, error: votesError }] =
          await Promise.all([
            supabaseAdmin
              .from("Response")
              .select("id, text, playerId, promptId, roomCode")
              .in("id", responseIds),
            supabaseAdmin
              .from("Vote")
              .select("id, voterPlayerId, selectedResponseId")
              .eq("matchupId", matchup.id),
          ]);

        if (responsesError) throw responsesError;
        if (votesError) throw votesError;

        const responseMap = new Map(
          ((responses || []) as ResponseRecord[]).map((response) => [
            response.id,
            response,
          ]),
        );
        const playerMap = new Map(
          roomPlayers.map((player) => [player.id, player]),
        );
        const matchupVotes = (votes || []) as VoteRecord[];

        const serializeResponse = (responseId: string | null) => {
          if (!responseId) return null;
          const response = responseMap.get(responseId);
          if (!response) return null;
          const author = playerMap.get(response.playerId);
          const responseVotes = matchupVotes.filter(
            (vote) => vote.selectedResponseId === response.id,
          );

          return {
            ...response,
            authorNickname: author?.nickname || "Unknown",
            voteCount: responseVotes.length,
            voters: responseVotes.map((vote) => ({
              playerId: vote.voterPlayerId,
              nickname:
                playerMap.get(vote.voterPlayerId)?.nickname || "Unknown",
            })),
          };
        };

        const responseA = serializeResponse(matchup.responseAId);
        const responseB = serializeResponse(matchup.responseBId);
        const authorIds = new Set(
          [responseA?.playerId, responseB?.playerId].filter(Boolean),
        );
        const eligibleVoterIds = roomPlayers
          .filter((player) => !authorIds.has(player.id))
          .map((player) => player.id);

        currentMatchup = {
          ...matchup,
          prompt: activePrompt,
          responseA,
          responseB,
          votes: matchupVotes,
          eligibleVoterIds,
          eligibleVoteCount: eligibleVoterIds.length,
          submittedVoteCount: matchupVotes.length,
        };
      }
    }

    return NextResponse.json(
      {
        ...room,
        activePrompt,
        players: roomPlayers,
        currentMatchup,
        leaderboard: sortLeaderboard(roomPlayers),
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch room data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { roomCode, totalRounds, timerLimit } = await req.json();

    if (!roomCode) {
      return NextResponse.json(
        { error: "Room code is required." },
        { status: 400 },
      );
    }

    const { count: promptCount, error: promptCountError } = await supabaseAdmin
      .from("Prompt")
      .select("id", { count: "exact", head: true });

    if (promptCountError) throw promptCountError;

    if (totalRounds > (promptCount || 0)) {
      return NextResponse.json(
        {
          error:
            "Rounds cannot exceed the number of prompts in the database.",
        },
        { status: 400 },
      );
    }

    const { error } = await supabaseAdmin
      .from("Room")
      .update({ totalRounds, timerLimit })
      .eq("roomCode", roomCode);

    if (error) throw error;

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to update room settings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomCode = searchParams.get("code")?.toUpperCase().trim();
    const playerId = searchParams.get("playerId");

    if (!roomCode) {
      return NextResponse.json(
        { error: "Missing room code parameter." },
        { status: 400 },
      );
    }

    const { error } = playerId
      ? await supabaseAdmin
          .from("Player")
          .delete()
          .eq("id", playerId)
          .eq("roomCode", roomCode)
      : await supabaseAdmin.from("Room").delete().eq("roomCode", roomCode);

    if (error) throw error;

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to delete room.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
