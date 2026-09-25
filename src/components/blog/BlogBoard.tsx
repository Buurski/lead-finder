"use client";
// /blog — blog-tavlen (ideer → arbejder → til gennemlæsning → publicer →
// udgivet). Kolonner = BLOG_STAGES (fra serveren, posts.ts har "server-only"
// og kan ikke importeres herfra — se blog-utils.ts). Kort-klik åbner PostDialog.
import { useState } from "react";
import type { BlogStage, PostCard } from "@/lib/hq/posts";
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

  function updateCard(id: string, patch: Partial<PostCard>) {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
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
                      <div className="bl-card-checklist" data-ok={card.checklist.ok}>
                        {card.checklist.ok ? "Klar til publicering" : `${card.checklist.missing.length} mangler`}
                      </div>
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
        />
      )}
    </>
  );
}
