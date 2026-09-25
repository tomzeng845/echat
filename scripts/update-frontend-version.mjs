import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

const publicDir = resolve(process.cwd(), "client/public");
const version = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const payload = JSON.stringify({ version, generatedAtUtc: new Date().toISOString() }, null, 2) + "\n";

await mkdir(publicDir, { recursive: true });
await writeFile(resolve(publicDir, "echat-version.json"), payload, "utf8");
console.log(`[frontend-version] ${version}`);
