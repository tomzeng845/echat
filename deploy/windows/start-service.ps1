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

foreach ($name in @("MONGODB_URI", "MONGODB_DATABASE", "MONGODB_DIRECT_CONNECTION", "JWT_SECRET", "ADMIN_BOOTSTRAP_PASSWORD", "ADMIN_SECRET_ENCRYPTION_KEY", "ADMIN_TOTP_SECRET", "SEED_INVITE_CODE", "CORS_ALLOWED_ORIGINS", "TURN_URLS", "TURN_SECRET", "SFU_URL", "FCM_PROJECT_ID", "FCM_SERVICE_ACCOUNT_JSON")) {
    $value = (Get-Item "Env:$name" -ErrorAction SilentlyContinue).Value
    if ($null -ne $value) { [Environment]::SetEnvironmentVariable($name, $value, "Machine") }
}

Start-Service -Name $ServiceName
Get-Service -Name $ServiceName
Write-Host "Started $ServiceName. Check http://127.0.0.1:2099/api/health and Windows Event Viewer if needed."
