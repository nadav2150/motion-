// Container entry (Dockerfile CMD): the web server + the Studio task worker.
// Bundled to build/worker/supervisor.mjs by `npm run build`. Policy and signal
// handling: app/lib/studio/supervisor.ts.
//
//   node build/worker/supervisor.mjs      (from /app, after `npm run build`)

import * as path from "node:path";
import { runSupervisor, WEB_POLICY, WORKER_POLICY } from "../app/lib/studio/supervisor";

const root = process.cwd();
const node = process.execPath;

runSupervisor([
  {
    name: "web",
    command: node,
    args: [path.join(root, "node_modules/@react-router/serve/bin.js"), path.join(root, "build/server/index.js")],
    policy: WEB_POLICY,
  },
  {
    name: "worker",
    command: node,
    args: [path.join(root, "build/worker/studio-worker.mjs")],
    policy: WORKER_POLICY,
  },
]);
