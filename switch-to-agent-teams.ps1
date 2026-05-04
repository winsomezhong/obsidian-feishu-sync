# Switch to Agent Teams configuration
# Usage: .\switch-to-agent-teams.ps1

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Switching to Agent Teams mode..." -ForegroundColor Cyan

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

# Copy Agent Teams config
Copy-Item "$projectRoot\configs\agent-teams\agents\*" "$projectRoot\.claude\agents\" -Force
Copy-Item "$projectRoot\configs\agent-teams\settings.local.json" "$projectRoot\.claude\" -Force
Copy-Item "$projectRoot\configs\agent-teams\CLAUDE.md" "$projectRoot\" -Force

Write-Host "[OK] Switched to Agent Teams mode" -ForegroundColor Green
Write-Host ""
Write-Host "Features:" -ForegroundColor Yellow
Write-Host "  - CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1" -ForegroundColor White
Write-Host "  - 4 teammates (spec/implementer/qa/review)" -ForegroundColor White
Write-Host "  - Inter-teammate messaging (SendMessage)" -ForegroundColor White
Write-Host "  - Cost: 3-7x token" -ForegroundColor White
Write-Host "  - Status: experimental" -ForegroundColor White
Write-Host ""
Write-Host "Launch:" -ForegroundColor Yellow
Write-Host "  .\start-wsl-tmux.ps1    <-- Recommended: WSL2 + tmux auto-panes" -ForegroundColor Green
Write-Host "  claude                  <-- Fallback: Windows in-process mode" -ForegroundColor Gray
Write-Host ""
Write-Host "Restart Claude Code session for changes to take effect." -ForegroundColor Cyan
