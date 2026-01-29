#!/bin/bash

# Test script for API connection
# Usage: ./test-connection.sh [API_URL]

API_URL="${1:-http://localhost:3001}"

echo "Testing connection to: $API_URL"
echo "-----------------------------------"

# Test health endpoint
echo -n "Health check: "
HEALTH=$(curl -s "$API_URL/health")
if [[ $HEALTH == *"ok"* ]]; then
    echo "✅ OK"
    echo "Response: $HEALTH"
else
    echo "❌ FAILED"
    echo "Response: $HEALTH"
fi

echo ""
echo "-----------------------------------"
echo "To test production, run:"
echo "  ./test-connection.sh https://your-backend-url.railway.app"
