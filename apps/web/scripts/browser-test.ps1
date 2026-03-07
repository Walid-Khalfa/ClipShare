# Clipshare Browser Test using agent-browser
# Usage: .\scripts\browser-test.ps1

param(
    [string]$BaseUrl = "http://localhost:3000",
    [string]$Session = "clipshare-test"
)

Write-Host "=== Clipshare Browser Test ===" -ForegroundColor Cyan
Write-Host "Testing: $BaseUrl" -ForegroundColor Gray
Write-Host ""

# Function to run agent-browser command
function Invoke-AgentBrowser {
    param([string]$Args)
    $output = agent-browser $Args 2>&1
    Write-Host $output
    return $output
}

try {
    # Start browser session
    Write-Host "Opening homepage..." -ForegroundColor Yellow
    Invoke-AgentBrowser "--session $Session open $BaseUrl"
    Invoke-AgentBrowser "--session $Session wait --load networkidle"

    # Take snapshot to discover elements
    Write-Host "Taking snapshot..." -ForegroundColor Yellow
    Invoke-AgentBrowser "--session $Session snapshot -i"

    # Verify homepage elements
    Write-Host "Verifying homepage elements..." -ForegroundColor Yellow
    Invoke-AgentBrowser "--session $Session get title"
    Invoke-AgentBrowser "--session $Session get text h1"

    # Test navigation to Record page
    Write-Host "Testing /record page..." -ForegroundColor Yellow
    Invoke-AgentBrowser "--session $Session open $BaseUrl/record"
    Invoke-AgentBrowser "--session $Session wait --load networkidle"
    Invoke-AgentBrowser "--session $Session snapshot -i"
    Invoke-AgentBrowser "--session $Session get text h1"

    # Test navigation to Login page
    Write-Host "Testing /login page..." -ForegroundColor Yellow
    Invoke-AgentBrowser "--session $Session open $BaseUrl/login"
    Invoke-AgentBrowser "--session $Session wait --load networkidle"
    Invoke-AgentBrowser "--session $Session snapshot -i"
    Invoke-AgentBrowser "--session $Session get text h1"

    # Take screenshot
    Write-Host "Taking screenshot..." -ForegroundColor Yellow
    Invoke-AgentBrowser "--session $Session screenshot test-screenshot.png"

    Write-Host ""
    Write-Host "=== Test Complete ===" -ForegroundColor Green
}
finally {
    # Close browser
    Write-Host "Closing browser..." -ForegroundColor Yellow
    Invoke-AgentBrowser "--session $Session close"
}
