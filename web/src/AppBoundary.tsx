import { Component } from "react";
import type { ReactNode } from "react";

export class AppBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="recovery-screen">
        <h1>Let’s reconnect your workspace.</h1>
        <p>
          Relay could not load part of this view. Refresh to try again. Your
          saved incidents will stay in place.
        </p>
        <button
          type="button"
          className="button primary"
          onClick={() => location.reload()}
        >
          Reload workspace
        </button>
      </main>
    );
  }
}
