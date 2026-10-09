import Link from "next/link";
import Icon from "@/components/shell/Icon";

// Forsiden viser tallet; selve listen (med telefon, sidste kontakt og handlinger) bor på /har-svaret.
export default function RepliedLeadsCard({ n }: { n: number }) {
  return (
    <Link href="/har-svaret" className="hq-replied-card cc-card cc-focus">
      <span className="n tnum">{n}</span>
      <span className="t">
        <b>Har svaret</b>
        <span>leads har svaret på en mail og venter stadig på dig. Ældste kontakt først.</span>
      </span>
      <Icon name="ChevronRight" style={{ width: 16, height: 16 }} />
    </Link>
  );
}
