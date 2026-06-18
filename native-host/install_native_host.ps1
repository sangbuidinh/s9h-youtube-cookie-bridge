[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[a-p]{32}$")]
    [string] $ExtensionId,

    [Parameter(Mandatory = $true)]
    [string] $HostExePath,

    [string] $ManifestOutputDir,

    [switch] $RegisterBrave
)

$ErrorActionPreference = "Stop"

$HostName = "com.s9h.youtube_downloader.cookies"
$ScriptDir = Split-Path -Parent $PSCommandPath
$ScriptDir = (Resolve-Path -LiteralPath $ScriptDir).Path

function Resolve-BridgePath {
    param(
        [Parameter(Mandatory = $true)]
        [string] $InputPath
    )

    if ([System.IO.Path]::IsPathRooted($InputPath)) {
        return [System.IO.Path]::GetFullPath($InputPath)
    }

    if (Test-Path -LiteralPath $InputPath) {
        return (Resolve-Path -LiteralPath $InputPath).Path
    }

    $RelativeToScript = Join-Path $ScriptDir $InputPath
    return [System.IO.Path]::GetFullPath($RelativeToScript)
}

function Resolve-OutputDir {
    param(
        [string] $InputPath
    )

    if ([string]::IsNullOrWhiteSpace($InputPath)) {
        return Join-Path $ScriptDir "generated"
    }

    if ([System.IO.Path]::IsPathRooted($InputPath)) {
        return [System.IO.Path]::GetFullPath($InputPath)
    }

    return [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $InputPath))
}

function Register-NativeHost {
    param(
        [Parameter(Mandatory = $true)]
        [string] $RegistryPath,

        [Parameter(Mandatory = $true)]
        [string] $PathToManifest
    )

    New-Item -Path $RegistryPath -Force | Out-Null
    Set-Item -Path $RegistryPath -Value $PathToManifest
}

$ResolvedHostPath = Resolve-BridgePath -InputPath $HostExePath
if (-not (Test-Path -LiteralPath $ResolvedHostPath -PathType Leaf)) {
    throw "Native host exe not found: $ResolvedHostPath"
}
if ([System.IO.Path]::GetExtension($ResolvedHostPath).ToLowerInvariant() -ne ".exe") {
    throw "HostExePath must point to cookie_bridge_host.exe."
}
if ([System.IO.Path]::GetFileName($ResolvedHostPath).ToLowerInvariant() -ne "cookie_bridge_host.exe") {
    throw "HostExePath must point to cookie_bridge_host.exe."
}

$ResolvedManifestOutputDir = Resolve-OutputDir -InputPath $ManifestOutputDir
New-Item -ItemType Directory -Force -Path $ResolvedManifestOutputDir | Out-Null

$ManifestPath = Join-Path $ResolvedManifestOutputDir "$HostName.json"
$Manifest = [ordered]@{
    name = $HostName
    description = "S9H YouTube Cookie Bridge Native Host"
    path = $ResolvedHostPath
    type = "stdio"
    allowed_origins = @("chrome-extension://$ExtensionId/")
}

$ManifestJson = $Manifest | ConvertTo-Json -Depth 5
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($ManifestPath, $ManifestJson, $Utf8NoBom)
$ResolvedManifestPath = (Resolve-Path -LiteralPath $ManifestPath).Path

$BrowserRegistryPaths = [ordered]@{
    Chrome = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
    Edge = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
}

if ($RegisterBrave) {
    $BrowserRegistryPaths["Brave"] = "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\$HostName"
}

Write-Host "[OK] Manifest path: $ResolvedManifestPath"
Write-Host "[OK] Host path: $ResolvedHostPath"
Write-Host "[OK] Extension ID: $ExtensionId"

foreach ($Entry in $BrowserRegistryPaths.GetEnumerator()) {
    Register-NativeHost -RegistryPath $Entry.Value -PathToManifest $ResolvedManifestPath
    Write-Host "[OK] Registered $($Entry.Key) native host: $($Entry.Value)"
}
