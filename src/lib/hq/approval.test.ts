import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as approvalHelpers from "./approval.ts";
import { applyApprovalChoice, approvalLine, APPROVAL_LABEL, parseApproval, prependApproval, withApproval } from "./approval.ts";

// Den reelle note på d0678f12 (kun de to første linjer + starten på planen).
const LEGACY = [
  "Beslutning fra Lucas GODKENDT",
  "Godkend eller afvis ved at redigere denne linje i Note og gemme. Klaret alene er ikke godkendelse. Dette er en manuel beslutningsnote, ikke en teststart. Godkendelse gælder retningen; ingen automatisk deploy.",
  "",
  "Mål: flere relevante kundehenvendelser, ikke flere visninger til alle URLer.",
].join("\n");

const rest = (s: string) => s.slice(s.indexOf("\n") + 1);

test("parseApproval læser den reelle legacy-linje", () => {
  assert.deepEqual(parseApproval(LEGACY), { status: "godkendt", actor: "Lucas" });
});

test("parseApproval: kun første linje tæller", () => {
  // Skjult markør længere nede må ikke give en beslutning.
  assert.equal(parseApproval("Almindelig note\nBeslutning fra Lucas AFVENTER"), null);
  // En titel der starter med "Godkend" er ikke en godkendelsesopgave.
  assert.equal(parseApproval("Godkend samlet synlighedsplan for Kinlys undersider"), null);
});

test("parseApproval afviser ukendt status og navn", () => {
  assert.equal(parseApproval("Beslutning fra Lucas MÅSKE"), null);
  assert.equal(parseApproval("Beslutning fra Allan AFVENTER"), null);
  assert.equal(parseApproval("Beslutning fra lucas AFVENTER"), null);
  assert.equal(parseApproval("Beslutning fra Lucas GODKENDT ekstra"), null);
  assert.equal(parseApproval(""), null);
});

test("parseApproval tåler \\r\\n og omkringliggende mellemrum", () => {
  assert.deepEqual(parseApproval("  Beslutning fra Charlie AFVENTER \r\nplan"), { status: "afventer", actor: "Charlie" });
});

test("withApproval bevarer resten af noten ordret (byte for byte)", () => {
  const out = withApproval(LEGACY, "Lucas", "afvist");
  assert.equal(out.split("\n")[0], "Beslutning fra Lucas AFVIST");
  assert.equal(rest(out), rest(LEGACY));
  assert.equal(Buffer.from(rest(out)).equals(Buffer.from(rest(LEGACY))), true, "resten må ikke ændres");
});

test("withApproval: note uden linjeskift → kun markøren", () => {
  assert.equal(withApproval("", "Charlie", "afventer"), "Beslutning fra Charlie AFVENTER");
  assert.equal(withApproval("gammel linje", "Lucas", "godkendt"), "Beslutning fra Lucas GODKENDT");
});

test("prependApproval bevarer en almindelig note som tekst under markøren", () => {
  assert.equal(prependApproval("Afventer Allans svar", "Lucas"), "Beslutning fra Lucas AFVENTER\nAfventer Allans svar");
  assert.equal(prependApproval("", "Charlie"), "Beslutning fra Charlie AFVENTER");
  assert.equal(parseApproval(prependApproval("Hej", "Lucas"))?.status, "afventer");
  const out = prependApproval("Linje 1\nLinje 2", "Lucas");
  assert.equal(out, "Beslutning fra Lucas AFVENTER\nLinje 1\nLinje 2");
});

test("approvalLine og APPROVAL_LABEL", () => {
  assert.equal(approvalLine("Lucas", "afventer"), "Beslutning fra Lucas AFVENTER");
  assert.equal(approvalLine("Charlie", "godkendt"), "Beslutning fra Charlie GODKENDT");
  assert.equal(approvalLine("Lucas", "afvist"), "Beslutning fra Lucas AFVIST");
  assert.equal(APPROVAL_LABEL.afventer, "Afventer godkendelse");
  assert.equal(APPROVAL_LABEL.godkendt, "Godkendt");
  assert.equal(APPROVAL_LABEL.afvist, "Afvist");
});

test("F5 checkbox bevarer første PLAN-linje når textarea-markøren er fjernet", () => {
  const plan = "PLAN første linje\nPLAN anden linje\n\nBevar æøå og mellemrum  ";
  assert.equal(applyApprovalChoice(plan, false, false, "Lucas"), plan);
  const checked = applyApprovalChoice(plan, true, false, "Charlie");
  assert.equal(checked, `Beslutning fra Charlie AFVENTER\n${plan}`);
  assert.equal(applyApprovalChoice(checked, true, false, "Charlie"), checked, "ingen duplicate markør");
  assert.equal(applyApprovalChoice(checked, false, false, "Charlie"), plan);
  assert.equal(applyApprovalChoice(LEGACY, true, true, "Charlie"), LEGACY);
  assert.equal(applyApprovalChoice(LEGACY, false, false, "Charlie"), LEGACY, "afgjort aktuel markør ændres ikke");
});

