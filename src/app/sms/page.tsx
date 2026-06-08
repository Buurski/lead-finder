import PageHeader from "@/components/shell/PageHeader";
import SmsClient from "./SmsClient";

export const metadata = { title: "SMS · Command Center" };

export default function SmsPage() {
  return (
    <div className="cc-fade">
      <PageHeader
        icon="Smartphone"
        title="SMS / Mobil"
        subtitle="Attraktive leads uden email eller Facebook — kun et mobilnummer. På telefonen: tryk Skriv SMS → Beskeder åbner med udkastet klar til at sende. Sender intet selv."
      />
      <SmsClient />
    </div>
  );
}
