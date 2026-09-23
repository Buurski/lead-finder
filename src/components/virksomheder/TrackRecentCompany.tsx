"use client";
import { useEffect } from "react";
import { pushRecentCompany } from "@/lib/recent-companies";

// Usynlig: registrerer at denne virksomhed lige er åbnet, så ⌘K-paletten kan
// vise den under "Seneste" næste gang. Ingen egen UI.
export default function TrackRecentCompany({ id, name }: { id: string; name: string }) {
  useEffect(() => {
    pushRecentCompany({ id, name });
  }, [id, name]);
  return null;
}
