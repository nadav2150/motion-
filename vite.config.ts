import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    allowedHosts: ["dev.videly.io"],
    hmr: {
      protocol: "wss",
      host: "dev.videly.io",
      clientPort: 443,
    },
  },
  optimizeDeps: {
    include: ["@iconify/react"],
  },
  ssr: {
    noExternal: ["@iconify/react"],
  },
});
