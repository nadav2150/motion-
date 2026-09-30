// /templates — curated starting points; clicking one pre-fills /home.

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { LayoutTemplate } from "lucide-react";
import type { StudioTemplate, TemplateCategory } from "../../lib/studio/types";
import { api } from "../ui/api";
import { AppShell, type ShellUser } from "../ui/AppShell";
import { Tabs } from "../ui/controls";
import { EmptyState, PageHeader, Skeleton } from "../ui/Card";
import { TemplateCard } from "../ui/TemplateCard";
import { FALLBACK_TEMPLATES, TEMPLATE_CATEGORY_LABELS } from "../ui/showcase";

type Cat = TemplateCategory | "all";

export const TEMPLATE_TABS: { key: Cat; label: string }[] = [
  { key: "all", label: "All" },
  ...(Object.keys(TEMPLATE_CATEGORY_LABELS) as TemplateCategory[]).map((k) => ({ key: k as Cat, label: TEMPLATE_CATEGORY_LABELS[k] })),
];

export function TemplatesScreen({ user, planTier, credits }: { user: ShellUser; planTier: string | null; credits: number | null }) {
  const [params, setParams] = useSearchParams();
  const cat = (TEMPLATE_TABS.some((t) => t.key === params.get("category")) ? params.get("category") : "all") as Cat;
  const q = (params.get("q") ?? "").toLowerCase();
  const [all, setAll] = useState<StudioTemplate[] | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .listTemplates()
      .then((r) => alive && setAll(r.items.length ? r.items : FALLBACK_TEMPLATES))
      .catch(() => alive && setAll(FALLBACK_TEMPLATES));
    return () => {
      alive = false;
    };
  }, []);

  const items = (all ?? []).filter(
    (t) => (cat === "all" || t.category === cat) && (!q || `${t.name} ${t.tagline}`.toLowerCase().includes(q)),
  );

  return (
    <AppShell user={user} planTier={planTier} credits={credits}>
      <PageHeader title="Templates" subtitle="Get inspired or start from a professional template." />
      <Tabs
        label="Template categories"
        items={TEMPLATE_TABS}
        value={cat}
        onChange={(k) => {
          const p = new URLSearchParams(params);
          if (k === "all") p.delete("category");
          else p.set("category", k);
          setParams(p, { replace: true });
        }}
        className="mb-6"
      />
      {all === null ? (
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i}>
              <Skeleton className="aspect-video w-full rounded-2xl" />
              <Skeleton className="mt-3 h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<LayoutTemplate className="size-5" />} title="No templates here yet" body="New templates are added regularly — try another category." />
      ) : (
        <div className="grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {items.map((t, i) => (
            <TemplateCard key={t.id} t={t} href={`/home?template=${encodeURIComponent(t.id)}`} eager={i < 3} />
          ))}
        </div>
      )}
    </AppShell>
  );
}
