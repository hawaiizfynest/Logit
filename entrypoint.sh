#!/bin/sh
set -e

apk add --no-cache python3 make g++ > /dev/null 2>&1

if [ ! -f /app/node_modules/.install-done ]; then
  echo "📦 Installing dependencies (first run only)..."
  cd /app
  npm install --production
  touch /app/node_modules/.install-done
  echo "✅ Dependencies installed."
else
  # Check if package.json changed (new deps added)
  if [ /app/package.json -nt /app/node_modules/.install-done ]; then
    echo "📦 package.json changed, reinstalling dependencies..."
    cd /app
    npm install --production
    touch /app/node_modules/.install-done
    echo "✅ Dependencies updated."
  else
    echo "✅ Dependencies already installed, skipping."
  fi
fi

echo "🚀 Starting Logit..."
exec node /app/server.js
