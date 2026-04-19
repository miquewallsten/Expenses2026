import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ── Viewport ─────────────────────────────────────────────────────────────────
//
// viewport-fit=cover + black-translucent status bar = true edge-to-edge on iOS
// PWA.  The shell handles safe-area insets via CSS env() vars so interactive
// content always stays clear of the notch and home indicator.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  viewportFit: "cover",
  themeColor: "#09090b",
};

// ── Metadata ─────────────────────────────────────────────────────────────────
export const metadata: Metadata = {
  title: "My Work — OpsFlow",
  description: "Financial operations management platform",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "My Work",
    // black-translucent lets the app shell draw behind the iOS status bar;
    // the shell adds env(safe-area-inset-top) padding so content stays clear.
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // dark: force dark-mode colour tokens everywhere
      className={`${geistSans.variable} ${geistMono.variable} antialiased dark`}
    >
      {/*
       * body: h-full + overflow-hidden so the AppShell owns every pixel.
       * Scrolling is managed by individual overflow-y-auto containers inside
       * the shell, never the browser viewport.
       */}
      <body className="h-full overflow-hidden bg-zinc-950 text-white">
        {children}
      </body>
    </html>
  );
}
