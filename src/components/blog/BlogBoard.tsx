"use client";
// /blog — blog-tavlen (ideer → arbejder → til gennemlæsning → publicer →
// udgivet). Kolonner = BLOG_STAGES (fra serveren, posts.ts har "server-only"
// og kan ikke importeres herfra — se blog-utils.ts). Kort-klik åbner PostDialog.
import { useState } from "react";
import type { BlogStage, PostCard } from "@/lib/hq/posts";
import Icon from "@/components/shell/Icon";
import PostDialog from "./PostDialog";
import { categoryLabel } from "./blog-utils";
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

  function updateCard(id: string, patch: Partial<PostCard>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeCard(id: string) {
    setCards((prev) => prev.filter((c) => c.id !== id));
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

  return (
    <>
      <div className="bl-board">
        {stages.map(({ stage, label }) => {
          const list = cards.filter((c) => c.stage === stage);
          return (
            <div key={stage} className="bl-col">
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
                {list.length === 0 && <div className="bl-col-empty">Ingen indlæg her</div>}
                {list.map((card) => {
                  const chosen = card.images.choice;
                  return (
                    <button key={card.id} type="button" className="bl-card" onClick={() => setOpenId(card.id)}>
                      <div className="bl-card-top">
                        <span className="bl-card-title">{card.title || "(uden titel)"}</span>
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
                              onClick={(e) => e.stopPropagation()}
                            >
                              Live <Icon name="ArrowUpRight" style={{ width: 11, height: 11 }} />
                            </a>
                          ) : (
                            "Live"
                          )}
                        </div>
                      ) : (
                        <div className="bl-card-checklist" data-ok={card.checklist.ok}>
                          {card.checklist.ok ? "Klar til publicering" : `${card.checklist.missing.length} mangler`}
                        </div>
                      )}
                      {(card.images.a || card.images.b) && (
                        <div className="bl-card-thumbs">
                          {card.images.a && (
                            <span className="bl-thumb" data-chosen={chosen === "a" || chosen === "both"}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={card.images.a.url} alt="" />
                              {(chosen === "a" || chosen === "both") && <span className="bl-thumb-badge">A</span>}
                            </span>
                          )}
                          {card.images.b && (
                            <span className="bl-thumb" data-chosen={chosen === "b" || chosen === "both"}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={card.images.b.url} alt="" />
                              {(chosen === "b" || chosen === "both") && <span className="bl-thumb-badge">B</span>}
                            </span>
                          )}
                        </div>
                      )}
                    </button>
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
          onClose={() => setOpenId(null)}
          onSaved={(patch) => updateCard(openId, patch)}
          onDeleted={(deletedId) => removeCard(deletedId)}
        />
      )}
    </>
  );
}
