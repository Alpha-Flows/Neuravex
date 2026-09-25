/**
 * The icons an Icon block can show, by name, with what each one is called
 * out loud and the words somebody might search for it by.
 *
 * A block stores the name, never the drawing, so this table is what the
 * validator checks a stored name against: a name that is not here falls back
 * to the default rather than rendering nothing. It is kept free of imports on
 * purpose — `block-tree.ts` reads it on the server and in the editor, and the
 * drawings themselves live in `icon-set.ts`, which pulls in lucide-react.
 *
 * The names are lucide's own, in the kebab case its files use, as of the
 * version in package.json. That is not a free choice. The first draft of this
 * list was written from memory of older lucide releases, and four of its 106
 * names — `building-2`, `circle-help`, `smile`, `waves` — were only aliases
 * by the time the package was installed, kept for compatibility and free to
 * disappear in the next major. A name that is lucide's current one can be
 * checked against the package mechanically, and the test does exactly that.
 *
 * About a hundred, chosen for the sites people build here: a café, a
 * plumber, a clinic, a guest house, a studio. Lucide has some eighteen
 * hundred, and offering all of them would put every one into the editor's
 * bundle and bury the useful ones in a grid nobody could scan.
 *
 * Each entry's label is what a screen reader hears for an icon standing on
 * its own, so it says what the picture shows in plain British English — a
 * "Tick", a "Lorry" — rather than lucide's file name read aloud. The words
 * after it are only for the picker's search box, which is how "email" finds
 * the envelope and "plumber" finds the water drops.
 */
