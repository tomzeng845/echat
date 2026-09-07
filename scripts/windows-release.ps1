[CmdletBinding()]
param(
    [string]$Configuration = "Release",
    [string]$Runtime = "win-x64",
    [string]$Version = "0.9.0"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root "releases\windows-x64"
$zip = Join-Path $root "releases\EChat-$Version-windows-x64.zip"

Write-Host "[1/5] Checking build tools..."
$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $pnpm) { throw "pnpm was not found. Install Node.js 22 LTS and pnpm first." }
if (-not $dotnet) { throw ".NET 8 SDK was not found. Install the .NET 8 SDK first." }

Write-Host "[2/5] Building the React web client..."
Push-Location $root
try {
    & pnpm exec vite build
    if ($LASTEXITCODE -ne 0) { throw "Vite build failed with exit code $LASTEXITCODE." }

    if (Test-Path $out) { Remove-Item $out -Recurse -Force }
    New-Item -ItemType Directory -Path $out -Force | Out-Null

    Write-Host "[3/5] Publishing ASP.NET Core for $Runtime..."
    & dotnet publish (Join-Path $root "Api\EChat.Api.csproj") `
        -c $Configuration `
        -r $Runtime `
        --self-contained true `
        -p:PublishSingleFile=true `
        -p:IncludeNativeLibrariesForSelfExtract=true `
        -p:DebugType=None `
        -o $out
    if ($LASTEXITCODE -ne 0) { throw ".NET publish failed with exit code $LASTEXITCODE." }

    Write-Host "[4/5] Copying Windows deployment documents..."
    Copy-Item (Join-Path $root "WINDOWS-DEPLOYMENT.md") (Join-Path $out "WINDOWS-DEPLOYMENT.md") -Force
    Copy-Item (Join-Path $root "deploy\windows\install-service.ps1") (Join-Path $out "install-service.ps1") -Force
    Copy-Item (Join-Path $root "deploy\windows\start-service.ps1") (Join-Path $out "start-service.ps1") -Force
    Copy-Item (Join-Path $root "deploy\windows\uninstall-service.ps1") (Join-Path $out "uninstall-service.ps1") -Force
    Copy-Item (Join-Path $root "deploy\windows\set-production-env.ps1.example") (Join-Path $out "set-production-env.ps1.example") -Force
    New-Item -ItemType Directory -Path (Join-Path $out "security") -Force | Out-Null
    Copy-Item (Join-Path $root "deploy\windows\setup-admin-totp.ps1") (Join-Path $out "security\setup-admin-totp.ps1") -Force
    New-Item -ItemType Directory -Path (Join-Path $out "mongodb") -Force | Out-Null
    Copy-Item (Join-Path $root "deploy\mongodb\create-default-admin.js") (Join-Path $out "mongodb\create-default-admin.js") -Force
    Copy-Item (Join-Path $root "deploy\mongodb\create-default-admin.ps1") (Join-Path $out "mongodb\create-default-admin.ps1") -Force

    $manifest = @"
EChat Windows release
Version: $Version
Runtime: $Runtime
Configuration: $Configuration
Self-contained: true
Single-file: true
Default HTTP port: 2099
MongoDB database: echat
Generated UTC: $([DateTime]::UtcNow.ToString("o"))

The release does not include secrets. Set MONGODB_URI, JWT_SECRET, ADMIN_BOOTSTRAP_PASSWORD,
ADMIN_SECRET_ENCRYPTION_KEY and SEED_INVITE_CODE before starting the service.
"@
    Set-Content -Path (Join-Path $out "RELEASE-MANIFEST.txt") -Value $manifest -Encoding UTF8

    Write-Host "[5/5] Creating ZIP and SHA-256 checksum..."
    if (Test-Path $zip) { Remove-Item $zip -Force }
    Compress-Archive -Path (Join-Path $out "*") -DestinationPath $zip -CompressionLevel Optimal
    $hash = (Get-FileHash -Path $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    Set-Content -Path "$zip.sha256" -Value "$hash  $(Split-Path $zip -Leaf)" -Encoding ASCII

    Write-Host "WINDOWS_RELEASE_OK"
    Write-Host "Package: $zip"
    Write-Host "SHA-256: $hash"
}
finally {
    Pop-Location
}
