import type { Metadata } from "next";
import PreviewQueue from "./PreviewQueue";

export const metadata: Metadata = {
  title: "Kinly previews",
  robots: { index: false, follow: false },
};

export default function PreviewsPage() {
  return <PreviewQueue />;
}
