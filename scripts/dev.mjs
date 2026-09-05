import { spawn, spawnSync } from "node:child_process";

const build = spawnSync("pnpm", ["exec", "vite", "build"], { stdio: "inherit", shell: process.platform === "win32" });
if (build.status !== 0) process.exit(build.status ?? 1);

const child = spawn("dotnet", ["run", "--project", "Api/EChat.Api.csproj", "--no-launch-profile"], {
  stdio: "inherit",
  env: { ...process.env, ASPNETCORE_ENVIRONMENT: "Development", PORT: process.env.ECHAT_PORT || "2099" },
  shell: process.platform === "win32",
});

for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 0));
