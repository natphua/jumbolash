/**
 * page.tsx (app/room/[code])
 *
 * Client-side player waiting room view. Sets up a real-time Postgres subscription
 * via Supabase to track player roster changes and automatically handles game
 * state routing once the administrator launches the session.
 *
 * Created on 2026-07-17 by Natalie Phua.
 */

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

interface Player {
  id: string;
  nickname: string;
  points: number;
}

interface RoomData {
  roomCode: string;
  gameState: string;
  players: Player[];
}

export default function WaitingRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params?.code as string)?.toUpperCase();

  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  // Effect 1: Handles the initial data loading on mount
  useEffect(() => {
    let isMounted = true;

    async function loadInitialLobbyData() {
      if (!roomCode) return;
      try {
        const response = await fetch(`/api/room?code=${roomCode}`);
        const data = await response.json();

        if (!response.ok)
          throw new Error(data.error || "Failed to load lobby data.");

        if (!isMounted) return;

        if (data.gameState === "PROMPTING") {
          router.push(`/game/${roomCode}`);
          return;
        }

        setRoomData(data);
        setLoading(false);
      } catch (err: unknown) {
        if (isMounted) {
          setError(
            err instanceof Error
              ? err.message
              : "Error establishing connection context.",
          );
          setLoading(false);
        }
      }
    }

    loadInitialLobbyData();

    return () => {
      isMounted = false;
    };
  }, [roomCode, router]); // Clean dependencies, no function references needed

  // Effect 2: Manage external live socket subscriptions exclusively
  useEffect(() => {
    if (!roomCode) return;

    const channel = supabase
      .channel(`room_lobby:${roomCode}`)
      // Listener A: Watch for game state changes from the host
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "Room",
          filter: `roomCode=eq.${roomCode}`,
        },
        (payload) => {
          const updatedRoom = payload.new as { gameState: string };
          if (updatedRoom && updatedRoom.gameState === "PROMPTING") {
            router.push(`/game/${roomCode}`);
          }
        },
      )
      // Listener B: Watch for roster changes (players joining or dropping out)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Player",
          filter: `roomCode=eq.${roomCode}`,
        },
        async () => {
          // Pull a fresh snapshot of the room and players from the API route
          const response = await fetch(`/api/room?code=${roomCode}`);
          const data = await response.json();
          if (response.ok) {
            setRoomData(data);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode, supabase, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 font-mono text-slate-400">
        <p className="animate-pulse uppercase tracking-widest">
          SYNCING WITH LOBBY ARENA...
        </p>
      </div>
    );
  }

  if (error || !roomData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-md game-dashboard-card text-center space-y-4">
          <p className="error-text">{error || "LOBBY COULD NOT BE LOADED."}</p>
          <button
            onClick={() => router.push("/")}
            className="copy-btn py-2 px-4 cursor-pointer"
          >
            RETURN TO HUB
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-slate-900 mt-5 flex flex-col items-center justify-start font-sans">
      <div className="w-full max-w-3xl space-y-8">
        {/* Waiting Arena Meta Header Panel */}
        <div className="game-dashboard-card flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="block text-sm font-bold font-mono tracking-wider text-slate-500 mb-1">
              CURRENT ROOM CODE
            </span>
            <h1 className="game-header text-3xl select-all border-2 border-dashed border-slate-400 bg-slate-50 px-4 py-1 inline-block font-mono tracking-widest">
              {roomData.roomCode}
            </h1>
          </div>
          <div className="text-center sm:text-right">
            <h2 className="game-header text-xl border-b-2 border-black pb-1 mb-2">
              WAITING ARENA
            </h2>
            <span className="game-badge">
              PLAYERS JOINED: {roomData.players.length} / 10
            </span>
          </div>
        </div>

        {/* Real-time Connected Players Tracking Grid */}
        <div className="game-dashboard-card min-h-75 space-y-4">
          <h3 className="game-header text-lg border-b border-slate-200 pb-2">
            CONNECTED ROSTER
          </h3>

          {roomData.players.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="font-mono text-slate-800 animate-pulse uppercase tracking-widest">
                Awaiting inbound player connections...
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {roomData.players.map((player) => (
                <div
                  key={player.id}
                  className="waiting-grid-cell flex items-center justify-between gap-2 truncate"
                >
                  <span className="truncate">{player.nickname}</span>
                  <span className="status-badge-ready shrink-0">READY</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* System Informational Status Box */}
        <div className="p-4 bg-slate-50 border-2 border-black rounded font-mono text-center text-xs text-slate-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          THE MATCH WILL COMMENCE AUTOMATICALLY WHEN THE GAME ADMINISTRATOR
          CHANGES THE ROOM STATE.
        </div>
      </div>
    </main>
  );
}