const ICONS = {
  // Qualities and promises: the head of a feature card.
  star: ["Star", "rating favourite review quality"],
  heart: ["Heart", "love like favourite care"],
  check: ["Tick", "done yes included check"],
  "circle-check": ["Tick in a circle", "done yes included check"],
  "badge-check": ["Verified badge", "certified approved quality check"],
  "shield-check": ["Shield with a tick", "secure safe insured guarantee protection"],
  zap: ["Lightning bolt", "fast quick speed power electric electrician energy"],
  sparkles: ["Sparkles", "new magic clean cleaning shine premium"],
  rocket: ["Rocket", "launch start growth fast"],
  lightbulb: ["Light bulb", "idea tip innovation"],
  target: ["Target", "goal aim focus"],
  award: ["Award", "prize winner certificate best medal"],
  "thumbs-up": ["Thumbs up", "like approve recommend good"],

  // Getting in touch, and where to find you.
  phone: ["Phone", "call telephone contact number"],
  mail: ["Envelope", "email mail contact letter post"],
  "message-circle": ["Speech bubble", "chat message comment talk support"],
  "map-pin": ["Map pin", "location address place where directions"],
  globe: ["Globe", "world international web website online"],
  clock: ["Clock", "time hours opening schedule"],
  calendar: ["Calendar", "date booking appointment event schedule"],
  house: ["House", "home property estate agent"],
  building: ["Building", "office company business flat apartment"],
  store: ["Shop front", "store shop retail"],
  landmark: ["Landmark", "bank museum government institution"],
  accessibility: ["Accessibility", "wheelchair disabled access step-free"],

  // People.
  user: ["Person", "user profile account customer"],
  users: ["People", "users team group community customers staff"],
  handshake: ["Handshake", "deal partner agreement trust"],
  "heart-handshake": ["Caring handshake", "care support charity volunteer"],
  "face-slightly-smiling": ["Smile", "happy face customer satisfaction dentist dental"],
  baby: ["Baby", "child nursery childcare family kids"],
  "graduation-cap": ["Graduation cap", "education school course training university"],

  // Work, money and shopping.
  briefcase: ["Briefcase", "work business job career consulting"],
  "book-open": ["Open book", "read learn library course education"],
  "file-text": ["Document", "file report contract paper form"],
  "chart-column": ["Bar chart", "statistics results analytics growth graph"],
  "trending-up": ["Rising line", "trending growth increase sales improve graph"],
  calculator: ["Calculator", "accounting accountant tax sums maths"],
  "piggy-bank": ["Piggy bank", "savings money budget finance"],
  wallet: ["Wallet", "money payment finance"],
  "credit-card": ["Bank card", "credit card payment pay money"],
  "shopping-cart": ["Shopping trolley", "cart buy shop order online"],
  "shopping-bag": ["Shopping bag", "shop buy retail purchase"],
  gift: ["Gift", "present voucher offer reward"],
  tag: ["Price tag", "label sale discount offer"],

  // Law and trust.
  scale: ["Scales", "law legal justice balance fair"],
  gavel: ["Gavel", "law legal court lawyer solicitor auction"],
  lock: ["Padlock", "lock secure security private password"],
  key: ["Key", "access property rental letting locksmith"],

  // Getting there, and staying.
  truck: ["Lorry", "truck delivery shipping transport van removals"],
  package: ["Parcel", "package box delivery shipping product"],
  car: ["Car", "vehicle driving garage mechanic taxi"],
  bike: ["Cyclist", "bike bicycle cycling"],
  plane: ["Aeroplane", "plane flight travel airport holiday"],
  bed: ["Bed", "hotel sleep room accommodation guest house"],
  tent: ["Tent", "camping outdoors"],
  mountain: ["Mountain", "outdoors hiking adventure nature"],
  compass: ["Compass", "explore direction navigation adventure"],

  // Food and drink.
  coffee: ["Coffee cup", "cafe café drink tea breakfast"],
  utensils: ["Fork and knife", "utensils food restaurant dining eat meal"],
  "chef-hat": ["Chef's hat", "food cook chef kitchen catering restaurant"],
  pizza: ["Pizza", "food takeaway italian"],
  "cake-slice": ["Slice of cake", "food bakery dessert birthday"],
  croissant: ["Croissant", "food bakery breakfast pastry"],
  wheat: ["Wheat", "food grain bread bakery farm organic gluten"],
  wine: ["Wine glass", "drink bar vineyard"],
  beer: ["Beer", "pub bar drink brewery"],

  // Health, fitness and looking after yourself.
  stethoscope: ["Stethoscope", "doctor medical health clinic"],
  "heart-pulse": ["Heartbeat", "health pulse medical care"],
  pill: ["Pill", "medicine pharmacy chemist"],
  activity: ["Pulse line", "activity health fitness vital"],
  dumbbell: ["Dumbbell", "gym fitness training workout"],
  brain: ["Brain", "mind therapy mental health psychology"],
  eye: ["Eye", "vision optician see view"],
  scissors: ["Scissors", "hair hairdresser barber salon cut"],
  "flower-2": ["Flower", "florist garden spa beauty"],

  // Trades, the house and the garden.
  hammer: ["Hammer", "build builder repair tools diy"],
  wrench: ["Spanner", "wrench repair fix mechanic plumber maintenance tools"],
  "hard-hat": ["Hard hat", "construction builder safety site"],
  "paint-roller": ["Paint roller", "painter decorator paint decorating"],
  ruler: ["Ruler", "measure carpenter design architecture"],
  plug: ["Plug", "electric electrician power socket"],
  droplets: ["Water drops", "droplets water plumber plumbing cleaning"],
  flame: ["Flame", "fire heating gas boiler hot"],
  snowflake: ["Snowflake", "cold air conditioning winter freezer"],
  "spray-can": ["Spray can", "cleaning cleaner spray"],
  sprout: ["Sprout", "grow plant garden organic eco"],
  leaf: ["Leaf", "nature eco green organic garden"],

  // Outdoors and animals.
  "tree-deciduous": ["Tree", "nature park garden landscaping"],
  sun: ["Sun", "summer weather solar bright"],
  recycle: ["Recycling", "recycle eco green sustainable environment"],
  dog: ["Dog", "pet grooming vet walking"],
  "paw-print": ["Paw print", "pet animal vet dog cat"],

  // Pictures, sound and making things.
  camera: ["Camera", "photo photography photographer"],
  image: ["Picture", "image photo gallery"],
  video: ["Video camera", "video film record"],
  music: ["Musical note", "music song audio band concert"],
  mic: ["Microphone", "mic podcast singing speaker audio"],
  palette: ["Palette", "art design colour paint creative"],
  "pen-tool": ["Pen", "design graphic writing creative"],
  megaphone: ["Megaphone", "marketing announce advertising news"],
  "party-popper": ["Party popper", "party celebration event wedding"],

  // Screens and the web.
  smartphone: ["Mobile phone", "smartphone app"],
  laptop: ["Laptop", "computer online remote work"],
  monitor: ["Computer screen", "monitor desktop display"],
  wifi: ["Wi-Fi", "wifi internet wireless connection online"],
  code: ["Code", "developer programming software web"],
  cloud: ["Cloud", "online hosting storage weather"],
  settings: ["Cog", "settings gear options configuration"],

  // Signs.
  search: ["Magnifying glass", "search find look"],
  info: ["Information", "info about help"],
  "circle-question-mark": ["Question mark", "help question faq support"],
  "triangle-alert": ["Warning", "caution alert danger"],
  download: ["Download", "save get brochure"],
  "arrow-right": ["Arrow pointing right", "next more forward go"],
} as const satisfies Record<string, readonly [string, string]>;

