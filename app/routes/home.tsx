import { data, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import { StudioHomeScreen } from "../motionflow/screens/studio-home";
import { loadAppContext, type AppContext } from "../motionflow/ui/session.server";
import type { VoiceOption } from "../motionflow/ui/api";
import { VOICE_CATALOG } from "../lib/elevenlabs-tts";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Home — Videly" }];
}

type LoaderData = AppContext & { voices: VoiceOption[] };

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx, headers } = await loadAppContext(request);
  const voices: VoiceOption[] = VOICE_CATALOG.map((v) => ({
    id: v.id,
    label: v.label,
    gender: v.gender,
    accent: v.accent,
    tone: v.tone,
    previewUrl: null,
  }));
  return data({ ...ctx, voices } satisfies LoaderData, { headers });
}

export default function HomeRoute() {
  const d = useLoaderData() as LoaderData;
  return <StudioHomeScreen user={d.user} planTier={d.planTier} credits={d.credits} voices={d.voices} />;
}
