[CmdletBinding()]
param(
    [string]$InstallPath = "C:\Program Files\EChat",
    [string]$ServiceName = "EChat"
)

$ErrorActionPreference = "Stop"
$envFile = Join-Path $InstallPath "echat.env.ps1"
if (-not (Test-Path $envFile)) {
    throw "Missing $envFile. Copy set-production-env.ps1.example, edit secrets, and save it as echat.env.ps1."
}

# Windows services inherit machine/user environment values when they start.
# The environment file is also validated here so configuration mistakes fail early.
. $envFile
foreach ($name in @("MONGODB_URI", "JWT_SECRET", "ADMIN_BOOTSTRAP_PASSWORD", "ADMIN_SECRET_ENCRYPTION_KEY", "ADMIN_TOTP_SECRET", "SEED_INVITE_CODE")) {
    if ([string]::IsNullOrWhiteSpace((Get-Item "Env:$name" -ErrorAction SilentlyContinue).Value) -or (Get-Item "Env:$name").Value.StartsWith("replace-")) {
        throw "Production variable $name is missing or still uses a placeholder."
    }
}

foreach ($name in @("MONGODB_URI", "MONGODB_DATABASE", "MONGODB_DIRECT_CONNECTION", "JWT_SECRET", "ADMIN_BOOTSTRAP_PASSWORD", "ADMIN_SECRET_ENCRYPTION_KEY", "ADMIN_TOTP_SECRET", "SEED_INVITE_CODE", "CORS_ALLOWED_ORIGINS", "ECHAT_HTTPS_CERT_PATH", "ECHAT_HTTPS_CERT_PASSWORD", "ECHAT_HTTPS_PORT", "TURN_URLS", "TURN_SECRET", "SFU_URL", "FCM_PROJECT_ID", "FCM_SERVICE_ACCOUNT_JSON")) {
    $value = (Get-Item "Env:$name" -ErrorAction SilentlyContinue).Value
    if ($null -ne $value) { [Environment]::SetEnvironmentVariable($name, $value, "Machine") }
}

if (-not [string]::IsNullOrWhiteSpace($env:ECHAT_HTTPS_CERT_PATH)) {
    if (-not (Test-Path $env:ECHAT_HTTPS_CERT_PATH -PathType Leaf)) {
        throw "HTTPS certificate file not found: $env:ECHAT_HTTPS_CERT_PATH"
    }
    $effectiveHttpsPort = if ([string]::IsNullOrWhiteSpace($env:ECHAT_HTTPS_PORT)) { "2099" } else { $env:ECHAT_HTTPS_PORT }
    Write-Host "HTTPS certificate: $env:ECHAT_HTTPS_CERT_PATH"
    Write-Host "HTTPS port: $effectiveHttpsPort"
}

$service = Get-Service -Name $ServiceName
if ($service.Status -ne "Stopped") {
    Stop-Service -Name $ServiceName -Force
    $service.WaitForStatus("Stopped", [TimeSpan]::FromSeconds(30))
}
Start-Service -Name $ServiceName
Get-Service -Name $ServiceName
if ([string]::IsNullOrWhiteSpace($env:ECHAT_HTTPS_CERT_PATH)) {
    Write-Host "Started $ServiceName in HTTP mode. Check http://127.0.0.1:2099/api/health and Windows Event Viewer if needed."
} else {
    Write-Host "Started $ServiceName in HTTPS mode. Check https://127.0.0.1:$effectiveHttpsPort/api/health and Windows Event Viewer if needed."
}
