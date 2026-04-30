import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LocaleProvider } from "@/context/LocaleContext";
import DevLoginCheat from "@/components/dev/DevLoginCheat";
import { ErrorBoundary } from "@/components/shell/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import CopilotLauncher from "@/components/agent/CopilotLauncher";
import PwaBootstrap from "@/components/pwa/PwaBootstrap";
import { ThemeProvider } from "@/components/shell/ThemeProvider";

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
  themeColor: "#000000",
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
      lang="es"
      className="antialiased dark"
      suppressHydrationWarning
    >
      {/* Blocking script: reads pref_theme from localStorage before React hydrates
          to prevent flash-of-wrong-theme on page load. */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('pref_theme')||'dark';var s=window.matchMedia('(prefers-color-scheme:dark)').matches;var c=t==='system'?(s?'dark':'light'):t;document.documentElement.classList.remove('dark','light');document.documentElement.classList.add(c);}catch(e){}})()`,
          }}
        />
      </head>
      <body className="h-full overflow-hidden bg-zinc-950 text-white">
        <ThemeProvider>
          <ErrorBoundary>
            <LocaleProvider>
              <ToastProvider>{children}</ToastProvider>
              <CopilotLauncher />
              <PwaBootstrap />
            </LocaleProvider>
          </ErrorBoundary>
          <DevLoginCheat />
        </ThemeProvider>
      </body>
    </html>
  );
}
