param([switch]$SkipInstall)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    $dotnetCommand = (Get-Command dotnet -ErrorAction SilentlyContinue).Source
    $localDotnet = Join-Path $env:LOCALAPPDATA 'RelayDevTools\dotnet\dotnet.exe'
    if (Test-Path -LiteralPath $localDotnet) { $dotnetCommand = $localDotnet; $env:DOTNET_ROOT = Split-Path $localDotnet }
    if (-not $dotnetCommand) { throw 'Install the .NET 10 SDK before running Relay.' }
    Push-Location web
    try {
        if (-not $SkipInstall) { npm ci; if ($LASTEXITCODE -ne 0) { throw 'Frontend dependency installation failed.' } }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
    } finally { Pop-Location }
    & $dotnetCommand run --project src/Relay.Api
    if ($LASTEXITCODE -ne 0) { throw 'Relay failed to start.' }
} finally { Pop-Location }
