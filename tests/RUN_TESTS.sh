#!/bin/bash
# Quick test runner script for TypeScript SDK

echo "=== Running TypeScript SDK Tests ==="
echo ""

# Check if in correct directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Must run from sdk-ts directory"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install > /dev/null 2>&1
fi

# Build if needed
if [ ! -d "dist" ]; then
    echo "🔨 Building..."
    npm run build > /dev/null 2>&1
fi

# Run tests
echo "🧪 Running tests..."
npm test -- "$@"
