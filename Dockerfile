FROM node:22-bookworm-slim AS frontend
WORKDIR /src
COPY . .
RUN npm install -g corepack@latest && corepack pnpm install --frozen-lockfile && corepack pnpm exec vite build

FROM mcr.microsoft.com/dotnet/sdk:8.0-bookworm-slim AS api-builder
WORKDIR /src
COPY Api ./Api
COPY --from=frontend /src/Api/wwwroot ./Api/wwwroot
RUN dotnet publish Api/EChat.Api.csproj -c Release -o /out

FROM mcr.microsoft.com/dotnet/aspnet:8.0-bookworm-slim AS runtime
WORKDIR /app
COPY --from=api-builder /out .
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 2099
CMD ["dotnet", "EChat.Api.dll"]
