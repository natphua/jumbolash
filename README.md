# JumboLash

JumboLash is a fast-paced party game inspired by Jackbox’s Quiplash, with prompts tailored for Tufts students.

This project was built for JumboCode’s weekly hacknights.

## Gameplay Overview

JumboLash has four phases:

### 1. Lobby

Players join a room while the admin configures the game settings, including the prompts and answer timer.

A room must have at least 3 players or teams before the game can begin.

### 2. Prompting

All players answer the same prompts.

If a player does not submit an answer before time runs out, their response is recorded as blank and may still appear during voting.

### 3. Voting

Players vote on their favorite response for each prompt.

For rooms with fewer than 8 players, responses are shown in pairs. For rooms with 8+ players, 4 random responses are shown per prompt.

Players cannot vote on matchups that include their own response. Each vote is worth 100 points.

To give players roughly equal scoring opportunities, admins are encouraged to use:

- `# of players` prompts for rooms with fewer than 8 players
- `# of players / 2` prompts for rooms with 8 or more players

The matchup algorithm tries to keep response appearances balanced, with a max variance of 1 when possible. Blank responses are given the lowest priority.

### 4. Results

After voting ends, players see the final scoreboard. The top 3 players are highlighted.

## Tech Stack

Frontend: Next.js, Tailwind CSS, Typescript

Backend: Next.js serverless API routes, with Supabase database managed via Prisma ORM

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Then open [http://localhost:3000](http://localhost:3000) with your browser to
see the result.
