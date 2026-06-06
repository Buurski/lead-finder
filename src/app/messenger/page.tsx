import PageHeader from "@/components/shell/PageHeader";
import MessengerPanel from "./MessengerPanel";

export const metadata = { title: "Messenger · Command Center" };

export default function MessengerPage() {
  return (
    <div className="cc-fade">
      <PageHeader
        icon="MessageSquare"
        title="Messenger"
        subtitle="FB-only leads at skrive til. Åbn deres side, åbn Messenger, indsæt udkastet — marker sendt. Sender intet selv."
      />
      <MessengerPanel />
    </div>
  );
}
