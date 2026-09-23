import { markdownSections, renderMarkdown } from "@/lib/md";

export default function NoteCard({ title, body }: { title: string; body: string }) {
  const sections = markdownSections(body);
  return (
    <article className="virk-note">
      <h2 className="virk-note-title">{title}</h2>
      {sections.length === 0 && <p className="cc-dim">Ingen tekst endnu.</p>}
      {sections.map((section, index) => section.title ? (
        <details className="virk-note-section" key={index} open={index === 0}>
          <summary>{section.title}</summary>
          <div className="virk-note-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(section.body) }} />
        </details>
      ) : <div className="virk-note-body" key={index} dangerouslySetInnerHTML={{ __html: renderMarkdown(section.body) }} />)}
    </article>
  );
}
