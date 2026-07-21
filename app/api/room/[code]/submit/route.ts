/**
 * Route: POST /api/room/[code]/submit
 *
 * Description:
 * Validates and stores player prompt submissions. Enforces server-side
 * timestamp verification to block tardy submissions past the countdown limit.
 *
 * Request Body:
 * {
 *   playerId: string;
 *   promptId: string;
 *   text: string;
 * }
 *
 * Responses:
 * 200 OK - Response successfully saved
 * 400 Bad Request - Missing required payload parameters or text > 120 chars
 * 403 Forbidden - Time limit exceeded or player already submitted this round
 * 404 Not Found - Room or player not found
 * 500 Internal Server Error - Database operational failure
 *
 * Created on 2026-07-19 by Natalie Phua.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ roomCode: string }> },
) {
  try {
    const { roomCode } = await context.params;

    if (!roomCode) {
      return NextResponse.json(
        { error: "Room code is required." },
        { status: 400 },
      );
    }

    const body = await req.json();
    const { playerId, promptId, text } = body;

    // 1. Basic validation
    if (!playerId || !promptId || text === undefined || text === null) {
      return NextResponse.json(
        {
          error:
            "Missing required payload parameters (playerId, promptId, text).",
        },
        { status: 400 },
      );
    }

    const trimmedText = String(text).trim();

    if (trimmedText.length === 0) {
      return NextResponse.json(
        { error: "Submission text cannot be empty." },
        { status: 400 },
      );
    }

    if (trimmedText.length > 120) {
      return NextResponse.json(
        { error: "Submission exceeds the 120-character limit." },
        { status: 400 },
      );
    }

    // 2. Fetch room state with current round details
    const room = await prisma.room.findUnique({
      where: { roomCode },
    });

    if (!room) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    if (room.gameState !== "PROMPTING") {
      return NextResponse.json(
        { error: "Room is not currently accepting answer submissions." },
        { status: 403 },
      );
    }

    // 3. Server-side time validation against clock manipulation
    if (!room.roundStartedAt) {
      return NextResponse.json(
        { error: "Round start timestamp is missing." },
        { status: 400 },
      );
    }

    const serverNow = Date.now();
    const roundStart = new Date(room.roundStartedAt).getTime();
    const timerLimitMs = room.timerLimit * 1000;
    const allowedEndTime = roundStart + timerLimitMs;

    // Buffer window of 1.5 seconds to account for network latency
    const LATENCY_BUFFER_MS = 1500;

    if (serverNow > allowedEndTime + LATENCY_BUFFER_MS) {
      return NextResponse.json(
        { error: "Time limit expired. Submission rejected." },
        { status: 403 },
      );
    }

    // 4. Duplicate submission check for the current round
    const existingResponse = await prisma.response.findFirst({
      where: {
        playerId,
        promptId,
        roomCode,
      },
    });

    if (existingResponse) {
      return NextResponse.json(
        { error: "You have already submitted an answer for this prompt." },
        { status: 403 },
      );
    }

    // 5. Save submission to database
    const newResponse = await prisma.response.create({
      data: {
        text: trimmedText,
        playerId,
        promptId,
        roomCode,
      },
    });

    return NextResponse.json(
      {
        message: "Response submitted successfully.",
        responseId: newResponse.id,
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("Error processing prompt submission:", error);
    return NextResponse.json(
      { error: "Internal server error processing submission." },
      { status: 500 },
    );
  }
}
