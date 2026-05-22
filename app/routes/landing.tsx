import { data, useLoaderData, useNavigate } from "react-router";
import type { Route } from "./+types/landing";
import { LandingScreen } from "../motionflow/screens/landing";
import { getUserFromRequest } from "../lib/auth";

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Videly AI — Cinematic launch videos" },
    { name: "description", content: "Transform screenshots, launches, and product updates into cinematic motion stories." },
  ];
}

type LoaderData = { isAuthed: boolean };

// Soft auth check — we never redirect from the landing page, just adapt
// the CTAs so a signed-in visitor sees "Open the app" instead of
// "Start free / Sign in".
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  return data({ isAuthed: user !== null } satisfies LoaderData);
}

export default function LandingRoute() {
  const navigate = useNavigate();
  const { isAuthed } = useLoaderData() as LoaderData;
  return (
    <LandingScreen
      isAuthed={isAuthed}
      onCta={() => navigate(isAuthed ? "/home" : "/register")}
      onSignIn={() => navigate("/signin")}
    />
  );
}
