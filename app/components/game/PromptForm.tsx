/**
 * PromptForm.tsx
 *
 * Interactive player prompt response form. Manages synchronized countdowns,
 * 120-character bounds, client submission locking, and post-submit view states.
 *
 * Created on 2026-07-19 by Natalie Phua.
 */

"use client";

import { useState, useEffect, useRef } from "react";
import { normalizeTimerLimitSeconds } from "@/lib/game-state";

interface PromptFormProps {
  roomCode: string;
  promptText: string;
  promptId: string;
  timerLimit: number;
  roundStartedAt: string | null;
  playerId: string | null;
}

export default function PromptForm({
  roomCode,
  promptText,
  promptId,
  timerLimit,
  roundStartedAt,
  playerId,
}: PromptFormProps) {
  const timerLimitSeconds = normalizeTimerLimitSeconds(timerLimit);
  const [answer, setAnswer] = useState("");
  const [timeLeft, setTimeLeft] = useState<number>(timerLimitSeconds);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const displayedTimeLeft = roundStartedAt ? timeLeft : timerLimitSeconds;
  const hasTransitionedRef = useRef(false);

  // Synchronized countdown calculation
  useEffect(() => {
    if (!roundStartedAt) return;

    const calculateRemaining = () => {
      const start = new Date(roundStartedAt).getTime();
      const elapsedSeconds = Math.floor((Date.now() - start) / 1000);
      const remaining = Math.max(0, timerLimitSeconds - elapsedSeconds);
      setTimeLeft(remaining);
    };

    calculateRemaining();
    const interval = setInterval(calculateRemaining, 1000);

    return () => clearInterval(interval);
  }, [roundStartedAt, timerLimitSeconds]);

  useEffect(() => {
    if (displayedTimeLeft > 0 || hasTransitionedRef.current) return;

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
  }, [displayedTimeLeft, roomCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !answer.trim() ||
      !playerId ||
      isSubmitted ||
      displayedTimeLeft === 0 ||
      submitting
    ) {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/room/${roomCode}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          promptId,
          text: answer.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to submit answer.");
      }

      setIsSubmitted(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "An unknown error occurred.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const isLocked = isSubmitted || displayedTimeLeft === 0 || submitting;

  return (
    <div className="w-full max-w-3xl space-y-6">
      {/* Header Panel with Timer */}
      <div className="game-dashboard-card flex items-center justify-between">
        <div>
          <span className="block text-xs font-bold font-mono tracking-wider text-slate-500 mb-1">
            ROUND IN PROGRESS
          </span>
          <h2 className="game-header text-xl">SUBMIT YOUR ANSWER</h2>
        </div>
        <div className="text-right">
          <span className="block text-xs font-bold font-mono tracking-wider text-slate-500 mb-1">
            TIME REMAINING
          </span>
          <span
            className={`font-mono font-bold text-3xl px-3 py-1 border-2 border-black rounded ${
              displayedTimeLeft <= 10
                ? "bg-rose-600 text-white animate-bounce"
                : "bg-amber-300 text-slate-900"
            }`}
          >
            {displayedTimeLeft}s
          </span>
        </div>
      </div>

      {/* Main Prompt Card */}
      <div className="game-dashboard-card space-y-6">
        <div className="p-6 bg-slate-100 border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          <p className="font-mono text-sm uppercase tracking-wider text-slate-500 mb-2">
            PROMPT
          </p>
          <h1 className="game-header text-2xl text-slate-900">
            {promptText || "Waiting for prompt distribution..."}
          </h1>
        </div>

        {/* Answer Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value.slice(0, 120))}
              disabled={isLocked}
              placeholder={
                displayedTimeLeft === 0
                  ? "TIME IS UP!"
                  : isSubmitted
                    ? "ANSWER LOCKED IN!"
                    : "Type your witty answer here..."
              }
              rows={3}
              className="game-input w-full p-3 resize-none disabled:bg-slate-200 disabled:cursor-not-allowed"
            />
            <div className="absolute bottom-3 right-3 font-mono text-xs text-slate-500">
              {answer.length} / 120
            </div>
          </div>

          {errorMessage && <p className="error-text text-sm">{errorMessage}</p>}

          <button
            type="submit"
            disabled={isLocked || !answer.trim()}
            className="game-box-jagged bg-logo-green w-full py-3 text-lg text-white cursor-pointer disabled:bg-slate-400 disabled:cursor-not-allowed"
          >
            {isSubmitted
              ? "SUBMISSION RECEIVED"
              : submitting
                ? "LOCKING IN..."
                : displayedTimeLeft === 0
                  ? "TIME EXPIRED"
                  : "SUBMIT ANSWER"}
          </button>
        </form>
      </div>

      {/* Confirmation Callout */}
      {isSubmitted && (
        <div className="p-4 bg-emerald-100 border-2 border-emerald-800 text-emerald-900 font-mono text-center text-sm rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          YOUR ANSWER HAS BEEN RECORDED. WAITING FOR OTHER PLAYERS...
        </div>
      )}
    </div>
  );
}
