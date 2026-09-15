import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const core = path.join(root, "node_modules/@ffmpeg/core/dist/umd");
const worker = path.join(root, "node_modules/@ffmpeg/ffmpeg/dist/esm");
const destination = path.join(root, "client/public");

await rm(path.join(destination, "ffmpeg-core"), { recursive: true, force: true });
await rm(path.join(destination, "ffmpeg-worker"), { recursive: true, force: true });
await mkdir(path.join(destination, "ffmpeg-core"), { recursive: true });
await mkdir(path.join(destination, "ffmpeg-worker"), { recursive: true });

await cp(path.join(core, "ffmpeg-core.js"), path.join(destination, "ffmpeg-core/ffmpeg-core.js"));
await cp(path.join(core, "ffmpeg-core.wasm"), path.join(destination, "ffmpeg-core/ffmpeg-core.wasm"));
for (const file of ["worker.js", "const.js", "errors.js", "utils.js"]) {
  await cp(path.join(worker, file), path.join(destination, `ffmpeg-worker/${file}`));
}
console.log("Copied same-origin FFmpeg WASM assets to client/public");
