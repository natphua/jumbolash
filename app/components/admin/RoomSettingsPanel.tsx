/**
 * RoomSettingsPanel.tsx
 *
 * Handles game constraint modifications, configuration updates,
 * and localized administrative clipboard operations.
 *
 * Created on 2026-07-19 by Natalie Phua.
 */

"use client";

import React from "react";

interface RoomSettingsPanelProps {
  roomCode: string | null;
  rounds: string;
  timer: string;
  playerCount: number;
  validationError: string | null;
  copied: boolean;
  onRoundsChange: (val: string) => void;
  onTimerChange: (val: string) => void;
  onSaveSettings: () => Promise<void>;
  onCopyRoomCode: () => Promise<void>;
}

export default function RoomSettingsPanel({
  roomCode,
  rounds,
  timer,
  playerCount,
  validationError,
  copied,
  onRoundsChange,
  onTimerChange,
  onSaveSettings,
  onCopyRoomCode,
}: RoomSettingsPanelProps) {
  const recommendedRounds = Math.max(
    1,
    playerCount >= 8 ? Math.ceil(playerCount / 2) : playerCount,
  );

  return (
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
            <div
              className="game-input text-center text-2xl tracking-widest bg-slate-100 select-all border-2 border-dashed border-slate-400 pr-20"
              data-testid="room-code-display"
            >
              {roomCode}
            </div>
            <button
              onClick={onCopyRoomCode}
              className="absolute right-3 copy-btn cursor-pointer"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-bold font-mono tracking-wider text-slate-500 mb-1">
            <span>TOTAL MATCH ROUNDS (1-10)</span>
            <span className="group relative inline-flex">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-400 bg-slate-200 text-xs font-black text-slate-600">
                i
              </span>
              <span className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-72 -translate-x-1/2 border-2 border-black bg-slate-100 p-3 text-left font-mono text-xs font-bold leading-relaxed tracking-normal text-slate-700 shadow-[4px_4px_0px_rgba(0,0,0,1)] group-hover:block">
                The total matches is the total number of questions. Although
                everyone will be able to answer for every question, only 2
                random answers per question will be picked for voting (4 random
                answers for 8+ players). It is recommended that you choose at
                least {recommendedRounds} rounds for the maximal playing
                experience.
              </span>
            </span>
          </label>
          <input
            type="number"
            value={rounds}
            onChange={(e) => onRoundsChange(e.target.value)}
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
            onChange={(e) => onTimerChange(e.target.value)}
            className="game-input text-center"
          />
        </div>

        <button
          onClick={onSaveSettings}
          className="game-box-jagged bg-logo-blue w-full py-3 mt-2 text-md text-white cursor-pointer"
        >
          UPDATE GAME RULES
        </button>

        {validationError && (
          <p className="error-text mt-2">{validationError}</p>
        )}
      </div>
    </div>
  );
}
