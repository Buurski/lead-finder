import { currentUser } from "@/lib/current-user";
import { listNotes } from "@/lib/mit-rum";
import PageHeader from "@/components/shell/PageHeader";
import NotesClient from "./notes-client";

// /mit-rum — personligt rum. Serveren henter KUN den indloggede brugers noter;
// "delt" (fælles-login) og udloggede får besked om at logge ind med egen konto.
export const dynamic = "force-dynamic";
export const metadata = { title: "Mit rum · Kinly HQ" };

export default async function MitRumPage() {
  const user = await currentUser();

  if (user !== "lucas" && user !== "charlie") {
    return (
      <div className="cc-fade kinly-page">
        <PageHeader icon="NotebookPen" title="Mit rum" subtitle="Private noter — kun for dig." />
        <div className="cc-card cc-card-pad">
          <p className="cc-sub" style={{ margin: 0 }}>
            Mit rum kræver et personligt login. Log ind med din egen konto for at se og skrive dine
            private noter — den fælles konto har ikke adgang.
          </p>
        </div>
      </div>
    );
  }

  const notes = await listNotes(user);
  return (
    <div className="cc-fade kinly-page">
      <PageHeader
        icon="NotebookPen"
        title="Mit rum"
        subtitle={`Dine private noter, ${user === "lucas" ? "Lucas" : "Charlie"} — ingen andre kan se dem.`}
      />
      <NotesClient initialNotes={notes} />
    </div>
  );
}
