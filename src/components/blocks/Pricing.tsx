"use client";
import type { CSSProperties } from "react";
import type { PricingPlan, PricingProps } from "@/types";
import { Editable } from "./Editable";
import { TOKEN, parseHex, readableTextOn } from "@/lib/site-theme";
import { cssColor } from "@/lib/css-value";
import { isSafeHref } from "@/lib/url-safety";
import { domId } from "@/lib/dom-id";
import { MAX_PLAN_FEATURES, MAX_PRICING_PLANS } from "@/lib/block-tree";
import { isBlank, newPlan, planLabel, plainText } from "@/lib/pricing-plan";

interface Props {
  props: PricingProps;
  onChange?: (next: PricingProps) => void;
  disabled?: boolean;
  /** The block's own id, for the ids and anchors it draws — see `domId`. */
  blockId?: string;
}

/**
 * How far above its card a plan's parts reach, in rem.
 *
 * The highlighted plan is drawn lifted, and a badge hangs half over the top
 * edge of its card. Both stand out of the card's own box, so the row makes
 * room for them above itself and between its rows once it wraps — otherwise a
 * badge on the first row sat over whatever block came before the pricing, and
 * on the second row it sat on the button of the plan above it.
 */
const LIFT = 0.5;
const BADGE_OVERHANG = 0.75;

/**
 * The canvas's controls, drawn as the builder's own rather than the page's —
 * dark, bordered, shadowed — so nobody takes one for a word on the card. 22px
 * tall, to fit the 28px gap above a card's button.
 */
const CHROME_PILL =
  "z-10 rounded-md bg-bg-card/95 border border-bg-border px-1.5 py-0.5 text-[11px] leading-4 text-fg-muted hover:text-fg shadow-lg whitespace-nowrap";

