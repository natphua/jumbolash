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
import { useRouter } from "next/navigation";

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
  const [loading, setLoading] = useState(true);

  const [rounds, setRounds] = useState<string>("3");
  const [timer, setTimer] = useState<string>("90");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

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
        router.push("/");
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
        setRounds(String(roomRes.data.totalRounds));
        setTimer(String(roomRes.data.timerLimit));
      }
      if (playersRes.data) {
        setPlayers(playersRes.data);
      }
      setLoading(false);
    };

    fetchRoomAndPlayers();
  }, [supabase, router]);

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

  const handleRoundsChange = (val: string) => {
    if (val === "") {
      setRounds("0");
      return;
    }
    // Remove leading zero if user starts typing another number
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

    // 1. Enforce validation criteria
    if (isNaN(parsedRounds) || parsedRounds < 1 || parsedRounds > 10) {
      setValidationError("Rounds must be between 1 and 10.");
      return;
    }

    if (isNaN(parsedTimer) || parsedTimer < 30 || parsedTimer > 120) {
      setValidationError("Countdown timer must be between 30 and 120 seconds.");
      return;
    }

    // Clear any active errors if passing checks
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
      "Are you sure you want to completely end this game session? All players will be disconnected.",
    );
    if (!confirmEnd) return;

    try {
      // 1. Terminate the database room record (Cascade rules will wipe out the Player records)
      await supabase.from("Room").delete().eq("roomCode", roomCode);

      // 2. Erase the tracking credentials from the local browser cookies
      document.cookie = "hosted_room_code=; path=/; maxAge=-1;";

      // 3. Return the host back to the main management hub
      router.replace("/");
    } catch (err) {
      console.error("Failed to cleanly dissolve game room:", err);
    }
  };

  return (
    <main className="min-h-screen p-8 bg-slate-900 text-slate-800 font-sans flex flex-col items-center justify-start relative">
      {/* Top Left Navigation Action Row */}
      <div className="w-full max-w-6xl flex justify-start mb-4 mt-2">
        <button
          onClick={handleEndRoom}
          className="game-box-jagged bg-rose-700 text-white px-5 py-2 text-sm cursor-pointer hover:bg-rose-800"
        >
          END ROOM
        </button>
      </div>

      <div className="w-full max-w-6xl flex flex-col md:flex-row gap-8 items-start justify-center">
        {/* Settings Configuration Card Panel */}
        <div className="w-full md:w-1/3 game-dashboard-card">
          <h2 className="game-header text-xl mb-4 border-b-2 border-black pb-2">
            ROOM CONFIGURATIONS
          </h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-bold font-mono tracking-wider text-slate-500 mb-1">
                ROOM CODE
              </label>
              <div className="relative flex items-center">
                <div className="game-input text-center text-2xl tracking-widest bg-slate-100 select-all border-2 border-dashed border-slate-400 pr-20">
                  {roomCode}
                </div>
                <button
                  onClick={copyRoomCode}
                  className="absolute right-3 copy-btn cursor-pointer"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold font-mono tracking-wider text-slate-500 mb-1">
                TOTAL MATCH ROUNDS (1-10)
              </label>
              <input
                type="number"
                value={rounds}
                onChange={(e) => handleRoundsChange(e.target.value)}
                className="game-input text-center"
              />
            </div>

            <div>
              <label className="block text-sm font-bold font-mono tracking-wider text-slate-500 mb-1">
                ANSWER COUNTDOWN TIMER (30-120 SEC)
              </label>
              <input
                type="number"
                value={timer}
                onChange={(e) => handleTimerChange(e.target.value)}
                className="game-input text-center"
              />
            </div>

            <button
              onClick={saveSettings}
              className="game-box-jagged bg-logo-blue w-full py-3 mt-2 text-md text-white cursor-pointer"
            >
              UPDATE GAME RULES
            </button>

            {validationError && (
              <p className="error-text mt-2">{validationError}</p>
            )}
          </div>
        </div>

        {/* Real-time Connected Players Tracking Grid */}
        <div className="w-full md:w-2/3 game-dashboard-card min-h-100">
          <div className="flex justify-between items-center mb-6 border-b-2 border-black pb-2">
            <h2 className="game-header text-xl">WAITING ARENA LOBBY</h2>
            <span className="game-badge">
              PLAYERS JOINED: {players.length}{" "}
            </span>
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
      </div>
    </main>
  );
}
