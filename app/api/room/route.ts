/**
 * route.ts (api/room)
 *
 * Core room management API endpoint. Handles administrative room initialization
 * via POST, and handles incoming player lobby connections via PUT.
 *
 * Created on 2026-07-15 by Natalie Phua.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateRoomCode } from "@/lib/room-code";

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

    const newRoom = await prisma.room.create({
      data: {
        roomCode: roomCode,
        gameState: "LOBBY",
        totalRounds: 3,
        timerLimit: 90,
      },
    });

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

    const room = await prisma.room.findUnique({
      where: { roomCode: roomCode },
      include: { players: true },
    });

    if (!room) {
      return NextResponse.json(
        { error: "The entered room code does not exist." },
        { status: 404 },
      );
    }

    if (room.players.length >= 10) {
      return NextResponse.json(
        { error: "This room is full (max 10 players)." },
        { status: 400 },
      );
    }

    const isNameTaken = room.players.some(
      (p) => p.nickname.toLowerCase() === formattedNickname.toLowerCase(),
    );

    if (isNameTaken) {
      return NextResponse.json(
        { error: "That nickname is already taken in this room." },
        { status: 400 },
      );
    }

    const newPlayer = await prisma.player.create({
      data: {
        nickname: formattedNickname,
        roomCode: roomCode,
        points: 0,
      },
    });

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

    const room = await prisma.room.findUnique({
      where: { roomCode },
      include: { players: true },
    });

    if (!room) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    return NextResponse.json(room, { status: 200 });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to fetch room data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
