[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $PSCommandPath
$ScriptDir = (Resolve-Path -LiteralPath $ScriptDir).Path
$RepoRoot = (Resolve-Path -LiteralPath (Join-Path $ScriptDir "..")).Path
$SourceScriptPath = Join-Path $ScriptDir "cookie_bridge_host.py"
$DistDir = Join-Path $ScriptDir "dist"
$BuildDir = Join-Path $ScriptDir "build"
$SpecDir = Join-Path $ScriptDir "generated"
$ExpectedExe = Join-Path $DistDir "cookie_bridge_host.exe"

if (-not (Test-Path -LiteralPath $SourceScriptPath -PathType Leaf)) {
    throw "Native host script not found: $SourceScriptPath"
}

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    Write-Host "Python launcher 'py' is not available."
    Write-Host "Install Python, then install PyInstaller with:"
    Write-Host "py -m pip install pyinstaller"
    exit 1
}

$null = & py -m PyInstaller --version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "PyInstaller is not available."
    Write-Host "Install it with:"
    Write-Host "py -m pip install pyinstaller"
    exit 1
}

New-Item -ItemType Directory -Force -Path $DistDir, $BuildDir, $SpecDir | Out-Null

Push-Location $RepoRoot
try {
    & py -m PyInstaller `
        --noconfirm `
        --clean `
        --onefile `
        --name cookie_bridge_host `
        --distpath $DistDir `
        --workpath $BuildDir `
        --specpath $SpecDir `
        $SourceScriptPath

    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller build failed."
    }
} finally {
    Pop-Location
}

if (-not (Test-Path -LiteralPath $ExpectedExe -PathType Leaf)) {
    throw "Expected native host exe was not created: $ExpectedExe"
}

Write-Host "Native host exe built:"
Write-Host $ExpectedExe
