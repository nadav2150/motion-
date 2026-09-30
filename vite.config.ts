import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

// HMR goes through the Cloudflare tunnel (dev.videly.io) only when the tunnel
// is actually running: `npm run dev` starts it alongside `dev:app`. Every
// other way of starting the dev server (`npm run dev:local`, `npx react-router
// dev`) uses plain local HMR — pointing the client at a tunnel that is down
// makes it fail the websocket, decide the server restarted, and reload the
// page in a loop.
const viaTunnel = process.env.npm_lifecycle_event === "dev:app" || process.env.VIDELY_DEV_TUNNEL === "1";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    allowedHosts: ["dev.videly.io"],
    hmr: viaTunnel
      ? {
          protocol: "wss",
          host: "dev.videly.io",
          clientPort: 443,
        }
      : true,
  },
  optimizeDeps: {
    include: ["@iconify/react"],
  },
  ssr: {
    noExternal: ["@iconify/react"],
  },
});
