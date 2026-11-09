# NexusTwin AI - Google Cloud ADK Web Dashboard Launcher
# Configuration (Project, Region, Models, MCP URLs) is loaded directly from .env files

# Clear any stale session overrides so .env files remain the single source of truth
Remove-Item Env:\ADK_MODEL, Env:\MODEL_REASONING, Env:\MODEL_FAST, Env:\GOOGLE_CLOUD_LOCATION, Env:\GCP_REGION -ErrorAction SilentlyContinue

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Launching NexusTwin AI - ADK Web Agent Inspector" -ForegroundColor Green
Write-Host "Config:     Loaded from agents/src/.env & agent .env files" -ForegroundColor Yellow
Write-Host "Supervisor: root_agent = twin_supervisor" -ForegroundColor Yellow
Write-Host "Port:       8000" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

# Set PYTHONPATH to include shared and agents src
$env:PYTHONPATH = "$PSScriptRoot;$PSScriptRoot\agents\src;$PSScriptRoot\shared"

$AdkExe = Join-Path $PSScriptRoot ".venv\Scripts\adk.exe"
if (Test-Path $AdkExe) {
    & $AdkExe web "$PSScriptRoot\agents\src" --port 8000
} elseif (Get-Command adk -ErrorAction SilentlyContinue) {
    adk web "$PSScriptRoot\agents\src" --port 8000
} else {
    Write-Host "[INFO] 'adk' CLI not found in .venv. Installing google-adk and a2a-sdk..." -ForegroundColor Yellow
    pip install -r "$PSScriptRoot\requirements.txt"
    if (Test-Path $AdkExe) {
        & $AdkExe web "$PSScriptRoot\agents\src" --port 8000
    } else {
        adk web "$PSScriptRoot\agents\src" --port 8000
    }
}
