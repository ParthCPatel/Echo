#!/bin/bash

# Kill background processes on exit
trap "exit" INT TERM
trap "kill 0" EXIT

echo "🚀 Starting Echo System..."

# Start Backend in background
echo "🧠 Starting Backend Brain..."
cd backend
npm start &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 3
echo "✅ Backend (likely) ready."

# Start Desktop App
echo "🖥️  Starting Desktop App..."
cd ../desktop-app
npm start

# When desktop app exits, the trap will kill the backend
