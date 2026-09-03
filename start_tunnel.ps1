# start_tunnel.ps1
# Starts a Cloudflare tunnel, extracts the URL, and hot-updates the backend.
# Usage: .\start_tunnel.ps1

Write-Host "Starting Cloudflare tunnel..." -ForegroundColor Cyan

$job = Start-Job -ScriptBlock {
    & cloudflared tunnel --url http://localhost:8000 2>&1
}

Write-Host "Waiting for tunnel URL..." -ForegroundColor Yellow
$tunnelUrl = $null
$attempts = 0

while (-not $tunnelUrl -and $attempts -lt 30) {
    Start-Sleep -Seconds 2
    $attempts++
    $output = Receive-Job $job -Keep 2>&1 | Out-String
    $match = [regex]::Match($output, 'https://[a-z0-9\-]+\.trycloudflare\.com')
    if ($match.Success) {
        $tunnelUrl = $match.Value
    }
}

if (-not $tunnelUrl) {
    Write-Host "Could not detect tunnel URL after 60s." -ForegroundColor Red
    Receive-Job $job
    exit 1
}

Write-Host ""
Write-Host "Tunnel URL: $tunnelUrl" -ForegroundColor Green
Write-Host ""

$envPath = Join-Path $PSScriptRoot ".env"
if (Test-Path $envPath) {
    $envContent = Get-Content $envPath -Raw
    $envContent = $envContent -replace "LLM_WEBHOOK_PUBLIC_URL=.*", "LLM_WEBHOOK_PUBLIC_URL=$tunnelUrl"
    $envContent | Set-Content $envPath -Encoding UTF8
    Write-Host ".env updated" -ForegroundColor Green
}

$bodyObj = @{ url = $tunnelUrl }
$bodyJson = $bodyObj | ConvertTo-Json -Compress

try {
    $response = Invoke-WebRequest -Uri "http://localhost:8000/tunnel/update" -Method POST -Body $bodyJson -ContentType "application/json" -TimeoutSec 5 -UseBasicParsing
    Write-Host "Backend hot-updated" -ForegroundColor Green
}
catch {
    Write-Host "Backend not running - .env updated for next start" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== TUNNEL READY ===" -ForegroundColor Cyan
Write-Host "URL:         $tunnelUrl" -ForegroundColor White
Write-Host "LLM webhook: $tunnelUrl/v1/chat/completions" -ForegroundColor White
Write-Host ""
Write-Host "Keep this window open. Press Ctrl+C to stop." -ForegroundColor Yellow
Write-Host ""

Receive-Job $job -Wait
