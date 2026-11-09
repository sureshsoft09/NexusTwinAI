# PowerShell helper to run all 3 FastMCP servers (Ports 8081, 8082, 8083)
# Standardized on Google Cloud Project: nexustwinai-project

$env:GOOGLE_CLOUD_PROJECT = "nexustwinai-project"
$env:GCP_PROJECT_ID = "nexustwinai-project"
$env:BQ_DATASET_ID = "supply_chain_lakehouse"
$env:PYTHONPATH = "$PSScriptRoot;$PSScriptRoot\shared"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "Starting NexusTwin AI FastMCP Microservices (/mcp)" -ForegroundColor Green
Write-Host "  [1] erp_inventory_mcp      -> http://localhost:8081/mcp" -ForegroundColor Yellow
Write-Host "  [2] logistics_rates_mcp    -> http://localhost:8082/mcp" -ForegroundColor Yellow
Write-Host "  [3] bigquery_telemetry_mcp -> http://localhost:8083/mcp" -ForegroundColor Yellow
Write-Host "  BigQuery Dataset:          nexustwinai-project.supply_chain_lakehouse" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$PythonExe = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $PythonExe)) {
    $PythonExe = "python"
}

& $PythonExe "$PSScriptRoot\run_mcp_servers.py"
