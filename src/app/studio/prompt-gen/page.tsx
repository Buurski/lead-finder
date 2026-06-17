import PageHeader from "@/components/shell/PageHeader";
import PromptGenClient from "./PromptGenClient";
import Link from "next/link";

export const metadata = { title: "Prompt-gen · Studio" };

export default function PromptGenPage() {
  return (
    <div className="cc-fade">
      <PageHeader
        icon="Sparkles"
        title="Prompt-gen → dispatch"
        subtitle="Recon kunden, byg en komplet Claude Code build-prompt, dispatch til en gratis build-session. Orchestration billig, build gratis."
        action={<Link href="/studio" className="cc-btn">← Studio</Link>}
      />
      <PromptGenClient />
    </div>
  );
}
