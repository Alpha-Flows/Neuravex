"use client";
import { useEffect, useState } from "react";

const LOCAL = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0"]);

/**
 * Says so when the builder is being reached over the network.
 *
 * Neuravex has no accounts and its API asks nobody who they are — which is
 * reasonable for something running on your own machine, and is the design.
 * It stops being reasonable without anyone noticing when the server is bound
 * to a network address: on a shared Wi-Fi, anyone who can reach this page can
 * edit or delete these sites. Nothing said so.
 */
export function NetworkNotice() {
  const [host, setHost] = useState<string | null>(null);

  useEffect(() => {
    const h = window.location.hostname;
    if (!LOCAL.has(h)) setHost(h);
  }, []);

  if (!host) return null;

  return (
    <div className="border-b border-amber-500/30 bg-amber-500/10">
      <div className="max-w-6xl mx-auto px-6 py-2.5 text-xs text-amber-200/90 flex items-start gap-2">
        <span aria-hidden className="leading-none">⚠</span>
        <p>
          You are reaching this builder at <strong className="font-medium">{host}</strong>, not on this machine.
          It has no sign-in: anyone who can reach that address can edit, publish or delete these sites. Run it on
          localhost unless you meant to share it.
        </p>
      </div>
    </div>
  );
}
