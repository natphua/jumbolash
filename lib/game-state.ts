/**
 * game-state.ts
 *
 * Contains constants for states of the game, including the different phases
 * and the status of matchups. Also includes utility functions for normalizing
 * timer limits.
 *
 * Created on 2026-07-22 by Natalie Phua.
 */

export const GameState = {
  Lobby: "LOBBY",
  Prompting: "PROMPTING",
  Voting: "VOTING",
  Results: "RESULTS",
} as const;

export type GameStateValue = (typeof GameState)[keyof typeof GameState];

export const MatchupStatus = {
  Pending: "PENDING",
  Active: "ACTIVE",
  Revealed: "REVEALED",
  Complete: "COMPLETE",
} as const;

export type MatchupStatusValue =
  (typeof MatchupStatus)[keyof typeof MatchupStatus];

export const VOTING_SECONDS = 20;
export const POINTS_PER_VOTE = 100;

export function parseGameTimestamp(timestamp: string) {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(timestamp);
  return new Date(hasTimezone ? timestamp : `${timestamp}Z`).getTime();
}
