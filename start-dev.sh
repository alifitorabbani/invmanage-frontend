#!/bin/zsh

# ---- CONFIG ----
FRONTEND_PORT=3001
BACKEND_PORT=8000
FRONTEND_DIR="$HOME/invmanage-frontend"
BACKEND_DIR="$HOME/invmanage-backend"
NGROK_PATH="/usr/local/bin/ngrok"  # adjust if ngrok installed elsewhere
# ----------------

echo "Killing busy frontend port $FRONTEND_PORT..."
PID=$(lsof -t -i :$FRONTEND_PORT)
if [ ! -z "$PID" ]; then kill -9 $PID; fi

echo "Killing busy backend port $BACKEND_PORT..."
PID=$(lsof -t -i :$BACKEND_PORT)
if [ ! -z "$PID" ]; then kill -9 $PID; fi

# ---- Start Backend ----
echo "Starting Django backend..."
cd $BACKEND_DIR
# Activate your virtualenv if you have one
# source venv/bin/activate
python manage.py runserver $BACKEND_PORT &
BACKEND_PID=$!

sleep 3  # wait a bit for server to start

# ---- Start Frontend ----
echo "Starting React frontend..."
cd $FRONTEND_DIR
npm install
PORT=$FRONTEND_PORT npm run dev &
FRONTEND_PID=$!

sleep 3  # wait a bit for frontend

# ---- Start ngrok tunnels ----
echo "Starting ngrok tunnels..."
$NGROK_PATH http $BACKEND_PORT --log=stdout &
$NGROK_PATH http $FRONTEND_PORT --log=stdout &

echo "All services started!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"

