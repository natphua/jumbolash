-- Add room-scoped prompt usage and voting progression fields.
ALTER TABLE "Room"
ADD COLUMN "usedPromptIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "activeMatchupIndex" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "votingStartedAt" TIMESTAMP(3),
ADD COLUMN "revealStartedAt" TIMESTAMP(3);

-- Store response pairings for each round.
CREATE TABLE "Matchup" (
  "id" TEXT NOT NULL,
  "roomCode" TEXT NOT NULL,
  "promptId" TEXT NOT NULL,
  "responseAId" TEXT NOT NULL,
  "responseBId" TEXT,
  "roundNumber" INTEGER NOT NULL,
  "matchupIndex" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Matchup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Matchup_roomCode_roundNumber_matchupIndex_key"
ON "Matchup"("roomCode", "roundNumber", "matchupIndex");

ALTER TABLE "Matchup"
ADD CONSTRAINT "Matchup_roomCode_fkey"
FOREIGN KEY ("roomCode") REFERENCES "Room"("roomCode")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Matchup"
ADD CONSTRAINT "Matchup_promptId_fkey"
FOREIGN KEY ("promptId") REFERENCES "Prompt"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Matchup"
ADD CONSTRAINT "Matchup_responseAId_fkey"
FOREIGN KEY ("responseAId") REFERENCES "Response"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Matchup"
ADD CONSTRAINT "Matchup_responseBId_fkey"
FOREIGN KEY ("responseBId") REFERENCES "Response"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Store one vote per eligible player per matchup.
CREATE TABLE "Vote" (
  "id" TEXT NOT NULL,
  "roomCode" TEXT NOT NULL,
  "matchupId" TEXT NOT NULL,
  "voterPlayerId" TEXT NOT NULL,
  "selectedResponseId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Vote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Vote_matchupId_voterPlayerId_key"
ON "Vote"("matchupId", "voterPlayerId");

ALTER TABLE "Vote"
ADD CONSTRAINT "Vote_roomCode_fkey"
FOREIGN KEY ("roomCode") REFERENCES "Room"("roomCode")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Vote"
ADD CONSTRAINT "Vote_matchupId_fkey"
FOREIGN KEY ("matchupId") REFERENCES "Matchup"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Vote"
ADD CONSTRAINT "Vote_voterPlayerId_fkey"
FOREIGN KEY ("voterPlayerId") REFERENCES "Player"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Vote"
ADD CONSTRAINT "Vote_selectedResponseId_fkey"
FOREIGN KEY ("selectedResponseId") REFERENCES "Response"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
