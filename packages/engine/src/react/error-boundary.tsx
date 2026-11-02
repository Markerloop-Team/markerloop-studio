"use client";

import * as React from "react";

/** DOM attribute on the plate a node draws when it threw; value = the node's type. */
export const SAUNA_NODE_ERROR_ATTR = "data-sauna-node-error";

/**
 * What `SaunaRenderer` hands its `nodeBoundary` (SDL-633). `resetKey` is the
 * node's stored config: every edit of the node replaces that object, so the
 * boundary knows the node changed and tries again.
 */
export type SaunaNodeBoundaryProps = {
  nodeType: string;
  nodeId: string;
  resetKey: unknown;
  /** Editor mode: the plate carries the node id, so a click selects the broken node. */
  editable?: boolean;
  children: React.ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Per-node fault isolation for the editor canvas (SDL-633). A node that
 * throws — the typical case is a compound part stored before SDL-633 outside
 * its root, where Radix throws "X must be used within Y" — draws a plate in
 * its place instead of taking the whole canvas down, and the plate is
 * selectable so the author can fix or delete the node. After the node is
 * edited (`resetKey` changes) the boundary renders the node again.
 *
 * A class component: never import it from the server renderer (see the note
 * in ./renderer.tsx); the canvas passes it in through `nodeBoundary`.
 */
export class SaunaNodeErrorBoundary extends React.Component<SaunaNodeBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: SaunaNodeBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  componentDidCatch() {
    // no-op (можно будет подключить telemetry)
  }

  render() {
    if (this.state.error) {
      return (
        <div
          {...{ [SAUNA_NODE_ERROR_ATTR]: this.props.nodeType }}
          {...(this.props.editable ? { "data-sauna-node-id": this.props.nodeId } : {})}
          style={{
            border: "1px solid rgba(185, 28, 28, 0.35)",
            background: "rgba(185, 28, 28, 0.06)",
            borderRadius: 10,
            padding: 10,
            fontFamily: "ui-sans-serif, system-ui",
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 700, color: "#b91c1c" }}>
            Render error: {this.props.nodeType}
          </div>
          <div style={{ opacity: 0.75, marginTop: 4 }}>id: {this.props.nodeId}</div>
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 8, marginBottom: 0 }}>
            {this.state.error.message}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
