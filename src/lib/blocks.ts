import {
  HeadingProps, TextProps, ImageProps, ButtonProps,
  DividerProps, SpacerProps, SectionProps, ColumnsProps,
  VideoProps, QuoteProps, ListProps, FormProps, HtmlProps,
  GalleryProps, AccordionProps, SliderProps, AudioProps, IconProps,
  SocialProps, TableProps, PricingProps, MapProps, CodeProps, PostsProps,
  BlockType,
} from "@/types";

export interface BlockDefinition {
  type: BlockType;
  label: string;
  category: "layout" | "content" | "media" | "form";
  icon: string;
  description: string;
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
      // The picture it starts on is one the library can describe, so a block
      // dragged onto the page and left alone is not a silent image.
      alt: "A lake below mountains",
      altFromLibrary: true,
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
    description: "A YouTube or Vimeo link, or a video file of your own.",
    defaultProps: {
      // Empty on purpose: the block asks for a video instead of shipping one.
      // It used to default to a demo clip hosted on w3schools.com, which every
      // new video block then fetched from a third party.
      src: "",
      poster: "",
      ratio: "16/9",
      title: "",
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
    description:
      "A contact, booking or signup form: text, email, phone, number, date, dropdowns, choices and a privacy checkbox. Answers are stored in the builder; a downloaded copy sends them to `destination` — a form service's https address or an email address — if one is set.",
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
  {
    type: "gallery",
    label: "Gallery",
    category: "media",
    icon: "▦",
    description: "A grid of pictures that open large when clicked.",
    defaultProps: {
      // Bundled photographs, with the descriptions and sizes the library
      // holds for them, so a gallery dropped on the page and left alone is
      // neither a row of broken images offline nor six silent ones.
      images: [
        { src: "/stock/food/alexandru-bogdan-ghita-UeYkqQh4PoI-unsplash.jpg", alt: "A platter of grilled ribs with tomatoes, fries and pickles", caption: "", naturalWidth: 2560, naturalHeight: 1710, altFromLibrary: true },
        { src: "/stock/food/edward-howell-vvUy1hWVYEA-unsplash.jpg", alt: "A plated dish of greens in a pale bowl", caption: "", naturalWidth: 2560, naturalHeight: 1706, altFromLibrary: true },
        { src: "/stock/food/louis-hansel-wVoP_Q2Bg_A-unsplash.jpg", alt: "A restaurant dining room", caption: "", naturalWidth: 2560, naturalHeight: 1706, altFromLibrary: true },
        { src: "/stock/nature/sam-ferrara-1527pjeb6jg-unsplash.jpg", alt: "Mountain peaks above the clouds at sunset", caption: "", naturalWidth: 2560, naturalHeight: 1706, altFromLibrary: true },
        { src: "/stock/nature/cristian-palmer-3leBubkp5hk-unsplash.jpg", alt: "Sunlight through turquoise water", caption: "", naturalWidth: 2560, naturalHeight: 1920, altFromLibrary: true },
        { src: "/stock/nature/sebastian-unrau-sp-p7uuT0tw-unsplash.jpg", alt: "A misty forest path", caption: "", naturalWidth: 2560, naturalHeight: 1706, altFromLibrary: true },
      ],
      columns: 3,
      gap: 12,
      aspect: "square",
      rounded: "md",
      lightbox: true,
    } satisfies GalleryProps,
  },
  {
    type: "slider",
    label: "Slider",
    category: "media",
    icon: "⇆",
    description: "Pictures one at a time, with arrows to move between them.",
    defaultProps: {
      // Bundled photographs with the library's descriptions and sizes, and a
      // caption on each that adds to the picture rather than repeating its
      // alt text — a screen reader reads both, and hearing the same sentence
      // twice is what a caption that only describes the picture costs.
      slides: [
        { src: "/stock/nature/sam-ferrara-1527pjeb6jg-unsplash.jpg", alt: "Mountain peaks above the clouds at sunset", caption: "Day one — above the clouds", naturalWidth: 2560, naturalHeight: 1706, altFromLibrary: true },
        { src: "/stock/nature/cristian-palmer-3leBubkp5hk-unsplash.jpg", alt: "Sunlight through turquoise water", caption: "Day two — down to the lagoon", naturalWidth: 2560, naturalHeight: 1920, altFromLibrary: true },
        { src: "/stock/nature/sebastian-unrau-sp-p7uuT0tw-unsplash.jpg", alt: "A misty forest path", caption: "Day three — home through the forest", naturalWidth: 2560, naturalHeight: 1706, altFromLibrary: true },
      ],
      ratio: "16/9",
      rounded: "xl",
      showArrows: true,
      showDots: true,
    } satisfies SliderProps,
  },
  {
    type: "audio",
    label: "Audio",
    category: "media",
    icon: "♪",
    description: "A sound file with a player — an episode, a track, a message.",
    defaultProps: {
      // Empty for the reason the video block is: the block asks for a file
      // rather than shipping one somebody else hosts.
      src: "",
      title: "Episode 1 — Getting started",
      description: "Why we started the show, who we are, and what the next ten episodes will cover.",
    } satisfies AudioProps,
  },
  {
    type: "map",
    label: "Map",
    category: "media",
    icon: "⌖",
    description: "Where to find you, with a link to open it on a map.",
    defaultProps: {
      address: "Pariser Platz, 10117 Berlin",
      lat: 52.5163,
      lng: 13.3777,
      zoom: 16,
      // A card, not a frame: a frame is a request to openstreetmap.org on
      // every page view, which is the owner's decision to make, not ours.
      mode: "card",
      height: 360,
      linkLabel: "Open in OpenStreetMap",
      googleLink: true,
      googleLabel: "Open in Google Maps",
    } satisfies MapProps,
  },
  {
    type: "accordion",
    label: "Accordion",
    category: "content",
    icon: "≡",
    description: "Questions and answers that open one at a time — an FAQ.",
    defaultProps: {
      items: [
        { title: "How long does delivery take?", body: "Most orders arrive within three to five working days." },
        { title: "Can I change my order?", body: "Yes — write to us within 24 hours and we will change it before it ships." },
        { title: "Do you ship abroad?", body: "We ship across the EU. Shipping costs are shown at checkout." },
      ],
      exclusive: true,
      openFirst: false,
      style: "bordered",
    } satisfies AccordionProps,
  },
  {
    type: "icon",
    label: "Icon",
    category: "content",
    icon: "★",
    description: "An icon on its own, or with a title and a line of text as a feature card.",
    defaultProps: {
      icon: "zap",
      size: "md",
      color: "",
      shape: "circle",
      title: "Fast by default",
      text: "Pages load in a blink, on every connection.",
      align: "left",
    } satisfies IconProps,
  },
  {
    type: "social",
    label: "Social links",
    category: "content",
    icon: "@",
    description:
      "A row of icons linking to your profiles elsewhere, in a page's footer say. Each link is a network and its address — https://www.instagram.com/yourname, mailto:you@yourdomain.com or a page of this site — and one with no address is not shown.",
    defaultProps: {
      // Empty until somebody names their own profile. A network's home page
      // would be a guess at an address, and a default that names somewhere
      // off the machine is what the block defaults test exists to catch. The
      // email link used to start as `mailto:hello@example.com`, and a block
      // dropped in and published as it came sent every visitor's email to a
      // domain set aside for examples. An empty link is faded on the canvas
      // and left off the page, so a new block publishes nothing it was not
      // given.
      links: [
        { network: "instagram", href: "" },
        { network: "linkedin", href: "" },
        { network: "email", href: "" },
      ],
      size: "md",
      shape: "circle",
      color: "",
      align: "left",
    } satisfies SocialProps,
  },
  {
    type: "table",
    label: "Table",
    category: "content",
    icon: "▥",
    description: "Rows and columns — opening hours, a price list, a comparison.",
    defaultProps: {
      rows: [
        ["Day", "Hours"],
        ["Monday – Friday", "9:00 – 18:00"],
        ["Saturday", "10:00 – 14:00"],
        ["Sunday", "Closed"],
      ],
      headerRow: true,
      headerColumn: true,
      striped: true,
      caption: "Opening hours",
    } satisfies TableProps,
  },
  {
    type: "pricing",
    label: "Pricing",
    category: "content",
    icon: "€",
    description: "Plans side by side, each with a price, what it includes and a button.",
    defaultProps: {
      plans: [
        {
          name: "Starter",
          price: "€9",
          period: "per month",
          description: "For getting going on your own.",
          features: ["One project", "Email support"],
          buttonLabel: "Choose Starter",
          buttonHref: "#",
          highlighted: false,
          badge: "",
        },
        {
          name: "Pro",
          price: "€29",
          period: "per month",
          description: "For a small team that ships often.",
          features: ["Ten projects", "Priority support", "Custom domain"],
          buttonLabel: "Choose Pro",
          buttonHref: "#",
          highlighted: true,
          badge: "Most popular",
        },
        {
          name: "Business",
          price: "€79",
          period: "per month",
          description: "For a whole company.",
          features: ["Unlimited projects", "Phone support", "Invoicing"],
          buttonLabel: "Talk to us",
          buttonHref: "#",
          highlighted: false,
          badge: "",
        },
      ],
      color: "",
    } satisfies PricingProps,
  },
  {
    type: "code",
    label: "Code",
    category: "content",
    icon: "{}",
    description: "A code sample, shown exactly as written in a monospaced font.",
    defaultProps: {
      // Short enough to replace at a glance, and a comment, a command and an
      // option each, so the sample shows its colours before it is edited.
      code: "# Install what the project needs, then start it\nnpm install\nnpm run dev -- --port 3000",
      language: "bash",
      filename: "",
      theme: "dark",
      wrap: false,
      lineNumbers: false,
    } satisfies CodeProps,
  },
  {
    type: "posts",
    label: "Blog posts",
    category: "content",
    icon: "✎",
    description: "The site's blog posts, newest first, with their covers, dates and summaries. New posts appear on their own.",
    defaultProps: {
      count: 6,
      layout: "grid",
      tag: "",
      showCover: true,
      showExcerpt: true,
      showDate: true,
    } satisfies PostsProps,
  },
];

export function getBlockDefinition(type: BlockType): BlockDefinition | undefined {
  return BLOCKS.find((b) => b.type === type);
}
