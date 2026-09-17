import { uid } from "./utils";
import { BlockType, BaseBlock } from "@/types";

export type TemplateBlock = BaseBlock;

export interface TemplatePage {
  title: string;
  slug: string;
  isHome?: boolean;
  published?: boolean;
  blocks: TemplateBlock[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  category: "business" | "portfolio" | "blog" | "landing" | "minimal";
  cover: string;
  pages: TemplatePage[];
}

// --- helpers that reduce boilerplate ---
function b(type: BlockType, props: Record<string, unknown>, children?: TemplateBlock[]): TemplateBlock {
  return { id: uid(), type, props, children };
}
function sec(bg: string, py: number, max: string, align: string, ...kids: TemplateBlock[]) {
  return b("section", { background: bg, paddingY: py, paddingX: 24, maxWidth: max, align }, kids);
}
function h(text: string, level = 2, color = "#0f172a", weight = "bold", align = "center"): TemplateBlock {
  return b("heading", { text, level, align, color, weight } as any);
}
function t(text: string, size = "lg", color = "#475569", align = "center"): TemplateBlock {
  return b("text", { text, align, size, color } as any);
}
function btn(label: string, color = "#6366f1", variant = "primary", size = "lg", align = "center"): TemplateBlock {
  return b("button", { label, href: "#", variant, size, align, color, textColor: "#ffffff" } as any);
}
function s(hPx: number): TemplateBlock { return b("spacer", { height: hPx }); }
function img(url: string, caption = ""): TemplateBlock {
  return b("image", { src: url, alt: "", rounded: "xl", width: "full", caption } as any);
}
function div(color = "#e2e8f0"): TemplateBlock { return b("divider", { style: "solid", color, thickness: 1 }); }
function cols(count: 2 | 3 | 4, gap: number, ...kids: TemplateBlock[]) {
  return b("columns", { count, gap }, kids);
}
function q(text: string, author: string, role: string, align = "center"): TemplateBlock {
  return b("quote", { text, author, role, align } as any);
}
function lst(items: string[], style: "check" | "bullet" | "number" = "check"): TemplateBlock {
  return b("list", { style, items } as any);
}

// --- shared images ---
// These are the bundled stock photos under public/stock, not remote URLs. A
// template used to seed a new site with Unsplash addresses, so every page it
// created showed broken images without an internet connection — in an app
// whose whole point is that it runs on your own machine — and a downloaded
// site carried the same dependency with it. Everything here ships in the repo.
const IMG = {
  heroSaaS: "/stock/abstract/magicpattern-bevXKKL7E9g-unsplash.jpg",
  heroAgency: "/stock/abstract/pawel-czerwinski-NTYYL9Eb9y8-unsplash.jpg",
  heroPortfolio: "/stock/industry/monika-bienert-EETgT0lmAiQ-unsplash.jpg",
  interior: "/stock/food/jelezniac-bianca-FTHK04C2FLg-unsplash.jpg",
  food1: "/stock/food/alexandru-bogdan-ghita-UeYkqQh4PoI-unsplash.jpg",
  food2: "/stock/food/edward-howell-vvUy1hWVYEA-unsplash.jpg",
  food3: "/stock/food/louis-hansel-wVoP_Q2Bg_A-unsplash.jpg",
  blog1: "/stock/nature/degleex-ganzorig-wQImoykAwGs-unsplash.jpg",
  blog2: "/stock/nature/sam-ferrara-1527pjeb6jg-unsplash.jpg",
  blog3: "/stock/nature/cristian-palmer-3leBubkp5hk-unsplash.jpg",
  device: "/stock/industry/thisisengineering-ZPeXrWxOjRQ-unsplash.jpg",
  workspace: "/stock/healthcare/national-cancer-institute-NFvdKIhxYlU-unsplash.jpg",
  team: "/stock/industry/thisisengineering-WjOWazUPAss-unsplash.jpg",
  abstract: "/stock/abstract/mymind-XUlsF9LYeVk-unsplash.jpg",
  graph: "/stock/abstract/maxim-berg-ANuuRuCRRAc-unsplash.jpg",
  outdoor: "/stock/nature/pietro-de-grandi-Q5dMq3cKqec-unsplash.jpg",
  phone: "/stock/food/clay-banks-1Uj0HmqQFGk-unsplash.jpg",
  event: "/stock/food/siyuan-g_V2rt6iG7A-unsplash.jpg",
  book: "/stock/abstract/codioful-formerly-gradienta-n2XqPm7Bqhk-unsplash.jpg",
  property: "/stock/transport/aron-yigin-lNpAmLA_bvQ-unsplash.jpg",
  camera: "/stock/nature/ian-keefe-NBQhCKtg_9Y-unsplash.jpg",
  building: "/stock/architecture/james-sullivan-ESZRBtkQ_f8-unsplash.jpg",
  gym: "/stock/fitness/dane-wetton-zdLdgGbi9Ow-unsplash.jpg",
  podcast: "/stock/abstract/pawel-czerwinski-6lQDFGOB1iw-unsplash.jpg",
  stage: "/stock/architecture/scott-blake-x-ghf9LjrVg-unsplash.jpg",
  law: "/stock/abstract/milad-fakurian-nY14Fs8pxT8-unsplash.jpg",
  finance: "/stock/abstract/magicpattern-87PP9Zd7MNo-unsplash.jpg",
  charity: "/stock/agriculture/land-o-lakes-inc-iFx1WMvjvpw-unsplash.jpg",
  wedding: "/stock/nature/sebastian-unrau-sp-p7uuT0tw-unsplash.jpg",
};

export const TEMPLATES: Template[] = [

  // ===================================================================
  // 1. SAAS LANDING  (Stripe · Linear · Vercel inspired)
  // ===================================================================
  {
    id: "saas-landing",
    name: "SaaS Landing",
    description: "A premium product landing page. Dark hero, feature grids, social proof, pricing, and a bold CTA.",
    category: "landing",
    cover: "from-[#1e1b4b] via-indigo-900 to-violet-800",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        // ── HERO ──
        sec("#0b0f1e", 128, "6xl", "center",
          b("text", { text: "INTRODUCING POLARIS", align: "center", size: "sm", color: "#818cf8" } as any),
          s(16),
          b("heading", { text: "The operating system for modern product teams", level: 1, align: "center", color: "#f8fafc", weight: "bold" } as any),
          s(20),
          b("text", { text: "Plan, build, and ship products your customers love. Polaris connects your roadmap, issues, docs, and releases in one fast, beautiful workspace.", align: "center", size: "xl", color: "#94a3b8" } as any),
          s(32),
          b("columns", { count: 2, gap: 16 }, [
            btn("Start building free", "#6366f1", "primary", "lg", "center"),
            b("button", { label: "Watch a demo →", href: "#", variant: "outline", size: "lg", align: "center", color: "#6366f1", textColor: "#e2e8f0" } as any),
          ]),
          s(16),
          b("text", { text: "No credit card required · 2-minute setup", align: "center", size: "sm", color: "#64748b" } as any),
          s(64),
          img(IMG.graph, "Dashboard built for speed — sub-50ms interactions"),
        ),
        // ── LOGOS ──
        sec("#ffffff", 56, "6xl", "center",
          b("text", { text: "Trusted by engineering teams at", align: "center", size: "sm", color: "#94a3b8" } as any),
          s(24),
          cols(4, 32,
            b("heading", { text: "Stripe", level: 4, align: "center", color: "#cbd5e1", weight: "semibold" } as any),
            b("heading", { text: "Figma", level: 4, align: "center", color: "#cbd5e1", weight: "semibold" } as any),
            b("heading", { text: "Vercel", level: 4, align: "center", color: "#cbd5e1", weight: "semibold" } as any),
            b("heading", { text: "Notion", level: 4, align: "center", color: "#cbd5e1", weight: "semibold" } as any),
          ),
        ),
        div("#e2e8f0"),
        // ── FEATURES GRID ──
        sec("#ffffff", 96, "6xl", "center",
          b("text", { text: "Why the best teams switch", align: "center", size: "sm", color: "#6366f1" } as any),
          s(8),
          h("Everything you need. Nothing you don't.", 2, "#0f172a", "bold", "center"),
          s(16),
          t("Polaris replaces five tools with one. Here's what that looks like.", "lg", "#475569", "center"),
          s(56),
          cols(3, 40,
            b("heading", { text: "⚡", level: 4, align: "left", color: "#0f172a", weight: "normal" } as any),
            s(8),
            b("heading", { text: "Lightning fast", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
            s(4),
            t("Every interaction is under 50 milliseconds. Built on a custom real-time engine that scales to millions of items.", "base", "#475569", "left"),
            s(16),
            b("heading", { text: "🧩", level: 4, align: "left", color: "#0f172a", weight: "normal" } as any),
            s(8),
            b("heading", { text: "Modular by design", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
            s(4),
            t("Start with the pieces you need and add more as your team grows. No lock-in, no bloat.", "base", "#475569", "left"),
            s(16),
            b("heading", { text: "🔒", level: 4, align: "left", color: "#0f172a", weight: "normal" } as any),
            s(8),
            b("heading", { text: "Enterprise security", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
            s(4),
            t("SOC 2 Type II, SAML SSO, audit logs, and role-based access. Your data is encrypted at rest and in transit.", "base", "#475569", "left"),
            // col 2
            b("heading", { text: "🎯", level: 4, align: "left", color: "#0f172a", weight: "normal" } as any),
            s(8),
            b("heading", { text: "Opinionated workflows", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
            s(4),
            t("Pre-built templates for sprints, OKRs, bug triage, and product launches. Less configuration, more doing.", "base", "#475569", "left"),
            s(16),
            b("heading", { text: "🤖", level: 4, align: "left", color: "#0f172a", weight: "normal" } as any),
            s(8),
            b("heading", { text: "AI-native", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
            s(4),
            t("Summarize threads, draft release notes, and triage issues with built-in AI that understands your context.", "base", "#475569", "left"),
            s(16),
            b("heading", { text: "🔄", level: 4, align: "left", color: "#0f172a", weight: "normal" } as any),
            s(8),
            b("heading", { text: "Deep integrations", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
            s(4),
            t("GitHub, GitLab, Slack, Figma, Linear, and 50+ more. Two-way sync so nothing falls through the cracks.", "base", "#475569", "left"),
            // col 3
            b("heading", { text: "📊", level: 4, align: "left", color: "#0f172a", weight: "normal" } as any),
            s(8),
            b("heading", { text: "Real-time dashboards", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
            s(4),
            t("Live charts, burndowns, and velocity reports. Share a link with stakeholders — no login required.", "base", "#475569", "left"),
            s(16),
            b("heading", { text: "📝", level: 4, align: "left", color: "#0f172a", weight: "normal" } as any),
            s(8),
            b("heading", { text: "Rich docs & wikis", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
            s(4),
            t("Write specs, RFCs, and decision logs with collaborative editing, code blocks, and embeds.", "base", "#475569", "left"),
            s(16),
            b("heading", { text: "🚀", level: 4, align: "left", color: "#0f172a", weight: "normal" } as any),
            s(8),
            b("heading", { text: "Ship with confidence", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
            s(4),
            t("Feature flags, release tracking, and deployment annotations tied to your issues. Know what shipped when.", "base", "#475569", "left"),
          ),
        ),
        // ── STATS ──
        sec("#f8fafc", 80, "6xl", "center",
          cols(4, 16,
            b("heading", { text: "120K+", level: 2, align: "center", color: "#6366f1", weight: "bold" } as any),
            b("text", { text: "Teams use Polaris daily", align: "center", size: "sm", color: "#64748b" } as any),
            b("heading", { text: "99.99%", level: 2, align: "center", color: "#6366f1", weight: "bold" } as any),
            b("text", { text: "Uptime SLA", align: "center", size: "sm", color: "#64748b" } as any),
            b("heading", { text: "3.2M", level: 2, align: "center", color: "#6366f1", weight: "bold" } as any),
            b("text", { text: "Issues tracked monthly", align: "center", size: "sm", color: "#64748b" } as any),
            b("heading", { text: "4.9 ★", level: 2, align: "center", color: "#6366f1", weight: "bold" } as any),
            b("text", { text: "G2 rating", align: "center", size: "sm", color: "#64748b" } as any),
          ),
        ),
        // ── SHOWCASE ──
        sec("#ffffff", 96, "6xl", "center",
          b("text", { text: "DESIGNED FOR SPEED", align: "center", size: "sm", color: "#6366f1" } as any),
          s(8),
          h("Beautiful to look at. Fast to use.", 2, "#0f172a", "bold", "center"),
          s(16),
          t("Every pixel was designed to reduce cognitive load and increase throughput. Dark mode and light mode, carefully crafted.", "lg", "#475569", "center"),
          s(48),
          img(IMG.device, "The Polaris dashboard — dark mode with real-time collaboration"),
          s(48),
          cols(2, 48,
            sec("#transparent", 0, "full", "left",
              b("heading", { text: "Command palette", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
              s(8),
              t("⌘K to search, navigate, and act — without ever touching the mouse.", "base", "#475569", "left"),
            ),
            sec("#transparent", 0, "full", "left",
              b("heading", { text: "Keyboard-first design", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
              s(8),
              t("Every action has a shortcut. Power users can fly through their workflow at the speed of thought.", "base", "#475569", "left"),
            ),
          ),
        ),
        // ── PRICING ──
        sec("#f8fafc", 96, "6xl", "center",
          b("text", { text: "PRICING", align: "center", size: "sm", color: "#6366f1" } as any),
          s(8),
          h("Plans for teams of every size", 2, "#0f172a", "bold", "center"),
          s(12),
          t("Start free, scale when you're ready. All plans include a 14-day trial of Pro features.", "lg", "#475569", "center"),
          s(48),
          cols(3, 24,
            sec("#ffffff", 48, "full", "center",
              b("heading", { text: "Starter", level: 3, align: "center", color: "#0f172a", weight: "semibold" } as any),
              s(4),
              t("For individuals and small projects.", "sm", "#64748b", "center"),
              s(16),
              b("heading", { text: "Free", level: 2, align: "center", color: "#0f172a", weight: "bold" } as any),
              t("forever", "sm", "#94a3b8", "center"),
              s(16),
              div("#e2e8f0"),
              s(16),
              lst(["Up to 5 users", "3 projects", "Basic integrations", "Community support", "1 GB storage"], "check"),
              s(16),
              btn("Get started", "#0f172a", "primary", "md", "center"),
            ),
            sec("#ffffff", 48, "full", "center",
              b("section", { background: "#6366f1", paddingY: 4, paddingX: 0, maxWidth: "full", align: "center" }, [
                b("text", { text: "MOST POPULAR", align: "center", size: "sm", color: "#ffffff" } as any),
              ] as any),
              s(8),
              b("heading", { text: "Pro", level: 3, align: "center", color: "#0f172a", weight: "semibold" } as any),
              s(4),
              t("For growing teams that need more power.", "sm", "#64748b", "center"),
              s(16),
              b("heading", { text: "$8", level: 2, align: "center", color: "#0f172a", weight: "bold" } as any),
              t("per user / month", "sm", "#94a3b8", "center"),
              s(16),
              div("#e2e8f0"),
              s(16),
              lst(["Unlimited users", "Unlimited projects", "All integrations", "Priority support", "50 GB storage", "Advanced analytics", "SSO / SAML"], "check"),
              s(16),
              btn("Start free trial", "#6366f1", "primary", "md", "center"),
            ),
            sec("#ffffff", 48, "full", "center",
              b("heading", { text: "Enterprise", level: 3, align: "center", color: "#0f172a", weight: "semibold" } as any),
              s(4),
              t("For large organizations with advanced needs.", "sm", "#64748b", "center"),
              s(16),
              b("heading", { text: "Custom", level: 2, align: "center", color: "#0f172a", weight: "bold" } as any),
              t("let's talk", "sm", "#94a3b8", "center"),
              s(16),
              div("#e2e8f0"),
              s(16),
              lst(["Everything in Pro", "Dedicated infra", "Custom integrations", "SLA guarantee", "On-premise option", "Dedicated support", "Custom contracts"], "check"),
              s(16),
              btn("Contact sales", "#0f172a", "outline", "md", "center"),
            ),
          ),
        ),
        // ── TESTIMONIALS ──
        sec("#ffffff", 96, "6xl", "center",
          b("text", { text: "LOVED BY BUILDERS", align: "center", size: "sm", color: "#6366f1" } as any),
          s(8),
          h("What our customers say", 2, "#0f172a", "bold", "center"),
          s(48),
          q("We evaluated 12 tools before choosing Polaris. It was the only one that didn't make our engineering team groan when they opened it. The speed is unreal.", "Nadia Chen", "VP Engineering, Opal Security", "center"),
          s(32),
          q("Switching from Jira felt impossible — until our trial week. We migrated 4,000 issues in an afternoon. Haven't looked back in 18 months.", "Marcus Johansson", "CTO, Beekeeper Studio", "center"),
          s(32),
          div("#e2e8f0"),
          s(32),
          cols(2, 16,
            btn("Start building free", "#6366f1", "primary", "lg", "center"),
            b("button", { label: "Talk to sales →", href: "#", variant: "outline", size: "lg", align: "center", color: "#6366f1", textColor: "#0f172a" } as any),
          ),
        ),
        // ── FOOTER CTA ──
        sec("#0b0f1e", 64, "4xl", "center",
          h("Ready to ship faster?", 2, "#f8fafc", "bold", "center"),
          s(12),
          t("Join 120,000+ teams already using Polaris. Free forever for up to 5 people.", "lg", "#94a3b8", "center"),
          s(32),
          btn("Get started — it's free", "#6366f1", "primary", "lg", "center"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 2. AGENCY PORTFOLIO  (Apple / Pentagram inspired)
  // ===================================================================
  {
    id: "agency",
    name: "Agency Studio",
    description: "A bold creative agency site. Full-bleed dark hero, case studies, services, clients, and a strong contact section.",
    category: "portfolio",
    cover: "from-black via-neutral-900 to-stone-800",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        // HERO
        sec("#0a0a0a", 120, "6xl", "left",
          b("text", { text: "STUDIO", align: "left", size: "sm", color: "#a3a3a3" } as any),
          s(12),
          b("heading", { text: "We design digital products that people love to use.", level: 1, align: "left", color: "#fafafa", weight: "bold" } as any),
          s(20),
          t("A design and engineering studio of 12 people working with the world's most ambitious startups and enterprises.", "xl", "#737373", "left"),
          s(32),
          b("columns", { count: 2, gap: 16 }, [
            btn("View our work ↓", "#fafafa", "secondary", "lg", "left"),
            b("button", { label: "Start a project →", href: "#", variant: "outline", size: "lg", align: "left", color: "#fafafa", textColor: "#fafafa" } as any),
          ]),
          s(80),
          img(IMG.heroAgency, ""),
        ),
        // CLIENTS
        sec("#ffffff", 64, "6xl", "center",
          t("Selected clients", "sm", "#a3a3a3", "center"),
          s(24),
          cols(4, 16,
            b("heading", { text: "Airbnb", level: 4, align: "center", color: "#d4d4d4", weight: "semibold" } as any),
            b("heading", { text: "Spotify", level: 4, align: "center", color: "#d4d4d4", weight: "semibold" } as any),
            b("heading", { text: "Revolut", level: 4, align: "center", color: "#d4d4d4", weight: "semibold" } as any),
            b("heading", { text: "Shopify", level: 4, align: "center", color: "#d4d4d4", weight: "semibold" } as any),
          ),
        ),
        div("#e5e5e5"),
        // WORK 1
        sec("#ffffff", 80, "6xl", "left",
          h("Era — AI research platform", 2, "#171717", "bold", "left"),
          s(12),
          t("Brand identity, UX strategy, and full product redesign for an AI startup backed by Sequoia. We shipped a 0-to-1 product in 8 weeks.", "lg", "#525252", "left"),
          s(8),
          b("text", { text: "Brand · Product Design · Frontend Engineering · Motion", align: "left", size: "sm", color: "#a3a3a3" } as any),
          s(32),
          img(IMG.graph, "Home screen — light mode with real-time data visualization"),
        ),
        s(40),
        div("#e5e5e5"),
        s(40),
        // WORK 2
        sec("#ffffff", 80, "6xl", "right",
          h("Notch — creative toolkit", 2, "#171717", "bold", "right"),
          s(12),
          t("We partnered with Notch for 2 years to design and build their entire product suite. The result: #1 Product of the Day on Product Hunt and a $12M Series A.", "lg", "#525252", "right"),
          s(8),
          b("text", { text: "Strategy · UX Research · Design System · Mobile App", align: "right", size: "sm", color: "#a3a3a3" } as any),
          s(32),
          img(IMG.device, "Mobile dashboard with gesture-based navigation"),
        ),
        // SERVICES
        sec("#fafafa", 96, "6xl", "center",
          t("WHAT WE DO", "sm", "#a3a3a3", "center"),
          s(8),
          h("Strategy, design, and engineering under one roof.", 2, "#171717", "bold"),
          s(48),
          cols(3, 40,
            b("heading", { text: "Brand & Identity", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
            s(8),
            t("Naming, visual identity, tone of voice, brand guidelines, and asset production.", "base", "#525252", "left"),
            s(24),
            b("heading", { text: "Product Design", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
            s(8),
            t("UX research, information architecture, prototyping, design systems, and visual design for web and mobile.", "base", "#525252", "left"),
            s(24),
            b("heading", { text: "Engineering", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
            s(8),
            t("React, Swift, Flutter — we write production code. Not throwaway prototypes. Our engineers sit in your standups.", "base", "#525252", "left"),
          ),
        ),
        // TESTIMONIAL
        sec("#0a0a0a", 80, "4xl", "center",
          q("The Studio team doesn't just deliver designs — they deliver conviction. Every pixel has a reason. Working with them felt like having a world-class design team in-house.", "Elena Kovač", "CEO, Era Technologies", "center"),
          s(24),
          btn("Let's build something great", "#fafafa", "outline", "lg", "center"),
        ),
        // FOOTER
        sec("#ffffff", 64, "4xl", "center",
          h("Ready to start?", 2, "#171717", "bold"),
          s(12),
          t("We take on 3–4 new projects per quarter. Tell us about yours.", "lg", "#525252", "center"),
          s(24),
          btn("hello@the.studio →", "#171717", "primary", "lg", "center"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 3. PERSONAL PORTFOLIO  (Designer / developer)
  // ===================================================================
  {
    id: "portfolio",
    name: "Personal Portfolio",
    description: "A polished personal site for designers, developers, and writers. With project cards, timeline, and contact.",
    category: "portfolio",
    cover: "from-amber-100 via-orange-200 to-rose-200",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#fffbeb", 96, "5xl", "left",
          b("text", { text: "Hello, I'm", align: "left", size: "base", color: "#b45309" } as any),
          h("Sofia Nakamura", 1, "#171717", "bold", "left"),
          s(12),
          t("Product designer at Stripe, previously at Figma. I design tools that help people do their best work. Based in New York City.", "xl", "#525252", "left"),
          s(32),
          b("columns", { count: 2, gap: 16 }, [
            btn("View my work ↓", "#171717", "primary", "md", "left"),
            b("button", { label: "Get in touch →", href: "#", variant: "outline", size: "md", align: "left", color: "#171717", textColor: "#171717" } as any),
          ]),
        ),
        // PROJECTS
        sec("#ffffff", 80, "6xl", "center",
          t("SELECTED WORK", "sm", "#a3a3a3", "center"),
          s(8),
          h("Recent projects", 2, "#171717", "bold"),
          s(48),
          img(IMG.device, "Stripe Dashboard · 2025 — Led the redesign of Stripe's revenue reporting suite"),
          s(32),
          img(IMG.graph, "Figma Design Systems · 2024 — Built the component library used by 400+ designers"),
          s(32),
          img(IMG.workspace, "Side project — Linear-style writing app · 2025 — Designed and shipped in 3 weekends"),
        ),
        // EXPERIENCE
        sec("#fafafa", 80, "5xl", "center",
          t("EXPERIENCE", "sm", "#a3a3a3", "center"),
          s(8),
          h("Where I've worked", 2, "#171717", "bold"),
          s(40),
          b("heading", { text: "Senior Product Designer  ·  Stripe", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
          t("2023 — Present  ·  Revenue & Billing team", "base", "#737373", "left"),
          s(8),
          t("Leading design for Stripe's analytics and reporting products. Shipped 3 major features used by 200K+ businesses.", "base", "#525252", "left"),
          s(24),
          b("heading", { text: "Product Designer  ·  Figma", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
          t("2020 — 2023  ·  Design Systems team", "base", "#737373", "left"),
          s(8),
          t("Owned the component library and auto-layout engine. Grew adoption from 40% to 90% across the design org.", "base", "#525252", "left"),
        ),
        // TESTIMONIALS
        sec("#ffffff", 80, "4xl", "center",
          q("Sofia is one of those rare designers who can move seamlessly between high-level strategy and pixel-perfect craft. She shipped the most impactful project our billing team has ever delivered.", "Ryan Park", "Director of Design, Stripe", "center"),
        ),
        // CONTACT
        sec("#fffbeb", 80, "4xl", "center",
          h("Let's work together", 2, "#171717", "bold"),
          s(12),
          t("I'm always open to chatting about design, technology, and interesting projects.", "lg", "#525252", "center"),
          s(24),
          btn("sofia@example.com →", "#171717", "primary", "lg", "center"),
        ),
      ],
    }, {
      title: "About", slug: "about", published: true,
      blocks: [
        sec("#ffffff", 80, "5xl", "left",
          h("About me", 1, "#171717", "bold", "left"),
          s(16),
          t("I'm a product designer with 8 years of experience building tools for creators and developers. My work lives at the intersection of systems thinking and visual craft.", "xl", "#525252", "left"),
          s(24),
          t("At Figma, I built the design systems that hundreds of designers use daily. At Stripe, I lead design for the reporting suite — turning complex financial data into clear, actionable interfaces.", "lg", "#525252", "left"),
          s(24),
          t("Outside of work, I write about design systems, mentor junior designers through ADPList, and spend my weekends hiking in the Hudson Valley.", "lg", "#525252", "left"),
          s(32),
          img(IMG.heroPortfolio, ""),
        ),
      ],
    }],
  },

  // ===================================================================
  // 4. RESTAURANT  (Premium dining)
  // ===================================================================
  {
    id: "restaurant",
    name: "Restaurant",
    description: "An elegant site for fine dining. Full hero image, tasting menu, gallery, reviews, and reservation.",
    category: "business",
    cover: "from-emerald-800 via-green-900 to-teal-900",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        // HERO
        sec("#064e3b", 0, "full", "center",
          // no children for section since the background is the image
        ),
        // Put image before section for full bleed
        img(IMG.food1, ""),
        sec("#064e3b", 80, "5xl", "center",
          h("Cedar & Salt", 1, "#f0fdf4", "bold"),
          s(12),
          t("A neighborhood kitchen in Brooklyn's Cobble Hill. Seasonal plates, natural wine, and warm hospitality since 2019.", "xl", "#a7f3d0", "center"),
          s(32),
          b("columns", { count: 2, gap: 16 }, [
            btn("Reserve a table", "#facc15", "primary", "lg", "center"),
            b("button", { label: "View the menu ↓", href: "#menu", variant: "outline", size: "lg", align: "center", color: "#facc15", textColor: "#facc15" } as any),
          ]),
          s(8),
          t("Dinner Wed–Sun  ·  5:30 PM – 10:00 PM  ·  242 Court St, Brooklyn", "sm", "#6ee7b7", "center"),
        ),
        // ABOUT
        sec("#ffffff", 80, "6xl", "left",
          cols(2, 48,
            h("Our philosophy is simple.", 2, "#064e3b", "bold", "left"),
            t("Everything we serve is sourced within 150 miles of the restaurant. We work with 14 farms, 3 fisheries, and a forager in the Catskills. The menu changes every week based on what's at peak season.", "lg", "#525252", "left"),
          ),
        ),
        s(48),
        img(IMG.interior, "Our dining room — 32 seats, an open kitchen, and a 200-bottle wine wall"),
        s(64),
        // MENU
        sec("#f8fafc", 80, "5xl", "left",
          b("html", { html: '<div id="menu"></div>' } as any),
          t("THIS WEEK'S MENU", "sm", "#059669", "left"),
          s(8),
          h("Spring tasting", 2, "#064e3b", "bold", "left"),
          s(12),
          t("Six courses  ·  $95 per person  ·  Wine pairing +$55", "lg", "#525252", "left"),
          s(32),
          cols(2, 24,
            sec("#ffffff", 32, "full", "left",
              lst([
                "Wild ramp velouté, cultured butter",
                "Hamachi crudo, gooseberry, shiso",
                "Green asparagus, morel mushroom, hollandaise",
                "Ricotta agnolotti, spring peas, mint",
              ], "bullet"),
            ),
            sec("#ffffff", 32, "full", "left",
              lst([
                "Roasted duck breast, rhubarb, fennel",
                "Cheese course: 3 American artisan cheeses",
                "Strawberry sorbet, lemon verbena, meringue",
                "Petit fours & digestif",
              ], "bullet"),
            ),
          ),
        ),
        s(48),
        img(IMG.food2, ""),
        s(48),
        img(IMG.food3, ""),
        // REVIEWS
        sec("#ffffff", 80, "4xl", "center",
          t("WHAT PEOPLE SAY", "sm", "#059669", "center"),
          s(8),
          h("Guest notes", 2, "#064e3b", "bold"),
          s(32),
          q("An absolute gem. The tasting menu felt like a love letter to the Hudson Valley. Every course surprised us.", "Michael Torres", "The New York Times", "center"),
          s(24),
          q("Chef Amara has created something special here. It's the kind of place you want to keep secret but can't stop telling people about.", "Lena Park", "Michelin Guide Inspector", "center"),
        ),
        // RESERVATION CTA
        sec("#064e3b", 80, "4xl", "center",
          h("Join us for dinner", 2, "#f0fdf4", "bold"),
          s(12),
          t("Reservations open two weeks in advance. Walk-ins always welcome at the bar.", "lg", "#a7f3d0", "center"),
          s(24),
          btn("Reserve a table", "#facc15", "primary", "lg", "center"),
          s(8),
          t("242 Court Street  ·  Brooklyn, NY 11201  ·  (718) 555-0182", "sm", "#6ee7b7", "center"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 5. JOURNAL / BLOG  (Premium publication)
  // ===================================================================
  {
    id: "blog",
    name: "Journal",
    description: "A beautiful blog with a featured hero post, article grid, newsletter, and author section.",
    category: "blog",
    cover: "from-purple-400 via-indigo-400 to-sky-400",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#ffffff", 80, "5xl", "left",
          h("The Journal", 1, "#171717", "bold", "left"),
          s(12),
          t("Long-form essays on design, engineering, and the creative process. Published every Tuesday.", "xl", "#525252", "left"),
          s(32),
          div("#e5e5e5"),
          s(32),
          // FEATURED POST
          b("text", { text: "FEATURED", align: "left", size: "sm", color: "#7c3aed" } as any),
          s(8),
          h("Why great design systems are boring (and that's the point)", 2, "#171717", "bold", "left"),
          s(8),
          t("The best design systems aren't the ones that win awards. They're the ones nobody notices. Here's why predictability beats creativity in component libraries — and how to build one that actually gets adopted.", "lg", "#525252", "left"),
          s(12),
          b("text", { text: "May 12, 2026  ·  14 min read  ·  Design Systems", align: "left", size: "sm", color: "#a3a3a3" } as any),
          s(16),
          btn("Read essay →", "#7c3aed", "outline", "md", "left"),
          s(40),
          div("#e5e5e5"),
          s(40),
          // POST GRID
          h("More from the archive", 2, "#171717", "bold", "left"),
          s(32),
          cols(2, 32,
            // Post 1
            sec("#fafafa", 24, "full", "left",
              img(IMG.blog1, ""),
              s(16),
              b("text", { text: "Engineering", align: "left", size: "sm", color: "#7c3aed" } as any),
              s(4),
              b("heading", { text: "How we halved our build times with one config change", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
              s(4),
              t("The story of how a 30-line Webpack tweak saved our team 400 hours per year. With benchmarks.", "base", "#525252", "left"),
              s(8),
              t("Apr 28, 2026  ·  8 min read", "sm", "#a3a3a3", "left"),
            ),
            // Post 2
            sec("#fafafa", 24, "full", "left",
              img(IMG.blog2, ""),
              s(16),
              b("text", { text: "Design", align: "left", size: "sm", color: "#7c3aed" } as any),
              s(4),
              b("heading", { text: "The case for ugly first drafts in product design", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
              s(4),
              t("Speed beats polish in the early stages. Here's how I learned to stop worrying and love the wireframe.", "base", "#525252", "left"),
              s(8),
              t("Apr 15, 2026  ·  11 min read", "sm", "#a3a3a3", "left"),
            ),
            // Post 3
            sec("#fafafa", 24, "full", "left",
              img(IMG.blog3, ""),
              s(16),
              b("text", { text: "Career", align: "left", size: "sm", color: "#7c3aed" } as any),
              s(4),
              b("heading", { text: "What I learned in 10 years of remote design leadership", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
              s(4),
              t("Async communication, trust batteries, and why the best managers say no 90% of the time.", "base", "#525252", "left"),
              s(8),
              t("Mar 30, 2026  ·  16 min read", "sm", "#a3a3a3", "left"),
            ),
            // Post 4
            sec("#fafafa", 24, "full", "left",
              img(IMG.graph, ""),
              s(16),
              b("text", { text: "Engineering", align: "left", size: "sm", color: "#7c3aed" } as any),
              s(4),
              b("heading", { text: "A practical guide to CSS container queries", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
              s(4),
              t("Container queries are finally here. Here's how to use them today, with production-ready patterns.", "base", "#525252", "left"),
              s(8),
              t("Mar 18, 2026  ·  9 min read", "sm", "#a3a3a3", "left"),
            ),
          ),
        ),
        // NEWSLETTER
        sec("#f8fafc", 80, "4xl", "center",
          h("Get the next essay in your inbox", 2, "#171717", "bold"),
          s(8),
          t("One email every Tuesday. No spam, no ads — just thoughtful writing about design and engineering.", "lg", "#525252", "center"),
          s(24),
          b("button", { label: "Subscribe — it's free", href: "#", variant: "primary", size: "lg", align: "center", color: "#7c3aed", textColor: "#ffffff" } as any),
          s(8),
          t("Join 12,000+ readers", "sm", "#a3a3a3", "center"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 6. PRODUCT SHOWCASE  (Apple-style product page)
  // ===================================================================
  {
    id: "product",
    name: "Product",
    description: "An Apple-inspired product page with hero device mockups, feature breakdowns, and tech specs.",
    category: "landing",
    cover: "from-blue-600 via-sky-500 to-cyan-400",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#f0f9ff", 96, "6xl", "center",
          b("text", { text: "NEW", align: "center", size: "sm", color: "#0284c7" } as any),
          s(8),
          h("Meet Arc Monitor", 1, "#0f172a", "bold"),
          s(16),
          t("The 32-inch 6K display designed for creative professionals. Reference-grade color accuracy, built-in calibration, and a zero-bezel design that disappears into your workflow.", "xl", "#475569", "center"),
          s(32),
          b("heading", { text: "From $1,599", level: 3, align: "center", color: "#0f172a", weight: "semibold" } as any),
          s(16),
          b("columns", { count: 3, gap: 16 }, [
            btn("Pre-order", "#0284c7", "primary", "lg", "center"),
            b("button", { label: "Watch the film →", href: "#", variant: "outline", size: "lg", align: "center", color: "#0284c7", textColor: "#0284c7" } as any),
            b("button", { label: "Compare models →", href: "#", variant: "ghost", size: "lg", align: "center", color: "#0284c7", textColor: "#475569" } as any),
          ]),
          s(48),
          img(IMG.device, ""),
        ),
        // FEATURE 1
        sec("#ffffff", 96, "6xl", "center",
          h("6K resolution. Zero compromise.", 2, "#0f172a", "bold"),
          s(16),
          cols(2, 40,
            t("Arc Monitor delivers 6016 × 3384 pixels at 218 PPI — that's 40% more pixels than 4K. Text is sharp enough to read body copy at 100% without zooming. Every detail of your work is visible, without scrolling or panning.", "lg", "#475569", "left"),
            lst(["6016 × 3384 native resolution", "P3 wide color gamut", "1600 nits peak brightness (HDR)", "True Tone with ambient light sensor", "Anti-reflective nano-texture glass"], "check"),
          ),
          s(56),
          img(IMG.graph, "Side-by-side color accuracy comparison: Arc Monitor vs reference display"),
        ),
        // FEATURE 2
        sec("#f8fafc", 96, "6xl", "center",
          cols(2, 48,
            h("Built-in calibration. Always accurate.", 2, "#0f172a", "bold", "left"),
            t("A built-in spectrophotometer calibrates your display every time you turn it on. No external hardware, no monthly ritual — just perfect color, always. Factory-calibrated to Delta E < 1.", "lg", "#475569", "left"),
            s(16),
            btn("Learn more about color →", "#0284c7", "ghost", "md", "left"),
          ),
          s(32),
          img(IMG.workspace, ""),
        ),
        // SPECS
        sec("#ffffff", 96, "6xl", "center",
          h("Technical specifications", 2, "#0f172a", "bold"),
          s(48),
          cols(3, 24,
            b("heading", { text: "Display", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
            s(8),
            lst(["32-inch IPS LCD", "6016 × 3384 at 218 PPI", "P3 wide color, 10-bit", "1600 nits peak (HDR)", "Delta E < 1 calibrated"], "check"),
            b("heading", { text: "Connectivity", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
            s(8),
            lst(["1 × Thunderbolt 4 (96W PD)", "3 × USB-C 3.2", "1 × HDMI 2.1", "1 × 3.5mm audio"], "check"),
            b("heading", { text: "In the box", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
            s(8),
            lst(["Arc Monitor", "Thunderbolt 4 cable (2m)", "Power cable", "Cleaning cloth", "Quick start guide"], "check"),
          ),
        ),
        // CTA
        sec("#f0f9ff", 80, "4xl", "center",
          h("Arc Monitor", 2, "#0f172a", "bold"),
          s(8),
          t("Pre-orders start at $1,599. Ships in 3–4 weeks.", "lg", "#475569", "center"),
          s(24),
          btn("Pre-order now", "#0284c7", "primary", "lg", "center"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 7. CREATIVE STUDIO  (Bold / artistic)
  // ===================================================================
  {
    id: "creative",
    name: "Creative Studio",
    description: "A bold, artistic studio site. Video hero, case studies, process, and a dramatic contact section.",
    category: "portfolio",
    cover: "from-fuchsia-700 via-purple-600 to-indigo-700",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        // HERO
        sec("#0f0518", 112, "6xl", "center",
          b("text", { text: "STUDIO RUIN", align: "center", size: "sm", color: "#c084fc" } as any),
          s(12),
          b("heading", { text: "We make brands impossible to ignore.", level: 1, align: "center", color: "#fafafa", weight: "bold" } as any),
          s(20),
          t("A creative studio specializing in bold brand identities, motion design, and interactive experiences for forward-thinking companies.", "xl", "#a78bfa", "center"),
          s(32),
          btn("See our work ↓", "#c084fc", "primary", "lg", "center"),
          s(64),
          img(IMG.abstract, ""),
        ),
        // CLIENTS
        sec("#ffffff", 64, "6xl", "center",
          t("WE'VE WORKED WITH", "sm", "#a3a3a3", "center"),
          s(24),
          cols(4, 16,
            b("heading", { text: "Nike", level: 4, align: "center", color: "#d4d4d4", weight: "semibold" } as any),
            b("heading", { text: "Adobe", level: 4, align: "center", color: "#d4d4d4", weight: "semibold" } as any),
            b("heading", { text: "Coinbase", level: 4, align: "center", color: "#d4d4d4", weight: "semibold" } as any),
            b("heading", { text: "Riot Games", level: 4, align: "center", color: "#d4d4d4", weight: "semibold" } as any),
          ),
        ),
        div("#e5e5e5"),
        // CASE STUDIES
        sec("#ffffff", 96, "6xl", "center",
          t("FEATURED WORK", "sm", "#c084fc", "center"),
          s(8),
          h("Selected projects", 2, "#171717", "bold"),
          s(48),
          img(IMG.graph, "Nike · Run Club — Brand refresh, motion identity, and global campaign toolkit · 2024"),
          s(40),
          img(IMG.abstract, "Coinbase · Web3 identity — Logo system, website, and product illustrations · 2024"),
          s(40),
          img(IMG.device, "Adobe · Creative Cloud — Product launch campaign and interactive landing page · 2025"),
        ),
        // PROCESS
        sec("#fafafa", 96, "6xl", "center",
          t("HOW WE WORK", "sm", "#c084fc", "center"),
          s(8),
          h("Strategy, then style. Always in that order.", 2, "#171717", "bold"),
          s(48),
          cols(4, 24,
            b("heading", { text: "01. Discover", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
            s(4),
            t("Deep research into your audience, competitors, and culture. We find the white space others miss.", "sm", "#525252", "left"),
            b("heading", { text: "02. Define", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
            s(4),
            t("A tight strategy brief with clear direction, mood boards, and a creative territory we commit to.", "sm", "#525252", "left"),
            b("heading", { text: "03. Design", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
            s(4),
            t("Rapid iteration across identity, motion, and digital — with your team in the loop at every milestone.", "sm", "#525252", "left"),
            b("heading", { text: "04. Deliver", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
            s(4),
            t("Production-ready assets, guidelines, and a launch strategy. We don't hand off and disappear.", "sm", "#525252", "left"),
          ),
        ),
        // TESTIMONIAL
        sec("#0f0518", 80, "4xl", "center",
          q("Studio Ruin didn't just redesign our brand — they redefined how we think about our identity. The work they delivered became the foundation of our entire marketing strategy for the next two years.", "Devin Okonkwo", "VP Brand, Coinbase", "center"),
        ),
        // CTA
        sec("#ffffff", 80, "4xl", "center",
          h("Have a project in mind?", 2, "#171717", "bold"),
          s(12),
          t("We take on a limited number of projects each year. Tell us about yours — we'd love to hear it.", "lg", "#525252", "center"),
          s(24),
          btn("Start the conversation →", "#c084fc", "primary", "lg", "center"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 8. BLANK  (Minimal)
  // ===================================================================
  {
    id: "blank",
    name: "Blank",
    description: "A clean starting point. One heading, one paragraph — build anything from here.",
    category: "minimal",
    cover: "from-slate-200 to-slate-100",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#ffffff", 128, "5xl", "center",
          h("Hello, world", 1, "#171717", "bold"),
          s(12),
          t("Start by dragging blocks from the palette on the left, or click any text to edit it inline. Build anything.", "xl", "#525252", "center"),
          s(32),
          btn("Get started ↓", "#6366f1", "primary", "md", "center"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 9.  APP LAUNCH  (Mobile app landing)
  // ===================================================================
  {
    id: "app-launch",
    name: "App Launch",
    description: "A mobile app landing page. Dark hero with phone mockups, feature highlights, screenshots, and download CTAs.",
    category: "landing",
    cover: "from-violet-600 via-purple-600 to-fuchsia-600",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#0f0720", 112, "6xl", "center",
          b("text", { text: "NOW ON IOS & ANDROID", align: "center", size: "sm", color: "#a78bfa" } as any),
          s(12),
          h("Your habits, beautifully tracked.", 1, "#fafafa", "bold"),
          s(16),
          t("Streak makes habit building feel like a game. Set goals, track progress, and build routines that stick — in just 2 minutes a day.", "xl", "#a78bfa", "center"),
          s(32),
          b("columns", { count: 3, gap: 16 }, [
            btn("Download on iOS", "#a78bfa", "primary", "lg", "center"),
            b("button", { label: "Get it on Android", href: "#", variant: "outline", size: "lg", align: "center", color: "#a78bfa", textColor: "#c4b5fd" } as any),
            b("button", { label: "Try the web app →", href: "#", variant: "ghost", size: "lg", align: "center", color: "#a78bfa", textColor: "#8b5cf6" } as any),
          ]),
          s(8),
          t("Free for up to 5 habits. Pro unlocks unlimited.", "sm", "#7c3aed", "center"),
          s(48),
          img(IMG.phone, ""),
        ),
        sec("#ffffff", 96, "6xl", "center",
          h("Why 2 million people use Streak", 2, "#171717", "bold"),
          s(48),
          cols(3, 40,
            b("heading", { text: "🎯", level: 4, align: "left", color: "#171717", weight: "normal" } as any),
            s(8),
            b("heading", { text: "Smart reminders", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
            s(4),
            t("AI learns when you're most likely to complete a habit and nudges you at the perfect moment.", "base", "#525252", "left"),
            b("heading", { text: "📊", level: 4, align: "left", color: "#171717", weight: "normal" } as any),
            s(8),
            b("heading", { text: "Beautiful charts", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
            s(4),
            t("See your streaks, consistency scores, and yearly heatmaps in stunning, shareable charts.", "base", "#525252", "left"),
            b("heading", { text: "👥", level: 4, align: "left", color: "#171717", weight: "normal" } as any),
            s(8),
            b("heading", { text: "Friend challenges", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
            s(4),
            t("Compete with friends on habit streaks. The accountability makes all the difference.", "base", "#525252", "left"),
          ),
        ),
        sec("#f8fafc", 80, "5xl", "center",
          q("I've tried every habit tracker. Streak is the only one I've used for more than a week. The design is so good it actually makes me want to open it.", "Priya Sharma", "4.9 ★ on the App Store", "center"),
          s(32),
          b("columns", { count: 2, gap: 16 }, [
            btn("Download free", "#7c3aed", "primary", "lg", "center"),
            btn("4.9 ★ · 50K+ reviews", "#7c3aed", "ghost", "lg", "center"),
          ]),
        ),
      ],
    }],
  },

  // ===================================================================
  // 10. CONFERENCE  (Event landing)
  // ===================================================================
  {
    id: "conference",
    name: "Conference",
    description: "An event landing page with date, speaker lineup, schedule, venue, and ticket registration.",
    category: "landing",
    cover: "from-cyan-500 via-blue-600 to-indigo-700",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#0c1929", 112, "6xl", "center",
          b("text", { text: "OCTOBER 12–14, 2026  ·  SAN FRANCISCO", align: "center", size: "sm", color: "#38bdf8" } as any),
          s(16),
          h("Design Systems Conf", 1, "#f0f9ff", "bold"),
          s(16),
          t("Three days of talks, workshops, and connection with the people shaping design systems at the world's top companies.", "xl", "#7dd3fc", "center"),
          s(32),
          b("columns", { count: 2, gap: 16 }, [
            btn("Get tickets →", "#38bdf8", "primary", "lg", "center"),
            b("button", { label: "Become a sponsor", href: "#", variant: "outline", size: "lg", align: "center", color: "#38bdf8", textColor: "#bae6fd" } as any),
          ]),
          s(48),
          img(IMG.stage, ""),
        ),
        sec("#ffffff", 80, "6xl", "center",
          h("Speakers", 2, "#171717", "bold"),
          s(32),
          cols(4, 24,
            b("heading", { text: "Sarah Chen", level: 3, align: "center", color: "#171717", weight: "semibold" } as any),
            t("Design Systems Lead, Stripe", "sm", "#737373", "center"),
            b("heading", { text: "Marcus Webb", level: 3, align: "center", color: "#171717", weight: "semibold" } as any),
            t("Staff Engineer, Vercel", "sm", "#737373", "center"),
            b("heading", { text: "Elena Torres", level: 3, align: "center", color: "#171717", weight: "semibold" } as any),
            t("Principal Designer, Figma", "sm", "#737373", "center"),
            b("heading", { text: "David Kim", level: 3, align: "center", color: "#171717", weight: "semibold" } as any),
            t("Design Engineer, Linear", "sm", "#737373", "center"),
          ),
        ),
        sec("#f8fafc", 80, "5xl", "center",
          h("Schedule", 2, "#171717", "bold"),
          s(32),
          b("heading", { text: "Day 1 — Foundations", level: 3, align: "left", color: "#0284c7", weight: "semibold" } as any),
          s(8),
          t("Design tokens · Component architecture · Accessibility by default", "lg", "#525252", "left"),
          s(16),
          b("heading", { text: "Day 2 — Scale", level: 3, align: "left", color: "#0284c7", weight: "semibold" } as any),
          s(8),
          t("Multi-brand systems · Versioning strategies · Adoption at enterprise scale", "lg", "#525252", "left"),
          s(16),
          b("heading", { text: "Day 3 — Craft", level: 3, align: "left", color: "#0284c7", weight: "semibold" } as any),
          s(8),
          t("Motion design · Documentation that works · Hands-on workshops", "lg", "#525252", "left"),
          s(40),
          b("columns", { count: 2, gap: 16 }, [
            b("heading", { text: "$599 Early bird", level: 2, align: "left", color: "#171717", weight: "bold" } as any),
            t("Until July 31", "sm", "#525252", "left"),
            b("heading", { text: "Palace of Fine Arts", level: 2, align: "left", color: "#171717", weight: "bold" } as any),
            t("San Francisco, CA", "sm", "#525252", "left"),
          ]),
          s(24),
          btn("Register now →", "#0284c7", "primary", "lg", "center"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 11. EBOOK  (Lead magnet)
  // ===================================================================
  {
    id: "ebook",
    name: "eBook",
    description: "A lead magnet landing page with a book mockup, chapter preview, author bio, and email capture.",
    category: "landing",
    cover: "from-orange-400 via-red-400 to-rose-500",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#fff7ed", 96, "6xl", "left",
          cols(2, 48,
            h("The Design Engineering Handbook", 1, "#171717", "bold", "left"),
            t("A free 120-page guide to bridging the gap between design and engineering. Written for designers who want to code and engineers who want to design.", "xl", "#525252", "left"),
            s(24),
            lst(["120 pages of practical advice", "Code examples in React & SwiftUI", "Real-world case studies from 12 companies", "Free forever — no email tricks"], "check"),
            s(24),
            b("button", { label: "Download the PDF →", href: "#", variant: "primary", size: "lg", align: "left", color: "#ea580c", textColor: "#ffffff" } as any),
            s(8),
            t("12,000+ downloads. Updated for 2026.", "sm", "#9a3412", "left"),
          ),
          img(IMG.book, ""),
        ),
        sec("#ffffff", 80, "5xl", "center",
          h("What's inside", 2, "#171717", "bold"),
          s(32),
          lst(["Part 1: Why every designer should learn to code (and vice versa)", "Part 2: Design tokens, variables, and the shared language of design systems", "Part 3: Component-driven development — from Figma to production", "Part 4: Motion, accessibility, and the details that separate good from great", "Part 5: Building a design engineering culture in your organization"], "number"),
        ),
        sec("#fff7ed", 80, "4xl", "center",
          q("This handbook single-handedly changed how our design and engineering teams work together. I've made it required reading for every new hire.", "Alex Rivera", "Director of Product, Notion"),
          s(24),
          b("button", { label: "Get the free ebook →", href: "#", variant: "primary", size: "lg", align: "center", color: "#ea580c", textColor: "#ffffff" } as any),
        ),
      ],
    }],
  },

  // ===================================================================
  // 12. CORPORATE  (Professional services)
  // ===================================================================
  {
    id: "corporate",
    name: "Corporate",
    description: "A polished corporate site with an about section, services, team, client logos, and a contact form.",
    category: "business",
    cover: "from-slate-600 via-slate-700 to-slate-900",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#ffffff", 96, "6xl", "left",
          cols(2, 48,
            sec("#transparent", 0, "full", "left",
              h("Building the infrastructure modern businesses run on.", 1, "#0f172a", "bold", "left"),
              s(16),
              t("Meridian Partners is a strategy and technology consultancy that helps Fortune 500 companies navigate digital transformation. We've delivered $3B+ in client value since 2012.", "xl", "#475569", "left"),
              s(24),
              b("columns", { count: 2, gap: 16 }, [
                btn("Our services ↓", "#0f172a", "primary", "md", "left"),
                b("button", { label: "Get in touch →", href: "#", variant: "outline", size: "md", align: "left", color: "#0f172a", textColor: "#0f172a" } as any),
              ]),
            ),
            img(IMG.workspace, ""),
          ),
        ),
        sec("#f8fafc", 80, "6xl", "center",
          cols(4, 24,
            b("heading", { text: "142", level: 2, align: "center", color: "#0f172a", weight: "bold" } as any),
            t("Projects delivered", "sm", "#64748b", "center"),
            b("heading", { text: "Fortune 50", level: 2, align: "center", color: "#0f172a", weight: "bold" } as any),
            t("Clients served", "sm", "#64748b", "center"),
            b("heading", { text: "18", level: 2, align: "center", color: "#0f172a", weight: "bold" } as any),
            t("Countries", "sm", "#64748b", "center"),
            b("heading", { text: "$3.2B", level: 2, align: "center", color: "#0f172a", weight: "bold" } as any),
            t("Client value", "sm", "#64748b", "center"),
          ),
        ),
        sec("#ffffff", 96, "6xl", "center",
          h("What we do", 2, "#0f172a", "bold"),
          s(40),
          cols(3, 32,
            b("heading", { text: "Strategy", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
            s(8),
            t("Market analysis, digital roadmaps, and organizational design tailored to your industry.", "base", "#475569", "left"),
            b("heading", { text: "Technology", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
            s(8),
            t("Cloud migration, custom software, AI/ML implementation, and enterprise architecture.", "base", "#475569", "left"),
            b("heading", { text: "Operations", level: 3, align: "left", color: "#0f172a", weight: "semibold" } as any),
            s(8),
            t("Process optimization, supply chain, and change management that sticks.", "base", "#475569", "left"),
          ),
        ),
        sec("#0f172a", 80, "4xl", "center",
          h("Let's talk about your next challenge.", 2, "#f8fafc", "bold"),
          s(16),
          t("We start every engagement with a free discovery session. No pitch, no pressure — just smart people thinking about your business.", "lg", "#94a3b8", "center"),
          s(24),
          btn("Schedule a call →", "#3b82f6", "primary", "lg", "center"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 13. REAL ESTATE
  // ===================================================================
  {
    id: "real-estate",
    name: "Real Estate",
    description: "A real estate site with featured properties, listing grid, agent profile, and contact section.",
    category: "business",
    cover: "from-emerald-500 via-green-600 to-teal-700",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#ffffff", 80, "6xl", "left",
          cols(2, 48,
            sec("#transparent", 0, "full", "left",
              h("Find a place you'll love to call home.", 1, "#171717", "bold"),
              s(16),
              t("We specialize in luxury residential properties in San Francisco, Marin, and the Peninsula. Every listing is hand-selected.", "xl", "#525252", "left"),
              s(24),
              btn("Browse listings →", "#059669", "primary", "lg", "left"),
            ),
            img(IMG.property, ""),
          ),
        ),
        sec("#ffffff", 64, "6xl", "center",
          h("Featured properties", 2, "#171717", "bold"),
          s(32),
          cols(3, 16,
            img(IMG.property, "Pacific Heights Victorian · $4.2M · 4 bed / 3.5 bath"),
            img(IMG.outdoor, "Sausalito Waterfront · $3.8M · 3 bed / 2 bath"),
            img(IMG.interior, "Russian Hill Penthouse · $6.1M · 3 bed / 4 bath"),
          ),
          s(32),
          btn("View all 24 listings →", "#059669", "outline", "md", "center"),
        ),
        sec("#f8fafc", 80, "5xl", "left",
          h("Work with Amanda", 2, "#171717", "bold", "left"),
          s(12),
          cols(2, 32,
            t("With 15 years of experience and over $200M in closed transactions, Amanda Chen is one of the Bay Area's most trusted luxury agents. She takes on a limited number of clients each year to ensure every transaction gets her full attention.", "lg", "#525252", "left"),
            lst(["15 years experience", "$200M+ in closed deals", "Top 1% Bay Area agent", "Stanford GSB alum"], "check"),
          ),
          s(32),
          btn("Contact Amanda →", "#059669", "primary", "md", "left"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 14. CONSULTING  (Case-study driven)
  // ===================================================================
  {
    id: "consulting",
    name: "Consulting",
    description: "A consulting firm site built around case studies, a clear process, and results.",
    category: "business",
    cover: "from-amber-500 via-orange-500 to-red-500",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#fffbeb", 96, "5xl", "left",
          b("text", { text: "BROOKS CONSULTING", align: "left", size: "sm", color: "#b45309" } as any),
          s(12),
          h("We turn struggling SaaS products into growing businesses.", 1, "#171717", "bold"),
          s(16),
          t("Revenue operations, pricing strategy, and go-to-market execution for B2B SaaS companies between $2M–$50M ARR.", "xl", "#525252", "left"),
          s(24),
          btn("See our results ↓", "#d97706", "primary", "lg", "left"),
        ),
        sec("#ffffff", 96, "6xl", "center",
          h("Case studies", 2, "#171717", "bold"),
          s(40),
          img(IMG.graph, "Bloom Analytics · Grew from $3M to $12M ARR in 14 months by repositioning from SMB to mid-market, rebuilding the pricing model, and restructuring the sales team."),
          s(32),
          img(IMG.device, "Notch · Reduced churn from 8% to 2.1% monthly by introducing usage-based pricing, redesigning the onboarding flow, and building a customer success motion."),
          s(32),
          img(IMG.workspace, "Tide · Launched an enterprise tier that added $4.2M in new ARR within 6 months by bundling compliance features and introducing annual contracts."),
        ),
        sec("#f8fafc", 80, "6xl", "center",
          h("How we work", 2, "#171717", "bold"),
          s(32),
          cols(3, 32,
            b("heading", { text: "1. Diagnose", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
            t("Two-week deep dive into your metrics, funnel, and customer data. We find the 20% of changes that drive 80% of results.", "base", "#525252", "left"),
            b("heading", { text: "2. Build", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
            t("We work alongside your team for 3–6 months to implement the strategy. Weekly check-ins, shared dashboards, zero bureaucracy.", "base", "#525252", "left"),
            b("heading", { text: "3. Scale", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
            t("We don't leave when the engagement ends. Ongoing advisory with quarterly reviews to keep momentum building.", "base", "#525252", "left"),
          ),
          s(40),
          btn("Book a free assessment →", "#d97706", "primary", "lg", "center"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 15. NONPROFIT  (Charity / NGO)
  // ===================================================================
  {
    id: "nonprofit",
    name: "Nonprofit",
    description: "A warm nonprofit site with mission statement, impact numbers, donation CTA, and volunteer stories.",
    category: "business",
    cover: "from-lime-500 via-emerald-500 to-teal-600",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#f0fdf4", 96, "5xl", "center",
          h("Clean water for every community.", 1, "#14532d", "bold"),
          s(16),
          t("Project Aqua has brought sustainable water infrastructure to 340 villages across 12 countries. Every dollar funds local construction — not overhead.", "xl", "#166534", "center"),
          s(32),
          b("columns", { count: 3, gap: 16 }, [
            btn("Donate now", "#16a34a", "primary", "lg", "center"),
            b("button", { label: "Volunteer →", href: "#", variant: "outline", size: "lg", align: "center", color: "#16a34a", textColor: "#16a34a" } as any),
            b("button", { label: "Partner with us →", href: "#", variant: "ghost", size: "lg", align: "center", color: "#16a34a", textColor: "#166534" } as any),
          ]),
          s(48),
          img(IMG.charity, "A new water well being installed in rural Guatemala — Project Aqua, 2025"),
        ),
        sec("#ffffff", 80, "6xl", "center",
          cols(3, 32,
            b("heading", { text: "340", level: 2, align: "center", color: "#16a34a", weight: "bold" } as any),
            t("Villages served", "sm", "#64748b", "center"),
            b("heading", { text: "1.4M", level: 2, align: "center", color: "#16a34a", weight: "bold" } as any),
            t("People with clean water", "sm", "#64748b", "center"),
            b("heading", { text: "92%", level: 2, align: "center", color: "#16a34a", weight: "bold" } as any),
            t("Goes directly to projects", "sm", "#64748b", "center"),
          ),
        ),
        sec("#f0fdf4", 80, "5xl", "center",
          h("How you can help", 2, "#14532d", "bold"),
          s(32),
          cols(3, 32,
            b("heading", { text: "Donate", level: 3, align: "left", color: "#14532d", weight: "semibold" } as any),
            t("$50 provides clean water for one family. $5,000 funds an entire village well. Monthly giving sustains our long-term projects.", "base", "#166534", "left"),
            s(8),
            btn("Give now →", "#16a34a", "primary", "md", "left"),
            b("heading", { text: "Volunteer", level: 3, align: "left", color: "#14532d", weight: "semibold" } as any),
            t("Join one of our build trips or contribute your skills remotely — engineering, design, fundraising, and more.", "base", "#166534", "left"),
            s(8),
            b("button", { label: "Join a trip →", href: "#", variant: "outline", size: "md", align: "left", color: "#16a34a", textColor: "#16a34a" } as any),
            b("heading", { text: "Partner", level: 3, align: "left", color: "#14532d", weight: "semibold" } as any),
            t("Corporate sponsorships and foundation grants help us scale. We'll work with your team on a custom partnership.", "base", "#166534", "left"),
            s(8),
            b("button", { label: "Partner with us →", href: "#", variant: "outline", size: "md", align: "left", color: "#16a34a", textColor: "#16a34a" } as any),
          ),
        ),
      ],
    }],
  },

  // ===================================================================
  // 16. LAW FIRM
  // ===================================================================
  {
    id: "law-firm",
    name: "Law Firm",
    description: "A professional law firm site with practice areas, attorney profiles, testimonials, and a contact section.",
    category: "business",
    cover: "from-blue-900 via-indigo-900 to-slate-900",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#0f172a", 80, "6xl", "left",
          h("Legal excellence since 1987.", 1, "#f8fafc", "bold"),
          s(16),
          t("Harrington & Walsh is a full-service law firm with offices in New York, Washington DC, and London. We represent Fortune 500 companies, startups, and individuals in their most consequential matters.", "xl", "#94a3b8", "left"),
          s(24),
          btn("Schedule a consultation →", "#3b82f6", "primary", "md", "left"),
          s(48),
          cols(4, 24,
            b("heading", { text: "Corporate", level: 4, align: "center", color: "#cbd5e1", weight: "semibold" } as any),
            b("heading", { text: "Litigation", level: 4, align: "center", color: "#cbd5e1", weight: "semibold" } as any),
            b("heading", { text: "Intellectual Property", level: 4, align: "center", color: "#cbd5e1", weight: "semibold" } as any),
            b("heading", { text: "Regulatory", level: 4, align: "center", color: "#cbd5e1", weight: "semibold" } as any),
          ),
        ),
        sec("#ffffff", 96, "6xl", "left",
          img(IMG.law, ""),
          s(40),
          h("Our approach", 2, "#171717", "bold", "left"),
          s(16),
          cols(2, 32,
            t("We don't just know the law — we know your business. Every engagement starts with a deep understanding of your industry, your goals, and what's at stake. We staff matters lean and communicate in plain English, not legal jargon.", "lg", "#525252", "left"),
            t("Our partners are former federal prosecutors, SEC enforcement attorneys, and Supreme Court clerks. But more importantly, they're practical problem-solvers who understand that the best legal outcome is the one that lets you get back to business.", "lg", "#525252", "left"),
          ),
        ),
        sec("#f8fafc", 80, "6xl", "center",
          h("Recognized by", 2, "#171717", "bold"),
          s(32),
          cols(4, 24,
            b("heading", { text: "Chambers & Partners", level: 4, align: "center", color: "#94a3b8", weight: "semibold" } as any),
            t("Band 1 — Corporate/M&A", "sm", "#a3a3a3", "center"),
            b("heading", { text: "The Legal 500", level: 4, align: "center", color: "#94a3b8", weight: "semibold" } as any),
            t("Tier 1 — Litigation", "sm", "#a3a3a3", "center"),
            b("heading", { text: "Best Lawyers", level: 4, align: "center", color: "#94a3b8", weight: "semibold" } as any),
            t("12 attorneys recognized", "sm", "#a3a3a3", "center"),
            b("heading", { text: "AmLaw 100", level: 4, align: "center", color: "#94a3b8", weight: "semibold" } as any),
            t("Ranked since 2015", "sm", "#a3a3a3", "center"),
          ),
        ),
        sec("#0f172a", 80, "4xl", "center",
          h("Let's discuss your case.", 2, "#f8fafc", "bold"),
          s(16),
          t("All consultations are confidential. We'll tell you honestly whether we can help — and what it will take.", "lg", "#94a3b8", "center"),
          s(24),
          btn("Contact us →", "#3b82f6", "primary", "lg", "center"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 17. FINTECH  (Security & trust focused)
  // ===================================================================
  {
    id: "fintech",
    name: "Fintech",
    description: "A fintech product page with a security-forward design, feature cards, compliance badges, and clear CTAs.",
    category: "business",
    cover: "from-emerald-800 via-teal-700 to-cyan-800",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#042f2e", 112, "6xl", "center",
          b("text", { text: "TRUSTED BY 50,000+ BUSINESSES", align: "center", size: "sm", color: "#5eead4" } as any),
          s(12),
          h("Move money at the speed of your business.", 1, "#f0fdfa", "bold"),
          s(16),
          t("NexPay is the payments infrastructure for modern platforms. Accept payments, send payouts, and manage compliance — all from one API.", "xl", "#99f6e4", "center"),
          s(32),
          b("columns", { count: 2, gap: 16 }, [
            btn("Start building →", "#14b8a6", "primary", "lg", "center"),
            b("button", { label: "Talk to sales", href: "#", variant: "outline", size: "lg", align: "center", color: "#5eead4", textColor: "#5eead4" } as any),
          ]),
        ),
        sec("#ffffff", 80, "6xl", "center",
          cols(4, 24,
            b("heading", { text: "99.999%", level: 2, align: "center", color: "#0f766e", weight: "bold" } as any),
            t("API uptime", "sm", "#64748b", "center"),
            b("heading", { text: "135+", level: 2, align: "center", color: "#0f766e", weight: "bold" } as any),
            t("Currencies", "sm", "#64748b", "center"),
            b("heading", { text: "43", level: 2, align: "center", color: "#0f766e", weight: "bold" } as any),
            t("Countries", "sm", "#64748b", "center"),
            b("heading", { text: "SOC 2", level: 2, align: "center", color: "#0f766e", weight: "bold" } as any),
            t("Certified", "sm", "#64748b", "center"),
          ),
        ),
        sec("#f0fdfa", 80, "6xl", "center",
          h("Enterprise-grade security", 2, "#0f766e", "bold"),
          s(32),
          cols(3, 32,
            b("heading", { text: "PCI DSS Level 1", level: 3, align: "left", color: "#0f766e", weight: "semibold" } as any),
            t("The highest level of payment card security certification. Your customers' data is never exposed.", "base", "#115e59", "left"),
            b("heading", { text: "End-to-end encryption", level: 3, align: "left", color: "#0f766e", weight: "semibold" } as any),
            t("All data is encrypted at rest and in transit with AES-256. We use hardware security modules for key management.", "base", "#115e59", "left"),
            b("heading", { text: "Real-time fraud detection", level: 3, align: "left", color: "#0f766e", weight: "semibold" } as any),
            t("Machine learning models flag suspicious transactions before they complete. Customizable rules for your risk tolerance.", "base", "#115e59", "left"),
          ),
        ),
        sec("#042f2e", 80, "4xl", "center",
          h("Ready to get started?", 2, "#f0fdfa", "bold"),
          s(12),
          t("Integrate in days, not months. Our docs are the best in fintech — and our support team responds in under 5 minutes.", "lg", "#99f6e4", "center"),
          s(24),
          btn("Read the docs →", "#14b8a6", "primary", "lg", "center"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 18. PHOTOGRAPHER  (Visual portfolio)
  // ===================================================================
  {
    id: "photographer",
    name: "Photographer",
    description: "A photographer's portfolio with a hero image, gallery, services, about, and booking section.",
    category: "portfolio",
    cover: "from-zinc-800 via-stone-700 to-neutral-900",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#1c1917", 0, "full", "center"),
        img(IMG.camera, ""),
        sec("#1c1917", 64, "5xl", "center",
          h("Jules Moreau", 1, "#fafafa", "bold"),
          s(8),
          t("Editorial & commercial photographer based in Paris. Working with brands, magazines, and artists worldwide.", "lg", "#a3a3a3", "center"),
          s(24),
          b("columns", { count: 2, gap: 16 }, [
            btn("View portfolio ↓", "#fafafa", "primary", "md", "center"),
            b("button", { label: "Book a shoot →", href: "#", variant: "outline", size: "md", align: "center", color: "#fafafa", textColor: "#d6d3d1" } as any),
          ]),
        ),
        sec("#ffffff", 64, "6xl", "center",
          img(IMG.abstract, "Campaign for Maison Laurent — Spring/Summer 2026"),
          s(24),
          img(IMG.outdoor, "Editorial for Kinfolk Magazine — Volume 44"),
          s(24),
          img(IMG.team, "Portrait series for TechCrunch — Disrupt 2025"),
        ),
        sec("#fafafa", 80, "5xl", "left",
          cols(2, 40,
            h("About", 2, "#1c1917", "bold", "left"),
            t("After a decade in fashion editorial, I've spent the last five years building a commercial practice that spans advertising, tech, and publishing. My work has appeared in Vogue, Wired, and The New York Times Magazine.", "lg", "#525252", "left"),
            s(16),
            lst(["Editorial / Fashion", "Advertising / Commercial", "Portrait / Headshot", "Product / Still Life"], "check"),
          ),
          s(32),
          btn("Get in touch →", "#1c1917", "primary", "md", "left"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 19. ARCHITECT  (Project showcase)
  // ===================================================================
  {
    id: "architect",
    name: "Architect",
    description: "An architecture portfolio with full-bleed project photos, process description, and awards.",
    category: "portfolio",
    cover: "from-stone-300 via-stone-400 to-stone-500",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#ffffff", 64, "5xl", "left",
          h("Studio Brandt", 1, "#292524", "bold"),
          s(12),
          t("We design spaces that improve how people live, work, and gather. Based in Copenhagen, working worldwide.", "xl", "#78716c", "left"),
          s(24),
          btn("See our projects ↓", "#292524", "primary", "md", "left"),
        ),
        sec("#ffffff", 64, "6xl", "center",
          img(IMG.building, "Nordhavn Residence · Copenhagen, 2025 — A minimalist family home on the waterfront."),
          s(40),
          img(IMG.abstract, "Vesterbro Office Tower · Copenhagen, 2024 — 22-story mixed-use tower with a living façade."),
          s(40),
          img(IMG.outdoor, "Skagen Retreat · Denmark, 2023 — A low-impact holiday home built into the dune landscape."),
        ),
        sec("#fafafa", 80, "5xl", "center",
          h("Our philosophy", 2, "#292524", "bold"),
          s(16),
          t("We believe architecture is a conversation with place. Every project starts with the site — its light, its history, its community. From there, we build with materials that age gracefully and forms that serve function without shouting.", "lg", "#57534e", "center"),
          s(40),
          cols(3, 32,
            b("heading", { text: "2025", level: 3, align: "center", color: "#292524", weight: "semibold" } as any),
            t("Mies van der Rohe Award", "sm", "#78716c", "center"),
            b("heading", { text: "2024", level: 3, align: "center", color: "#292524", weight: "semibold" } as any),
            t("Danish Design Award", "sm", "#78716c", "center"),
            b("heading", { text: "2023", level: 3, align: "center", color: "#292524", weight: "semibold" } as any),
            t("AIA International Prize", "sm", "#78716c", "center"),
          ),
        ),
      ],
    }],
  },

  // ===================================================================
  // 20. VIDEOGRAPHER
  // ===================================================================
  {
    id: "videographer",
    name: "Videographer",
    description: "A videographer's reel site with showreel hero, project categories, client list, and booking CTA.",
    category: "portfolio",
    cover: "from-red-700 via-rose-800 to-pink-900",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#1a0a0a", 96, "6xl", "center",
          h("Motion with meaning.", 1, "#fafafa", "bold"),
          s(16),
          t("I'm Kai Jensen — a director and cinematographer specializing in brand films, documentaries, and music videos. Every frame has a purpose.", "xl", "#fca5a5", "center"),
          s(24),
          b("columns", { count: 2, gap: 16 }, [
            btn("Watch showreel ↓", "#ef4444", "primary", "lg", "center"),
            b("button", { label: "Hire me →", href: "#", variant: "outline", size: "lg", align: "center", color: "#ef4444", textColor: "#fca5a5" } as any),
          ]),
          s(40),
          img(IMG.event, "Frame from Nike — Run the City (2025)"),
        ),
        sec("#ffffff", 64, "5xl", "center",
          h("Selected work", 2, "#171717", "bold"),
          s(24),
          b("heading", { text: "Nike — Run the City", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
          t("A 90-second brand film following 8 runners across 5 cities. 14M views on YouTube.", "base", "#525252", "left"),
          s(16),
          b("heading", { text: "Patagonia — The Last Forest", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
          t("A 12-minute documentary about old-growth logging in British Columbia. Official selection at Sundance 2025.", "base", "#525252", "left"),
          s(16),
          b("heading", { text: "Billie Eilish — Ocean Eyes (Reimagined)", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
          t("Official music video. 87M views. VMA nomination for Best Cinematography.", "base", "#525252", "left"),
        ),
        sec("#fafafa", 64, "6xl", "center",
          t("CLIENTS", "sm", "#a3a3a3", "center"),
          s(16),
          cols(4, 16,
            b("heading", { text: "Nike", level: 4, align: "center", color: "#d4d4d4", weight: "semibold" } as any),
            b("heading", { text: "Patagonia", level: 4, align: "center", color: "#d4d4d4", weight: "semibold" } as any),
            b("heading", { text: "Apple", level: 4, align: "center", color: "#d4d4d4", weight: "semibold" } as any),
            b("heading", { text: "Google", level: 4, align: "center", color: "#d4d4d4", weight: "semibold" } as any),
          ),
          s(32),
          btn("Let's make something →", "#ef4444", "primary", "lg", "center"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 21. NEWSLETTER
  // ===================================================================
  {
    id: "newsletter",
    name: "Newsletter",
    description: "A newsletter landing page with past issues, subscriber count, and a clean email signup.",
    category: "blog",
    cover: "from-yellow-300 via-amber-400 to-orange-400",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#fefce8", 128, "4xl", "center",
          b("text", { text: "A weekly newsletter by James Clearwater", align: "center", size: "sm", color: "#b45309" } as any),
          s(12),
          h("Dispatches", 1, "#171717", "bold"),
          s(16),
          t("One essay every Sunday about technology, culture, and the ideas shaping the next decade. No ads, no sponsors — just writing worth your Sunday morning.", "xl", "#525252", "center"),
          s(32),
          b("button", { label: "Subscribe — it's free", href: "#", variant: "primary", size: "lg", align: "center", color: "#ca8a04", textColor: "#ffffff" } as any),
          s(8),
          t("Join 28,000+ readers", "sm", "#a16207", "center"),
        ),
        sec("#ffffff", 80, "5xl", "left",
          h("Recent issues", 2, "#171717", "bold", "left"),
          s(24),
          div("#e5e5e5"),
          s(24),
          b("heading", { text: "The end of the social internet", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
          t("Why the era of centralized social platforms is ending — and what comes next for how we connect online.", "base", "#525252", "left"),
          s(8),
          t("July 27, 2026", "sm", "#a3a3a3", "left"),
          s(20),
          b("heading", { text: "AI didn't kill the essay — it made it matter more", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
          t("In a world of infinite synthetic text, the value of a genuinely interesting idea has never been higher.", "base", "#525252", "left"),
          s(8),
          t("July 20, 2026", "sm", "#a3a3a3", "left"),
          s(20),
          b("heading", { text: "The small web is back", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
          t("Personal blogs, RSS, and newsletters are having a renaissance. Here's why that matters for the open web.", "base", "#525252", "left"),
          s(8),
          t("July 13, 2026", "sm", "#a3a3a3", "left"),
          s(32),
          btn("Read the archive →", "#ca8a04", "outline", "md", "left"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 22. DOCUMENTATION
  // ===================================================================
  {
    id: "docs",
    name: "Documentation",
    description: "A clean documentation site layout with structured content, code examples, and clear hierarchy.",
    category: "blog",
    cover: "from-sky-500 via-blue-500 to-indigo-500",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#f8fafc", 96, "5xl", "left",
          h("Orbit API Reference", 1, "#171717", "bold"),
          s(16),
          t("Everything you need to integrate Orbit into your product. REST APIs, WebSocket streams, webhooks, and SDKs for every major language.", "xl", "#475569", "left"),
          s(24),
          b("button", { label: "Get started →", href: "#", variant: "primary", size: "md", align: "left", color: "#0284c7", textColor: "#ffffff" } as any),
        ),
        sec("#ffffff", 64, "5xl", "left",
          b("heading", { text: "Quick start", level: 2, align: "left", color: "#171717", weight: "bold" } as any),
          s(12),
          t("Install the SDK and make your first API call in under 5 minutes.", "lg", "#475569", "left"),
          s(16),
          b("heading", { text: "$ npm install @orbit/client", level: 4, align: "left", color: "#0ea5e9", weight: "medium" } as any),
          s(8),
          t("Initialize the client with your API key from the dashboard.", "base", "#475569", "left"),
          s(16),
          b("heading", { text: "Authentication", level: 2, align: "left", color: "#171717", weight: "bold" } as any),
          s(12),
          t("All API requests require an API key. Generate one in your dashboard under Settings → API Keys.", "lg", "#475569", "left"),
          s(16),
          lst(["Create an API key in your dashboard", "Pass it as a Bearer token in the Authorization header", "Keys can be scoped to read, write, or admin access"], "number"),
          s(32),
          b("heading", { text: "Endpoints", level: 2, align: "left", color: "#171717", weight: "bold" } as any),
          s(16),
          lst(["GET /v1/users — List all users", "POST /v1/users — Create a user", "GET /v1/users/:id — Get a user", "PUT /v1/users/:id — Update a user", "DELETE /v1/users/:id — Delete a user", "GET /v1/events — List events (with filtering)"], "bullet"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 23. STOREFRONT  (E-commerce)
  // ===================================================================
  {
    id: "storefront",
    name: "Storefront",
    description: "An e-commerce storefront with a hero banner, featured products grid, category pills, and email signup.",
    category: "business",
    cover: "from-rose-400 via-pink-400 to-fuchsia-400",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#fdf2f8", 96, "6xl", "center",
          b("text", { text: "SUMMER COLLECTION 2026", align: "center", size: "sm", color: "#be185d" } as any),
          s(12),
          h("Designed for the light.", 1, "#171717", "bold"),
          s(16),
          t("Thoughtfully crafted essentials for your everyday life. Ethically made, designed to last.", "xl", "#475569", "center"),
          s(32),
          b("columns", { count: 2, gap: 16 }, [
            btn("Shop now →", "#db2777", "primary", "lg", "center"),
            b("button", { label: "New arrivals", href: "#", variant: "outline", size: "lg", align: "center", color: "#db2777", textColor: "#be185d" } as any),
          ]),
          s(48),
          img(IMG.food1, "The Linen Edit — our bestselling summer collection in three new colors."),
        ),
        sec("#ffffff", 64, "6xl", "center",
          h("Featured products", 2, "#171717", "bold"),
          s(32),
          cols(4, 16,
            img(IMG.book, "The Morning Tote — $148"),
            img(IMG.phone, "Ceramic Pour-Over Set — $64"),
            img(IMG.workspace, "Linen Apron — $78"),
            img(IMG.outdoor, "Wool Throw Blanket — $195"),
          ),
        ),
        sec("#f8fafc", 80, "4xl", "center",
          h("Join the newsletter", 2, "#171717", "bold"),
          s(8),
          t("New collections, restocks, and 10% off your first order.", "lg", "#475569", "center"),
          s(24),
          b("button", { label: "Subscribe →", href: "#", variant: "primary", size: "lg", align: "center", color: "#db2777", textColor: "#ffffff" } as any),
        ),
      ],
    }],
  },

  // ===================================================================
  // 24. RESUME / CV
  // ===================================================================
  {
    id: "resume",
    name: "Résumé",
    description: "A personal brand and CV site with experience timeline, skills, portfolio links, and contact.",
    category: "portfolio",
    cover: "from-teal-400 via-cyan-400 to-sky-400",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#ffffff", 64, "4xl", "left",
          h("Taylor Brooks", 1, "#171717", "bold"),
          s(8),
          t("Senior software engineer specializing in developer tools and infrastructure. 8 years building at Stripe, GitHub, and Palantir.", "lg", "#525252", "left"),
          s(16),
          b("columns", { count: 2, gap: 16 }, [
            btn("taylor@example.com →", "#0891b2", "outline", "md", "left"),
            b("button", { label: "github.com/taylorbrooks →", href: "#", variant: "ghost", size: "md", align: "left", color: "#0891b2", textColor: "#0891b2" } as any),
          ]),
          s(24),
          div("#e2e8f0"),
          s(24),
        ),
        sec("#ffffff", 48, "4xl", "left",
          b("heading", { text: "Experience", level: 2, align: "left", color: "#171717", weight: "bold" } as any),
          s(20),
          b("heading", { text: "Staff Engineer · Stripe", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
          t("2022 — Present · Developer Infrastructure", "base", "#737373", "left"),
          s(4),
          t("Led the team that rebuilt Stripe's CI pipeline, reducing build times by 70% and saving $4.2M annually in compute costs. Designed and shipped an internal developer portal used by 2,000+ engineers.", "base", "#525252", "left"),
          s(16),
          b("heading", { text: "Senior Engineer · GitHub", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
          t("2019 — 2022 · Actions & CI/CD", "base", "#737373", "left"),
          s(4),
          t("Core contributor to GitHub Actions. Designed the workflow syntax, built the matrix strategy engine, and shipped the reusable workflows feature.", "base", "#525252", "left"),
          s(16),
          b("heading", { text: "Software Engineer · Palantir", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
          t("2016 — 2019 · Foundry Platform", "base", "#737373", "left"),
          s(4),
          t("Built data transformation pipelines and the scheduling infrastructure for Palantir Foundry. 3 patents in distributed systems.", "base", "#525252", "left"),
        ),
        sec("#f8fafc", 64, "4xl", "left",
          h("Skills & tools", 2, "#171717", "bold", "left"),
          s(16),
          cols(3, 16,
            lst(["Rust", "Go", "TypeScript", "Python", "C++"], "bullet"),
            lst(["Kubernetes", "Docker", "Terraform", "AWS / GCP", "Nix"], "bullet"),
            lst(["Distributed Systems", "CI/CD", "Dev Tools", "API Design", "Observability"], "bullet"),
          ),
        ),
      ],
    }],
  },

  // ===================================================================
  // 25. COMING SOON / WAITLIST
  // ===================================================================
  {
    id: "coming-soon",
    name: "Coming Soon",
    description: "A waitlist landing page with a countdown-style layout, feature teasers, and email capture.",
    category: "landing",
    cover: "from-indigo-800 via-violet-800 to-purple-900",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#1e1b4b", 128, "4xl", "center",
          b("text", { text: "SOMETHING NEW IS COMING", align: "center", size: "sm", color: "#a5b4fc" } as any),
          s(16),
          h("We're building the future of team communication.", 1, "#fafafa", "bold"),
          s(20),
          t("A new kind of messenger that's fast, private, and designed for deep work. No notifications, no distractions — just the conversations that matter.", "xl", "#a5b4fc", "center"),
          s(40),
          b("button", { label: "Join the waitlist →", href: "#", variant: "primary", size: "lg", align: "center", color: "#6366f1", textColor: "#ffffff" } as any),
          s(8),
          t("Be the first to know when we launch. No spam.", "sm", "#6366f1", "center"),
          s(64),
          cols(3, 24,
            b("heading", { text: "🔐", level: 4, align: "center", color: "#fafafa", weight: "normal" } as any),
            s(4),
            b("heading", { text: "End-to-end encrypted", level: 3, align: "center", color: "#fafafa", weight: "semibold" } as any),
            t("Not even we can read your messages.", "base", "#c7d2fe", "center"),
            b("heading", { text: "⚡", level: 4, align: "center", color: "#fafafa", weight: "normal" } as any),
            s(4),
            b("heading", { text: "Blazing fast", level: 3, align: "center", color: "#fafafa", weight: "semibold" } as any),
            t("Built on a custom protocol. Sub-10ms delivery.", "base", "#c7d2fe", "center"),
            b("heading", { text: "🎯", level: 4, align: "center", color: "#fafafa", weight: "normal" } as any),
            s(4),
            b("heading", { text: "Focus-first design", level: 3, align: "center", color: "#fafafa", weight: "semibold" } as any),
            t("No notifications by default. Batch delivery every 2 hours.", "base", "#c7d2fe", "center"),
          ),
        ),
      ],
    }],
  },

  // ===================================================================
  // 26. PODCAST
  // ===================================================================
  {
    id: "podcast",
    name: "Podcast",
    description: "A podcast site with a featured episode, episode list, host bios, and subscribe links.",
    category: "blog",
    cover: "from-orange-500 via-red-500 to-rose-600",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        sec("#fef2f2", 96, "5xl", "left",
          cols(2, 40,
            sec("#transparent", 0, "full", "left",
              b("text", { text: "A PODCAST ABOUT", align: "left", size: "sm", color: "#b91c1c" } as any),
              s(8),
              h("How Things Work", 1, "#171717", "bold", "left"),
              s(12),
              t("Every week, host Mira Patel interviews the people who build the hidden infrastructure of modern life — from undersea cables to supply chains to the internet's DNS system.", "lg", "#525252", "left"),
              s(24),
              b("columns", { count: 2, gap: 16 }, [
                b("button", { label: "Apple Podcasts →", href: "#", variant: "primary", size: "md", align: "left", color: "#dc2626", textColor: "#ffffff" } as any),
                b("button", { label: "Spotify →", href: "#", variant: "outline", size: "md", align: "left", color: "#dc2626", textColor: "#dc2626" } as any),
              ]),
            ),
            img(IMG.podcast, ""),
          ),
        ),
        sec("#ffffff", 64, "5xl", "left",
          h("Latest episodes", 2, "#171717", "bold", "left"),
          s(24),
          b("heading", { text: "#142 — The hidden world of undersea internet cables", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
          t("With Dr. Nicole Tran, marine geologist and cable route surveyor. We go 8,000 meters under the sea to understand the 1.3 million kilometers of fiber that carry 99% of international data.", "base", "#525252", "left"),
          s(4),
          t("Aug 2, 2026 · 52 min", "sm", "#a3a3a3", "left"),
          s(20),
          b("heading", { text: "#141 — How the US power grid actually works", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
          t("With Raj Mehta, former FERC commissioner. We break down the three interconnections, the balancing act of supply and demand, and why the grid is both a miracle and a mess.", "base", "#525252", "left"),
          s(4),
          t("Jul 26, 2026 · 48 min", "sm", "#a3a3a3", "left"),
          s(20),
          b("heading", { text: "#140 — Container ships: the invisible backbone of global trade", level: 3, align: "left", color: "#171717", weight: "semibold" } as any),
          t("With Captain Sarah Okonkwo, port operations director. 90% of everything you own arrived on a container ship. Here's how that system works — and what happens when it breaks.", "base", "#525252", "left"),
          s(4),
          t("Jul 19, 2026 · 55 min", "sm", "#a3a3a3", "left"),
        ),
        sec("#fef2f2", 64, "4xl", "center",
          h("Never miss an episode", 2, "#171717", "bold"),
          s(12),
          t("Available wherever you listen to podcasts. New episodes every Monday.", "lg", "#525252", "center"),
          s(24),
          b("button", { label: "Subscribe now →", href: "#", variant: "primary", size: "lg", align: "center", color: "#dc2626", textColor: "#ffffff" } as any),
        ),
      ],
    }],
  },

  // ===================================================================
  // 27. AI PHOTO UPSCALER  (dark, tilted-image, AI-tool product page)
  // ===================================================================
  {
    id: "ai-upscaler",
    name: "AI Upscaler — Dark",
    description: "A dark, high-energy product page for an AI tool. Two-tone hero, tilted floating imagery, a scrolling marquee, and a bento feature grid. Also available in Bright.",
    category: "landing",
    cover: "from-[#0a0e1a] via-indigo-950 to-fuchsia-950",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        // ── HERO ──
        sec("#0a0e1a", 112, "6xl", "center",
          b("html", { html:
            `<div style="display:inline-flex;align-items:center;gap:8px;padding:8px 18px;border-radius:999px;border:1px solid rgba(148,163,184,0.25);background:rgba(255,255,255,0.03);font-size:13px;color:#cbd5e1;">
              <span style="width:8px;height:8px;border-radius:999px;background:#34d399;display:inline-block;" class="anim-pulse-glow"></span>
              NEW — Cloud upscaling is here
            </div>`
          } as any),
          s(24),
          b("html", { html:
            `<h1 style="margin:0;font-size:56px;line-height:1.1;font-weight:800;letter-spacing:-0.02em;">
              <span style="color:#94a3b8;font-weight:400;">From</span> <span style="color:#f8fafc;">Pixelated</span> <span style="color:#94a3b8;font-weight:400;">to</span> <span style="color:#f8fafc;">Perfect</span>
            </h1>`
          } as any),
          s(20),
          t("Supercharging your photos with AI — sharper, cleaner, larger. In seconds.", "xl", "#94a3b8", "center"),
          s(32),
          b("columns", { count: 2, gap: 16 }, [
            b("button", { label: "See how it works", href: "#", variant: "ghost", size: "lg", align: "center", color: "#818cf8", textColor: "#cbd5e1" } as any),
            btn("Get Started", "#818cf8", "outline", "lg", "center"),
          ]),
          s(56),
          b("html", { html:
            `<div style="position:relative;max-width:620px;margin:0 auto;">
              <div class="anim-float-slow">
                <div style="position:relative;border-radius:20px;overflow:hidden;box-shadow:0 30px 80px -20px rgba(129,140,248,0.45), 0 0 0 1px rgba(148,163,184,0.15);transform:rotate(-4deg);">
                  <div style="background-image:linear-gradient(115deg, rgba(236,72,153,0.55), rgba(56,189,248,0.55)), url('${IMG.abstract}');background-size:cover;background-position:center;width:100%;aspect-ratio:16/10;"></div>
                  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:44px;height:44px;border-radius:999px;background:rgba(10,14,26,0.85);border:2px solid rgba(255,255,255,0.6);display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;">↔</div>
                </div>
              </div>
            </div>`
          } as any),
          s(40),
          t("AS SEEN ON", "sm", "#475569", "center"),
          s(20),
          cols(3, 32,
            b("heading", { text: "The Pixel Times", level: 4, align: "center", color: "#475569", weight: "semibold" } as any),
            b("heading", { text: "Maker Weekly", level: 4, align: "center", color: "#475569", weight: "semibold" } as any),
            b("heading", { text: "Creator Daily", level: 4, align: "center", color: "#475569", weight: "semibold" } as any),
          ),
        ),
        // ── "LOW RES IS NO FUN" SPLIT ──
        sec("#0a0e1a", 112, "6xl", "left",
          cols(2, 56,
            sec("#transparent", 0, "full", "left",
              h("Low resolution is no fun.", 2, "#f8fafc", "bold", "left"),
              s(16),
              t("Got a blurry photo or a pixelated mess? Love the memories but hate the quality?", "lg", "#94a3b8", "left"),
              s(16),
              t("We've all been there.", "lg", "#64748b", "left"),
              s(24),
              btn("Fix my photos →", "#818cf8", "primary", "md", "left"),
            ),
            b("html", { html:
              `<div style="position:relative;height:340px;">
                <div class="anim-float" style="position:absolute;top:40px;right:40px;">
                  <div style="width:220px;height:270px;border-radius:16px;transform:rotate(11deg);box-shadow:0 25px 60px -15px rgba(236,72,153,0.4);background-image:linear-gradient(160deg, rgba(244,114,182,0.65), rgba(56,189,248,0.65)), url('${IMG.abstract}');background-size:cover;background-position:center;border:1px solid rgba(255,255,255,0.15);"></div>
                </div>
                <div class="anim-float-slow" style="position:absolute;top:20px;left:20px;width:52px;height:52px;border-radius:14px;background:rgba(129,140,248,0.15);border:1px solid rgba(129,140,248,0.4);display:flex;align-items:center;justify-content:center;font-size:22px;">📷</div>
                <div class="anim-float" style="position:absolute;bottom:30px;left:60px;width:48px;height:48px;border-radius:999px;background:rgba(236,72,153,0.15);border:1px solid rgba(236,72,153,0.4);display:flex;align-items:center;justify-content:center;font-size:20px;">☁️</div>
                <div class="anim-float-slow" style="position:absolute;bottom:60px;right:10px;">
                  <div style="width:44px;height:44px;border-radius:12px;background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.4);display:flex;align-items:center;justify-content:center;font-size:18px;transform:rotate(-12deg);">💎</div>
                </div>
              </div>`
            } as any),
          ),
        ),
        // ── MARQUEE ──
        b("html", { html:
          `<div style="position:relative;background:#0a0e1a;padding:64px 0;overflow:hidden;">
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:480px;height:480px;border-radius:999px;background:radial-gradient(circle, rgba(129,140,248,0.25), rgba(236,72,153,0.12) 55%, transparent 75%);filter:blur(10px);" class="anim-pulse-glow"></div>
            <div style="position:absolute;top:38%;left:0;white-space:nowrap;width:200%;display:flex;" class="anim-marquee">
              <span style="font-size:96px;font-weight:800;color:rgba(148,163,184,0.12);letter-spacing:-0.02em;">PIXELFORGE&nbsp;PIXELFORGE&nbsp;PIXELFORGE&nbsp;PIXELFORGE&nbsp;</span>
              <span style="font-size:96px;font-weight:800;color:rgba(148,163,184,0.12);letter-spacing:-0.02em;">PIXELFORGE&nbsp;PIXELFORGE&nbsp;PIXELFORGE&nbsp;PIXELFORGE&nbsp;</span>
            </div>
            <div style="position:relative;text-align:center;padding:40px 0;">
              <div style="font-size:16px;color:#94a3b8;">PixelForge is made for</div>
              <div style="font-size:52px;font-weight:800;color:#f8fafc;margin-top:8px;">Creators</div>
            </div>
          </div>`
        } as any),
        // ── MEET CLOUD ──
        sec("#0a0e1a", 112, "6xl", "center",
          h("Meet PixelForge Cloud.", 2, "#f8fafc", "bold", "center"),
          s(12),
          t("The best gets even better.", "lg", "#94a3b8", "center"),
          s(48),
          b("html", { html:
            `<div style="max-width:900px;margin:0 auto;">
              <div class="anim-float-slow">
                <div style="transform:perspective(1400px) rotateX(8deg) rotate(-2deg);border-radius:16px;overflow:hidden;box-shadow:0 40px 90px -25px rgba(129,140,248,0.4), 0 0 0 1px rgba(148,163,184,0.15);background:#0f1424;">
                  <div style="display:flex;align-items:center;gap:6px;padding:12px 16px;background:#11172a;border-bottom:1px solid rgba(148,163,184,0.1);">
                    <span style="width:10px;height:10px;border-radius:999px;background:#f87171;display:inline-block;"></span>
                    <span style="width:10px;height:10px;border-radius:999px;background:#fbbf24;display:inline-block;"></span>
                    <span style="width:10px;height:10px;border-radius:999px;background:#34d399;display:inline-block;"></span>
                  </div>
                  <div style="display:flex;">
                    <div style="flex:1;padding:10px 0;text-align:center;font-size:12px;font-weight:600;color:#fff;background:linear-gradient(90deg,#f97316,#fb923c);">Generate</div>
                    <div style="flex:1;padding:10px 0;text-align:center;font-size:12px;font-weight:600;color:#fff;background:linear-gradient(90deg,#22c55e,#4ade80);">Edit</div>
                    <div style="flex:1;padding:10px 0;text-align:center;font-size:12px;font-weight:600;color:#fff;background:linear-gradient(90deg,#3b82f6,#22d3ee);">Upscale</div>
                  </div>
                  <div style="background-image:linear-gradient(180deg, rgba(15,20,36,0.4), rgba(15,20,36,0.85)), url('${IMG.graph}');background-size:cover;background-position:center;aspect-ratio:16/9;"></div>
                </div>
              </div>
            </div>`
          } as any),
        ),
        // ── BENTO FEATURE GRID ──
        sec("#0a0e1a", 112, "6xl", "center",
          t("EVERYTHING YOU NEED", "sm", "#818cf8", "center"),
          s(8),
          h("One app. Every fix your photos need.", 2, "#f8fafc", "bold", "center"),
          s(48),
          b("html", { html: (() => {
            const card = (icon: string, title: string, desc: string, bgImg: string, delay: number, tall = false) => `
              <div class="anim-fade-up" style="animation-delay:${delay}ms;position:relative;border-radius:18px;overflow:hidden;border:1px solid rgba(148,163,184,0.15);background:#0d1220;${tall ? "grid-row:span 2;" : ""}min-height:${tall ? 380 : 180}px;padding:24px;display:flex;flex-direction:column;justify-content:flex-end;">
                <div style="position:absolute;inset:0;background-image:linear-gradient(180deg, rgba(10,14,26,0.55), rgba(10,14,26,0.92)), url('${bgImg}');background-size:cover;background-position:center;"></div>
                <div style="position:relative;">
                  <div style="width:40px;height:40px;border-radius:10px;background:rgba(129,140,248,0.18);border:1px solid rgba(129,140,248,0.35);display:flex;align-items:center;justify-content:center;font-size:18px;margin-bottom:14px;">${icon}</div>
                  <div style="font-size:18px;font-weight:700;color:#f8fafc;margin-bottom:6px;">${title}</div>
                  <div style="font-size:14px;color:#94a3b8;line-height:1.5;">${desc}</div>
                </div>
              </div>`;
            return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              ${card("🔍", "AI Upscaling", "Scale images up to 16x with multiple AI models tuned for crystal-clear results.", IMG.device, 0, true)}
              ${card("🎨", "Color Accuracy", "Preserve every detail and color, ready for print.", IMG.abstract, 80)}
              ${card("✏️", "Smart Editing", "AI face enhancement, detail recovery, and batch editing.", IMG.workspace, 160)}
              ${card("☁️", "Unlimited Cloud Storage", "Access your files from anywhere, anytime.", IMG.graph, 240, true)}
              ${card("⚡", "Batch Processing", "Queue hundreds of images and let it run in the background.", IMG.device, 320)}
            </div>`;
          })() } as any),
        ),
        // ── FOOTER CTA ──
        sec("#0a0e1a", 96, "4xl", "center",
          h("Ready to breathe life into your photos?", 2, "#f8fafc", "bold", "center"),
          s(12),
          t("Free to start. No credit card required.", "lg", "#94a3b8", "center"),
          s(28),
          btn("Get Started Free", "#818cf8", "primary", "lg", "center"),
        ),
      ],
    }],
  },

  // ===================================================================
  // 28. AI PHOTO UPSCALER — BRIGHT  (light counterpart of #27)
  // ===================================================================
  {
    id: "ai-upscaler-light",
    name: "AI Upscaler — Bright",
    description: "The bright counterpart to AI Upscaler — the same energetic layout, tilted imagery, marquee, and bento grid in a clean, light palette. Also available in Dark.",
    category: "landing",
    cover: "from-white via-indigo-50 to-fuchsia-50",
    pages: [{
      title: "Home", slug: "index", isHome: true, published: true,
      blocks: [
        // ── HERO ──
        sec("#ffffff", 112, "6xl", "center",
          b("html", { html:
            `<div style="display:inline-flex;align-items:center;gap:8px;padding:8px 18px;border-radius:999px;border:1px solid rgba(15,23,42,0.12);background:rgba(15,23,42,0.03);font-size:13px;color:#334155;">
              <span style="width:8px;height:8px;border-radius:999px;background:#10b981;display:inline-block;" class="anim-pulse-glow"></span>
              NEW — Cloud upscaling is here
            </div>`
          } as any),
          s(24),
          b("html", { html:
            `<h1 style="margin:0;font-size:56px;line-height:1.1;font-weight:800;letter-spacing:-0.02em;">
              <span style="color:#94a3b8;font-weight:400;">From</span> <span style="color:#0f172a;">Pixelated</span> <span style="color:#94a3b8;font-weight:400;">to</span> <span style="color:#0f172a;">Perfect</span>
            </h1>`
          } as any),
          s(20),
          t("Supercharging your photos with AI — sharper, cleaner, larger. In seconds.", "xl", "#475569", "center"),
          s(32),
          b("columns", { count: 2, gap: 16 }, [
            b("button", { label: "See how it works", href: "#", variant: "ghost", size: "lg", align: "center", color: "#6366f1", textColor: "#475569" } as any),
            b("button", { label: "Get Started", href: "#", variant: "outline", size: "lg", align: "center", color: "#6366f1", textColor: "#6366f1" } as any),
          ]),
          s(56),
          b("html", { html:
            `<div style="position:relative;max-width:620px;margin:0 auto;">
              <div class="anim-float-slow">
                <div style="position:relative;border-radius:20px;overflow:hidden;box-shadow:0 20px 50px -15px rgba(15,23,42,0.12), 0 30px 80px -25px rgba(99,102,241,0.35);transform:rotate(-4deg);">
                  <div style="background-image:linear-gradient(115deg, rgba(236,72,153,0.4), rgba(56,189,248,0.4)), url('${IMG.abstract}');background-size:cover;background-position:center;width:100%;aspect-ratio:16/10;"></div>
                  <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:44px;height:44px;border-radius:999px;background:rgba(255,255,255,0.9);border:2px solid rgba(15,23,42,0.15);display:flex;align-items:center;justify-content:center;font-size:16px;color:#0f172a;">↔</div>
                </div>
              </div>
            </div>`
          } as any),
          s(40),
          t("AS SEEN ON", "sm", "#94a3b8", "center"),
          s(20),
          cols(3, 32,
            b("heading", { text: "The Pixel Times", level: 4, align: "center", color: "#94a3b8", weight: "semibold" } as any),
            b("heading", { text: "Maker Weekly", level: 4, align: "center", color: "#94a3b8", weight: "semibold" } as any),
            b("heading", { text: "Creator Daily", level: 4, align: "center", color: "#94a3b8", weight: "semibold" } as any),
          ),
        ),
        // ── "LOW RES IS NO FUN" SPLIT ──
        sec("#ffffff", 112, "6xl", "left",
          cols(2, 56,
            sec("#transparent", 0, "full", "left",
              h("Low resolution is no fun.", 2, "#0f172a", "bold", "left"),
              s(16),
              t("Got a blurry photo or a pixelated mess? Love the memories but hate the quality?", "lg", "#475569", "left"),
              s(16),
              t("We've all been there.", "lg", "#64748b", "left"),
              s(24),
              btn("Fix my photos →", "#6366f1", "primary", "md", "left"),
            ),
            b("html", { html:
              `<div style="position:relative;height:340px;">
                <div class="anim-float" style="position:absolute;top:40px;right:40px;">
                  <div style="width:220px;height:270px;border-radius:16px;transform:rotate(11deg);box-shadow:0 20px 45px -15px rgba(15,23,42,0.12), 0 25px 60px -20px rgba(236,72,153,0.3);background-image:linear-gradient(160deg, rgba(244,114,182,0.45), rgba(56,189,248,0.45)), url('${IMG.abstract}');background-size:cover;background-position:center;border:1px solid rgba(15,23,42,0.08);"></div>
                </div>
                <div class="anim-float-slow" style="position:absolute;top:20px;left:20px;width:52px;height:52px;border-radius:14px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);display:flex;align-items:center;justify-content:center;font-size:22px;">📷</div>
                <div class="anim-float" style="position:absolute;bottom:30px;left:60px;width:48px;height:48px;border-radius:999px;background:rgba(236,72,153,0.1);border:1px solid rgba(236,72,153,0.3);display:flex;align-items:center;justify-content:center;font-size:20px;">☁️</div>
                <div class="anim-float-slow" style="position:absolute;bottom:60px;right:10px;">
                  <div style="width:44px;height:44px;border-radius:12px;background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.3);display:flex;align-items:center;justify-content:center;font-size:18px;transform:rotate(-12deg);">💎</div>
                </div>
              </div>`
            } as any),
          ),
        ),
        // ── MARQUEE ──
        b("html", { html:
          `<div style="position:relative;background:#ffffff;padding:64px 0;overflow:hidden;">
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:480px;height:480px;border-radius:999px;background:radial-gradient(circle, rgba(99,102,241,0.16), rgba(236,72,153,0.08) 55%, transparent 75%);filter:blur(10px);" class="anim-pulse-glow"></div>
            <div style="position:absolute;top:38%;left:0;white-space:nowrap;width:200%;display:flex;" class="anim-marquee">
              <span style="font-size:96px;font-weight:800;color:rgba(15,23,42,0.06);letter-spacing:-0.02em;">PIXELFORGE&nbsp;PIXELFORGE&nbsp;PIXELFORGE&nbsp;PIXELFORGE&nbsp;</span>
              <span style="font-size:96px;font-weight:800;color:rgba(15,23,42,0.06);letter-spacing:-0.02em;">PIXELFORGE&nbsp;PIXELFORGE&nbsp;PIXELFORGE&nbsp;PIXELFORGE&nbsp;</span>
            </div>
            <div style="position:relative;text-align:center;padding:40px 0;">
              <div style="font-size:16px;color:#475569;">PixelForge is made for</div>
              <div style="font-size:52px;font-weight:800;color:#0f172a;margin-top:8px;">Creators</div>
            </div>
          </div>`
        } as any),
        // ── MEET CLOUD ──
        sec("#ffffff", 112, "6xl", "center",
          h("Meet PixelForge Cloud.", 2, "#0f172a", "bold", "center"),
          s(12),
          t("The best gets even better.", "lg", "#475569", "center"),
          s(48),
          b("html", { html:
            `<div style="max-width:900px;margin:0 auto;">
              <div class="anim-float-slow">
                <div style="transform:perspective(1400px) rotateX(8deg) rotate(-2deg);border-radius:16px;overflow:hidden;box-shadow:0 20px 50px -15px rgba(15,23,42,0.1), 0 40px 90px -30px rgba(99,102,241,0.3);background:#ffffff;border:1px solid rgba(15,23,42,0.08);">
                  <div style="display:flex;align-items:center;gap:6px;padding:12px 16px;background:#f8fafc;border-bottom:1px solid rgba(15,23,42,0.08);">
                    <span style="width:10px;height:10px;border-radius:999px;background:#f87171;display:inline-block;"></span>
                    <span style="width:10px;height:10px;border-radius:999px;background:#fbbf24;display:inline-block;"></span>
                    <span style="width:10px;height:10px;border-radius:999px;background:#34d399;display:inline-block;"></span>
                  </div>
                  <div style="display:flex;">
                    <div style="flex:1;padding:10px 0;text-align:center;font-size:12px;font-weight:600;color:#fff;background:linear-gradient(90deg,#f97316,#fb923c);">Generate</div>
                    <div style="flex:1;padding:10px 0;text-align:center;font-size:12px;font-weight:600;color:#fff;background:linear-gradient(90deg,#22c55e,#4ade80);">Edit</div>
                    <div style="flex:1;padding:10px 0;text-align:center;font-size:12px;font-weight:600;color:#fff;background:linear-gradient(90deg,#3b82f6,#22d3ee);">Upscale</div>
                  </div>
                  <div style="background-image:linear-gradient(180deg, rgba(255,255,255,0.25), rgba(255,255,255,0.8)), url('${IMG.graph}');background-size:cover;background-position:center;aspect-ratio:16/9;"></div>
                </div>
              </div>
            </div>`
          } as any),
        ),
        // ── BENTO FEATURE GRID ──
        sec("#ffffff", 112, "6xl", "center",
          t("EVERYTHING YOU NEED", "sm", "#6366f1", "center"),
          s(8),
          h("One app. Every fix your photos need.", 2, "#0f172a", "bold", "center"),
          s(48),
          b("html", { html: (() => {
            const card = (icon: string, title: string, desc: string, bgImg: string, delay: number, tall = false) => `
              <div class="anim-fade-up" style="animation-delay:${delay}ms;position:relative;border-radius:18px;overflow:hidden;border:1px solid rgba(15,23,42,0.08);background:#ffffff;box-shadow:0 4px 16px -8px rgba(15,23,42,0.08);${tall ? "grid-row:span 2;" : ""}min-height:${tall ? 380 : 180}px;padding:24px;display:flex;flex-direction:column;justify-content:flex-end;">
                <div style="position:absolute;inset:0;background-image:linear-gradient(180deg, rgba(255,255,255,0.35), rgba(255,255,255,0.92)), url('${bgImg}');background-size:cover;background-position:center;"></div>
                <div style="position:relative;">
                  <div style="width:40px;height:40px;border-radius:10px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);display:flex;align-items:center;justify-content:center;font-size:18px;margin-bottom:14px;">${icon}</div>
                  <div style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:6px;">${title}</div>
                  <div style="font-size:14px;color:#475569;line-height:1.5;">${desc}</div>
                </div>
              </div>`;
            return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
              ${card("🔍", "AI Upscaling", "Scale images up to 16x with multiple AI models tuned for crystal-clear results.", IMG.device, 0, true)}
              ${card("🎨", "Color Accuracy", "Preserve every detail and color, ready for print.", IMG.abstract, 80)}
              ${card("✏️", "Smart Editing", "AI face enhancement, detail recovery, and batch editing.", IMG.workspace, 160)}
              ${card("☁️", "Unlimited Cloud Storage", "Access your files from anywhere, anytime.", IMG.graph, 240, true)}
              ${card("⚡", "Batch Processing", "Queue hundreds of images and let it run in the background.", IMG.device, 320)}
            </div>`;
          })() } as any),
        ),
        // ── FOOTER CTA ──
        sec("#f8fafc", 96, "4xl", "center",
          h("Ready to breathe life into your photos?", 2, "#0f172a", "bold", "center"),
          s(12),
          t("Free to start. No credit card required.", "lg", "#475569", "center"),
          s(28),
          btn("Get Started Free", "#6366f1", "primary", "lg", "center"),
        ),
      ],
    }],
  },

];
export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
