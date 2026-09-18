import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { QueryProvider } from "@/components/query-provider";

import "./globals.css";

/**
 * Vision UI Pro ships with Plus Jakarta Display, which is licensed and not
 * redistributable. Plus Jakarta Sans is its open-source successor and shares
 * the letterforms, so it is the face the tokens resolve to.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-jakarta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Web Signals",
  description: "Analytics across brandmultiplier.ai and sister sites",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jakarta.variable}>
      <body className="min-h-screen antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
