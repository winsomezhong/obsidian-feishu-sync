# Launch Claude Code Agent Teams in WSL2 + tmux
# Usage: .\start-wsl-tmux.ps1

$projectPath = "/mnt/d/workspace/obsidian-feishu-sync"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Claude Code Agent Teams (WSL2 + tmux)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project: $projectPath" -ForegroundColor White
Write-Host "Mode: Agent Teams (tmux auto-pane per teammate)" -ForegroundColor White
Write-Host ""

# Check if WSL is running
$wslRunning = wsl -d Ubuntu -u fzhong echo "ok" 2>&1
if ($wslRunning -notmatch "ok") {
    Write-Host "Starting WSL Ubuntu..." -ForegroundColor Yellow
    wsl -d Ubuntu
    Start-Sleep -Seconds 3
}

# Kill old session, reload config, create new, start claude, attach
wsl -d Ubuntu -u fzhong bash -c "tmux kill-session -t claude-work 2>/dev/null; tmux source-file ~/.tmux.conf 2>/dev/null; tmux new-session -d -s claude-work -c $projectPath; tmux send-keys -t claude-work 'cd $projectPath && claude' Enter; sleep 2; tmux attach-session -t claude-work"

Write-Host ""
Write-Host "Session ended." -ForegroundColor Gray
