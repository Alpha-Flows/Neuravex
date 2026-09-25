"use client";
import type { BaseBlock } from "@/types";
import { MOTIONS, MOTION_LABEL, type BlockMotion } from "@/lib/block-motion";

/**
 * How the block comes into view as a visitor scrolls to it.
 *
 * Said plainly under the choice where it plays, because it does not play
 * here: blocks fading in as the canvas scrolls would get in the way of
 * editing them, so the canvas shows every block where it ends up.
 */
export function MotionPanel({ block, onChange }: { block: BaseBlock; onChange: (next: BaseBlock) => void }) {
  return (
    <div className="pt-4 border-t border-bg-border space-y-1.5">
      <label className="block text-[11px] uppercase tracking-wide text-fg-subtle font-semibold" htmlFor={`motion-${block.id}`}>
        On scroll
      </label>
      <select
        id={`motion-${block.id}`}
        value={block.motion ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v) onChange({ ...block, motion: v as BlockMotion });
          else {
            const { motion: _dropped, ...rest } = block;
            onChange(rest);
          }
        }}
        className="h-9 w-full px-2 rounded-md bg-bg border border-bg-border text-fg text-sm focus:outline-none focus:border-brand/60"
      >
        <option value="">Always there</option>
        {MOTIONS.map((m) => (
          <option key={m} value={m}>{MOTION_LABEL[m]}</option>
        ))}
      </select>
      <p className="text-[11px] text-fg-subtle">
        Plays on the published page and in Preview as the block scrolls into view. Browsers that cannot drive an
        animation from scrolling, and visitors who have asked for less motion, see the block as it is.
      </p>
    </div>
  );
}
