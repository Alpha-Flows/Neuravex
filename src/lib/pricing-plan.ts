import type { PricingPlan } from "@/types";
import { plainText, textToHtml } from "./inline-text";

export { plainText, textToHtml, editedText, hasFormatting, isBlank } from "./inline-text";

/** A plan's features as the panel's box shows them: one per line. */
export function featuresToText(features: string[]): string {
  return features.map(plainText).join("\n");
}

/**
 * The features the box now describes, one per line.
 *
 * Each line takes back the stored feature it still matches, preferring the
 * one on the same line and then any other — so a line moved by cutting and
 * pasting it keeps its formatting as well. A line that matches nothing is new
 * words and is stored as such. An empty box is no features rather than one
 * empty one, which would be a tick beside nothing on the published card.
 */
export function featuresFromText(text: string, previous: string[], max = Infinity): string[] {
  if (text === "") return [];
  const lines = text.split(/\r?\n/).slice(0, max);
  const words = previous.map(plainText);
  const taken = new Set<number>();
  return lines.map((line, i) => {
    const same = i < previous.length && !taken.has(i) && words[i] === line ? i : -1;
    const match = same >= 0 ? same : words.findIndex((w, k) => !taken.has(k) && w === line);
    if (match < 0) return textToHtml(line);
    taken.add(match);
    return previous[match];
  });
}

/** What a plan is called in the panel and to a screen reader: "Pro", or "Plan 2". */
export function planLabel(plan: Pick<PricingPlan, "name">, index: number): string {
  return plainText(plan.name).trim() || `Plan ${index + 1}`;
}

/**
 * The plan "Add a plan" puts on the page.
 *
 * It takes its price and period from the plan before it. A price is written
 * in whatever currency and form the author uses — "€29", "$8", "29 CHF", "Free"
 * — and a fresh plan reading "$0" on a page priced in euros is one more thing
 * to notice and correct. Starting from the neighbour's, the author changes a
 * number and nothing else.
 */
export function newPlan(plans: PricingPlan[]): PricingPlan {
  const last = plans[plans.length - 1];
  return {
    name: "New plan",
    price: last?.price ?? "€0",
    period: last?.period ?? "per month",
    description: "Who this plan is for.",
    features: ["What it includes"],
    buttonLabel: "Choose this plan",
    buttonHref: "#",
    highlighted: false,
    badge: "",
  };
}
