"use client";
import { BaseBlock, BlockType } from "@/types";
import { Heading } from "./Heading";
import { Text } from "./Text";
import { Image } from "./Image";
import { ButtonBlock } from "./ButtonBlock";
import { Divider } from "./Divider";
import { Spacer } from "./Spacer";
import { Section } from "./Section";
import { Columns } from "./Columns";
import { Video } from "./Video";
import { Quote } from "./Quote";
import { List } from "./List";
import { Form } from "./Form";
import { CustomHtml } from "./CustomHtml";
import { BlockBoundary } from "./BlockBoundary";
import { safeProps } from "@/lib/block-tree";

interface ContainerHandlers {
  onSelect?: (id: string | null) => void;
  onChildDelete?: (id: string) => void;
  onChildDuplicate?: (id: string) => void;
  selectedId?: string | null;
}

interface Props extends ContainerHandlers {
  block: BaseBlock;
  onChange?: (next: BaseBlock, editKey?: string) => void;
  disabled?: boolean;
  pageId?: string;
}

/**
 * One block, drawn.
 *
 * Two things sit between a stored row and the renderers. `safeProps` repairs a
 * prop that is not the shape its type says — `List` maps `props.items`, `Form`
 * maps `props.fields`, and a string in either used to throw. `BlockBoundary`
 * catches what that does not, so a block nobody can draw is one gap on the
 * page rather than a 500 on the editor the owner needs to fix it with.
 */
export function BlockView(props: Props) {
  return (
    <BlockBoundary type={props.block.type} silent={props.disabled}>
      <BlockBody {...props} />
    </BlockBoundary>
  );
}

function BlockBody({ block: raw, onChange, disabled, onSelect, onChildDelete, onChildDuplicate, selectedId, pageId }: Props) {
  const block = { ...raw, props: safeProps(raw.type, raw.props, raw.props) };

  switch (block.type as BlockType) {
    case "heading":
      return <Heading props={block.props} onChange={onChange ? (p) => onChange({ ...block, props: p }) : undefined} disabled={disabled} />;
    case "text":
      return <Text props={block.props} onChange={onChange ? (p) => onChange({ ...block, props: p }) : undefined} disabled={disabled} />;
    case "image":
      // eslint-disable-next-line jsx-a11y/alt-text
      return <Image props={block.props} onChange={onChange ? (p) => onChange({ ...block, props: p }) : undefined} disabled={disabled} />;
    case "button":
      return <ButtonBlock props={block.props} onChange={onChange ? (p) => onChange({ ...block, props: p }) : undefined} disabled={disabled} />;
    case "divider":
      return <Divider props={block.props} onChange={onChange ? (p) => onChange({ ...block, props: p }) : undefined} disabled={disabled} />;
    case "spacer":
      return <Spacer props={block.props} onChange={onChange ? (p) => onChange({ ...block, props: p }) : undefined} disabled={disabled} />;
    case "section":
      return (
        <Section blockId={block.id} props={block.props} childBlocks={block.children}
          onChildrenChange={onChange ? (c, editKey) => onChange({ ...block, children: c }, editKey) : undefined}
          onSelect={onSelect} onChildDelete={onChildDelete} onChildDuplicate={onChildDuplicate}
          selectedId={selectedId} disabled={disabled} />
      );
    case "columns":
      return (
        <Columns blockId={block.id} props={block.props} childBlocks={block.children}
          onChildrenChange={onChange ? (c, editKey) => onChange({ ...block, children: c }, editKey) : undefined}
          onSelect={onSelect} onChildDelete={onChildDelete} onChildDuplicate={onChildDuplicate}
          selectedId={selectedId} disabled={disabled} />
      );
    case "video":
      return <Video props={block.props} onChange={onChange ? (p) => onChange({ ...block, props: p }) : undefined} disabled={disabled} />;
    case "quote":
      return <Quote props={block.props} onChange={onChange ? (p) => onChange({ ...block, props: p }) : undefined} disabled={disabled} />;
    case "list":
      return <List props={block.props} onChange={onChange ? (p) => onChange({ ...block, props: p }) : undefined} disabled={disabled} />;
    case "form":
      return <Form props={block.props} onChange={onChange ? (p) => onChange({ ...block, props: p }) : undefined} disabled={disabled} pageId={pageId} />;
    case "html":
      return <CustomHtml props={block.props} onChange={onChange ? (p) => onChange({ ...block, props: p }) : undefined} disabled={disabled} />;
    default:
      return <div className="text-red-500 text-sm">Unknown block: {String(block.type)}</div>;
  }
}
