/**
 * AdminRosterPanel.tsx
 *
 * Manages player roster listings and handles game launch control operations.
 *
 * Created on 2026-07-19 by Natalie Phua.
 */

"use client";

import React from "react";

interface Player {
  id: string;
  nickname: string;
}

interface AdminRosterPanelProps {
  players: Player[];
}

export default function AdminRosterPanel({ players }: AdminRosterPanelProps) {
  return (
    <div className="w-full md:w-2/3 game-dashboard-card min-h-100">
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
  );
}
