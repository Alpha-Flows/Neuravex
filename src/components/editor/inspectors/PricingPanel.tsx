"use client";
import type { PricingPlan, PricingProps } from "@/types";
import { Input, Textarea } from "@/components/ui/Input";
import { ColorInput, Field, LinkField, ListEditor, Toggle, type BlockPanelProps } from "../inspector-fields";
import { MAX_PLAN_FEATURES, MAX_PRICING_PLANS } from "@/lib/block-tree";
import {
  editedText,
  featuresFromText,
  featuresToText,
  hasFormatting,
  newPlan,
  planLabel,
  plainText,
} from "@/lib/pricing-plan";

/**
 * Said under a box whose stored value has bold or a link in it. The box shows
 * the words only, and retyping them here stores the words only.
 */
const FORMATTING_NOTE =
  "Bold or links on the page aren't shown here. Retyping this saves your new words without them; edit on the page to keep them.";

/** The same, for the features box, where each line is kept or retyped on its own. */
const FEATURES_FORMATTING_NOTE =
  "Bold or links on the page aren't shown here; only the lines you retype lose them. Edit on the page to keep them.";

/**
 * A plan's words in a box, edited as words.
 *
 * What is stored is inline HTML; what is shown is the plain text of it, and a
 * value whose words the author has not touched is stored back unchanged — see
 * `editedText`.
 */
function WordsInput({
  value,
  onChange,
  placeholder,
  multiline,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const shown = plainText(value);
  const note = hasFormatting(value) ? <p className="text-[11px] text-fg-subtle mt-1">{FORMATTING_NOTE}</p> : null;
  if (multiline) {
    return (
      <>
        <Textarea
          rows={2}
          value={shown}
          placeholder={placeholder}
          // One paragraph, however it wraps in the box: a line break typed
          // here is a space by the time it reaches the card, and keeping it
          // in the box would jump the caret on the next keystroke.
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          onChange={(e) => onChange(editedText(value, e.target.value.replace(/[\r\n]+/g, " ")))}
        />
        {note}
      </>
    );
  }
  return (
    <>
      <Input value={shown} placeholder={placeholder} onChange={(e) => onChange(editedText(value, e.target.value))} />
      {note}
    </>
  );
}

/**
 * The pricing block's settings: its plans, and the colour they are drawn in.
 *
 * A plan's features are a box with one feature per line rather than a list of
 * their own inside the plan's row. Nested, each feature would be another
 * bordered row with its own up, down and remove buttons, inside a plan's row,
 * in a panel 288px wide — eight features alone would take more scrolling than
 * every other setting of the plan together. A list of what a plan includes is
 * something people already write one line at a time, and often paste from
 * somewhere else; lines are reordered by cutting and pasting them, and a line
 * keeps its formatting from the page for as long as its words stay the same.
 * The canvas still has a remove button on every feature, and an add button
 * under each plan's list.
 */
export function PricingPanel({ block, onChange, linkTargets, siteSlug }: BlockPanelProps) {
  const p = block.props as PricingProps;
  const plans: PricingPlan[] = Array.isArray(p.plans) ? p.plans : [];
  const set = (patch: Partial<PricingProps>) => onChange({ ...block, props: { ...p, ...patch } });

  return (
    <>
      <Field label="Plans">
        <ListEditor
          items={plans}
          onChange={(next) => set({ plans: next })}
          newItem={() => newPlan(plans)}
          addLabel="Add a plan"
          itemLabel={planLabel}
          max={MAX_PRICING_PLANS}
          min={1}
          renderItem={(plan, update) => {
            const edit = (patch: Partial<PricingPlan>) => update({ ...plan, ...patch });
            const features = Array.isArray(plan.features) ? plan.features : [];
            return (
              <div className="space-y-3">
                <Field label="Name">
                  <WordsInput value={plan.name} onChange={(name) => edit({ name })} placeholder="Pro" />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Price">
                    <WordsInput value={plan.price} onChange={(price) => edit({ price })} placeholder="€29" />
                  </Field>
                  <Field label="Period">
                    <WordsInput value={plan.period} onChange={(period) => edit({ period })} placeholder="per month" />
                  </Field>
                </div>
                <Field label="Description">
                  <WordsInput
                    value={plan.description}
                    onChange={(description) => edit({ description })}
                    placeholder="Who this plan is for"
                    multiline
                  />
                </Field>
                <Field label="Features">
                  <Textarea
                    rows={Math.min(Math.max(features.length + 1, 3), 10)}
                    value={featuresToText(features)}
                    placeholder={"Ten projects\nPriority support"}
                    onChange={(e) => edit({ features: featuresFromText(e.target.value, features, MAX_PLAN_FEATURES) })}
                    className="leading-snug"
                  />
                  <p className="text-[11px] text-fg-subtle mt-1">
                    {features.length >= MAX_PLAN_FEATURES
                      ? `One per line. A plan lists up to ${MAX_PLAN_FEATURES}.`
                      : "One per line."}
                    {features.some(hasFormatting) ? ` ${FEATURES_FORMATTING_NOTE}` : ""}
                  </p>
                </Field>
                <Field label="Button">
                  <WordsInput value={plan.buttonLabel} onChange={(buttonLabel) => edit({ buttonLabel })} placeholder="Choose Pro" />
                </Field>
                <Field label="Button link">
                  <LinkField
                    value={plan.buttonHref}
                    onChange={(buttonHref) => edit({ buttonHref })}
                    pages={linkTargets}
                    siteSlug={siteSlug}
                  />
                </Field>
                <Toggle
                  label="Highlight this plan"
                  checked={!!plan.highlighted}
                  onChange={(highlighted) => edit({ highlighted })}
                  hint="Drawn raised, with a border and a filled button in the colour below."
                />
                <Field label="Badge">
                  <WordsInput value={plan.badge} onChange={(badge) => edit({ badge })} placeholder="Most popular" />
                </Field>
              </div>
            );
          }}
        />
      </Field>
      <Field label="Colour">
        <ColorInput value={p.color ?? ""} onChange={(color) => set({ color })} inherit="Site accent" />
        <p className="text-[11px] text-fg-subtle mt-1">For the highlighted plan, the badges, the ticks and the buttons.</p>
      </Field>
    </>
  );
}
