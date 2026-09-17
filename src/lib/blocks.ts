import {
  HeadingProps, TextProps, ImageProps, ButtonProps,
  DividerProps, SpacerProps, SectionProps, ColumnsProps,
  VideoProps, QuoteProps, ListProps, FormProps, HtmlProps,
  BlockType,
} from "@/types";

export interface BlockDefinition {
  type: BlockType;
  label: string;
  category: "layout" | "content" | "media" | "form";
  icon: string;
  description: string;
  // eslint-disable-next-line
  defaultProps: any;
}

export const BLOCKS: BlockDefinition[] = [
  {
    type: "heading",
    label: "Heading",
    category: "content",
    icon: "H",
    description: "A title or section header.",
    defaultProps: {
      text: "A great headline",
      level: 2,
      align: "left",
      // Empty means "whatever the site says" — the block inherits the page's
      // text colour, and the inspector offers a colour of its own.
      color: "",
      weight: "bold",
    } satisfies HeadingProps,
  },
  {
    type: "text",
    label: "Text",
    category: "content",
    icon: "T",
    description: "A paragraph of body copy.",
    defaultProps: {
      text: "Write something compelling about your business, your story, or this page. Click to edit.",
      align: "left",
      size: "base",
      color: "",
    } satisfies TextProps,
  },
  {
    type: "image",
    label: "Image",
    category: "media",
    icon: "🖼",
    description: "A picture from your library or a URL.",
    defaultProps: {
      // One of the bundled stock photos. A new image block used to start on a
      // remote Unsplash address, which is a broken image on a machine that is
      // offline and an outside dependency in a downloaded site.
      src: "/stock/nature/pietro-de-grandi-Q5dMq3cKqec-unsplash.jpg",
      alt: "",
      rounded: "xl",
      width: "large",
      caption: "",
    } satisfies ImageProps,
  },
  {
    type: "button",
    label: "Button",
    category: "content",
    icon: "▶",
    description: "A clickable call to action.",
    defaultProps: {
      label: "Get started",
      href: "#",
      variant: "primary",
      size: "md",
      align: "left",
      // The site's accent, until someone picks a colour for this one button.
      color: "",
      textColor: "",
    } satisfies ButtonProps,
  },
  {
    type: "divider",
    label: "Divider",
    category: "layout",
    icon: "—",
    description: "A horizontal line.",
    defaultProps: {
      style: "solid",
      color: "",
      thickness: 1,
    } satisfies DividerProps,
  },
  {
    type: "spacer",
    label: "Spacer",
    category: "layout",
    icon: "↕",
    description: "Vertical breathing room.",
    defaultProps: {
      height: 48,
    } satisfies SpacerProps,
  },
  {
    type: "section",
    label: "Section",
    category: "layout",
    icon: "▭",
    description: "A container with background and padding.",
    defaultProps: {
      background: "#f8fafc",
      paddingY: 64,
      paddingX: 24,
      // Follows the site's content width, so widening the site widens this too.
      maxWidth: "site",
      align: "center",
    } satisfies SectionProps,
  },
  {
    type: "columns",
    label: "Columns",
    category: "layout",
    icon: "▤",
    description: "A multi-column layout container.",
    defaultProps: {
      count: 3,
      gap: 24,
    } satisfies ColumnsProps,
  },
  {
    type: "video",
    label: "Video",
    category: "media",
    icon: "▶",
    description: "An embedded video.",
    defaultProps: {
      // Empty on purpose: the block asks for a video instead of shipping one.
      // It used to default to a demo clip hosted on w3schools.com, which every
      // new video block then fetched from a third party.
      src: "",
      poster: "",
      ratio: "16/9",
    } satisfies VideoProps,
  },
  {
    type: "quote",
    label: "Quote",
    category: "content",
    icon: "❝",
    description: "A testimonial or pull quote.",
    defaultProps: {
      text: "This product changed the way we work — we can't imagine going back.",
      author: "Jane Cooper",
      role: "Head of Design, Northwind",
      align: "center",
    } satisfies QuoteProps,
  },
  {
    type: "list",
    label: "List",
    category: "content",
    icon: "•",
    description: "A bulleted, numbered, or check list.",
    defaultProps: {
      style: "check",
      items: ["Fast and easy to use", "Works on every device", "Free to get started"],
    } satisfies ListProps,
  },
  {
    type: "form",
    label: "Form",
    category: "content",
    icon: "☰",
    description: "A contact or signup form. Submissions are saved in the CMS.",
    defaultProps: {
      fields: [
        { label: "Name", type: "text", required: true },
        { label: "Email", type: "email", required: true },
        { label: "Message", type: "textarea", required: false },
      ],
      submitLabel: "Submit",
      successMessage: "Thanks! Your message has been received.",
    } satisfies FormProps,
  },
  {
    type: "html",
    label: "Custom HTML",
    category: "media",
    icon: "‹›",
    description: "Raw HTML embed. Useful for widgets, maps, or code snippets.",
    defaultProps: {
      html: '<div style="padding:32px;text-align:center;background:#f1f5f9;border-radius:8px">Your custom HTML here</div>',
    } satisfies HtmlProps,
  },
];

export function getBlockDefinition(type: BlockType): BlockDefinition | undefined {
  return BLOCKS.find((b) => b.type === type);
}
