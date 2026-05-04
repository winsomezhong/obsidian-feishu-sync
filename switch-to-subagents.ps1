# Switch to Subagents configuration
# Usage: .\switch-to-subagents.ps1

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Switching to Subagents mode..." -ForegroundColor Cyan

# Backup current config
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = "$projectRoot\configs\backup-$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

if (Test-Path "$projectRoot\.claude\agents") {
    Copy-Item "$projectRoot\.claude\agents\*" "$backupDir\" -Force
}
if (Test-Path "$projectRoot\.claude\settings.local.json") {
    Copy-Item "$projectRoot\.claude\settings.local.json" "$backupDir\" -Force
}
if (Test-Path "$projectRoot\CLAUDE.md") {
    Copy-Item "$projectRoot\CLAUDE.md" "$backupDir\" -Force
}
Write-Host "  Backed up to configs\backup-$timestamp" -ForegroundColor Gray

# Clean current config
Remove-Item "$projectRoot\.claude\agents\*" -Force -ErrorAction SilentlyContinue
Remove-Item "$projectRoot\.claude\settings.local.json" -Force -ErrorAction SilentlyContinue
Remove-Item "$projectRoot\CLAUDE.md" -Force -ErrorAction SilentlyContinue

# Copy Subagents config
Copy-Item "$projectRoot\configs\subagents\agents\*" "$projectRoot\.claude\agents\" -Force
Copy-Item "$projectRoot\configs\subagents\settings.local.json" "$projectRoot\.claude\" -Force
Copy-Item "$projectRoot\configs\subagents\CLAUDE.md" "$projectRoot\" -Force

Write-Host "[OK] Switched to Subagents mode" -ForegroundColor Green
Write-Host ""
Write-Host "Features:" -ForegroundColor Yellow
Write-Host "  - No experimental flags" -ForegroundColor White
Write-Host "  - Main agent calls subagents directly" -ForegroundColor White
Write-Host "  - 4 subagents (spec/implementer/qa/review)" -ForegroundColor White
Write-Host "  - No inter-agent messaging (via main agent)" -ForegroundColor White
Write-Host "  - Parallel via run_in_background" -ForegroundColor White
Write-Host "  - Cost: 1.5-2x token" -ForegroundColor White
Write-Host "  - Status: stable" -ForegroundColor White
Write-Host ""
Write-Host "Launch: claude" -ForegroundColor Green
Write-Host ""
Write-Host "Restart Claude Code session for changes to take effect." -ForegroundColor Cyan
