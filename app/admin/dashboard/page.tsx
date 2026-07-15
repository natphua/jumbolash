/**
 * page.tsx (admin/dashboard)
 *
 * Renders the master administrative dashboard panel. Verifies hosting privileges
 * by checking active session cookies, configures game parameters, and lists
 * players in real-time.
 *
 * Created on 2026-07-15 by Natalie Phua.
 */

"use client";

import { useEffect, useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

interface Player {
  id: string;
  nickname: string;
}

export default function AdminDashboard() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );

  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [rounds, setRounds] = useState(3);
  const [timer, setTimer] = useState(90);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRoomAndPlayers = async () => {
      // Pull host credentials from the cookie
      const cookies = document.cookie.split("; ");
      const roomCookie = cookies.find((row) =>
        row.startsWith("hosted_room_code="),
      );
      const code = roomCookie ? roomCookie.split("=")[1] : null;

      if (!code) {
        alert("No active game room found for this hosting session.");
        window.location.href = "/";
        return;
      }

      setRoomCode(code);

      // Fetch parameters and players using the public Supabase clients
      const [roomRes, playersRes] = await Promise.all([
        supabase
          .from("Room")
          .select("totalRounds, timerLimit")
          .eq("roomCode", code)
          .single(),
        supabase.from("Player").select("id, nickname").eq("roomCode", code),
      ]);

      if (roomRes.data) {
        setRounds(roomRes.data.totalRounds);
        setTimer(roomRes.data.timerLimit);
      }
      if (playersRes.data) {
        setPlayers(playersRes.data);
      }
      setLoading(false);
    };

    fetchRoomAndPlayers();
  }, [supabase]);

  // Set up real-time socket listener
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
  }, [roomCode, supabase]);

  const saveSettings = async () => {
    if (!roomCode) return;

    const { error } = await supabase
      .from("Room")
      .update({ totalRounds: rounds, timerLimit: timer })
      .eq("roomCode", roomCode);

    if (error)
      alert("Failed to save parameter configurations: " + error.message);
    else alert("Match configurations updated successfully.");
  };

  if (loading || !roomCode) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-mono">
        ESTABLISHING MASTER HOST SESSION...
      </div>
    );
  }

  return (
    <main className="min-h-screen p-8 bg-slate-900 mt-5 text-slate-800 font-sans flex flex-col md:flex-row gap-8 items-start justify-center">
      {/* Settings Configuration Card Panel */}
      <div className="w-full md:w-1/3 game-dashboard-card">
        <h2 className="game-header text-xl mb-4 border-b-2 border-black pb-2">
          ROOM CONFIGURATIONS
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-s font-bold font-mono tracking-wider text-slate-500 mb-1">
              ROOM CODE
            </label>
            <div className="game-input text-center text-4xl tracking-widest bg-slate-100 select-all border-2 border-dashed border-slate-400">
              {roomCode}
            </div>
          </div>

          <div>
            <label className="block text-s font-bold font-mono tracking-wider text-slate-500 mb-1">
              TOTAL MATCH ROUNDS
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
              className="game-input text-center"
            />
          </div>

          <div>
            <label className="block text-s font-bold font-mono tracking-wider text-slate-500 mb-1">
              ANSWER COUNTDOWN TIMER (SEC)
            </label>
            <input
              type="number"
              min={10}
              max={300}
              step={5}
              value={timer}
              onChange={(e) => setTimer(Number(e.target.value))}
              className="game-input text-center"
            />
          </div>

          <button
            onClick={saveSettings}
            className="game-box-jagged bg-logo-blue w-full py-3 mt-2 text-md text-white cursor-pointer"
          >
            UPDATE GAME RULES
          </button>
        </div>
      </div>

      {/* Real-time Connected Players Tracking Grid */}
      <div className="w-full md:w-2/3 game-dashboard-card min-h-[400px]">
        <div className="flex justify-between items-center mb-6 border-b-2 border-black pb-2">
          <h2 className="game-header text-xl">WAITING ARENA LOBBY</h2>
          <span className="game-badge">PLAYERS JOINED: {players.length}</span>
        </div>

        {players.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="font-mono text-m text-slate-400 animate-pulse uppercase tracking-widest">
              WAITING FOR TEAMS TO JOIN...
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {players.map((player) => (
              <div
                key={player.id}
                className="p-3 bg-slate-50 border-2 border-black font-mono font-bold text-center uppercase text-sm rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] truncate"
              >
                {player.nickname}
              </div>
            ))}
          </div>
        )}

        {players.length >= 2 && (
          <button className="game-box-jagged bg-logo-green w-full py-4 mt-8 text-xl text-white cursor-pointer">
            LAUNCH MATCH STATE
          </button>
        )}
      </div>
    </main>
  );
}
