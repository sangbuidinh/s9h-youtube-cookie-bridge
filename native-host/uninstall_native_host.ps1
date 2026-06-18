[CmdletBinding()]
param(
    [switch] $RemoveGenerated
)

$ErrorActionPreference = "Stop"

$HostName = "com.s9h.youtube_downloader.cookies"
$ScriptDir = Split-Path -Parent $PSCommandPath
$ScriptDir = (Resolve-Path -LiteralPath $ScriptDir).Path
$GeneratedDir = Join-Path $ScriptDir "generated"

$RegistryPaths = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName",
    "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$HostName"
)

foreach ($RegistryPath in $RegistryPaths) {
    if (Test-Path -LiteralPath $RegistryPath) {
        Remove-Item -LiteralPath $RegistryPath -Recurse -Force
        Write-Host "[OK] Removed native messaging host registry key: $RegistryPath"
    } else {
        Write-Host "[OK] Registry key not present: $RegistryPath"
    }
}

if ($RemoveGenerated) {
    if (Test-Path -LiteralPath $GeneratedDir) {
        Remove-Item -LiteralPath $GeneratedDir -Recurse -Force
        Write-Host "[OK] Removed generated native host files: $GeneratedDir"
    } else {
        Write-Host "[OK] Generated native host folder not present: $GeneratedDir"
    }
}
