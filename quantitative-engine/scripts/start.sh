#!/bin/bash
# XORJ Quantitative Engine - Startup Script

set -e

echo "🚀 Starting XORJ Quantitative Engine..."

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from .env.example..."
    cp .env.example .env
    echo "📝 Please edit .env with your configuration before continuing."
    exit 1
fi

# Load environment variables
export $(cat .env | grep -v '^#' | xargs)

# Check required environment variables
required_vars=("DATABASE_URL" "REDIS_URL" "SOLANA_RPC_URL")
for var in "${required_vars[@]}"; do
    if [ -z "${!var}" ]; then
        echo "❌ Missing required environment variable: $var"
        exit 1
    fi
done

# Start mode selection
MODE=${1:-"development"}

echo "🔧 Starting in $MODE mode..."

case $MODE in
    "development")
        echo "🧪 Development mode - Starting all services with hot reload"
        docker-compose --profile dev up --build
        ;;
    
    "production")
        echo "🏭 Production mode - Starting optimized containers"
        docker-compose up -d --build
        ;;
    
    "worker-only")
        echo "⚙️  Worker-only mode - Starting background processing only"
        docker-compose up -d postgres redis celery-worker celery-beat
        ;;
        
    "api-only")
        echo "🌐 API-only mode - Starting web server only"
        docker-compose up -d postgres redis quantitative-engine
        ;;
        
    "local")
        echo "💻 Local development mode - Using local Python"
        
        # Check if Python virtual environment exists
        if [ ! -d "venv" ]; then
            echo "📦 Creating Python virtual environment..."
            python3 -m venv venv
        fi
        
        # Activate virtual environment
        source venv/bin/activate
        
        # Install dependencies
        echo "📥 Installing dependencies..."
        pip install -q -r requirements.txt
        
        # Start background services
        echo "🐳 Starting Docker services (PostgreSQL, Redis)..."
        docker-compose up -d postgres redis
        
        # Wait for services to be ready
        echo "⏳ Waiting for services to start..."
        sleep 5
        
        echo "🚀 Starting local development servers..."
        echo "🌐 API server will be available at: http://localhost:8000"
        echo "📊 Flower UI will be available at: http://localhost:5555"
        echo ""
        echo "Starting in background processes..."
        
        # Start API server
        uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload &
        API_PID=$!
        
        # Start Celery worker
        celery -A app.worker worker --loglevel=info --concurrency=2 &
        WORKER_PID=$!
        
        # Start Celery beat
        celery -A app.worker beat --loglevel=info &
        BEAT_PID=$!
        
        # Start Flower
        celery -A app.worker flower --port=5555 &
        FLOWER_PID=$!
        
        echo "📝 Process IDs:"
        echo "  API Server: $API_PID"
        echo "  Celery Worker: $WORKER_PID"
        echo "  Celery Beat: $BEAT_PID"
        echo "  Flower: $FLOWER_PID"
        echo ""
        echo "🛑 To stop all services, run: kill $API_PID $WORKER_PID $BEAT_PID $FLOWER_PID"
        echo "📋 Or use: pkill -f 'uvicorn\|celery'"
        
        # Wait for user input to stop
        echo ""
        read -p "Press Enter to stop all services..."
        
        echo "🛑 Stopping services..."
        kill $API_PID $WORKER_PID $BEAT_PID $FLOWER_PID 2>/dev/null || true
        docker-compose down
        
        deactivate
        ;;
        
    "test")
        echo "🧪 Test mode - Running health checks and basic tests"
        
        # Start minimal services
        docker-compose up -d postgres redis
        sleep 5
        
        # Start API temporarily
        docker-compose up -d quantitative-engine
        sleep 10
        
        echo "🔍 Running health check..."
        HEALTH_RESPONSE=$(curl -s http://localhost:8000/health || echo "failed")
        
        if echo "$HEALTH_RESPONSE" | grep -q '"healthy":true'; then
            echo "✅ Health check passed!"
        else
            echo "❌ Health check failed:"
            echo "$HEALTH_RESPONSE"
            docker-compose down
            exit 1
        fi
        
        echo "📊 Testing manual ingestion..."
        INGESTION_RESPONSE=$(curl -s -X POST http://localhost:8000/ingestion/manual \
            -H "Content-Type: application/json" \
            -d '{"wallet_addresses":["ExampleTestWallet..."],"lookback_hours":1}' || echo "failed")
        
        if echo "$INGESTION_RESPONSE" | grep -q '"success":true'; then
            echo "✅ Manual ingestion test passed!"
        else
            echo "⚠️  Manual ingestion test warning (this may be expected in test environment):"
            echo "$INGESTION_RESPONSE"
        fi
        
        echo "✨ Basic tests completed!"
        docker-compose down
        ;;
        
    "stop")
        echo "🛑 Stopping all services..."
        docker-compose down -v
        pkill -f 'uvicorn\|celery' 2>/dev/null || true
        echo "✅ All services stopped!"
        ;;
        
    *)
        echo "❌ Unknown mode: $MODE"
        echo ""
        echo "Available modes:"
        echo "  development  - Full development environment with hot reload"
        echo "  production   - Production deployment"
        echo "  worker-only  - Background workers only"
        echo "  api-only     - API server only"  
        echo "  local        - Local development with Python virtual environment"
        echo "  test         - Run basic tests and health checks"
        echo "  stop         - Stop all services"
        echo ""
        echo "Usage: $0 [mode]"
        echo "Example: $0 development"
        exit 1
        ;;
esac

echo "✅ XORJ Quantitative Engine startup complete!"