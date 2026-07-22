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

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/supabase/client";
import { normalizeTimerLimitSeconds } from "@/lib/game-state";

interface ActivePrompt {
  id: string;
  text: string;
}

interface AdminPromptViewProps {
  roomCode: string;
  activePrompt: ActivePrompt | null;
  totalPlayers: number;
  timerLimit: number;
  roundStartedAt: string | null;
  currentRound: number;
  totalRounds: number;
}

export default function AdminPromptView({
  roomCode,
  activePrompt,
  totalPlayers,
  timerLimit,
  roundStartedAt,
  currentRound,
  totalRounds,
}: AdminPromptViewProps) {
  const timerLimitSeconds = normalizeTimerLimitSeconds(timerLimit);
  const [submissionCount, setSubmissionCount] = useState<number>(0);
  const [isCounterPulsing, setIsCounterPulsing] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number>(timerLimitSeconds);
  const displayedTimeLeft = roundStartedAt ? timeLeft : timerLimitSeconds;
  const hasTransitionedRef = useRef(false);

  useEffect(() => {
    hasTransitionedRef.current = false;
  }, [roomCode, activePrompt?.id]);

  useEffect(() => {
    if (!roundStartedAt) return;

    const calculateRemaining = () => {
      const start = new Date(roundStartedAt).getTime();
      const elapsedSeconds = Math.floor((Date.now() - start) / 1000);
      setTimeLeft(Math.max(0, timerLimitSeconds - elapsedSeconds));
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);

    return () => clearInterval(interval);
  }, [roundStartedAt, timerLimitSeconds]);

  useEffect(() => {
    const everyoneSubmitted = totalPlayers > 0 && submissionCount >= totalPlayers;
    const timerExpired = displayedTimeLeft <= 0;

    if ((!timerExpired && !everyoneSubmitted) || hasTransitionedRef.current) {
      return;
    }

    hasTransitionedRef.current = true;
    fetch(`/api/room/${roomCode}/transition`, { method: "POST" })
      .then((response) => {
        if (!response.ok) {
          hasTransitionedRef.current = false;
        }
      })
      .catch((err) => {
        console.error("Failed to transition to voting:", err);
        hasTransitionedRef.current = false;
      });
  }, [displayedTimeLeft, roomCode, submissionCount, totalPlayers]);

  useEffect(() => {
    if (!roomCode) return;

    const fetchResponseCount = async () => {
      const response = await fetch(`/api/room/${roomCode}/responses/count`);
      const data = await response.json();

      if (!response.ok) {
        console.error("Error fetching response count:", data.error);
        return;
      }

      setSubmissionCount(data.count || 0);
    };

    fetchResponseCount();

    // real-time listener for new responses
    const responseChannel = supabase
      .channel(`realtime-responses-${roomCode}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "Response",
          filter: `roomCode=eq.${roomCode}`,
        },
        () => {
          setSubmissionCount((prev) => prev + 1);
          setIsCounterPulsing(true);
          setTimeout(() => setIsCounterPulsing(false), 600);
        },
      )
      .subscribe();

    const fallbackRefresh = window.setInterval(fetchResponseCount, 1500);

    return () => {
      window.clearInterval(fallbackRefresh);
      supabase.removeChannel(responseChannel);
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
          <span className="block font-mono text-md text-amber-400 tracking-widest uppercase mb-3">
            QUESTION {currentRound} OF {totalRounds}
          </span>
          <h1 className="game-header text-3xl md:text-5xl text-white leading-tight">
            &quot;{activePrompt?.text || "Prepare your answers!"}&quot;
          </h1>
        </div>

        {/* Live Metrics: Countdown Timer & Submissions Counter */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full">
          {/* Synchronized Timer Card */}
          <div className="game-dashboard-card bg-slate-800 border-2 border-slate-700 px-8 py-6 text-center">
            <span className="block font-mono text-sm text-slate-400 tracking-wider uppercase mb-1">
              TIME REMAINING
            </span>
            <span
              className={`text-5xl font-mono font-black ${
                displayedTimeLeft <= 10
                  ? "text-rose-500 animate-pulse"
                  : "text-amber-400"
              }`}
            >
              {displayedTimeLeft}s
            </span>
          </div>

          {/* Submissions Live Counter */}
          <div className="game-dashboard-card bg-slate-800 border-2 border-slate-700 px-8 py-6 text-center">
            <span className="block font-mono text-sm text-slate-400 tracking-wider uppercase mb-1">
              ANSWERS RECEIVED
            </span>
            <div className="flex items-center justify-center gap-2">
              <span
                className={`text-3xl font-mono font-black text-emerald-400 transition-transform duration-300 ${
                  isCounterPulsing ? "scale-125 text-amber-300" : "scale-100"
                }`}
              >
                {submissionCount}
              </span>
              <span className="text-3xl font-mono text-slate-500">
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
