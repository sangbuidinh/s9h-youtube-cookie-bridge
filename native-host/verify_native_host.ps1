[CmdletBinding()]
param(
    [string] $HostName = "com.s9h.youtube_downloader.cookies"
)

$ErrorActionPreference = "Stop"
$FailureCount = 0
$ScriptDir = Split-Path -Parent $PSCommandPath
$ScriptDir = (Resolve-Path -LiteralPath $ScriptDir).Path
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $ScriptDir "..")).Path
$ExpectedHostExe = [System.IO.Path]::GetFullPath((Join-Path $RepoRoot "native-host\dist\cookie_bridge_host.exe"))
$RuntimeDir = Join-Path $RepoRoot "data\runtime"
$RuntimeGitkeep = Join-Path $RuntimeDir ".gitkeep"
$RuntimeCookieFile = Join-Path $RuntimeDir "youtube_cookies.txt"

function Pass {
    param([string] $Message)
    Write-Host "[PASS] $Message"
}

function Fail {
    param([string] $Message)
    $script:FailureCount += 1
    Write-Host "[FAIL] $Message"
}

function Info {
    param([string] $Message)
    Write-Host "[INFO] $Message"
}

function Test-ExtensionId {
    param([string] $Origin)
    return $Origin -match '^chrome-extension://[a-p]{32}/$'
}

function Test-RegistryTarget {
    param(
        [string] $BrowserName,
        [string] $RegistryPath
    )

    if (-not (Test-Path -LiteralPath $RegistryPath)) {
        Fail "$BrowserName registry key missing: $RegistryPath"
        return
    }
    Pass "$BrowserName registry key exists"

    $RegistryKey = Get-Item -LiteralPath $RegistryPath
    $ManifestPath = [string] $RegistryKey.GetValue("")
    if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
        Fail "$BrowserName registry default value is empty"
        return
    }
    Pass "$BrowserName manifest path registered: $ManifestPath"

    if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
        Fail "$BrowserName manifest file does not exist"
        return
    }
    Pass "$BrowserName manifest file exists"

    try {
        $Manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
    } catch {
        Fail "$BrowserName manifest JSON is invalid"
        return
    }
    Pass "$BrowserName manifest JSON is valid"

    if ($Manifest.name -ne $HostName) {
        Fail "$BrowserName manifest name mismatch: $($Manifest.name)"
    } else {
        Pass "$BrowserName manifest name matches $HostName"
    }

    $ManifestHostPath = [string] $Manifest.path
    if ([string]::IsNullOrWhiteSpace($ManifestHostPath)) {
        Fail "$BrowserName manifest path is empty"
        return
    }

    $ResolvedManifestHostPath = [System.IO.Path]::GetFullPath($ManifestHostPath)
    if ($ResolvedManifestHostPath -ne $ExpectedHostExe) {
        Fail "$BrowserName manifest path is not release EXE: $ResolvedManifestHostPath"
    } else {
        Pass "$BrowserName manifest path points to release EXE"
    }

    if ($ManifestHostPath -match 'py -3|native_host\.py|cookie_bridge_host\.py|run_cookie_bridge_host\.cmd|\.cmd$') {
        Fail "$BrowserName manifest path references script or cmd wrapper"
    } else {
        Pass "$BrowserName manifest path does not reference script mode"
    }

    if (-not (Test-Path -LiteralPath $ManifestHostPath -PathType Leaf)) {
        Fail "$BrowserName manifest host path does not exist"
    } else {
        Pass "$BrowserName manifest host path exists"
    }

    $Origins = @($Manifest.allowed_origins)
    if ($Origins.Count -lt 1) {
        Fail "$BrowserName allowed_origins is empty"
    } elseif ($Origins | Where-Object { Test-ExtensionId $_ }) {
        Pass "$BrowserName allowed_origins contains valid Chrome extension origin"
    } else {
        Fail "$BrowserName allowed_origins does not contain a valid extension origin"
    }
}

Write-Host "S9H YouTube Cookie Bridge - Native Host Verification"
Write-Host "Expected host exe: $ExpectedHostExe"
Write-Host ""

if (Test-Path -LiteralPath $ExpectedHostExe -PathType Leaf) {
    Pass "Release native host EXE exists"
} else {
    Fail "Release native host EXE missing"
}

$Targets = [ordered]@{
    Chrome = "HKCU:\Software\Google\Chrome\NativeMessagingHosts\$HostName"
    Edge = "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\$HostName"
}

foreach ($Target in $Targets.GetEnumerator()) {
    Test-RegistryTarget -BrowserName $Target.Key -RegistryPath $Target.Value
}

if (Test-Path -LiteralPath $RuntimeDir -PathType Container) {
    Pass "data\runtime exists"
} else {
    Fail "data\runtime missing"
}

if (Test-Path -LiteralPath $RuntimeGitkeep -PathType Leaf) {
    Pass "data\runtime\.gitkeep exists"
} else {
    Fail "data\runtime\.gitkeep missing"
}

if (Test-Path -LiteralPath $RuntimeCookieFile -PathType Leaf) {
    $CookieItem = Get-Item -LiteralPath $RuntimeCookieFile
    Info ("youtube_cookies.txt exists | size={0} | mtime={1:O}" -f $CookieItem.Length, $CookieItem.LastWriteTimeUtc)
} else {
    Info "youtube_cookies.txt not present; export is not required for install verification"
}

Write-Host ""
if ($FailureCount -eq 0) {
    Write-Host "PASS: Native host release install looks valid."
    exit 0
}

Write-Host "FAIL: $FailureCount verification check(s) failed."
exit 1
