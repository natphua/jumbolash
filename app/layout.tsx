/**
 * layout.tsx
 *
 * Defines the root layout for the application, wrapping all pages with global
 * styles and providing authentication context.
 *
 * Created on: 2026-07-12.
 */

import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";

export const metadata = {
  title: "JumboLash | Tufts Hacknight",
  description: "Fast-paced party game tailored for Tufts CS culture",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-slate-900 text-slate-100 min-h-screen antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
