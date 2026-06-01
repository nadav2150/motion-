import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import { getUserFromRequest } from "./lib/auth";
import { getImpersonation } from "./lib/impersonation";
import { SITE_NAME, SITE_URL } from "./lib/seo";
import { bootstrapPostHog } from "./lib/posthog-client";
import {
  usePostHogIdentify,
  usePostHogPageviews,
} from "./lib/use-posthog-pageviews";
import "./app.css";

// Module-load init is safe: bootstrapPostHog() short-circuits when window is
// undefined, so SSR is unaffected. On the client it runs once when the bundle
// first executes, before any component mounts and fires its first $pageview.
bootstrapPostHog();

// Organization schema lives at the document root so every page emits it. Wire
// social profiles into `sameAs` (Twitter/LinkedIn/etc.) as they go live —
// Google uses them to associate the brand with its public identities.
const ORGANIZATION_JSONLD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/logo.svg`,
  sameAs: [],
});

export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  const impersonating = getImpersonation(request);
  return { user, impersonating };
}

export const links: Route.LinksFunction = () => [
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&family=Inter:wght@400;500;600;700;800;900&display=swap",
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#06070A" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <Meta />
        <Links />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: ORGANIZATION_JSONLD }}
        />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function ImpersonationBanner({ email }: { email: string }) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 2147483647,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: "8px 16px",
        background: "#7AA2FF",
        color: "#06070A",
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 1px 0 rgba(0,0,0,0.2)",
      }}
    >
      <span>
        Impersonating <strong>{email || "user"}</strong>
      </span>
      <form method="post" action="/impersonate/stop" style={{ margin: 0 }}>
        <button
          type="submit"
          style={{
            background: "#06070A",
            color: "#E6E8EC",
            border: "none",
            borderRadius: 6,
            padding: "4px 12px",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Return to admin
        </button>
      </form>
    </div>
  );
}

export default function App() {
  const { user, impersonating } = useLoaderData<typeof loader>();
  usePostHogPageviews();
  usePostHogIdentify(user);
  return (
    <>
      {impersonating && <ImpersonationBanner email={impersonating.email} />}
      <Outlet />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main style={{ padding: "64px 24px", maxWidth: 720, margin: "0 auto", color: "var(--ink-0)" }}>
      <h1 style={{ fontSize: 48, fontWeight: 500, letterSpacing: "-0.03em" }}>{message}</h1>
      <p style={{ color: "var(--ink-2)" }}>{details}</p>
      {stack && (
        <pre style={{ width: "100%", padding: 16, overflowX: "auto", background: "rgba(255,255,255,0.04)", borderRadius: 8 }}>
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
