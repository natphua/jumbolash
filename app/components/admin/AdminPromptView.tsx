/**
 * AdminPromptView.tsx
 *
 * Dedicated host display for the PROMPTING phase.
 * Tracks live player submission counts, displays active prompt text,
 * and renders a synchronized round countdown timer.
 *
 * Created on 2026-07-20 by Natalie Phua.
 */

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface ActivePrompt {
  id: string;
  text: string;
}

interface AdminPromptViewProps {
  roomCode: string;
  activePrompt: ActivePrompt | null;
  totalPlayers: number;
  timerLimit: number; // e.g. 90 seconds
  roundStartedAt: string | null;
}

export default function AdminPromptView({
  roomCode,
  activePrompt,
  totalPlayers,
  timerLimit,
  roundStartedAt,
}: AdminPromptViewProps) {
  const [submissionCount, setSubmissionCount] = useState<number>(0);
  const [isCounterPulsing, setIsCounterPulsing] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(timerLimit);

  // Synchronized countdown calculation
  useEffect(() => {
    if (!roundStartedAt) return;

    const calculateTimeLeft = () => {
      const startTime = new Date(roundStartedAt).getTime();
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - startTime) / 1000);
      const remaining = Math.max(0, timerLimit - elapsedSeconds);
      setTimeLeft(remaining);
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [roundStartedAt, timerLimit]);

  // Live submission listener
  useEffect(() => {
    if (!roomCode) return;

    const fetchSubmissionCount = async () => {
      const { count } = await supabase
        .from("Submission")
        .select("*", { count: "exact", head: true })
        .eq("roomCode", roomCode);

      setSubmissionCount(count || 0);
    };

    fetchSubmissionCount();

    const submissionChannel = supabase
      .channel(`realtime-submissions-${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "Submission",
          filter: `roomCode=eq.${roomCode}`,
        },
        () => {
          setSubmissionCount((prev) => prev + 1);
          setIsCounterPulsing(true);
          setTimeout(() => setIsCounterPulsing(false), 600);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(submissionChannel);
    };
  }, [roomCode]);

  return (
    <main className="min-h-screen p-8 bg-slate-900 text-slate-100 flex flex-col items-center justify-between font-sans relative">
      {/* Top Header Bar */}
      <div className="w-full max-w-5xl flex justify-between items-center border-b-2 border-slate-700 pb-4">
        <span className="font-mono text-sm tracking-widest text-slate-400">
          ROOM CODE: <strong className="text-amber-400">{roomCode}</strong>
        </span>
        <span className="game-badge bg-emerald-600 text-white font-mono uppercase">
          PHASE: PROMPTING
        </span>
      </div>

      {/* Main Content Area */}
      <div className="w-full max-w-4xl flex flex-col items-center text-center my-auto space-y-8">
        {/* Active Prompt Card */}
        <div className="game-dashboard-card w-full bg-slate-800 border-4 border-slate-700 p-8 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.5)]">
          <span className="block font-mono text-xs text-amber-400 tracking-widest uppercase mb-3">
            CURRENT QUESTION
          </span>
          <h1 className="game-header text-3xl md:text-5xl text-white leading-tight">
            &quot;{activePrompt?.text || "Prepare your answers!"}&quot;
          </h1>
        </div>

        {/* Live Metrics: Countdown Timer & Submissions Counter */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
          {/* Synchronized Timer Card */}
          <div className="game-dashboard-card bg-slate-800 border-2 border-slate-700 px-8 py-6 text-center">
            <span className="block font-mono text-xs text-slate-400 tracking-wider uppercase mb-1">
              TIME REMAINING
            </span>
            <span
              className={`text-5xl font-mono font-black ${
                timeLeft <= 10
                  ? "text-rose-500 animate-pulse"
                  : "text-amber-400"
              }`}
            >
              {timeLeft}s
            </span>
          </div>

          {/* Submissions Live Counter */}
          <div className="game-dashboard-card bg-slate-800 border-2 border-slate-700 px-8 py-6 text-center">
            <span className="block font-mono text-xs text-slate-400 tracking-wider uppercase mb-1">
              ANSWERS RECEIVED
            </span>
            <div className="flex items-center justify-center gap-2">
              <span
                className={`text-5xl font-mono font-black text-emerald-400 transition-transform duration-300 ${
                  isCounterPulsing ? "scale-125 text-amber-300" : "scale-100"
                }`}
              >
                {submissionCount}
              </span>
              <span className="text-2xl font-mono text-slate-500">
                / {totalPlayers}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Guidance */}
      <div className="w-full max-w-5xl text-center py-4 border-t border-slate-800 font-mono text-xs text-slate-500 uppercase tracking-widest">
        AWAITING ALL PLAYER SUBMISSIONS OR TIMER EXPIRATION...
      </div>
    </main>
  );
}
