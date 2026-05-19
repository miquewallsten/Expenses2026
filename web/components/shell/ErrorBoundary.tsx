"use client";

/**
 * Top-level error boundary.
 *
 * Catches render-phase exceptions in client components and shows an
 * error state with optional retry. Detects HttpError by duck-typing
 * to avoid importing the api/client module at the layout level (which
 * would pull in the session module and its Node Buffer polyfill chain).
 */

import React from "react";
import { ErrorState } from "@/components/ui/ErrorState";

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

/** Duck-type check for HttpError without importing it. */
function getRequestId(error: Error): string | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const obj = error as any;
  if (obj?.requestId && typeof obj.requestId === "string") {
    return obj.requestId;
  }
  return undefined;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const requestId = getRequestId(error);
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
