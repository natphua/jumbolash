/*
  Warnings:

  - A unique constraint covering the columns `[roomCode,nickname]` on the table `Player` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "adminId" TEXT,
ADD COLUMN     "timerLimit" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "totalRounds" INTEGER NOT NULL DEFAULT 3;

-- CreateIndex
CREATE UNIQUE INDEX "Player_roomCode_nickname_key" ON "Player"("roomCode", "nickname");
