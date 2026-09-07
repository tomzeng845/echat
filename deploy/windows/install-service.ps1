[CmdletBinding()]
param(
    [string]$InstallPath = "C:\Program Files\EChat",
    [string]$ServiceName = "EChat",
    [int]$Port = 2099
)

$ErrorActionPreference = "Stop"
$source = Split-Path -Parent $PSCommandPath
if (-not (Test-Path (Join-Path $source "EChat.Api.exe"))) {
    throw "EChat.Api.exe was not found in $source. Run this script from the extracted release directory."
}

New-Item -ItemType Directory -Path $InstallPath -Force | Out-Null
Copy-Item (Join-Path $source "*") $InstallPath -Recurse -Force

$envFile = Join-Path $InstallPath "echat.env.ps1"
if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $source "set-production-env.ps1.example") $envFile
    Write-Warning "Created $envFile from the example. Edit it with production secrets before starting the service."
}

$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
    if ($service.Status -ne "Stopped") { Stop-Service -Name $ServiceName -Force }
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 1
}

$binary = Join-Path $InstallPath "EChat.Api.exe"
New-Service -Name $ServiceName `
    -BinaryPathName "`"$binary`"" `
    -DisplayName "E聊即时通讯 API" `
    -Description "E聊即时通讯 ASP.NET Core API、WebSocket/SignalR 和网页前端" `
    -StartupType Automatic

# Give the service enough time to start after reboot and restart it after transient failures.
sc.exe config $ServiceName start= delayed-auto | Out-Null
sc.exe failure $ServiceName reset= 86400 actions= restart/5000/restart/15000/restart/60000 | Out-Null
sc.exe failureflag $ServiceName 1 | Out-Null

# Store the listening port as a machine-level environment variable for the service.
[Environment]::SetEnvironmentVariable("ECHAT_PORT", [string]$Port, "Machine")
Write-Host "Installed service $ServiceName at $InstallPath."
Write-Host "Next: edit $envFile as Administrator, then run start-service.ps1 or Start-Service $ServiceName."
