import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/shell/AppShell";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
});

export const metadata: Metadata = {
  title: "Command Center",
  description: "Lucas's agentic OS — lead & client command center",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="da" className={`${fraunces.variable} ${jakarta.variable} h-full`}>
      <body suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
