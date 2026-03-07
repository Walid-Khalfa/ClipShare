#!/bin/bash
# Browser automation script for Clipshare using agent-browser
# Usage: ./scripts/browser-test.sh

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"
SESSION="${SESSION:-clipshare-test}"

echo "=== Clipshare Browser Test ==="
echo "Testing: $BASE_URL"
echo ""

# Start browser session
echo "Opening homepage..."
agent-browser --session "$SESSION" open "$BASE_URL"
agent-browser --session "$SESSION" wait --load networkidle

# Take snapshot to discover elements
echo "Taking snapshot..."
agent-browser --session "$SESSION" snapshot -i

# Verify homepage elements
echo "Verifying homepage elements..."
agent-browser --session "$SESSION" get title
agent-browser --session "$SESSION" get text "h1"

# Test navigation to Record page
echo "Testing /record page..."
agent-browser --session "$SESSION" open "$BASE_URL/record"
agent-browser --session "$SESSION" wait --load networkidle
agent-browser --session "$SESSION" snapshot -i
agent-browser --session "$SESSION" get text "h1"

# Test navigation to Login page
echo "Testing /login page..."
agent-browser --session "$SESSION" open "$BASE_URL/login"
agent-browser --session "$SESSION" wait --load networkidle
agent-browser --session "$SESSION" snapshot -i
agent-browser --session "$SESSION" get text "h1"

# Take screenshot
echo "Taking screenshot..."
agent-browser --session "$SESSION" screenshot ./test-screenshot.png

# Close browser
echo "Closing browser..."
agent-browser --session "$SESSION" close

echo ""
echo "=== Test Complete ==="
