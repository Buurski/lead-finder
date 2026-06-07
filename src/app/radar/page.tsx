import PageHeader from "@/components/shell/PageHeader";
import RadarClient from "./RadarClient";

export const metadata = { title: "AI-Radar · Command Center" };

export default function RadarPage() {
  return (
    <div className="cc-fade">
      <PageHeader
        icon="Radar"
        title="AI-Radar"
        subtitle="Det vigtigste nye AI — skills, tools, teknikker — kurateret dagligt fra Latent Space, ai.engineer, Karpathy, tech-X & GitHub, og scoret efter relevans for vores OS."
      />
      <RadarClient />
    </div>
  );
}
