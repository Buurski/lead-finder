"use client";
// /blog — blog-tavlen (ideer → arbejder → til gennemlæsning → publicer →
// udgivet). Kolonner = BLOG_STAGES (fra serveren, posts.ts har "server-only"
// og kan ikke importeres herfra — se blog-utils.ts). Kort-klik åbner PostDialog.
// Træk-og-slip flytter fase ligesom Pipeline (PipelineBoard.tsx): samme
// mønster (dragId/dragOverStage, native HTML5 drag, optimistisk + rollback),
// samme server-rute (PATCH /api/posts/[id]) som pil-knapperne i PostDialog —
// ingen separat DnD-gate at glemme at opdatere.
import { useEffect, useRef, useState } from "react";
import type { BlogStage, PostCard } from "@/lib/hq/posts";
import Icon from "@/components/shell/Icon";
import PostDialog from "./PostDialog";
import WorkStatus from "./WorkStatus";
import { IMAGE_SLOTS, categoryLabel, chosenSlots, dayMonth, overallScore, personName, readWork, scoreLevel, workState, type QueueSpot } from "./blog-utils";
import IdeaCleanup from "./IdeaCleanup";
import "./blog.css";

export interface StageInfo {
  stage: BlogStage;
  label: string;
}

export default function BlogBoard({ initialCards, stages }: { initialCards: PostCard[]; stages: StageInfo[] }) {
  const [cards, setCards] = useState(initialCards);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addingIdea, setAddingIdea] = useState(false);
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaBusy, setIdeaBusy] = useState(false);
  const [ideaError, setIdeaError] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [dropError, setDropError] = useState<string | null>(null);
  const dropErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (dropErrorTimer.current) clearTimeout(dropErrorTimer.current); }, []);

  // Mens noget ligger i Arbejder, hentes tavlen hvert 30. sekund, så Hermes'
  // fremdrift rykker sig uden reload. Stopper af sig selv når Arbejder er tom.
  const [now, setNow] = useState(() => Date.now());
  const [retryBusy, setRetryBusy] = useState<string | null>(null);
  const working = cards.some((c) => c.stage === "arbejder");
  useEffect(() => {
    if (!working) return;
    const t = setInterval(async () => {
      setNow(Date.now());
      if (document.hidden) return;
      try {
        const res = await fetch("/api/posts");
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.cards)) setCards(data.cards);
      } catch {
        // Næste runde prøver igen — et mistet poll er ikke en fejl at vise.
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [working]);

  // "Prøv igen" på et fejlet/hængt kort: serveren (retryWork) afgør om det er tilladt.
  async function retryCard(id: string) {
    setRetryBusy(id);
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retry: true }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "kunne ikke starte igen");
      updateCard(id, { work: readWork(data.post?.work) });
      setNow(Date.now());
    } catch (err) {
      notifyDropError(err instanceof Error ? err.message : "kunne ikke starte igen");
    } finally {
      setRetryBusy(null);
    }
  }

  function updateCard(id: string, patch: Partial<PostCard>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
  }

  function notifyDropError(msg: string) {
    setDropError(msg);
    if (dropErrorTimer.current) clearTimeout(dropErrorTimer.current);
    dropErrorTimer.current = setTimeout(() => setDropError(null), 4200);
  }

  // Samme rute som PostDialog's pil-knapper (patchPost i den fil) — kaldes her
  // adskilt, fordi tavlen ikke har den åbne dialogs state. Serverens guards i
  // hq/posts.ts (updatePost) er den ENESTE gate: et afvist træk springer
  // kortet tilbage til sin gamle fase og viser serverens egen fejlbesked.
  async function moveCard(id: string, stage: BlogStage) {
    const current = cards.find((c) => c.id === id);
    if (!current || current.stage === stage) return;
    const prevCards = cards;
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, stage } : c)));
    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const data = await res.json().catch(() => ({}) as { error?: string });
      if (!res.ok) throw new Error(data.error || "kunne ikke flytte indlægget");
      // Flytningen kan have bestilt eller ryddet Hermes' arbejde (workOnMove i posts.ts).
      updateCard(id, { work: readWork(data.post?.work) });
      setNow(Date.now());
    } catch (err) {
      setCards(prevCards);
      notifyDropError(err instanceof Error ? err.message : "kunne ikke flytte indlægget");
    }
  }

  // Opretter kortet via den eksisterende agent-rute (POST /api/posts) og henter
  // så hele listen igen — det er den simpleste vej til et korrekt PostCard-objekt
  // uden at duplikere listPosts' normalisering her (createPost returnerer rådata).
  async function createIdea() {
    const title = ideaTitle.trim();
    if (!title) return;
    setIdeaBusy(true);
    setIdeaError("");
    try {
      const res = await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "kunne ikke oprette idéen");
      const listRes = await fetch("/api/posts");
      const listData = await listRes.json().catch(() => ({}));
      if (listRes.ok && Array.isArray(listData.cards)) setCards(listData.cards);
      setIdeaTitle("");
      setAddingIdea(false);
    } catch (e) {
      setIdeaError(e instanceof Error ? e.message : "kunne ikke oprette idéen");
    } finally {
      setIdeaBusy(false);
    }
  }

  // Kø-plads for ventende kort (ældste bestilling først, som serverens workQueue),
  // så hvert kort kan sige "nr. 3 · forventet ca. i morgen".
  const running = cards.filter((c) => c.stage === "arbejder" && workState(c.work, now) === "running").length;
  const spots = new Map<string, QueueSpot>(
    cards
      .filter((c) => c.stage === "arbejder" && workState(c.work, now) === "waiting")
      .sort((a, b) => (a.work.requestedAt ?? "").localeCompare(b.work.requestedAt ?? ""))
      .map((c, i) => [c.id, { pos: i + 1, running }]),
  );

  return (
    <>
      <div className="bl-board">
        {stages.map(({ stage, label }) => {
          const list = cards.filter((c) => c.stage === stage);
          // Idé-kolonnen sorteres efter samlet Jev-score, højest øverst —
          // ubedømte (null) nederst, uden at det ændrer position i databasen.
          if (stage === "ide") {
            list.sort((a, b) => {
              const sa = overallScore(a.scores);
              const sb = overallScore(b.scores);
              if (sa === null && sb === null) return 0;
              if (sa === null) return 1;
              if (sb === null) return -1;
              return sb - sa;
            });
          }
          return (
            <div
              key={stage}
              className="bl-col"
              data-stage={stage}
              data-over={dragOverStage === stage}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (dragOverStage !== stage) setDragOverStage(stage);
              }}
              onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain") || dragId;
                setDragOverStage(null);
                setDragId(null);
                if (id) void moveCard(id, stage);
              }}
            >
              <div className="bl-col-head">
                <div className="bl-col-title">
                  {label}
                  <span className="cc-chip">{list.length}</span>
                </div>
                {stage === "ide" && (
                  <div className="bl-new-idea">
                    {!addingIdea ? (
                      <button type="button" className="cc-btn bl-new-idea-btn" onClick={() => setAddingIdea(true)}>
                        <Icon name="Plus" style={{ width: 14, height: 14 }} /> Ny idé
                      </button>
                    ) : (
                      <form className="bl-new-idea-form" onSubmit={(e) => { e.preventDefault(); void createIdea(); }}>
                        <input
                          className="bl-input"
                          autoFocus
                          placeholder="Titel på idéen"
                          value={ideaTitle}
                          onChange={(e) => setIdeaTitle(e.target.value)}
                          maxLength={160}
                        />
                        <div className="bl-new-idea-actions">
                          <button type="submit" className="cc-btn cc-btn-accent" disabled={ideaBusy || !ideaTitle.trim()}>{ideaBusy ? "Opretter…" : "Opret"}</button>
                          <button type="button" className="cc-btn" onClick={() => { setAddingIdea(false); setIdeaTitle(""); setIdeaError(""); }} disabled={ideaBusy}>Annuller</button>
                        </div>
                        {ideaError && <p role="alert" className="bl-error">{ideaError}</p>}
                      </form>
                    )}
                  </div>
                )}
              </div>
              <div className="bl-col-body">
                {stage === "ide" && <IdeaCleanup onDeleted={removeCard} />}
                {list.length === 0 && <div className="bl-col-empty">Ingen indlæg her</div>}
                {list.map((card) => {
                  const chosen = chosenSlots(card.images.choice);
                  const samlet = overallScore(card.scores);
                  const fcOld = card.factcheck ? card.factcheck.revision !== card.checklist.revision : false;
                  // Kortet er en div med en knap indeni, så "Prøv igen" kan være sin egen knap
                  // (knap-i-knap er ugyldigt). Klik hvor som helst på kortet åbner dialogen.
                  return (
                    <div
                      key={card.id}
                      className="bl-card"
                      data-dragging={dragId === card.id}
                      data-locked={card.stage === "arbejder"}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", card.id);
                        e.dataTransfer.effectAllowed = "move";
                        setDragId(card.id);
                      }}
                      onDragEnd={() => { setDragId(null); setDragOverStage(null); }}
                      onClick={() => setOpenId(card.id)}
                    >
                      <button type="button" className="bl-card-main">
                      <div className="bl-card-top">
                        <span className="bl-card-title">{card.title || "(uden titel)"}</span>
                        {samlet !== null && (
                          <span className="bl-score-badge" data-level={scoreLevel(samlet)} title="Jev-bedømmelse: samlet score">
                            {samlet}
                          </span>
                        )}
                      </div>
                      <span className="bl-card-cat cc-chip">{categoryLabel(card.category)}</span>
                      {card.stage === "udgivet" ? (
                        <div className="bl-card-checklist" data-ok="true">
                          {card.publishedUrl ? (
                            <a
                              className="cc-link"
                              href={card.publishedUrl}
                              target="_blank"
                              rel="noreferrer"
                              // Kun så bredt som teksten — ellers sluger linket klik midt på kortet (E2E 26/9).
                              style={{ display: "inline-flex", alignItems: "center", gap: 2, width: "fit-content" }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              Live <Icon name="ArrowUpRight" style={{ width: 11, height: 11 }} />
                            </a>
                          ) : (
                            "Live"
                          )}
                        </div>
                      ) : card.stage === "arbejder" ? null : (
                        // I Arbejder er tjeklisten Hermes' sag — statuslinjen nedenfor siger mere.
                        <div className="bl-card-checklist" data-ok={card.checklist.ok}>
                          {card.checklist.ok ? "Klar til publicering" : `${card.checklist.missing.length} mangler`}
                        </div>
                      )}
                      {IMAGE_SLOTS.some((s) => card.images[s]) && (
                        <div className="bl-card-thumbs">
                          {IMAGE_SLOTS.map((s) => {
                            const cand = card.images[s];
                            if (!cand) return null;
                            const pos = chosen.indexOf(s);
                            return (
                              <span key={s} className="bl-thumb" data-chosen={pos >= 0}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={cand.url} alt="" />
                                {pos >= 0 && <span className="bl-thumb-badge">{pos + 1} · {s.toUpperCase()}</span>}
                              </span>
                            );
                          })}
                        </div>
                      )}
                      </button>
                      {card.stage === "arbejder" && (
                        <WorkStatus work={card.work} now={now} spot={spots.get(card.id)} busy={retryBusy === card.id} onRetry={() => void retryCard(card.id)} />
                      )}
                      {/* Kun det beviserne rummer: council-loggen (Hermes' reviewer) og menneskets faktatjek. */}
                      {card.stage === "klar" && (card.council || card.factcheck) && (
                        <div className="bl-checked">
                          {card.council && (
                            <div>Tjekket af {card.council.reviewer}{card.council.retest ? ` · retest ${card.council.retest}` : ""}</div>
                          )}
                          {card.factcheck && (
                            <div data-old={fcOld}>
                              Faktatjek: {personName(card.factcheck.by)} {card.factcheck.at ? dayMonth(card.factcheck.at) : ""}{fcOld ? " — ældre version" : ""}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Træk-og-slip virker ikke med fingre (HTML5-drag er mus-only) — på touch
                          flyttes med en indbygget vælger. Samme moveCard/server-gate som trækket. */}
                      {card.stage !== "udgivet" && (
                        <select
                          className="bl-card-move cc-focus"
                          aria-label={`Flyt "${card.title}" til en anden fase`}
                          value=""
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            const s = e.target.value as BlogStage;
                            if (s) void moveCard(card.id, s);
                          }}
                        >
                          <option value="">Flyt til…</option>
                          {stages.filter((s) => s.stage !== card.stage && s.stage !== "udgivet").map((s) => (
                            <option key={s.stage} value={s.stage}>{s.label}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {openId && (
        <PostDialog
          id={openId}
          stages={stages}
          work={cards.find((c) => c.id === openId)?.work ?? {}}
          now={now}
          onClose={() => setOpenId(null)}
          onSaved={(patch) => updateCard(openId, patch)}
          onDeleted={(deletedId) => removeCard(deletedId)}
        />
      )}

      {/* Afvist træk: kortet springer tilbage (moveCard) og fejlen vises her,
          role="alert" så skærmlæsere fanger den med det samme. */}
      {dropError && (
        <div role="alert" className="bl-drop-toast">
          {dropError}
        </div>
      )}
    </>
  );
}
