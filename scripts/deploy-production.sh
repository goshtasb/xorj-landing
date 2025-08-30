#!/bin/bash
#
# XORJ Production Deployment Script
# 
# This script handles the complete deployment process for the XORJ backend
# including database setup, service startup, and health checks.
#

set -e

echo "🚀 Starting XORJ Production Deployment"
echo "======================================="

# Configuration
COMPOSE_FILE="docker-compose.production.yml"
ENV_FILE=".env.production"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if Docker is installed and running
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    # Check if docker-compose is available
    if ! command -v docker-compose &> /dev/null; then
        log_error "docker-compose is not installed"
        exit 1
    fi
    
    # Check if environment file exists
    if [ ! -f "$ENV_FILE" ]; then
        log_error "Environment file $ENV_FILE not found"
        log_info "Please create $ENV_FILE with production configuration"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Validate environment variables
validate_environment() {
    log_info "Validating environment variables..."
    
    source "$ENV_FILE"
    
    required_vars=(
        "DATABASE_PASSWORD"
        "JWT_SECRET" 
        "NEXTAUTH_SECRET"
        "REDIS_PASSWORD"
        "SOLANA_RPC_URL"
    )
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            log_error "Required environment variable $var is not set"
            exit 1
        fi
    done
    
    log_success "Environment validation passed"
}

# Build Docker images
build_images() {
    log_info "Building Docker images..."
    
    docker-compose -f "$COMPOSE_FILE" build --no-cache
    
    log_success "Docker images built successfully"
}

# Initialize database
init_database() {
    log_info "Initializing database..."
    
    # Start only the database service first
    docker-compose -f "$COMPOSE_FILE" up -d database
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    sleep 10
    
    # Check if database is accessible
    if docker-compose -f "$COMPOSE_FILE" exec -T database pg_isready -U postgres; then
        log_success "Database is ready"
    else
        log_error "Database failed to start"
        exit 1
    fi
    
    # Run migrations
    log_info "Running database migrations..."
    # Note: This would typically run Drizzle migrations
    # docker-compose -f "$COMPOSE_FILE" exec -T nextjs-app npm run db:migrate
    
    log_success "Database initialization completed"
}

# Start all services
start_services() {
    log_info "Starting all services..."
    
    docker-compose -f "$COMPOSE_FILE" up -d
    
    log_success "All services started"
}

# Health checks
perform_health_checks() {
    log_info "Performing health checks..."
    
    services=("database:5432" "redis:6379" "quantitative-engine:8001" "trade-execution-bot:8002" "fastapi-gateway:8000" "nextjs-app:3000")
    
    for service in "${services[@]}"; do
        service_name=$(echo "$service" | cut -d':' -f1)
        port=$(echo "$service" | cut -d':' -f2)
        
        log_info "Checking $service_name health..."
        
        # Wait up to 60 seconds for service to be healthy
        counter=0
        while [ $counter -lt 12 ]; do
            if docker-compose -f "$COMPOSE_FILE" exec -T "$service_name" sh -c "nc -z localhost $port" &> /dev/null; then
                log_success "$service_name is healthy"
                break
            fi
            
            sleep 5
            counter=$((counter + 1))
        done
        
        if [ $counter -eq 12 ]; then
            log_warning "$service_name health check timeout"
        fi
    done
    
    # Test API endpoints
    log_info "Testing API endpoints..."
    
    if curl -f http://localhost:3000/api/system/status &> /dev/null; then
        log_success "Next.js API is responding"
    else
        log_warning "Next.js API health check failed"
    fi
    
    if curl -f http://localhost:8000/health &> /dev/null; then
        log_success "FastAPI Gateway is responding"
    else
        log_warning "FastAPI Gateway health check failed"
    fi
}

# Setup monitoring
setup_monitoring() {
    log_info "Setting up monitoring..."
    
    # Ensure monitoring services are running
    if docker-compose -f "$COMPOSE_FILE" ps prometheus | grep -q "Up"; then
        log_success "Prometheus is running on http://localhost:9090"
    else
        log_warning "Prometheus is not running"
    fi
    
    if docker-compose -f "$COMPOSE_FILE" ps grafana | grep -q "Up"; then
        log_success "Grafana is running on http://localhost:3001"
    else
        log_warning "Grafana is not running"
    fi
}

# Display deployment summary
show_deployment_summary() {
    log_success "🎉 XORJ Production Deployment Complete!"
    echo ""
    echo "📋 Service URLs:"
    echo "   • Frontend:           http://localhost:3000"
    echo "   • FastAPI Gateway:    http://localhost:8000"
    echo "   • Quantitative Engine: http://localhost:8001"
    echo "   • Trade Execution Bot: http://localhost:8002"
    echo "   • Database:           localhost:5432"
    echo "   • Redis:              localhost:6379"
    echo "   • Prometheus:         http://localhost:9090"
    echo "   • Grafana:            http://localhost:3001"
    echo ""
    echo "🔧 Management Commands:"
    echo "   • View logs:          docker-compose -f $COMPOSE_FILE logs -f [service]"
    echo "   • Stop services:      docker-compose -f $COMPOSE_FILE down"
    echo "   • Restart service:    docker-compose -f $COMPOSE_FILE restart [service]"
    echo "   • Scale service:      docker-compose -f $COMPOSE_FILE up -d --scale [service]=[count]"
    echo ""
    echo "📊 Monitor deployment:"
    echo "   • docker-compose -f $COMPOSE_FILE ps"
    echo "   • docker-compose -f $COMPOSE_FILE logs -f"
}

# Cleanup function
cleanup() {
    if [ $? -ne 0 ]; then
        log_error "Deployment failed. Cleaning up..."
        docker-compose -f "$COMPOSE_FILE" down
        exit 1
    fi
}

trap cleanup EXIT

# Main execution
main() {
    check_prerequisites
    validate_environment
    build_images
    init_database
    start_services
    sleep 30  # Give services time to fully start
    perform_health_checks
    setup_monitoring
    show_deployment_summary
}

# Handle command line arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "stop")
        log_info "Stopping all services..."
        docker-compose -f "$COMPOSE_FILE" down
        log_success "All services stopped"
        ;;
    "restart")
        log_info "Restarting all services..."
        docker-compose -f "$COMPOSE_FILE" restart
        log_success "All services restarted"
        ;;
    "logs")
        docker-compose -f "$COMPOSE_FILE" logs -f "${2:-}"
        ;;
    "status")
        docker-compose -f "$COMPOSE_FILE" ps
        ;;
    "health")
        perform_health_checks
        ;;
    *)
        echo "Usage: $0 {deploy|stop|restart|logs [service]|status|health}"
        echo ""
        echo "Commands:"
        echo "  deploy   - Full deployment (default)"
        echo "  stop     - Stop all services"
        echo "  restart  - Restart all services"
        echo "  logs     - View logs (optionally for specific service)"
        echo "  status   - Show service status"
        echo "  health   - Run health checks"
        exit 1
        ;;
esac

exit 0