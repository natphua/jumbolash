/**
 * page.tsx
 *
 * The main page component for the application, rendering the lobby interface
 * and managing the overall layout.
 *
 * Created on 2026-07-12 by Natalie Phua.
 */

import Image from "next/image";
import LobbyManager from "./components/lobby/LobbyManager";

export default function Home() {
  return (
    <main className="relative flex flex-col items-center justify-center min-h-screen px-4 overflow-hidden">
      {/* 1. Full-screen background image */}
      <div className="absolute inset-0 -z-10">
        <Image
          src="/backgrounds/purple-bg.png"
          alt="Game Background"
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
      </div>

      {/* 2. Logo & Subheading Group */}
      <div className="flex flex-col items-center mb-10 z-10 text-center max-w-lg">
        <Image
          src="/jumbolash-logo.png"
          alt="JumboLash Logo"
          width={450}
          height={200}
          priority
          style={{ width: "100%", height: "auto" }}
          className="drop-shadow-[0_8px_0_rgba(0,0,0,1)] object-contain"
        />
      </div>

      {/* 3. Lobby UI Module container */}
      <LobbyManager />
    </main>
  );
}
