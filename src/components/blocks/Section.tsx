"use client";
import { BaseBlock, SectionProps } from "@/types";
import { SortableContainer } from "./Sortable";
import { cn } from "@/lib/utils";

interface Props {
  props: SectionProps;
  onChange?: (next: SectionProps) => void;
  childBlocks?: BaseBlock[];
  onChildrenChange?: (next: BaseBlock[]) => void;
  onSelect?: (id: string | null) => void;
  onChildDelete?: (id: string) => void;
  onChildDuplicate?: (id: string) => void;
  selectedId?: string | null;
  disabled?: boolean;
  blockId: string;
}

const maxClass: Record<SectionProps["maxWidth"], string> = {
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

  const bgStyle = props.backgroundImage
    ? {
        backgroundImage: props.backgroundOverlay
          ? `linear-gradient(${props.backgroundOverlay}, ${props.backgroundOverlay}), url(${props.backgroundImage})`
          : `url(${props.backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { background: props.background };

  return (
    <div
      style={{
        ...bgStyle,
        paddingTop: props.paddingY,
        paddingBottom: props.paddingY,
        paddingLeft: props.paddingX,
        paddingRight: props.paddingX,
      }}
    >
      <div className={cn("w-full", maxClass[props.maxWidth], alignClass[props.align])}>{inner}</div>
    </div>
  );
}
