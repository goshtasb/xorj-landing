#!/bin/bash

# XORJ Trade Execution Bot Service Startup Script
# Starts both the Python bot service and Next.js frontend

set -e

echo "🚀 Starting XORJ Trade Execution Bot Integration"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration
BOT_SERVICE_HOST="${BOT_SERVICE_HOST:-127.0.0.1}"
BOT_SERVICE_PORT="${BOT_SERVICE_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-3000}"
BOT_SERVICE_API_KEY="${BOT_SERVICE_API_KEY:-development-key}"

echo "📋 Configuration:"
echo "  Bot Service: http://${BOT_SERVICE_HOST}:${BOT_SERVICE_PORT}"
echo "  Frontend: http://localhost:${FRONTEND_PORT}"
echo "  API Key: ${BOT_SERVICE_API_KEY}"
echo ""

# Function to check if port is available
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${RED}❌ Port $port is already in use${NC}"
        return 1
    fi
    return 0
}

# Function to wait for service to be ready
wait_for_service() {
    local url=$1
    local service_name=$2
    local max_attempts=30
    local attempt=1
    
    echo -e "${YELLOW}⏳ Waiting for $service_name to be ready...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s "$url" >/dev/null 2>&1; then
            echo -e "${GREEN}✅ $service_name is ready!${NC}"
            return 0
        fi
        echo "  Attempt $attempt/$max_attempts..."
        sleep 2
        ((attempt++))
    done
    
    echo -e "${RED}❌ $service_name failed to start within $((max_attempts * 2)) seconds${NC}"
    return 1
}

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}🛑 Shutting down services...${NC}"
    
    # Kill background jobs
    if [ ! -z "$BOT_PID" ]; then
        kill $BOT_PID 2>/dev/null || true
        echo "  Stopped bot service (PID: $BOT_PID)"
    fi
    
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
        echo "  Stopped frontend (PID: $FRONTEND_PID)"
    fi
    
    echo -e "${GREEN}✅ Services stopped${NC}"
    exit 0
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Check if ports are available
echo "🔍 Checking port availability..."
if ! check_port $BOT_SERVICE_PORT; then
    echo "Please stop the service using port $BOT_SERVICE_PORT or set a different BOT_SERVICE_PORT"
    exit 1
fi

if ! check_port $FRONTEND_PORT; then
    echo "Please stop the service using port $FRONTEND_PORT or set a different FRONTEND_PORT"
    exit 1
fi

# Check Python dependencies
echo "🐍 Checking Python environment..."
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python 3 is required but not installed${NC}"
    exit 1
fi

# Check Node.js dependencies
echo "📦 Checking Node.js environment..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js is required but not installed${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is required but not installed${NC}"
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ package.json not found. Please run this script from the project root directory${NC}"
    exit 1
fi

if [ ! -f "trade-execution-bot/fastapi_service.py" ]; then
    echo -e "${RED}❌ Bot service not found. Please ensure trade-execution-bot/fastapi_service.py exists${NC}"
    exit 1
fi

# Install Python dependencies for bot service
echo "📦 Installing Python dependencies..."
cd trade-execution-bot
if [ ! -f "requirements.txt" ]; then
    echo -e "${YELLOW}⚠️  requirements.txt not found, creating minimal requirements...${NC}"
    cat > requirements.txt << EOF
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
python-multipart==0.0.6
solana==0.32.0
solders==0.19.0
httpx==0.25.2
EOF
fi

pip3 install -r requirements.txt
cd ..

# Install Node.js dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Set environment variables
export NEXT_PUBLIC_BOT_SERVICE_URL="http://${BOT_SERVICE_HOST}:${BOT_SERVICE_PORT}"
export BOT_SERVICE_API_KEY="$BOT_SERVICE_API_KEY"
export BOT_SERVICE_HOST="$BOT_SERVICE_HOST"
export BOT_SERVICE_PORT="$BOT_SERVICE_PORT"

echo ""
echo -e "${GREEN}🚀 Starting services...${NC}"

# Start Python bot service in background
echo "🤖 Starting XORJ Trade Execution Bot Service..."
cd trade-execution-bot
python3 fastapi_service.py &
BOT_PID=$!
cd ..

echo "  Bot service PID: $BOT_PID"

# Wait for bot service to be ready
if ! wait_for_service "http://${BOT_SERVICE_HOST}:${BOT_SERVICE_PORT}/health" "Bot Service"; then
    echo -e "${RED}❌ Failed to start bot service${NC}"
    exit 1
fi

# Start Next.js frontend in background
echo "🌐 Starting Next.js Frontend..."
npm run dev &
FRONTEND_PID=$!

echo "  Frontend PID: $FRONTEND_PID"

# Wait for frontend to be ready
if ! wait_for_service "http://localhost:${FRONTEND_PORT}" "Frontend"; then
    echo -e "${RED}❌ Failed to start frontend${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 XORJ Trade Execution Bot Integration Started Successfully!${NC}"
echo ""
echo "📋 Service URLs:"
echo "  🤖 Bot Service API: http://${BOT_SERVICE_HOST}:${BOT_SERVICE_PORT}"
echo "  📊 Health Check: http://${BOT_SERVICE_HOST}:${BOT_SERVICE_PORT}/health"
echo "  🌐 Frontend: http://localhost:${FRONTEND_PORT}"
echo "  📱 Bot Dashboard: http://localhost:${FRONTEND_PORT}/bot"
echo ""
echo "🔑 API Key: $BOT_SERVICE_API_KEY"
echo ""
echo -e "${YELLOW}📘 Usage:${NC}"
echo "  1. Open http://localhost:${FRONTEND_PORT} in your browser"
echo "  2. Connect your Solana wallet"
echo "  3. Click 'Bot Dashboard' to access the bot controls"
echo "  4. The frontend will automatically connect to the bot service"
echo ""
echo -e "${YELLOW}🛑 To stop: Press Ctrl+C${NC}"
echo ""

# Keep the script running and monitor services
while true; do
    # Check if bot service is still running
    if ! kill -0 $BOT_PID 2>/dev/null; then
        echo -e "${RED}❌ Bot service stopped unexpectedly${NC}"
        exit 1
    fi
    
    # Check if frontend is still running
    if ! kill -0 $FRONTEND_PID 2>/dev/null; then
        echo -e "${RED}❌ Frontend stopped unexpectedly${NC}"
        exit 1
    fi
    
    sleep 5
done