export type IconName = keyof typeof ICONS;

/** Every name, in the order the picker shows them — related icons together. */
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export const DEFAULT_ICON: IconName = "star";

/**
 * Names lucide used to give some of these icons, and still exports them
 * under, mapped to the name they have now.
 *
 * An agent working through the MCP server writes a block from what it
 * remembers of lucide, and what it remembers is usually a release or two old:
 * `home`, `smile`, `alert-triangle`. Falling back to a star for those is the
 * validator doing its job and still the wrong picture on somebody's page, so
 * a name lucide itself recognises as another spelling of one of ours is
 * repaired to ours. Only lucide's own aliases are listed, so the test can
 * check each one against the package rather than against anyone's judgement.
 */
export const ICON_RENAMES: Readonly<Record<string, IconName>> = {
  "check-circle-2": "circle-check",
  verified: "badge-check",
  stars: "sparkles",
  home: "house",
  smile: "face-slightly-smiling",
  "bar-chart-3": "chart-column",
  "fork-knife": "utensils",
  "circle-help": "circle-question-mark",
  "help-circle": "circle-question-mark",
  "alert-triangle": "triangle-alert",
};

export function isIconName(value: unknown): value is IconName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ICONS, value);
}

/** A stored name, repaired: ours, ours under an older spelling, or the star. */
export function resolveIconName(value: unknown): IconName {
  if (isIconName(value)) return value;
  if (typeof value === "string" && Object.prototype.hasOwnProperty.call(ICON_RENAMES, value)) return ICON_RENAMES[value];
  return DEFAULT_ICON;
}

/** What the icon is called out loud, for a lone icon and the picker's buttons. */
export function iconLabel(name: unknown): string {
  return ICONS[resolveIconName(name)][0];
}

/**
 * The icons whose name, label or search words contain every word typed.
 *
 * Every word, not any: "shopping bag" should narrow the grid to one icon,
 * not widen it to everything with "shopping" or "bag" in it. A word matches
 * anywhere inside another, so "plumb" finds the water drops before it is
 * finished, and accents are folded away, so "cafe" finds the café's cup.
 */
export function searchIcons(query: string): IconName[] {
  // A hyphen separates words here as it does in the names, so "map-pin",
  // typed the way it is stored, finds what "map pin" does.
  const words = fold(query).split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return ICON_NAMES;
  return ICON_NAMES.filter((name) => {
    const [label, keywords] = ICONS[name];
    const haystack = fold(`${name.replace(/-/g, " ")} ${label} ${keywords}`);
    return words.every((word) => haystack.includes(word));
  });
}

/** Lower case, accents dropped: "Café" and "cafe" are the same search. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
