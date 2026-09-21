"use client";
import { BaseBlock, SectionProps } from "@/types";
import { SortableContainer } from "./Sortable";
import { backgroundStyle } from "@/lib/block-style";
import { cn } from "@/lib/utils";
import { cssLength } from "@/lib/css-value";

interface Props {
  props: SectionProps;
  onChange?: (next: SectionProps) => void;
  childBlocks?: BaseBlock[];
  onChildrenChange?: (next: BaseBlock[], editKey?: string) => void;
  onSelect?: (id: string | null) => void;
  onChildDelete?: (id: string) => void;
  onChildDuplicate?: (id: string) => void;
  selectedId?: string | null;
  disabled?: boolean;
  blockId: string;
}

const maxClass: Record<SectionProps["maxWidth"], string> = {
  site: "max-w-full",
  full: "max-w-full",
  "7xl": "max-w-7xl",
  "6xl": "max-w-6xl",
  "5xl": "max-w-5xl",
  "4xl": "max-w-4xl",
};

const alignClass = { left: "mr-auto ml-0", center: "mx-auto", right: "ml-auto mr-0" } as const;

export function Section({
  props,
  childBlocks,
  onChildrenChange,
  onSelect,
  onChildDelete,
  onChildDuplicate,
  selectedId,
  disabled,
  blockId,
}: Props) {
  const inner = (
    <SortableContainer
      containerId={`section-${blockId}`}
      blocks={childBlocks ?? []}
      onChange={onChildrenChange ?? (() => {})}
      onSelect={onSelect ?? (() => {})}
      onDelete={onChildDelete ?? (() => {})}
      onDuplicate={onChildDuplicate ?? (() => {})}
      selectedId={selectedId ?? null}
      disabled={disabled}
      emptyHint="Drop blocks into this section"
    />
  );

  const bgStyle = backgroundStyle(props);

  return (
    <div
      style={{
        ...bgStyle,
        paddingTop: cssLength(props.paddingY) ?? 0,
        paddingBottom: cssLength(props.paddingY) ?? 0,
        paddingLeft: cssLength(props.paddingX) ?? 0,
        paddingRight: cssLength(props.paddingX) ?? 0,
      }}
    >
      {/*
        Everything but a full-width section sits inside the page's content
        column, so a left-aligned section lines up with the header instead of
        hugging the edge of the window — which is what made a wide window look
        as though the page had come apart. `align` then places the content
        inside that column.
      */}
      {props.maxWidth === "full" ? (
        <div className="w-full">{inner}</div>
      ) : (
        <div className="mx-auto w-full" style={{ maxWidth: "var(--site-content-width, 72rem)" }}>
          <div className={cn("w-full", maxClass[props.maxWidth], alignClass[props.align])}>{inner}</div>
        </div>
      )}
    </div>
  );
}
