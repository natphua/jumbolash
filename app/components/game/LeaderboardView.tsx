/**
 * LeaderboardView.tsx
 *
 * Component rendering the final leaderboard of the game. Displays players
 * ranked by their total points, along with their nicknames and point totals.
 *
 * Created on 2026-07-22 by Natalie Phua.
 */

"use client";

import Image from "next/image";
import LeaveRoomButton from "../shared/LeaveRoomButton";

interface LeaderboardPlayer {
  id: string;
  nickname: string;
  points: number;
}

interface LeaderboardViewProps {
  players: LeaderboardPlayer[];
  handleConfirm?: () => void | Promise<void>;
  confirmStatement?: string;
  leaveButtonText?: string;
}

export default function LeaderboardView({
  players,
  handleConfirm,
  confirmStatement,
  leaveButtonText,
}: LeaderboardViewProps) {
  return (
    <main className="relative min-h-screen overflow-hidden p-6 flex items-center justify-center">
      <Image
        src="/backgrounds/yellow-bg.jpg"
        alt=""
        fill
        sizes="100vw"
        className="object-cover -z-10"
      />

      {handleConfirm && confirmStatement && (
        <LeaveRoomButton
          text={leaveButtonText}
          confirmStatement={confirmStatement}
          handleConfirm={handleConfirm}
          className="absolute left-6 top-6 z-10"
        />
      )}

      <section className="w-full max-w-3xl game-dashboard-card space-y-5">
        <div className="text-center border-b-2 border-black pb-3">
          <span className="game-badge">PHASE: RESULTS</span>
          <h1 className="game-header text-3xl mt-3">FINAL LEADERBOARD</h1>
        </div>

        <ol className="space-y-3">
          {players.map((player, index) => (
            <li
              key={player.id}
              className="flex items-center justify-between gap-4 p-4 bg-slate-50 border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
            >
              <span className="font-mono font-black text-xl text-slate-900">
                #{index + 1} {player.nickname}
              </span>
              <span className="game-badge">{player.points} pts</span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
