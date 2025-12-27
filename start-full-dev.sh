#!/bin/zsh

# ===== CONFIG =====
FRONTEND_PORT=3001
BACKEND_PORT=8000
FRONTEND_DIR="$HOME/invmanage-frontend"
BACKEND_DIR="$HOME/invmanage-backend"
NGROK_PATH="/usr/local/bin/ngrok"  # ganti jika ngrok lain lokasi
# ==================

# --- Kill busy ports ---
echo "Killing busy ports..."
for PORT in $FRONTEND_PORT $BACKEND_PORT; do
  PID=$(lsof -t -i :$PORT)
  if [ ! -z "$PID" ]; then
    kill -9 $PID
    echo "Killed PID $PID on port $PORT"
  fi
done

# --- Start Django backend ---
echo "Starting Django backend..."
cd $BACKEND_DIR
# source venv/bin/activate  # uncomment kalau pakai virtualenv
python manage.py runserver $BACKEND_PORT &
BACKEND_PID=$!
sleep 5  # tunggu backend start

# --- Start ngrok backend tunnel ---
echo "Starting ngrok backend tunnel..."
BACKEND_NGROK_URL=$($NGROK_PATH http $BACKEND_PORT --log=stdout --inspect=false --log-format=json | grep -o 'https://[a-z0-9\-]*\.ngrok-free\.dev' | head -n 1)
echo "ngrok backend URL: $BACKEND_NGROK_URL"

# --- Update frontend .env ---
echo "Updating frontend .env..."
echo "VITE_API_URL=$BACKEND_NGROK_URL" > $FRONTEND_DIR/.env

# --- Start React frontend ---
echo "Starting React frontend..."
cd $FRONTEND_DIR
npm install
PORT=$FRONTEND_PORT npm run dev &
FRONTEND_PID=$!
sleep 5  # tunggu frontend start

# --- Start ngrok frontend tunnel ---
echo "Starting ngrok frontend tunnel..."
FRONTEND_NGROK_URL=$($NGROK_PATH http $FRONTEND_PORT --log=stdout --inspect=false --log-format=json | grep -o 'https://[a-z0-9\-]*\.ngrok-free\.dev' | head -n 1)
echo "ngrok frontend URL: $FRONTEND_NGROK_URL"

# --- Open frontend in browser ---
echo "Opening frontend in browser..."
open $FRONTEND_NGROK_URL

echo "✅ All services started!"
echo "Backend PID: $BACKEND_PID"
echo "Frontend PID: $FRONTEND_PID"
echo "Frontend is calling backend at: $BACKEND_NGROK_URL"
echo "Frontend URL: $FRONTEND_NGROK_URL"

