import { chmodSync } from "node:fs";
import { join } from "node:path";

chmodSync(join(process.cwd(), "dist/index.js"), 0o755);