/** The tick beside each feature: drawn, in the accent, and silent to a screen reader. */
function Tick() {
  return (
    <svg className="nvx-pricing-tick" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Plans side by side, each with a price, what it includes and a button.
 *
 * Templates built this by hand until now: a Columns block of three Sections,
 * each holding a heading for the name, another for the price, two lines of
 * text, a divider, a check list and a button, held apart by five spacers —
 * thirteen blocks a card, forty-three for the product template's row of
 * three. None of the cards knew about the others, so the buttons stopped at
 * different heights as soon as one plan listed five features beside a
 * neighbour's seven, and "Most popular" was a Section of its own with a
 * background colour.
 *
 * One block draws the row instead, and the layout lives in globals.css
 * because the published page and the download carry no script: the cards are
 * one grid, so they share a height and the button sits at the foot of each;
 * the row folds to two and then one as the space it is given narrows, which
 * is measured on the block rather than the window. Every colour on a card is
 * mixed from the text it inherits or from the accent, so the same block reads
 * on a white page and inside a near-black section.
 */
export function Pricing({ props, onChange, disabled, blockId }: Props) {
  const editing = !disabled && !!onChange;
  const plans: PricingPlan[] = Array.isArray(props.plans) ? props.plans : [];

  function setPlans(next: PricingPlan[]) {
    onChange?.({ ...props, plans: next });
  }
  function updatePlan(index: number, patch: Partial<PricingPlan>) {
    setPlans(plans.map((plan, k) => (k === index ? { ...plan, ...patch } : plan)));
  }
  function addPlan() {
    if (plans.length < MAX_PRICING_PLANS) setPlans([...plans, newPlan(plans)]);
  }

  // No colour of its own means the site's accent. The filled button's label
  // is worked out from a hex the block carries. `readableTextOn` reads only a
  // hex, and answers near-black for anything else — so for the site accent, a
  // named colour or an rgb() the label defers to the accent's contrast token.
  const ownColor = cssColor(props.color);
  const accent = ownColor ?? TOKEN.accent;
  const onAccent = ownColor && parseHex(ownColor) ? readableTextOn(ownColor) : TOKEN.accentContrast;

  const lifted = plans.some((plan) => plan.highlighted);
  const badged = plans.some((plan) => !isBlank(plan.badge));
  const rise = (lifted ? LIFT : 0) + (badged ? BADGE_OVERHANG : 0);

  const style = {
    "--nvx-pricing-accent": accent,
    "--nvx-pricing-on-accent": onAccent,
    "--nvx-pricing-radius": TOKEN.radius("0.75rem"),
    "--nvx-pricing-button-radius": TOKEN.radius("0.375rem"),
    "--nvx-pricing-rise": `${rise}rem`,
  } as CSSProperties;

  if (plans.length === 0) {
    // Nothing for a visitor to see. On the canvas the block still needs a
    // body, or there is nothing to click to select it or to add a plan to.
    if (!editing) return null;
    return (
      <div className="nvx-pricing" style={style}>
        <div className="nvx-pricing-empty">
          <span>No plans yet.</span>{" "}
          <button type="button" onClick={addPlan} className="underline">Add a plan</button>
        </div>
      </div>
    );
  }

  return (
    // `relative` (in the stylesheet) so the canvas's own controls can hang
    // over the block rather than sit in it — the page must lay out the same
    // on the canvas as it does published.
    <div className="nvx-pricing" style={style}>
      <ul className="nvx-pricing-grid" role="list" data-count={Math.min(plans.length, MAX_PRICING_PLANS)}>
        {plans.map((plan, i) => (
          <PlanCard
            key={i}
            plan={plan}
            index={i}
            blockId={blockId}
            editing={editing}
            onChange={(patch) => updatePlan(i, patch)}
            onAddPlan={i === plans.length - 1 && plans.length < MAX_PRICING_PLANS ? addPlan : undefined}
          />
        ))}
      </ul>
    </div>
  );
}

function PlanCard({
  plan,
  index,
  blockId,
  editing,
  onChange,
  onAddPlan,
}: {
  plan: PricingPlan;
  index: number;
  blockId?: string;
  editing: boolean;
  onChange: (patch: Partial<PricingPlan>) => void;
  /** Given to the last card only, while the block has room for another plan. */
  onAddPlan?: () => void;
}) {
  const features = Array.isArray(plan.features) ? plan.features : [];
  const label = planLabel(plan, index);

  // A visitor is shown only what was written. The canvas keeps every field,
  // empty ones included, because an empty field that is not drawn is one the
  // author cannot click into to fill.
  const show = (html: string) => editing || !isBlank(html);
  const shownFeatures = features
    .map((feature, f) => ({ feature, f }))
    .filter(({ feature }) => show(feature));

  const nameId = domId(blockId, "plan", index, "name");
  const priceId = domId(blockId, "plan", index, "price");
  const hasName = show(plan.name);
  const hasPrice = show(plan.price) || show(plan.period);

  function setFeatures(next: string[]) {
    onChange({ features: next });
  }

  // Three plans each ending in "Get started" are three links read out with
  // the same name. The plan's name and price are attached as the link's
  // description, so each one says which plan it starts.
  const describedBy = [hasName ? nameId : "", hasPrice ? priceId : ""].filter(Boolean).join(" ") || undefined;

  const buttonLabel = (
    <Editable
      as="span"
      disabled={!editing}
      value={plan.buttonLabel}
      onChange={(buttonLabel) => onChange({ buttonLabel })}
      placeholder="Button text"
    />
  );

  /**
   * The button, drawn the way the button block draws one: filled for the plan
   * picked out, outlined for the rest. On the canvas it is a span, as the
   * button block's is — an anchor around text being edited is a link the
   * author keeps following by accident. The address is still checked here
   * as well as at the door, for a row stored before the door checked it.
   */
  const href = isSafeHref(plan.buttonHref);
  const filled = plan.highlighted ? "true" : undefined;
  let button: React.ReactNode = null;
  if (editing) {
    button = <span className="nvx-pricing-button" data-filled={filled}>{buttonLabel}</span>;
  } else if (!isBlank(plan.buttonLabel)) {
    button = href ? (
      <a href={href} className="nvx-pricing-button" data-filled={filled} aria-describedby={describedBy}>{buttonLabel}</a>
    ) : (
      <span className="nvx-pricing-button" data-filled={filled}>{buttonLabel}</span>
    );
  }

  return (
    <li className="nvx-pricing-plan" data-highlighted={plan.highlighted ? "true" : undefined}>
      {hasName ? (
        <h3 className="nvx-pricing-name" id={nameId}>
          <Editable as="span" disabled={!editing} value={plan.name} onChange={(name) => onChange({ name })} placeholder="Plan name" />
        </h3>
      ) : null}

      {/* After the name in the page's order, so a screen reader meets the
          plan first and its tag second; the stylesheet hangs it over the
          card's top edge. */}
      {!isBlank(plan.badge) ? (
        <p className="nvx-pricing-badge">
          <Editable as="span" disabled={!editing} value={plan.badge} onChange={(badge) => onChange({ badge })} placeholder="Badge" />
        </p>
      ) : null}

      {hasPrice ? (
        <p className="nvx-pricing-price" id={priceId}>
          {show(plan.price) ? (
            <Editable as="span" className="nvx-pricing-amount" disabled={!editing} value={plan.price} onChange={(price) => onChange({ price })} placeholder="Price" />
          ) : null}{" "}
          {show(plan.period) ? (
            <Editable as="span" className="nvx-pricing-period" disabled={!editing} value={plan.period} onChange={(period) => onChange({ period })} placeholder="per month" />
          ) : null}
        </p>
      ) : null}

      {show(plan.description) ? (
        <Editable
          as="p"
          className="nvx-pricing-description"
          disabled={!editing}
          value={plan.description}
          onChange={(description) => onChange({ description })}
          placeholder="Who this plan is for"
        />
      ) : null}

      {shownFeatures.length > 0 ? (
        <ul className="nvx-pricing-features" role="list">
          {shownFeatures.map(({ feature, f }) => (
            <li key={f} className="nvx-pricing-feature">
              <Tick />
              <Editable
                as="span"
                className="nvx-pricing-feature-text"
                disabled={!editing}
                value={feature}
                onChange={(v) => setFeatures(features.map((old, k) => (k === f ? v : old)))}
                placeholder="Feature"
              />
              {editing ? (
                <button
                  type="button"
                  onClick={() => setFeatures(features.filter((_, k) => k !== f))}
                  aria-label={`Remove ${plainText(feature).trim() || "this feature"} from ${label}`}
                  className="nvx-block-chrome absolute -right-5 top-0 text-xs text-slate-400 hover:text-red-500"
                >×</button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        The canvas's two add buttons sit in the gap above the button, which
        holds nothing of the page's own. "Add plan" hung below the whole block
        at first, as the list's "Add item" does, and landed exactly on the
        first words of whatever came next — clicking there to edit that
        paragraph added a plan. The block's top-right corner was the next
        idea, and the editor's own move-copy-delete toolbar already lives
        there. So it is on the last card, at the end of the row it extends.
      */}
      <div className="nvx-pricing-action">
        {editing && features.length < MAX_PLAN_FEATURES ? (
          <button
            type="button"
            onClick={() => setFeatures([...features, "New feature"])}
            aria-label={`Add a feature to ${label}`}
            className={`nvx-block-chrome absolute left-0 top-1 ${CHROME_PILL}`}
          >+ Add feature</button>
        ) : null}
        {editing && onAddPlan ? (
          <button type="button" onClick={onAddPlan} className={`nvx-block-chrome absolute right-0 top-1 ${CHROME_PILL}`}>
            + Add plan
          </button>
        ) : null}
        {button}
      </div>
    </li>
  );
}
