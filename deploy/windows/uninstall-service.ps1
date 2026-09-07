[CmdletBinding()]
param(
    [string]$InstallPath = "C:\Program Files\EChat",
    [string]$ServiceName = "EChat",
    [switch]$RemoveFiles
)

$ErrorActionPreference = "Stop"
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service) {
    if ($service.Status -ne "Stopped") { Stop-Service -Name $ServiceName -Force }
    sc.exe delete $ServiceName | Out-Null
    Write-Host "Removed service $ServiceName."
}

if ($RemoveFiles -and (Test-Path $InstallPath)) {
    Remove-Item $InstallPath -Recurse -Force
    Write-Host "Removed $InstallPath."
}
