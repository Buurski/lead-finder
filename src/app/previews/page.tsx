import type { Metadata } from "next";
import GratisUdkast from "@/components/previews/GratisUdkast";
import { isSenderAvailable } from "@/lib/senders";

export const metadata: Metadata = {
  title: "Gratis udkast · Kinly Lead System",
  robots: { index: false, follow: false },
};

// Hvilke afsendere der kan sende lige nu afgøres server-side (kræver Gmail-creds
// i miljøet) — klienten må aldrig selv afgøre det, den ser kun resultatet.
export default function PreviewsPage() {
  const senders = {
    lucas: isSenderAvailable("lucas"),
    charlie: isSenderAvailable("charlie"),
  };
  return <GratisUdkast senders={senders} />;
}
