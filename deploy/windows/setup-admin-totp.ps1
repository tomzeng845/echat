[CmdletBinding()]
param(
    [string]$EnvFile = "C:\Program Files\EChat\echat.env.ps1",
    [string]$Account = "e-admin",
    [string]$Issuer = "EChat"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $EnvFile)) {
    throw "环境文件不存在：$EnvFile"
}

$alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
$bytes = New-Object byte[] 20
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
try { $random.GetBytes($bytes) } finally { $random.Dispose() }
$secretBuilder = New-Object System.Text.StringBuilder
$buffer = 0
$bits = 0
foreach ($byte in $bytes) {
    $buffer = ($buffer -shl 8) -bor $byte
    $bits += 8
    while ($bits -ge 5) {
        $bits -= 5
        [void]$secretBuilder.Append($alphabet[($buffer -shr $bits) -band 31])
        if ($bits -eq 0) { $buffer = 0 } else { $buffer = $buffer -band ((1 -shl $bits) - 1) }
    }
}
if ($bits -gt 0) { [void]$secretBuilder.Append($alphabet[($buffer -shl (5 - $bits)) -band 31]) }
$secret = $secretBuilder.ToString()
$encodedAccount = [Uri]::EscapeDataString($Account)
$encodedIssuer = [Uri]::EscapeDataString($Issuer)
$uri = "otpauth://totp/$encodedIssuer`:$encodedAccount?secret=$secret&issuer=$encodedIssuer&digits=6&period=30"

$content = Get-Content $EnvFile -Raw
if ($content -match '(?m)^\$env:ADMIN_TOTP_SECRET\s*=') {
    $content = [Regex]::Replace($content, '(?m)^\$env:ADMIN_TOTP_SECRET\s*=.*$', ('$env:ADMIN_TOTP_SECRET = "' + $secret + '"'))
} else {
    $content += "`r`n`$env:ADMIN_TOTP_SECRET = `"$secret`"`r`n"
}
Set-Content -Path $EnvFile -Value $content -Encoding UTF8

Write-Host "ADMIN_TOTP_SECRET 已写入：$EnvFile"
Write-Host "请将以下密钥添加到 Google Authenticator 或 Microsoft Authenticator："
Write-Host "Secret: $secret"
Write-Host "URI:    $uri"
Write-Host "完成后执行 Restart-Service EChat，然后使用验证器生成 6 位验证码登录。"
