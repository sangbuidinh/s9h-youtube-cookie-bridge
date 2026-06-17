[CmdletBinding(DefaultParameterSetName = "Script")]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[a-p]{32}$")]
    [string] $ExtensionId,

    [Parameter(Mandatory = $true, ParameterSetName = "Exe")]
    [string] $HostExePath,

    [Parameter(Mandatory = $true, ParameterSetName = "Script")]
    [string] $HostScriptPath,

    [string] $ManifestOutputDir
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

$ResolvedManifestOutputDir = Resolve-OutputDir -InputPath $ManifestOutputDir
New-Item -ItemType Directory -Force -Path $ResolvedManifestOutputDir | Out-Null

if ($PSCmdlet.ParameterSetName -eq "Script") {
    $ResolvedHostScriptPath = Resolve-BridgePath -InputPath $HostScriptPath
    if (-not (Test-Path -LiteralPath $ResolvedHostScriptPath -PathType Leaf)) {
        throw "Native host script not found: $ResolvedHostScriptPath"
    }

    $WrapperPath = Join-Path $ResolvedManifestOutputDir "run_cookie_bridge_host.cmd"
    $WrapperContent = @(
        "@echo off",
        "py -3 ""$ResolvedHostScriptPath"""
    ) -join "`r`n"
    [System.IO.File]::WriteAllText($WrapperPath, $WrapperContent + "`r`n", [System.Text.Encoding]::ASCII)
    $ResolvedHostPath = (Resolve-Path -LiteralPath $WrapperPath).Path
} else {
    $ResolvedHostPath = Resolve-BridgePath -InputPath $HostExePath
    if (-not (Test-Path -LiteralPath $ResolvedHostPath -PathType Leaf)) {
        throw "Native host exe not found: $ResolvedHostPath"
    }
    if ([System.IO.Path]::GetExtension($ResolvedHostPath).ToLowerInvariant() -ne ".exe") {
        throw "HostExePath must point to cookie_bridge_host.exe."
    }
}

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

Write-Host "[OK] Manifest path: $ResolvedManifestPath"
Write-Host "[OK] Host path: $ResolvedHostPath"
Write-Host "[OK] Extension ID: $ExtensionId"

$BrowserRegistryPaths = [ordered]@{
    Chrome = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
    Edge = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
}

foreach ($Entry in $BrowserRegistryPaths.GetEnumerator()) {
    Register-NativeHost -RegistryPath $Entry.Value -PathToManifest $ResolvedManifestPath
    Write-Host "[OK] Registered $($Entry.Key) native host: $($Entry.Value)"
}
