"use client";

/**
 * Phase 3.3 — Top-level error boundary.
 *
 * Catches render-phase exceptions in client components and shows the
 * dark-enterprise <ErrorState/> with the captured request_id (when the
 * error is an HttpError from the centralized API client).
 *
 * Server-side errors are handled by Next's app/error.tsx convention; this
 * boundary is mounted inside the root layout so client-side runtime errors
 * never blank the screen.
 */

import React from "react";
import { ErrorState } from "@/components/ui/ErrorState";
import { HttpError } from "@/lib/api/client";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Lightweight client-side breadcrumb. The Phase 2.5 backend will already
    // have logged the request_id for any HttpError that surfaced here.
    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.error("[ErrorBoundary]", error, info.componentStack);
    }
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const requestId =
      error instanceof HttpError ? error.requestId : undefined;
    const message = error.message || "Unexpected error";

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-0 p-6">
        <ErrorState
          title="Something went wrong"
          message={message}
          requestId={requestId}
          onRetry={this.reset}
        />
      </div>
    );
  }
}
