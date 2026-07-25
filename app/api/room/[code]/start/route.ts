/**
 * Route: POST /api/room/[code]/start
 *
 * Description:
 * Admin Game Engine Controller. Transitions the room from WAITING to PROMPTING.
 * Selects a random prompt from the database, sets roundStartedAt to the current
 * timestamp, and updates the Room record state to notify connected players via
 * Supabase Realtime.
 *
 * Request body: None
 *
 * Responses:
 * 200 - OK: Game state successfully updated to PROMPTING.
 * 400 - Bad Request: Room code is missing or insufficient players to start.
 * 404 - Not Found: Room not found in the database.
 * 500 - Internal Server Error: Database operational failure.
 *
 * Created on 2026-07-19 by Natalie Phua.
 */

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/supabase/admin";
import { GameState } from "@/lib/game-state";

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

    // 1. Fetch room to confirm existence and current state
    const { data: room, error: roomError } = await supabaseAdmin
      .from("Room")
      .select("*")
      .eq("roomCode", roomCode)
      .maybeSingle();

    if (roomError) throw roomError;

    if (!room) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    const { data: players, error: playersError } = await supabaseAdmin
      .from("Player")
      .select("id")
      .eq("roomCode", roomCode);

    if (playersError) throw playersError;

    if ((players || []).length < 3) {
      return NextResponse.json(
        { error: "At least 3 players are required to start the match." },
        { status: 400 },
      );
    }

    if (room.timerLimit < 30 || room.timerLimit > 120) {
      return NextResponse.json(
        { error: "Room timer must be stored in seconds between 30 and 120." },
        { status: 400 },
      );
    }

    // 2. Fetch a random prompt from the database
    const { count: totalPrompts, error: countError } = await supabaseAdmin
      .from("Prompt")
      .select("id", { count: "exact", head: true });

    if (countError) throw countError;

    if (!totalPrompts) {
      return NextResponse.json(
        { error: "No available prompts found in the database." },
        { status: 500 },
      );
    }

    if (room.totalRounds > totalPrompts) {
      return NextResponse.json(
        {
          error:
            "Total rounds cannot exceed the number of prompts in the database.",
        },
        { status: 400 },
      );
    }

    const usedPromptIds = (room.usedPromptIds || []) as string[];
    const { data: allPrompts, error: availablePromptError } =
      await supabaseAdmin.from("Prompt").select("id, text");

    if (availablePromptError) throw availablePromptError;

    const usedPromptSet = new Set(usedPromptIds);
    const availablePrompts = (allPrompts || []).filter(
      (prompt) => !usedPromptSet.has(prompt.id),
    );

    if (!availablePrompts || availablePrompts.length === 0) {
      return NextResponse.json(
        { error: "No unused prompts remain for this room." },
        { status: 400 },
      );
    }

    const randomIndex = Math.floor(Math.random() * availablePrompts.length);
    const randomPrompt = availablePrompts[randomIndex];

    if (!randomPrompt) {
      return NextResponse.json(
        { error: "Failed to retrieve a random prompt." },
        { status: 500 },
      );
    }

    // 3. Update Room state: transition to PROMPTING & attach active prompt
    const { data: updatedRoom, error: updateError } = await supabaseAdmin
      .from("Room")
      .update({
        gameState: GameState.Prompting,
        activePromptId: randomPrompt.id,
        roundStartedAt: new Date().toISOString(),
        roundNumber: room.roundNumber || 1,
        activeMatchupIndex: 0,
        votingStartedAt: null,
        revealStartedAt: null,
        usedPromptIds: [...usedPromptIds, randomPrompt.id],
      })
      .eq("roomCode", roomCode)
      .select("roomCode, roundNumber, roundStartedAt")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json(
      {
        message: "Game state successfully updated to PROMPTING.",
        roomCode: updatedRoom.roomCode,
        activePromptId: randomPrompt.id,
        activePrompt: randomPrompt,
        roundNumber: updatedRoom.roundNumber,
        roundStartedAt: updatedRoom.roundStartedAt,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("Error starting game round:", error);
    return NextResponse.json(
      { error: "Internal server error starting the game round." },
      { status: 500 },
    );
  }
}
