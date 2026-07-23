/**
 * VotingForm.tsx
 *
 * Component rendering the voting form for a specific matchup in the game.
 * Displays the prompt and two responses, allowing players to vote for their
 * preferred response. Handles vote submission and displays feedback messages.
 *
 * Created on 2026-07-22 by Natalie Phua.
 */

"use client";

import Image from "next/image";
import { useState } from "react";

interface VotingResponse {
  id: string;
  text: string;
  playerId: string;
  authorNickname: string;
}

interface CurrentMatchup {
  id: string;
  matchupIndex: number;
  prompt: {
    text: string;
  } | null;
  responseA: VotingResponse | null;
  responseB: VotingResponse | null;
}

interface VotingFormProps {
  roomCode: string;
  matchup: CurrentMatchup;
  playerId: string | null;
}

export default function VotingForm({
  roomCode,
  matchup,
  playerId,
}: VotingFormProps) {
  const [selectedResponseId, setSelectedResponseId] = useState<string | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);

  const responses = [matchup.responseA, matchup.responseB].filter(
    Boolean,
  ) as VotingResponse[];
  const ownsMatchup = responses.some(
    (response) => response.playerId === playerId,
  );
  const backgroundSrc = "/backgrounds/purple-bg.png";

  const submitVote = async (responseId: string) => {
    if (!playerId || ownsMatchup || submitting || hasVoted) return;

    setSelectedResponseId(responseId);
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/room/${roomCode}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          matchupId: matchup.id,
          selectedResponseId: responseId,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to submit vote.");
      }

      setHasVoted(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "An unknown error occurred.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden p-6 flex items-center justify-center">
      <Image
        src={backgroundSrc}
        alt=""
        fill
        sizes="100vw"
        className="object-cover -z-10"
      />

      <div className="w-full max-w-4xl space-y-6">
        <div className="game-dashboard-card text-center space-y-3">
          <span className="game-badge">PHASE: VOTING</span>
          <h1 className="game-header mt-4 text-2xl text-slate-900">
            {matchup.prompt?.text || "Vote on the best answer"}
          </h1>
          <p className="font-mono text-sm uppercase tracking-wider text-slate-600">
            Choose the response you think best answered the prompt
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {responses.map((response) => (
            <button
              key={response.id}
              type="button"
              disabled={ownsMatchup || submitting || hasVoted}
              onClick={() => submitVote(response.id)}
              className={`game-vote-option ${
                selectedResponseId === response.id ? "is-selected" : ""
              }`}
            >
              {response.text}
            </button>
          ))}
        </div>

        {ownsMatchup && (
          <p className="game-dashboard-card text-center font-mono text-sm uppercase text-slate-700">
            This matchup includes your answer, so you cannot vote here.
          </p>
        )}

        {hasVoted && (
          <p className="game-dashboard-card text-center font-mono text-sm uppercase text-emerald-800">
            Vote locked in. Waiting for the next matchup...
          </p>
        )}

        {errorMessage && <p className="error-text">{errorMessage}</p>}
      </div>
    </main>
  );
}
