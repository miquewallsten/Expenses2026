import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LocaleProvider } from "@/context/LocaleContext";
import DevLoginCheat from "@/components/dev/DevLoginCheat";
import { ErrorBoundary } from "@/components/shell/ErrorBoundary";
import { ToastProvider } from "@/components/ui/Toast";
import PwaBootstrap from "@/components/pwa/PwaBootstrap";
import { ThemeProvider } from "@/components/shell/ThemeProvider";
import HydrationGuard from "@/components/shell/HydrationGuard";
import HtmlLang from "@/components/shell/HtmlLang";

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
  title: "My Work - OpsFlow",
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
      className="antialiased"
      data-theme="dark"
      suppressHydrationWarning
    >
      <body className="h-full overflow-hidden bg-surface-0 text-primary">
        <HydrationGuard>
          <ThemeProvider>
            <ErrorBoundary>
              <LocaleProvider>
                <HtmlLang />
                <ToastProvider>{children}</ToastProvider>
                <PwaBootstrap />
              </LocaleProvider>
            </ErrorBoundary>
          </ThemeProvider>
        </HydrationGuard>
        {process.env.NODE_ENV === "development" && <DevLoginCheat />}
      </body>
    </html>
  );
}
