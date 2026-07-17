/**
 * LobbyManager.tsx
 *
 * Manages the lobby interface, providing users with options to either host a
 * game (admin) or join a game (team). Handles user input for room codes and
 * team nicknames, executing room generation without requiring account login.
 *
 * Created on 2026-07-15 by Natalie Phua.
 */

"use client";

import { useState } from "react";

export default function LobbyManager() {
  const [view, setView] = useState<"home" | "join">("home");
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("jumbolash_player_name") || "";
    }
    return "";
  });

  const handleHostGame = async () => {
    try {
      const res = await fetch("/api/room", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      window.location.href = "/admin/dashboard";
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Room creation failed";
      alert(message);
    }
  };

  const handlePlayerJoin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!nickname || !roomCode) return alert("Fields cannot be blank!");
    localStorage.setItem("jumbolash_player_name", nickname);
    window.location.href = `/room/${roomCode.toUpperCase()}`;
  };

  return (
    <div className="w-full max-w-md p-8 bg-white border-4 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] z-10 clip-path-[polygon(1%_1%,_99%_2%,_100%_98%,_97%_100%,_2%_99%,_0%_96%)]">
      {view === "home" && (
        <div className="space-y-6">
          <button
            onClick={handleHostGame}
            className="game-box-jagged bg-logo-blue w-full py-4 text-xl cursor-pointer"
          >
            Host Game (Admin)
          </button>
          <button
            onClick={() => setView("join")}
            className="game-box-jagged bg-logo-green w-full py-4 text-xl cursor-pointer"
          >
            Join Game (Teams)
          </button>
        </div>
      )}

      {view === "join" && (
        <form onSubmit={handlePlayerJoin} className="space-y-4">
          <h2 className="game-header text-center text-xl mb-2">
            Enter the Arena
          </h2>
          <input
            type="text"
            placeholder="ROOM CODE"
            maxLength={4}
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
            required
            className="game-input text-center tracking-widest"
          />
          <input
            type="text"
            placeholder="TEAM NICKNAME"
            maxLength={16}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required
            className="game-input text-center tracking-wide"
          />
          <div className="flex gap-4 pt-2">
            <button
              type="button"
              onClick={() => setView("home")}
              className="game-box-jagged bg-slate-500 w-1/3 py-2 text-sm cursor-pointer"
            >
              Back
            </button>
            <button
              type="submit"
              className="game-box-jagged bg-logo-green w-2/3 py-2 text-sm cursor-pointer"
            >
              Enter Room
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
