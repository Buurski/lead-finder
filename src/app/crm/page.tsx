import PageHeader from "@/components/shell/PageHeader";
import WarnBanner from "@/components/WarnBanner";
import { buildDeckSummary } from "@/lib/deck";
import { nextAction } from "@/lib/next-action";
import { getClients } from "@/lib/sheets";
import { listActivities, listTasks } from "@/lib/crm";
import CrmClient from "./CrmClient";

export const metadata = { title: "CRM · Command Center" };
export const dynamic = "force-dynamic";

export default async function CrmPage() {
  let clients;
  try {
    clients = await getClients();
  } catch {
    return (
      <div className="cc-fade">
        <PageHeader icon="Users" title="CRM" subtitle="Kunder, opgaver og aktivitet" />
        <WarnBanner>Google Sheets svarer ikke. CRM viser ikke tomme kundedata som om alt er i orden.</WarnBanner>
      </div>
    );
  }

  const [summary, tasksResult, activitiesResult] = await Promise.all([
    buildDeckSummary(),
    listTasks().catch(() => null),
    listActivities(undefined, 60).catch(() => null),
  ]);
  const tasks = tasksResult ?? [];
  const activities = activitiesResult ?? [];
  const dataOk = tasksResult !== null && activitiesResult !== null;
  const overdueTasks = tasks.filter((task) => !task.done && task.due && task.due < new Date().toISOString().slice(0, 10)).length;
  const dueTasks = tasks.filter((task) => !task.done && task.due === new Date().toISOString().slice(0, 10)).length;
  const action = nextAction({ ...summary, crm: { overdueTasks, dueTasks, overdueInvoices: summary.invoicesOverdue } });

  return (
    <div className="cc-fade">
      <PageHeader icon="Users" title="CRM" subtitle={`${clients.length} kunder · arbejdsfladen for næste handling`} />
      <CrmClient
        clients={clients.map((client) => ({ id: client.id, name: client.name, branch: client.branch }))}
        initialTasks={tasks}
        activities={activities}
        nextAction={action}
        today={new Date().toISOString().slice(0, 10)}
        dataOk={dataOk}
      />
    </div>
  );
}
