# start_tunnel.ps1
# Starts a Cloudflare tunnel, extracts the URL, and hot-updates the backend.
# Usage: .\start_tunnel.ps1
# Run this every time you start a new session.

Write-Host "Starting Cloudflare tunnel..." -ForegroundColor Cyan

# Start cloudflared in background and capture output
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
    Write-Host "Could not detect tunnel URL after 60s. Check cloudflared output." -ForegroundColor Red
    Receive-Job $job
    exit 1
}

Write-Host ""
Write-Host "Tunnel URL: $tunnelUrl" -ForegroundColor Green
Write-Host ""

# Update .env file
$envPath = Join-Path $PSScriptRoot ".env"
if (Test-Path $envPath) {
    $envContent = Get-Content $envPath -Raw
    $envContent = $envContent -replace "LLM_WEBHOOK_PUBLIC_URL=.*", "LLM_WEBHOOK_PUBLIC_URL=$tunnelUrl"
    $envContent | Set-Content $envPath -Encoding UTF8
    Write-Host ".env updated with new tunnel URL" -ForegroundColor Green
}

# Hot-update the running backend if it's up
try {
    $body = "{`"url`": `"$tunnelUrl`"}" 
    $response = Invoke-WebRequest -Uri "http://localhost:8000/tunnel/update" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 5
    Write-Host "Backend hot-updated successfully" -ForegroundColor Green
} catch {
    Write-Host "Backend not running or not reachable — .env updated for next start" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== TUNNEL READY ===" -ForegroundColor Cyan
Write-Host "URL:         $tunnelUrl" -ForegroundColor White
Write-Host "LLM webhook: $tunnelUrl/v1/chat/completions" -ForegroundColor White
Write-Host ""
Write-Host "Keep this window open. Press Ctrl+C to stop the tunnel." -ForegroundColor Yellow
Write-Host ""

# Keep alive — stream cloudflared output
Receive-Job $job -Wait
