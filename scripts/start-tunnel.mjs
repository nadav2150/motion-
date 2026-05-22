import "dotenv/config";
import { spawn } from "node:child_process";

const token = process.env.CLOUDFLARED_TUNNEL_TOKEN;
if (!token) {
  console.error("[tunnel] CLOUDFLARED_TUNNEL_TOKEN is not set in .env");
  process.exit(1);
}

const args = ["tunnel", "--no-autoupdate", "run", "--token", token];
const child = spawn("cloudflared", args, { stdio: "inherit", shell: process.platform === "win32" });

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  if (err && err.code === "ENOENT") {
    console.error("[tunnel] cloudflared not found on PATH. Install from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/");
  } else {
    console.error("[tunnel] failed to start:", err);
  }
  process.exit(1);
});

const shutdown = () => child.kill("SIGINT");
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
