"use client";
import { DndContext, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { BaseBlock } from "@/types";
import { SortableContainer } from "@/components/blocks/Sortable";

interface Props {
  blocks: BaseBlock[];
}

/**
 * Renders a miniature preview of the template's first page inside a
 * small card. Uses CSS transform to scale the full block tree down
 * so the template's actual design (colors, headings, buttons, images)
 * is visible in the template picker.
 */
export function TemplatePreview({ blocks }: Props) {
  // DndContext is needed because some container blocks (section, columns)
  // use dnd-kit hooks even in disabled mode.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 9999 } }));

  return (
    <div className="w-full h-32 overflow-hidden rounded-t-lg bg-white relative">
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{
          width: "500%", // scale down factor = 1/5 ≈ 0.2
          transform: "scale(0.2)",
          fontSmooth: "never",
        }}
      >
        <DndContext sensors={sensors}>
          <div className="public-canvas">
            <SortableContainer
              containerId="preview"
              blocks={blocks}
              onChange={() => {}}
              onSelect={() => {}}
              onDelete={() => {}}
              onDuplicate={() => {}}
              selectedId={null}
              disabled
              emptyHint=""
            />
          </div>
        </DndContext>
      </div>
    </div>
  );
}
