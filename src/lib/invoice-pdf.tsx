// invoice-pdf.tsx — react-pdf template + renderInvoicePdf (Task 2).
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { Invoice, BusinessSettings } from "./invoices.ts";
import { invoiceTotal } from "./invoices.ts";

const kr = (n: number) => `${n.toLocaleString("da-DK")} kr`;

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("da-DK", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: "#1a1a1a" },
  title: { fontSize: 20, marginBottom: 4 },
  meta: { fontSize: 10, color: "#555", marginBottom: 20 },
  columns: { flexDirection: "row", justifyContent: "space-between", marginBottom: 24 },
  col: { width: "45%" },
  colHeading: { fontSize: 9, color: "#888", marginBottom: 4, textTransform: "uppercase" },
  hr: { borderBottomWidth: 1, borderBottomColor: "#ddd", marginVertical: 10 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  lineDesc: { flex: 1 },
  totalsBox: { marginTop: 10, alignItems: "flex-end" },
  totalRow: { flexDirection: "row", justifyContent: "space-between", width: 200, paddingVertical: 2 },
  totalFinal: { fontSize: 12, fontWeight: 700 as unknown as number },
  payBox: { marginTop: 24, padding: 12, backgroundColor: "#f5f5f5" },
  noteBox: { marginTop: 12, padding: 12, backgroundColor: "#fafafa", fontSize: 9, color: "#555" },
  footer: { position: "absolute", bottom: 30, left: 40, right: 40, fontSize: 9, color: "#888", textAlign: "center" },
});

function InvoiceDocument({ inv, biz }: { inv: Invoice; biz: BusinessSettings }) {
  const { subtotal, vat, total } = invoiceTotal(inv);
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>FAKTURA {inv.number}</Text>
        <Text style={styles.meta}>
          Udstedt {fmtDate(inv.issueDate)} · Forfalder {fmtDate(inv.dueDate)}
        </Text>

        <View style={styles.columns}>
          <View style={styles.col}>
            <Text style={styles.colHeading}>Faktura til</Text>
            <Text>{inv.recipient.name}</Text>
            {inv.recipient.att ? <Text>Att: {inv.recipient.att}</Text> : null}
            {inv.recipient.address ? <Text>{inv.recipient.address}</Text> : null}
            {inv.recipient.cvr ? <Text>CVR: {inv.recipient.cvr}</Text> : null}
          </View>
          <View style={styles.col}>
            <Text style={styles.colHeading}>Fra</Text>
            <Text>{biz.name}</Text>
            <Text>{biz.address}</Text>
            <Text>{biz.city}</Text>
            {biz.cvr ? <Text>CVR: {biz.cvr}</Text> : <Text>Privatperson · uden CVR</Text>}
          </View>
        </View>

        <View style={styles.hr} />
        {inv.lines.map((line, i) => (
          <View style={styles.row} key={i}>
            <Text style={styles.lineDesc}>{line.description}</Text>
            <Text>{kr(line.amount)}</Text>
          </View>
        ))}
        <View style={styles.hr} />

        <View style={styles.totalsBox}>
          <View style={styles.totalRow}>
            <Text>Subtotal</Text>
            <Text>{kr(subtotal)}</Text>
          </View>
          {inv.vatRate > 0 ? (
            <View style={styles.totalRow}>
              <Text>Moms ({Math.round(inv.vatRate * 100)}%)</Text>
              <Text>{kr(vat)}</Text>
            </View>
          ) : null}
          <View style={[styles.totalRow, styles.totalFinal]}>
            <Text>Total</Text>
            <Text>{kr(total)}</Text>
          </View>
        </View>

        <View style={styles.payBox}>
          <Text>
            Bankoverførsel · Reg. {biz.bankReg} · Konto {biz.bankAccount} · Betales senest {fmtDate(inv.dueDate)}
          </Text>
        </View>

        {inv.payerType === "privat" ? (
          <View style={styles.noteBox}>
            {/* react-pdf kollapser whitespace mellem JSX-children — hold teksten i ét udtryk */}
            <Text>
              {`Beløbet indberettes af ${biz.name} som personlig indkomst (B-indkomst) — ingen moms opkrævet, jf. SKAT's regler for privatpersoner under 50.000 kr/år i salgsindkomst.`}
            </Text>
          </View>
        ) : null}

        <Text style={styles.footer}>
          På forhånd tak · {biz.name} · {biz.phone}
        </Text>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(inv: Invoice, biz: BusinessSettings): Promise<Buffer> {
  return renderToBuffer(<InvoiceDocument inv={inv} biz={biz} />);
}
