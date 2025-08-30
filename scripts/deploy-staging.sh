#!/bin/bash

# XORJ Staging Environment Deployment Script
# Deploys real infrastructure for chaos engineering tests

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check if .env.staging exists
    if [ ! -f ".env.staging" ]; then
        log_error ".env.staging file not found"
        exit 1
    fi
    
    # Check available disk space (need at least 5GB)
    available_space=$(df / | awk 'NR==2 {print $4}')
    if [ "$available_space" -lt 5000000 ]; then
        log_error "Insufficient disk space. Need at least 5GB available."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Load environment variables
load_environment() {
    log_info "Loading staging environment variables..."
    
    if [ -f ".env.staging" ]; then
        export $(cat .env.staging | grep -v '^#' | xargs)
        log_success "Environment variables loaded"
    else
        log_error ".env.staging file not found"
        exit 1
    fi
}

# Create necessary directories
create_directories() {
    log_info "Creating necessary directories..."
    
    mkdir -p chaos-testing/results
    mkdir -p staging-logs
    mkdir -p staging-data/postgres
    mkdir -p staging-data/redis
    
    log_success "Directories created"
}

# Build Docker images
build_images() {
    log_info "Building Docker images for staging..."
    
    # Build chaos testing image
    log_info "Building chaos testing framework..."
    cd chaos-testing && npm install && cd ..
    
    # Build with staging context
    log_info "Building services with staging configuration..."
    docker-compose -f docker-compose.staging.yml build --no-cache
    
    log_success "Docker images built successfully"
}

# Start infrastructure services first
start_infrastructure() {
    log_info "Starting infrastructure services..."
    
    # Start database and Redis first
    docker-compose -f docker-compose.staging.yml up -d staging-database staging-redis
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    max_attempts=30
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose -f docker-compose.staging.yml exec -T staging-database pg_isready -U xorj_staging_user -d xorj_staging > /dev/null 2>&1; then
            log_success "Database is ready"
            break
        fi
        
        log_info "Database not ready yet, waiting... (attempt $attempt/$max_attempts)"
        sleep 5
        ((attempt++))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        log_error "Database failed to start within timeout"
        exit 1
    fi
    
    # Start chaos proxy
    docker-compose -f docker-compose.staging.yml up -d chaos-proxy
    sleep 10
    
    log_success "Infrastructure services started"
}

# Start application services
start_application_services() {
    log_info "Starting application services..."
    
    # Start in dependency order
    docker-compose -f docker-compose.staging.yml up -d staging-quantitative-engine
    sleep 15
    
    docker-compose -f docker-compose.staging.yml up -d staging-trade-bot
    sleep 15
    
    docker-compose -f docker-compose.staging.yml up -d staging-fastapi-gateway
    sleep 10
    
    docker-compose -f docker-compose.staging.yml up -d staging-nextjs-app
    sleep 10
    
    docker-compose -f docker-compose.staging.yml up -d chaos-controller
    sleep 5
    
    log_success "Application services started"
}

# Verify all services are healthy
verify_services() {
    log_info "Verifying service health..."
    
    services=(
        "staging-database:5432"
        "staging-redis:6379" 
        "staging-quantitative-engine:8001"
        "staging-trade-bot:8002"
        "staging-fastapi-gateway:8000"
        "staging-nextjs-app:3000"
        "chaos-controller:9000"
    )
    
    for service_port in "${services[@]}"; do
        service=$(echo $service_port | cut -d':' -f1)
        port=$(echo $service_port | cut -d':' -f2)
        
        log_info "Checking $service..."
        
        max_attempts=12
        attempt=1
        
        while [ $attempt -le $max_attempts ]; do
            if docker-compose -f docker-compose.staging.yml ps $service | grep -q "Up"; then
                if nc -z localhost $port 2>/dev/null; then
                    log_success "$service is healthy"
                    break
                fi
            fi
            
            log_info "$service not ready yet, waiting... (attempt $attempt/$max_attempts)"
            sleep 10
            ((attempt++))
        done
        
        if [ $attempt -gt $max_attempts ]; then
            log_error "$service failed health check"
            show_service_logs $service
            exit 1
        fi
    done
    
    log_success "All services are healthy"
}

# Show service logs for debugging
show_service_logs() {
    local service=$1
    log_warning "Showing logs for $service:"
    docker-compose -f docker-compose.staging.yml logs --tail=20 $service
}

