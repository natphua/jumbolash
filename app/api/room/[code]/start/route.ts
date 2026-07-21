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
import { prisma } from "@/lib/prisma";

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
    const room = await prisma.room.findUnique({
      where: { roomCode },
      include: { players: true },
    });

    if (!room) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    if (room.players.length < 2) {
      return NextResponse.json(
        { error: "At least 2 players are required to start the match." },
        { status: 400 },
      );
    }

    // 2. Fetch a random prompt from the database
    const totalPrompts = await prisma.prompt.count();

    if (totalPrompts === 0) {
      return NextResponse.json(
        { error: "No available prompts found in the database." },
        { status: 500 },
      );
    }

    const randomIndex = Math.floor(Math.random() * totalPrompts);
    const randomPrompt = await prisma.prompt.findFirst({
      skip: randomIndex,
    });

    if (!randomPrompt) {
      return NextResponse.json(
        { error: "Failed to retrieve a random prompt." },
        { status: 500 },
      );
    }

    // 3. Update Room state: transition to PROMPTING & attach active prompt
    const updatedRoom = await prisma.room.update({
      where: { roomCode },
      data: {
        gameState: "PROMPTING",
        activePromptId: randomPrompt.id,
        roundStartedAt: new Date(),
        roundNumber: room.roundNumber || 1,
      },
    });

    return NextResponse.json(
      {
        message: "Game state successfully updated to PROMPTING.",
        roomCode: updatedRoom.roomCode,
        activePromptId: randomPrompt.id,
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
