"use client";
import React from "react";

/**
 * One block that cannot render, instead of a page that cannot render.
 *
 * There is no `error.tsx` anywhere in this app, so anything a block threw
 * became a 500 — on the published page, and on the editor page for the same
 * site. That is the part that mattered: the owner could not open the editor to
 * take the broken block out, because opening the editor was what threw. A
 * mistyped prop from an import or an agent was a site the owner could only
 * repair through the API or the database.
 *
 * Every write path validates props now, so this should never fire. It is here
 * for the rows written before that existed, and for the next prop somebody
 * adds and forgets to describe.
 */

interface Props {
  children: React.ReactNode;
  /** The block's type, so the message can say which one it was. */
  type?: string;
  /** In the editor the owner needs to know; on a published page they do not. */
  silent?: boolean;
}

interface State {
  failed: boolean;
}

export class BlockBoundary extends React.Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // One line, on the terminal the owner is already watching.
    if (typeof console !== "undefined") {
      console.error(`[neuravex] a ${this.props.type ?? "block"} block could not be drawn:`, error);
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;

    // A published page shows nothing rather than an apology to a visitor.
    if (this.props.silent) return null;

    return (
      <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        This {this.props.type ?? "block"} block could not be drawn. Its settings are
        not ones Neuravex understands — delete it and add a new one, or undo
        whatever last changed it.
      </div>
    );
  }
}