# Test basic functionality
test_basic_functionality() {
    log_info "Testing basic functionality..."
    
    # Test database connectivity
    log_info "Testing database connectivity..."
    if docker-compose -f docker-compose.staging.yml exec -T staging-database psql -U xorj_staging_user -d xorj_staging -c "SELECT 1;" > /dev/null; then
        log_success "Database connectivity test passed"
    else
        log_error "Database connectivity test failed"
        exit 1
    fi
    
    # Test API endpoints
    endpoints=(
        "http://localhost:8001/health:Quantitative Engine"
        "http://localhost:8002/health:Trade Bot"
        "http://localhost:8000/health:FastAPI Gateway"
        "http://localhost:3001/api/system/status:Next.js App"
        "http://localhost:9000/health:Chaos Controller"
    )
    
    for endpoint_name in "${endpoints[@]}"; do
        endpoint=$(echo $endpoint_name | cut -d':' -f1)
        name=$(echo $endpoint_name | cut -d':' -f2-)
        
        log_info "Testing $name endpoint..."
        
        if curl -sf "$endpoint" > /dev/null; then
            log_success "$name endpoint test passed"
        else
            log_error "$name endpoint test failed"
            exit 1
        fi
    done
    
    log_success "Basic functionality tests passed"
}

# Setup chaos testing
setup_chaos_testing() {
    log_info "Setting up chaos testing environment..."
    
    # Initialize Toxiproxy proxies
    log_info "Configuring network proxies for chaos testing..."
    
    # Wait for Toxiproxy to be ready
    max_attempts=10
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sf http://localhost:8474/proxies > /dev/null 2>&1; then
            log_success "Toxiproxy is ready"
            break
        fi
        
        log_info "Waiting for Toxiproxy to be ready... (attempt $attempt/$max_attempts)"
        sleep 5
        ((attempt++))
    done
    
    if [ $attempt -gt $max_attempts ]; then
        log_error "Toxiproxy failed to start"
        exit 1
    fi
    
    log_success "Chaos testing environment is ready"
}

# Display deployment summary
display_summary() {
    log_success "🎉 XORJ Staging Environment Deployed Successfully!"
    echo
    echo "====================================="
    echo "       STAGING SERVICES SUMMARY      "
    echo "====================================="
    echo
    echo "🔗 Service URLs:"
    echo "   📊 Next.js App:          http://localhost:3001"
    echo "   🚪 FastAPI Gateway:      http://localhost:8000"
    echo "   🧠 Quantitative Engine:  http://localhost:8001"
    echo "   🤖 Trade Bot:           http://localhost:8002" 
    echo "   🔥 Chaos Controller:    http://localhost:9000"
    echo
    echo "🗄️ Infrastructure:"
    echo "   🐘 PostgreSQL:          localhost:5433"
    echo "   📦 Redis:               localhost:6380"
    echo "   🎭 Chaos Proxy:         localhost:8474"
    echo
    echo "🧪 Chaos Testing:"
    echo "   ⚡ RPC Failures:        curl -X POST localhost:9000/chaos/rpc-failure"
    echo "   🗃️ DB Failures:         curl -X POST localhost:9000/chaos/db-failure"
    echo "   ⛓️ OnChain Failures:    curl -X POST localhost:9000/chaos/onchain-failure"
    echo "   🔥 Full Chaos Suite:    curl -X POST localhost:9000/chaos/full-suite"
    echo
    echo "📊 Monitoring:"
    echo "   📈 Test Results:        curl localhost:9000/results"
    echo "   🩺 System Health:       docker-compose -f docker-compose.staging.yml logs"
    echo
    echo "🛑 To stop staging environment:"
    echo "   docker-compose -f docker-compose.staging.yml down -v"
    echo
    echo "🎯 Next Steps:"
    echo "   1. Run chaos tests to validate resilience"
    echo "   2. Monitor system behavior under failure conditions"
    echo "   3. Verify graceful failure handling and recovery"
    echo "   4. Only approve production deployment after all chaos tests pass"
    echo
    log_warning "⚠️  IMPORTANT: This is a staging environment with real infrastructure."
    log_warning "   Production deployment is NOT APPROVED until chaos testing validates resilience."
    echo
}

# Cleanup function
cleanup_on_error() {
    log_error "Deployment failed. Cleaning up..."
    docker-compose -f docker-compose.staging.yml down -v || true
    exit 1
}

# Set trap for cleanup on error
trap cleanup_on_error ERR

# Main deployment process
main() {
    log_info "🚀 Starting XORJ Staging Environment Deployment"
    echo "==============================================="
    
    check_prerequisites
    load_environment
    create_directories
    build_images
    start_infrastructure
    start_application_services
    verify_services
    test_basic_functionality
    setup_chaos_testing
    display_summary
}

# Run main function
main "$@"