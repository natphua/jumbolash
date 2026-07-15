/**
 * route.ts (api/room)
 *
 * Serverless POST endpoint that handles the generation of unique game rooms.
 * Generates a random, non-colliding 4-character room code string and initializes
 * the baseline database record.
 *
 * Created on 2026-07-15 by Natalie Phua.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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

    // Loop logic to verify unique index constraints
    while (!isUnique && attempts < 5) {
      roomCode = generateRoomCode();
      const existingRoom = await prisma.room.findUnique({
        where: { roomCode: roomCode },
      });
      if (!existingRoom) isUnique = true;
      attempts++;
    }

    if (!isUnique) {
      return NextResponse.json(
        { error: "Failed to generate a unique room code" },
        { status: 500 },
      );
    }

    // Insert initialization record using standard ORM methods (adminId is null/optional)
    const newRoom = await prisma.room.create({
      data: {
        roomCode: roomCode,
        gameState: "LOBBY",
        totalRounds: 3,
        timerLimit: 90,
      },
    });

    // We store this room code in a cookie or return it so the host client can track ownership
    const response = NextResponse.json(
      { roomCode: newRoom.roomCode },
      { status: 200 },
    );

    // Set a cookie so the hosting browser can identify itself as the admin of this specific code
    response.cookies.set("hosted_room_code", newRoom.roomCode, {
      path: "/",
      httpOnly: false, // Accessible by client-side router checks
      maxAge: 60 * 60 * 4, // 4 hours
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
