import { getDb } from "@/lib/db/client";
import { listPosts, BLOG_STAGES, STAGE_LABEL } from "@/lib/hq/posts";
import PageHeader from "@/components/shell/PageHeader";
import BlogBoard from "@/components/blog/BlogBoard";

// /blog — HQ-tavlen for blogindlæg: idé → arbejder → til gennemlæsning →
// publicer → udgivet. Samme server/klient-opdeling som /opgaver og /pipeline:
// serveren henter kort-listen én gang, tavlen er klient-side (BlogBoard).
export const dynamic = "force-dynamic";
export const metadata = { title: "Blog · Kinly HQ" };

export default async function BlogPage() {
  const cards = await listPosts(getDb());
  const stages = BLOG_STAGES.map((stage) => ({ stage, label: STAGE_LABEL[stage] }));

  return (
    <div className="cc-fade kinly-page">
      <PageHeader icon="Rss" title="Blog" subtitle="Idé → arbejder → til gennemlæsning → publicer → udgivet." />
      <BlogBoard initialCards={cards} stages={stages} />
    </div>
  );
}
