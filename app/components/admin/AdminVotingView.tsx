/**
 * AdminVotingView.tsx
 *
 * Admin component rendering the voting phase of the game. Displays the
 * current matchup, voting countdown, and vote tallies for each response.
 * Automatically transitions to the next matchup when the voting timer expires.
 *
 * Created on 2026-07-22 by Natalie Phua.
 */

"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { parseGameTimestamp, VOTING_SECONDS } from "@/lib/game-state";
import LoadingScreen from "../game/LoadingScreen";

interface VotingResponse {
  id: string;
  text: string;
  authorNickname: string;
  voteCount: number;
  voters: Array<{ playerId: string; nickname: string }>;
}

interface CurrentMatchup {
  id: string;
  matchupIndex: number;
  prompt: {
    text: string;
  } | null;
  responseA: VotingResponse | null;
  responseB: VotingResponse | null;
  eligibleVoteCount: number;
  submittedVoteCount: number;
}

interface AdminVotingViewProps {
  roomCode: string;
  currentMatchup: CurrentMatchup | null;
  votingStartedAt: string | null;
}

export default function AdminVotingView({
  roomCode,
  currentMatchup,
  votingStartedAt,
}: AdminVotingViewProps) {
  const [timeLeft, setTimeLeft] = useState(VOTING_SECONDS);
  const hasTransitionedRef = useRef(false);

  useEffect(() => {
    hasTransitionedRef.current = false;
  }, [currentMatchup?.id]);

  useEffect(() => {
    if (!votingStartedAt) return;

    const calculateRemaining = () => {
      const start = parseGameTimestamp(votingStartedAt);
      const elapsedSeconds = Math.floor((Date.now() - start) / 1000);
      setTimeLeft(Math.max(0, VOTING_SECONDS - elapsedSeconds));
    };

    calculateRemaining();
    const interval = window.setInterval(calculateRemaining, 1000);

    return () => window.clearInterval(interval);
  }, [votingStartedAt]);

  useEffect(() => {
    if (timeLeft > 0 || hasTransitionedRef.current) return;

    hasTransitionedRef.current = true;
    fetch(`/api/room/${roomCode}/transition`, { method: "POST" })
      .then((response) => {
        if (!response.ok) {
          hasTransitionedRef.current = false;
        }
      })
      .catch((err) => {
        console.error("Failed to advance voting matchup:", err);
        hasTransitionedRef.current = false;
      });
  }, [roomCode, timeLeft]);

  if (!currentMatchup) {
    return <LoadingScreen />;
  }

  const responses = [currentMatchup.responseA, currentMatchup.responseB].filter(
    Boolean,
  ) as VotingResponse[];
  const highestVoteCount = Math.max(
    ...responses.map((response) => response.voteCount),
    0,
  );
  const isRevealReady =
    currentMatchup.eligibleVoteCount > 0 &&
    currentMatchup.submittedVoteCount >= currentMatchup.eligibleVoteCount;

  return (
    <main className="relative min-h-screen overflow-hidden p-8 text-slate-100 flex flex-col items-center gap-8">
      <Image
        src="/backgrounds/purple-bg.png"
        alt=""
        fill
        sizes="100vw"
        className="object-cover -z-10"
      />
      <div className="w-full max-w-5xl flex justify-between items-center border-b-2 border-slate-700 pb-4">
        <span className="font-mono text-sm tracking-widest text-slate-400">
          ROOM CODE: <strong className="text-amber-400">{roomCode}</strong>
        </span>
        <span className="game-badge bg-emerald-600 text-white font-mono uppercase">
          PHASE: VOTING
        </span>
      </div>

      <section className="w-full max-w-5xl text-center space-y-4">
        <p className="game-voting-banner">Vote for your favorite response</p>
        <h1 className="game-header text-3xl text-white">
          {currentMatchup.prompt?.text || "Vote on the best answer"}
        </h1>
        <p className="font-mono text-5xl font-black text-amber-400">
          {timeLeft}s
        </p>
        <p className="font-mono text-sm text-slate-400 uppercase">
          Votes received: {currentMatchup.submittedVoteCount} /{" "}
          {currentMatchup.eligibleVoteCount}
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl">
        {responses.map((response) => {
          const isWinner =
            isRevealReady &&
            highestVoteCount > 0 &&
            response.voteCount === highestVoteCount;

          return (
            <article
              key={response.id}
              className={`game-chat-bubble ${isWinner ? "is-winning" : ""}`}
            >
              <p className="text-xl font-mono text-slate-900">
                {response.text}
              </p>
              {isRevealReady ? (
                <>
                  <div className="game-author-reveal">
                    {response.authorNickname}
                  </div>
                  <div className="game-voter-row">
                    {response.voters.map((voter) => (
                      <span key={voter.playerId} className="game-voter-tag">
                        {voter.nickname}
                      </span>
                    ))}
                    <span className="game-vote-count-badge">
                      {response.voteCount}
                    </span>
                  </div>
                </>
              ) : (
                <p className="mt-5 font-mono text-sm uppercase tracking-wider text-slate-700">
                  Authors hidden until voting closes
                </p>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
