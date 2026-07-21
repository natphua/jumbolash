/**
 * page.tsx (app/room/[code])
 *
 * Client-side player room view. Dynamically switches between the waiting lobby
 * roster view and the active prompt form.
 *
 * Created on 2026-07-17 by Natalie Phua.
 */

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import PromptForm from "../../components/game/PromptForm";

interface Player {
  id: string;
  nickname: string;
  points: number;
}

interface RoomData {
  roomCode: string;
  gameState: string;
  timerLimit: number;
  roundStartedAt: string | null;
  activePrompt?: {
    id: string;
    text: string;
  } | null;
  players: Player[];
}

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = (params?.code as string)?.toUpperCase();

  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Effect 1: Handles initial data loading
  useEffect(() => {
    let isMounted = true;

    async function loadRoomData() {
      if (!roomCode) return;
      try {
        const sessionPlayerId = sessionStorage.getItem("jumbolash_player_id");
        const sessionRoomCode = sessionStorage.getItem(
          "jumbolash_player_room_code",
        );
        const cookiePlayerId =
          document.cookie
            .split("; ")
            .find((row) => row.startsWith("player_id="))
            ?.split("=")[1] ?? null;

        setPlayerId(
          sessionRoomCode === roomCode && sessionPlayerId
            ? sessionPlayerId
            : cookiePlayerId,
        );

        const response = await fetch(`/api/room?code=${roomCode}`);
        const data = await response.json();

        if (!response.ok)
          throw new Error(data.error || "Failed to load room data.");

        if (!isMounted) return;

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

    loadRoomData();

    return () => {
      isMounted = false;
    };
  }, [roomCode]);

  // Effect 2: Realtime WebSocket Subscription for State Updates & Roster Changes
  useEffect(() => {
    if (!roomCode) return;

    const channel = supabase
      .channel(`room_lobby:${roomCode}`)
      // Listener A: Watch for game state and active prompt updates from host
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "Room",
          filter: `roomCode=eq.${roomCode}`,
        },
        async () => {
          // Re-fetch room data to get populated active prompt relation
          const response = await fetch(`/api/room?code=${roomCode}`);
          const data = await response.json();
          if (response.ok) {
            setRoomData(data);
          }
        },
      )
      // Listener A.2: Host deleted room
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "Room",
          filter: `roomCode=eq.${roomCode}`,
        },
        () => {
          alert("Host has closed this room");
          document.cookie = "player_nickname=; path=/; Max-Age=0;";
          document.cookie = "player_id=; path=/; Max-Age=0;";
          router.replace("/");
        },
      )
      // Listener B: Watch roster changes
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Player",
          filter: `roomCode=eq.${roomCode}`,
        },
        async () => {
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
  }, [roomCode, router]);

  const handleLeaveRoom = async () => {
    const confirmLeave = confirm(
      "Are you sure you want to leave this game lobby?",
    );
    if (!confirmLeave) return;

    try {
      if (playerId) {
        const { error } = await supabase
          .from("Player")
          .delete()
          .eq("id", playerId);

        if (error) throw error;
      }

      document.cookie = "player_id=; path=/; Max-Age=0;";
      document.cookie = "player_nickname=; path=/; Max-Age=0;";
      sessionStorage.removeItem("jumbolash_player_id");
      sessionStorage.removeItem("jumbolash_player_room_code");
      sessionStorage.removeItem("jumbolash_player_name");

      router.push("/");
    } catch (err) {
      console.error("Failed to process lobby exit:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 font-mono text-slate-400">
        <p className="animate-pulse uppercase tracking-widest">
          SYNCING WITH LOBBY...
        </p>
      </div>
    );
  }

  if (error || !roomData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 p-4">
        <div className="w-full max-w-md game-dashboard-card text-center space-y-4">
          <p className="error-text">{error || "ROOM COULD NOT BE LOADED."}</p>
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

  // Active Prompting Phase View
  if (roomData.gameState === "PROMPTING") {
    return (
      <main className="min-h-screen p-8 bg-slate-900 flex flex-col items-center justify-start font-sans relative">
        <PromptForm
          roomCode={roomData.roomCode}
          promptText={roomData.activePrompt?.text || "Prepare your answer!"}
          promptId={roomData.activePrompt?.id || ""}
          timerLimit={roomData.timerLimit || 90}
          roundStartedAt={roomData.roundStartedAt}
          playerId={playerId}
        />
      </main>
    );
  }

  // Default Waiting Lobby View
  return (
    <main className="min-h-screen p-8 bg-slate-900 flex flex-col items-center justify-start font-sans relative">
      <div className="w-full max-w-3xl flex justify-start mb-4 mt-2">
        <button
          onClick={handleLeaveRoom}
          className="game-box-jagged bg-amber-600 text-white px-5 py-2 text-sm cursor-pointer hover:bg-amber-700"
        >
          LEAVE ROOM
        </button>
      </div>

      <div className="w-full max-w-3xl space-y-8">
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
              WAITING LOBBY
            </h2>
            <span className="game-badge">
              PLAYERS JOINED: {roomData.players.length} / 10
            </span>
          </div>
        </div>

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
                  <span className="truncate text-slate-800">
                    {player.nickname}
                  </span>
                  <span className="status-badge-ready shrink-0">READY</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-2 border-black rounded font-mono text-center text-xs text-slate-600 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          THE MATCH WILL COMMENCE AUTOMATICALLY WHEN THE GAME ADMINISTRATOR
          CHANGES THE ROOM STATE.
        </div>
      </div>
    </main>
  );
}
