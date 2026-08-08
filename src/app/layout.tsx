import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Neuravex — Website Builder",
  description: "Design, edit, and publish websites visually.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-bg text-fg">{children}</body>
    </html>
  );
}
