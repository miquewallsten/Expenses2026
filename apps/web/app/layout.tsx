import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpsFlow",
  description: "Financial operations management platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} dark h-full`}>
      <body className="h-full bg-neutral-950 text-neutral-100 antialiased">
        <div className="min-h-full flex flex-col bg-gradient-to-b from-neutral-900 to-neutral-950">
          {/* Top navbar */}
          <header className="h-10 flex items-center px-4 border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-sm shrink-0">
            <span className="text-sm font-semibold tracking-wide text-neutral-100 mr-auto">
              OpsFlow
            </span>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-neutral-700 flex items-center justify-center text-[10px] font-medium text-neutral-300">
                U
              </div>
              <span className="text-xs text-neutral-400">Admin</span>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 mx-auto w-full max-w-screen-2xl px-4 py-4">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