// Smalle branchchecks på de faktiske TSX-komponenter, ikke en kopieret helper.
// Eksisterende TypeScript compiler + stubbede hooks; rigtig browseraccept er parentens gate.
interface View { type: unknown; props: Record<string, unknown> }
function componentProbe(name: string, taskQuery: string | null = null) {
  const effects: { effect: () => unknown; deps: unknown[] }[] = [];
  const timers: (() => void)[] = [];
  const updates: unknown[][] = [];
  const jsx = (type: unknown, props: Record<string, unknown>): View => ({ type, props });
  const exports: { default?: (props: Record<string, unknown>) => View } = {};
  const source = readFileSync(`src/components/opgaver/${name}.tsx`, "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  runInNewContext(compiled, {
    exports,
    require: (path: string) => {
      if (path === "react") return {
        useState: (value: unknown) => [value, (next: unknown) => updates.push([value, next])],
        useRef: (value: unknown) => ({ current: value }),
        useCallback: (fn: unknown) => fn,
        useEffect: (effect: () => unknown, deps: unknown[]) => effects.push({ effect, deps }),
      };
      if (path === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (path === "next/navigation") return { useSearchParams: () => ({ get: () => taskQuery }) };
      if (path === "@/lib/hq/approval") return approvalHelpers;
      if (path === "@/lib/hq/focus-task") return {
        focusTaskFromHref: () => {},
        subscribeTaskFocus: () => () => {},
      };
      if (path === "./date-shortcuts") return { addDays: (date: string) => date, nextMonday: (date: string) => date };
      if (path.endsWith(".css")) return {};
      return { default: path };
    },
    setTimeout: (fn: () => void) => { timers.push(fn); return timers.length; },
    clearTimeout: () => {},
  });
  assert.ok(exports.default);
  return { render: exports.default, effects, timers, updates };
}
function views(node: unknown): View[] {
  if (Array.isArray(node)) return node.flatMap(views);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const view = node as View;
  return [view, ...views(view.props.children)];
}

test("F6 board abonnerer på ændret task-query og åbner Alle/Begge fra forkert filter", () => {
  for (const taskQuery of ["fixture_first", "fixture_second"]) {
    const probe = componentProbe("OpgaverBoard", taskQuery);
    probe.render({ initialItems: [], today: "2026-10-07", defaultOwner: "charlie" });
    const navigation = probe.effects.find(({ deps }) => deps.includes(taskQuery));
    assert.ok(navigation, "effect skal afhænge af task-query, ikke mount-only");
    navigation.effect();
    probe.timers[0]();
    assert.ok(probe.updates.some(([before, after]) => before === "dag" && after === "alle"));
    assert.ok(probe.updates.some(([before, after]) => before === "charlie" && after === ""));
    assert.ok(probe.updates.some(([before, after]) => before === null && after === taskQuery));
  }
});

test("F7 CompanyTasks-række og dialog læser fallback uden approval-projection", () => {
  const item = { id: "fixture_shared", title: "Plan", due: "", dueTime: "", owner: "lucas", note: "Beslutning fra Lucas AFVENTER\nplan", important: false, companyId: null, company: "Fixture" };
  const row = componentProbe("TaskRow");
  const nodes = views(row.render({ item, today: "2026-10-07", onComplete: () => assert.fail("pending må ikke klares"), onReschedule: () => {}, onChanged: () => {} }));
  assert.ok(nodes.some((v) => v.props["data-status"] === "afventer"));
  assert.ok(nodes.some((v) => v.props.role === "checkbox" && v.props.disabled === true));
  assert.ok(nodes.some((v) => v.props.href === `/opgaver?task=${item.id}#task-${item.id}`));
  const dialog = componentProbe("TaskEditDialog");
  const inputs = views(dialog.render({ item, onClose: () => {}, onChanged: () => {} }));
  assert.ok(inputs.some((v) => v.type === "input" && v.props.type === "checkbox" && v.props.checked === true), "dialogens kræver-godkendelse-checkbox er checked via noten");
  const decided = componentProbe("TaskEditDialog");
  const decidedInputs = views(decided.render({ item: { ...item, note: item.note.replace("AFVENTER", "GODKENDT") }, onClose: () => {}, onChanged: () => {} }));
  assert.ok(decidedInputs.some((v) => v.type === "input" && v.props.type === "checkbox" && v.props.disabled === true));
});
