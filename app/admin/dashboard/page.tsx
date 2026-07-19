/**
 * page.tsx (admin/dashboard)
 *
 * Handles admin live sockets, game configuration updates, and real-time roster
 * syncrhonization via Supabase. Provides a single-page interface for game
 * hosting and management.
 *
 * Created on 2026-07-15 by Natalie Phua.
 */

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import RoomSettingsPanel from "../../components/admin/RoomSettingsPanel";
import AdminRosterPanel from "../../components/admin/AdminRosterPanel";

interface Player {
  id: string;
  nickname: string;
}

export default function AdminDashboard() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  const [rounds, setRounds] = useState<string>("3");
  const [timer, setTimer] = useState<string>("90");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  // Effect 1: Fetches the room code and initial player roster on mount
  useEffect(() => {
    let isActive = true;

    const fetchRoomAndPlayers = async () => {
      const cookies = document.cookie.split("; ");
      const roomCookie = cookies.find((row) =>
        row.startsWith("hosted_room_code="),
      );
      const code = roomCookie ? roomCookie.split("=")[1] : null;

      if (!code) {
        alert("No active game room found for this hosting session.");
        router.push("/");
        return;
      }

      if (!isActive) return;

      setRoomCode(code);

      const [roomRes, playersRes] = await Promise.all([
        supabase
          .from("Room")
          .select("totalRounds, timerLimit")
          .eq("roomCode", code)
          .single(),
        supabase.from("Player").select("id, nickname").eq("roomCode", code),
      ]);

      if (!isActive) return;

      if (roomRes.data) {
        setRounds(String(roomRes.data.totalRounds));
        setTimer(String(roomRes.data.timerLimit));
      }
      if (playersRes.data) {
        setPlayers(playersRes.data);
      }
      setLoading(false);
    };

    fetchRoomAndPlayers();

    return () => {
      isActive = false;
    };
  }, [router]);

  // Effect 2: Sets up supabase real-time subscription for player roster changes
  useEffect(() => {
    if (!roomCode) return;

    const channel = supabase
      .channel(`realtime-players-${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Player",
          filter: `roomCode=eq.${roomCode}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setPlayers((prev) => [...prev, payload.new as Player]);
          } else if (payload.eventType === "DELETE") {
            setPlayers((prev) => prev.filter((p) => p.id !== payload.old.id));
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomCode]);

  const handleRoundsChange = (val: string) => {
    if (val === "") {
      setRounds("0");
      return;
    }
    const parsed = val.replace(/^0+/, "");
    setRounds(parsed === "" ? "0" : parsed);
  };

  const handleTimerChange = (val: string) => {
    if (val === "") {
      setTimer("0");
      return;
    }
    const parsed = val.replace(/^0+/, "");
    setTimer(parsed === "" ? "0" : parsed);
  };

  const saveSettings = async () => {
    if (!roomCode) return;

    const parsedRounds = parseInt(rounds, 10);
    const parsedTimer = parseInt(timer, 10);

    if (isNaN(parsedRounds) || parsedRounds < 1 || parsedRounds > 10) {
      setValidationError("Rounds must be between 1 and 10.");
      return;
    }

    if (isNaN(parsedTimer) || parsedTimer < 30 || parsedTimer > 120) {
      setValidationError("Countdown timer must be between 30 and 120 seconds.");
      return;
    }

    setValidationError(null);

    const { error } = await supabase
      .from("Room")
      .update({ totalRounds: parsedRounds, timerLimit: parsedTimer })
      .eq("roomCode", roomCode);

    if (error) {
      setValidationError(
        "Failed to save parameter configurations: " + error.message,
      );
    } else {
      alert("Match configurations updated successfully.");
    }
  };

  const copyRoomCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err: unknown) {
      console.error("Failed to copy text: ", err);
    }
  };

  const handleEndRoom = async () => {
    if (!roomCode) return;

    const confirmEnd = confirm(
      "Are you sure you want to end this game session? All players will be disconnected.",
    );
    if (!confirmEnd) return;

    try {
      const { error } = await supabase
        .from("Room")
        .delete()
        .eq("roomCode", roomCode);

      if (error) throw error;

      document.cookie = "hosted_room_code=; path=/; Max-Age=0;";
      router.replace("/");
    } catch (err) {
      console.error("Failed to cleanly dissolve game room:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900 font-mono text-slate-400">
        <p className="animate-pulse uppercase tracking-widest">
          SYNCING HOST DASHBOARD...
        </p>
      </div>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-slate-900 text-slate-800 font-sans flex flex-col items-center justify-start relative">
      <div className="w-full max-w-6xl flex justify-start mb-4 mt-2">
        <button
          onClick={handleEndRoom}
          className="game-box-jagged bg-rose-700 text-white px-5 py-2 text-sm cursor-pointer hover:bg-rose-800"
        >
          END ROOM
        </button>
      </div>

      <div className="w-full max-w-6xl flex flex-col md:flex-row gap-8 items-start justify-center">
        <RoomSettingsPanel
          roomCode={roomCode}
          rounds={rounds}
          timer={timer}
          validationError={validationError}
          copied={copied}
          onRoundsChange={handleRoundsChange}
          onTimerChange={handleTimerChange}
          onSaveSettings={saveSettings}
          onCopyRoomCode={copyRoomCode}
        />

        <AdminRosterPanel players={players} />
      </div>
    </main>
  );
}
