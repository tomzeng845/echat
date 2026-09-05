import fs from "node:fs";

const file = new URL("../package.json", import.meta.url);
const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
pkg.name = "e-chat";
pkg.description = "E聊：React HTML5 + ASP.NET Core SignalR + MongoDB 即时通信 MVP";
pkg.scripts = {
  ...pkg.scripts,
  dev: "node scripts/dev.mjs",
  build: "vite build && dotnet publish Api/EChat.Api.csproj -c Release -o dist/dotnet",
  start: "dotnet dist/dotnet/EChat.Api.dll",
  check: "tsc --noEmit && dotnet build Api/EChat.Api.csproj --no-restore",
  test: "vitest run --passWithNoTests && dotnet test Api.Tests/EChat.Api.Tests.csproj",
};
fs.writeFileSync(file, JSON.stringify(pkg, null, 2) + "\n");
