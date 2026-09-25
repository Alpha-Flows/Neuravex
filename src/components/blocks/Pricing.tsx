"use client";
import type { PricingProps } from "@/types";

interface Props {
  props: PricingProps;
  onChange?: (next: PricingProps) => void;
  disabled?: boolean;
}

// Placeholder until the block is written.
export function Pricing({ props }: Props) {
  return <div data-block-stub="pricing">{`${props.plans.length} plans`}</div>;
}
