import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "Neuravex — Website Builder",
  description: "Design, edit, and publish websites visually.",
};

/**
 * The builder's own document: the dark chrome of the app itself.
 *
 * A published site gets its own root layout under (published), because the
 * two are different documents with nothing in common but the stylesheet. The
 * builder's theme classes used to ride along on every published page, and the
 * download had to strip them back off again.
 */
export default function BuilderLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-bg text-fg">{children}</body>
    </html>
  );
}
