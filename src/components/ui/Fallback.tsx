import { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

/**
 * The shape of every page that exists because something went wrong.
 *
 * There are four of them — a 404 and a failure page on each side of the app —
 * and the thing they have in common is not styling but posture: say what
 * happened in one sentence a person can act on, and give them somewhere to go.
 * A boundary that only says "Application error" leaves the owner of a site
 * with nothing to do but close the tab.
 *
 * `global-error.tsx` deliberately does not use this. It replaces the root
 * layout, so it cannot rely on the stylesheet having loaded, and carries its
 * own inline styles instead.
 */
export function Fallback({
  title,
  children,
  action,
  tone = "dark",
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  /** `light` is for a published site, whose pages are white rather than the builder's black. */
  tone?: "dark" | "light";
}) {
  const light = tone === "light";
  return (
    <div className={`min-h-screen flex items-center justify-center px-6 ${light ? "public-canvas" : ""}`}>
      <Card
        className={`max-w-md w-full p-8 text-center ${
          light ? "border-slate-200 bg-white" : ""
        }`}
      >
        <h1 className={`text-lg font-semibold ${light ? "text-slate-900" : "text-fg"}`}>{title}</h1>
        <div className={`mt-2 text-sm leading-relaxed ${light ? "text-slate-600" : "text-fg-muted"}`}>
          {children}
        </div>
        {action ? <div className="mt-6 flex items-center justify-center gap-3">{action}</div> : null}
      </Card>
    </div>
  );
}
