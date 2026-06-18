#!/bin/bash

# Trap Ctrl+C (SIGINT) and exit signals to kill all background child processes
trap "echo 'Shutting down servers...'; kill 0" EXIT

echo "🚀 Starting RAGBuilder Framework..."

# Start FastAPI Backend
echo "📡 Starting Backend on http://localhost:8000..."
.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 &

# Wait a brief moment for the backend port to bind
sleep 1

# Start Next.js Frontend
echo "💻 Starting Next.js Frontend on http://localhost:3000..."
cd frontend
npm run dev &

# Wait for all background processes to finish (keeps script running)
wait
