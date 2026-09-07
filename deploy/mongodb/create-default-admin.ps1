[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$MongoUri = $env:MONGODB_URI,
    [string]$ScriptPath = (Join-Path $PSScriptRoot "create-default-admin.js")
)

$ErrorActionPreference = "Stop"
if ([string]::IsNullOrWhiteSpace($MongoUri)) {
    throw "请先设置 MONGODB_URI，或使用 -MongoUri 传入 MongoDB 连接串。"
}
if (-not (Get-Command mongosh -ErrorAction SilentlyContinue)) {
    throw "未找到 mongosh。请安装 MongoDB Shell，并将 mongosh.exe 加入 PATH。"
}

Write-Host "正在创建或更新 E聊管理员账号 e-admin..."
& mongosh $MongoUri --file $ScriptPath
if ($LASTEXITCODE -ne 0) {
    throw "mongosh 执行失败，退出码：$LASTEXITCODE"
}
Write-Host "完成。请登录后立即修改密码，并配置 TOTP。"
