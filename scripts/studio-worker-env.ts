// Loaded first by scripts/studio-worker.ts so .env is in process.env before
// any module reads it at import time. In the container there is no .env file
// (the Worker passes secrets as env vars), so this is a no-op there.
import { config } from "dotenv";

config({ quiet: true });
