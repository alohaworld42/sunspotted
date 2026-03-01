#!/bin/bash
set -e

echo "=== Vercel Build ==="
echo "CWD: $(pwd)"
echo "Contents: $(ls -1)"

# Run the web build
pnpm --filter web build

echo "=== Looking for dist ==="
echo "CWD after build: $(pwd)"

# Find the dist directory wherever it ended up
if [ -d "apps/web/dist" ]; then
  echo "Found at apps/web/dist"
  cp -r apps/web/dist ./dist
elif [ -d "dist" ]; then
  echo "Found at ./dist (already in place)"
else
  echo "Searching for dist..."
  find . -type d -name dist -not -path '*/node_modules/*' 2>/dev/null
  echo "ERROR: dist not found"
  exit 1
fi

echo "=== dist contents ==="
ls -la dist/
echo "=== Build complete ==="
