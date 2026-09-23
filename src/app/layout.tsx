import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/shell/AppShell";
import { currentUser } from "@/lib/current-user";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-jakarta",
});

// Meta-tekst kun (datoer, "6 min siden", tællere) — spec §5. Aldrig brødtekst.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jbmono",
});

export const metadata: Metadata = {
  title: "Kinly HQ",
  description: "Kinly · internt CRM og kundeoverblik",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Charlie 23/9: "Hvem"-valget i Ny opgave stod altid på Lucas — skal følge
  // den indloggede person (lokalt uden login = null → Lucas, jf. fælles-regel #29).
  const user = await currentUser();
  const defaultOwner = user === "charlie" ? "charlie" : "lucas";
  return (
    <html lang="da" className={`${jakarta.variable} ${jetbrainsMono.variable} h-full`}>
      <body suppressHydrationWarning>
        <AppShell defaultOwner={defaultOwner}>{children}</AppShell>
      </body>
    </html>
  );
}
