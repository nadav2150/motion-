import { data, useLoaderData, useNavigate, useRevalidator } from "react-router";
import type { Route } from "./+types/projects";
import { ProjectsScreen, type ProjectCard } from "../motionflow/screens/projects";
import type { NavKey } from "../motionflow/primitives";
import { requireUserOrRedirect } from "../lib/auth";
import { listProjectsForUser, type ProjectSummary } from "../lib/jobs";
import { loadCreditsForUI } from "../lib/billing/loader";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Projects — MotionFlow AI" }];
}

const navPath: Record<NavKey, string> = {
  home: "/home",
  projects: "/projects",
  settings: "/settings",
};

type LoaderData = {
  authed: boolean;
  projects: ProjectCard[];
  credits: number | null;
  planTier: string | null;
  debug?: {
    userId: string | null;
    email: string | null;
    queryCount: number;
    error: string | null;
  };
};

function toCard(p: ProjectSummary): ProjectCard {
  const finalReady = p.finalVideoStatus === "ready";
  const building = p.finalVideoStatus === "building";
  const finalFailed = p.finalVideoStatus === "failed";
  let label: ProjectCard["statusLabel"];
  if (finalReady) label = "Ready";
  else if (building) label = "Rendering";
  else if (finalFailed) label = "Failed";
  else if (p.status === "completed") label = "Storyboard";
  else if (p.status === "rendering") label = "Generating";
  else if (p.status === "directing") label = "Directing";
  else if (p.status === "failed") label = "Failed";
  else label = "Draft";

  const durSec = p.finalVideoDuration ?? null;
  const durStr = durSec ? `${Math.round(durSec)}s` : `${p.shotCount} shots`;

  // Finished films open the Export deliverable page; everything still in
  // progress opens the editor's storyboard view so the user sees shot status
  // and can drive retries / clip generation.
  const openTarget: ProjectCard["openTarget"] =
    finalReady || building ? "export" : "editor";

  return {
    id: p.id,
    title: p.title ?? "Untitled launch",
    statusLabel: label,
    metaLabel: durStr,
    updatedLabel: relativeTime(p.updatedAt),
    thumbnailUrl: p.thumbnailUrl,
    accent: gradientFor(p.id),
    openTarget,
    directDurationLabel: formatDirectDuration(p.directDurationSec),
  };
}

function formatDirectDuration(sec: number | null): string | null {
  if (sec === null || sec <= 0) return null;
  if (sec < 60) return `Directed in ${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0
    ? `Directed in ${m}m`
    : `Directed in ${m}m ${s}s`;
}

function gradientFor(seed: string): string {
  // Stable visual variety per job id when there's no thumbnail.
  const palettes: string[][] = [
    ["#7AA2FF", "#A78BFA"],
    ["#5468FF", "#2D3340"],
    ["#67E8F9", "#7AA2FF"],
    ["#F472B6", "#7AA2FF"],
    ["#A78BFA", "#67E8F9"],
    ["#1F2937", "#5468FF"],
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const [a, b] = palettes[hash % palettes.length]!;
  return `linear-gradient(135deg, ${a}, ${b})`;
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  if (!Number.isFinite(d)) return "—";
  const diffSec = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (diffSec < 60) return "Just now";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const week = Math.floor(day / 7);
  if (week < 4) return `${week}w ago`;
  return new Date(iso).toLocaleDateString();
}

export async function loader({ request }: Route.LoaderArgs) {
  const { user, headers } = await requireUserOrRedirect(request);
  const { credits, planTier } = await loadCreditsForUI(user.id);
  try {
    const summaries = await listProjectsForUser(user.id);
    console.log(
      `[projects loader] user=${user.id} (${user.email}) → ${summaries.length} project(s)`,
    );
    return data(
      {
        authed: true,
        projects: summaries.map(toCard),
        credits,
        planTier,
        debug: {
          userId: user.id,
          email: user.email,
          queryCount: summaries.length,
          error: null,
        },
      } satisfies LoaderData,
      { headers },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[projects loader] listProjectsForUser failed for ${user.id}:`, message);
    return data(
      {
        authed: true,
        projects: [],
        credits,
        planTier,
        debug: {
          userId: user.id,
          email: user.email,
          queryCount: 0,
          error: message,
        },
      } satisfies LoaderData,
      { headers },
    );
  }
}

export default function ProjectsRoute() {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const { authed, projects, credits, debug } = useLoaderData() as LoaderData;
  return (
    <ProjectsScreen
      authed={authed}
      projects={projects}
      credits={credits}
      debug={debug}
      onNav={(k) => navigate(navPath[k])}
      onOpenProject={(id, target) => {
        const route = target === "export" ? `/export?job=${id}` : `/editor?job=${id}`;
        navigate(route);
      }}
      onNewProject={() => navigate("/editor?empty=1")}
      onDeleteProject={async (id) => {
        const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
        if (!res.ok) {
          let message = `Delete failed (${res.status})`;
          try {
            const body = (await res.json()) as { error?: string };
            if (body.error) message = body.error;
          } catch {}
          throw new Error(message);
        }
        revalidator.revalidate();
      }}
      onSignIn={() => navigate("/signin")}
    />
  );
}
