import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Headroom dashboard",
  description: "Memory-priced inference: capacity proof, live paid calls, Arc tab, baseline pricing and demand, every number linked to evidence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
