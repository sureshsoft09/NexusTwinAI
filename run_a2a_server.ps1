# NexusTwin AI - Remote A2A Approval Agent Server Launcher (Port 8001)
# Configuration (Project, Region, Models) is loaded directly from .env files
# Serves the `human_in_loop` agent over Google ADK A2A protocol at:
# http://localhost:8001/a2a/human_in_loop/.well-known/agent.json

# Clear any stale session overrides so .env files remain the single source of truth
Remove-Item Env:\ADK_MODEL, Env:\MODEL_REASONING, Env:\MODEL_FAST, Env:\GOOGLE_CLOUD_LOCATION, Env:\GCP_REGION -ErrorAction SilentlyContinue

$env:PYTHONPATH = "$PSScriptRoot;$PSScriptRoot\agents\src;$PSScriptRoot\shared"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Launching NexusTwin AI - Remote A2A Server (human_in_loop)" -ForegroundColor Green
Write-Host "Config:     Loaded from agents/src/human_in_loop/.env" -ForegroundColor Yellow
Write-Host "Agent Card: http://localhost:8001/a2a/human_in_loop/.well-known/agent.json" -ForegroundColor Yellow
Write-Host "Port:       8001" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan

$AdkExe = Join-Path $PSScriptRoot ".venv\Scripts\adk.exe"
$PythonExe = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    $PythonExe = "python"
}

# Run the standalone FastAPI A2A server on Port 8001 (serves both ADK Agent Card /.well-known/agent.json and /pending)
& $PythonExe "$PSScriptRoot\run_a2a_server.py"
