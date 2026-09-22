"use client";

import { useEffect } from "react";

/**
 * The last boundary: what catches a throw in a root layout itself.
 *
 * Both root layouts in this app live inside route groups — `(builder)` and
 * `(published)/sites/[siteSlug]` — and each emits its own `<html>`. An
 * `error.tsx` beside one of them is rendered *inside* it, so it cannot help
 * when the layout is what failed. The published layout reads the database to
 * decide `<html lang>`, so that is a real case rather than a theoretical one:
 * a locked or missing database threw there, above everything, and the visitor
 * got nothing at all.
 *
 * Next renders this file with the layouts stripped away, which is why it has
 * to supply `<html>` and `<body>` itself.
 *
 * The styles are inline for the same reason. Every other page in this app is
 * styled by `globals.css`, which arrives through a layout — and a layout is
 * exactly what has failed by the time anyone sees this. A page that depends
 * on the stylesheet it may not have is a page that renders as unstyled black
 * text on white in the one situation it exists for.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[neuravex]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          background: "#0b0d12",
          color: "#e7e9ee",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <div
          style={{
            maxWidth: "28rem",
            width: "100%",
            textAlign: "center",
            border: "1px solid #222735",
            borderRadius: "0.75rem",
            background: "#11141c",
            padding: "2rem",
          }}
        >
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            Neuravex could not start this page
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", lineHeight: 1.6, color: "#9aa3b2" }}>
            Something failed before the page could be drawn. This usually means the database
            could not be opened — another copy of Neuravex may still be running.
          </p>
          <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", lineHeight: 1.6, color: "#9aa3b2" }}>
            Your sites are stored on this machine and nothing has been changed. The window
            Neuravex is running in has the details.
          </p>
          {error.digest ? (
            <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "#6b7280", fontFamily: "ui-monospace, monospace" }}>
              Reference {error.digest}
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              height: "2.25rem",
              padding: "0 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#ffffff",
              background: "#6366f1",
              border: "none",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
