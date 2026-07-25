"use client";

interface LoadingScreenProps {
  className?: string;
}

export default function LoadingScreen({ className = "" }: LoadingScreenProps) {
  return (
    <div
      className={`flex min-h-screen items-center justify-center bg-slate-900 font-mono text-slate-400 ${className}`}
    >
      <div className="flex items-center gap-3 uppercase tracking-widest">
        <span>LOADING</span>
        <span
          aria-hidden="true"
          className="h-5 w-5 rounded-full border-2 border-slate-500 border-t-slate-300 animate-spin"
        />
      </div>
    </div>
  );
}
