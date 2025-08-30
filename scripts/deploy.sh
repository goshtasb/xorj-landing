#!/bin/bash

# XORJ V1 Deployment Script
# Supports local staging simulation and cloud deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[DEPLOY]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "XORJ V1 Deployment Script"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --env staging          Deploy to staging environment"
    echo "  --env production       Deploy to production environment"
    echo "  --local-sim           Run local staging simulation"
    echo "  --help                Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --env staging       # Deploy to cloud staging"
    echo "  $0 --local-sim         # Run local staging simulation"
    echo "  $0 --env production    # Deploy to production"
    echo ""
}

# Function to deploy local staging simulation
deploy_local_sim() {
    print_status "Starting XORJ V1 Local Staging Simulation"
    echo "======================================"
    
    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi
    
    print_success "Docker and Docker Compose are available"
    
    # Set staging environment variables with defaults
    export STAGING_DB_PASSWORD=${STAGING_DB_PASSWORD:-"staging_secure_password_2024"}
    export STAGING_JWT_SECRET=${STAGING_JWT_SECRET:-"staging_jwt_secret_2024_secure_random_key"}
    export STAGING_NEXTAUTH_SECRET=${STAGING_NEXTAUTH_SECRET:-"staging_nextauth_secret_2024"}
    export GRAFANA_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD:-"staging_grafana_admin_2024"}
    
    print_status "Environment variables configured"
    
    # Create necessary directories
    mkdir -p ./monitoring/grafana/{provisioning,dashboards}
    mkdir -p ./monitoring/prometheus
    mkdir -p ./chaos-testing/results
    
    print_status "Created necessary directories"
    
    # Stop any existing services
    print_status "Stopping any existing staging services..."
    docker-compose -f docker-compose.staging.yml down --remove-orphans 2>/dev/null || true
    
    # Clean up old containers if they exist
    print_status "Cleaning up old containers..."
    docker container rm -f xorj-staging-db xorj-staging-redis xorj-staging-quant-engine xorj-staging-trade-bot xorj-staging-app xorj-staging-prometheus xorj-staging-grafana xorj-chaos-proxy xorj-chaos-controller 2>/dev/null || true
    
    # Pull latest images
    print_status "Pulling latest Docker images..."
    docker-compose -f docker-compose.staging.yml pull postgres redis prometheus grafana
    
    # Build and start services
    print_status "Building and starting all staging services..."
    docker-compose -f docker-compose.staging.yml up -d --build
    
    print_status "Waiting for services to be healthy..."
    
    # Wait for services to be healthy
    services=("postgres" "redis" "quantitative-engine" "trade-execution-bot" "nextjs-app" "prometheus" "grafana")
    max_wait=300  # 5 minutes
    wait_time=0
    
    for service in "${services[@]}"; do
        print_status "Waiting for $service..."
        
        while [ $wait_time -lt $max_wait ]; do
            if docker-compose -f docker-compose.staging.yml ps | grep -q "${service}.*healthy\|${service}.*Up"; then
                print_success "$service is ready"
                break
            fi
            
            if [ $wait_time -ge $max_wait ]; then
                print_error "$service failed to become healthy within ${max_wait}s"
                print_status "Showing logs for $service:"
                docker-compose -f docker-compose.staging.yml logs --tail=20 $service
                exit 1
            fi
            
            sleep 5
            wait_time=$((wait_time + 5))
            echo -n "."
        done
        echo ""
        wait_time=0  # Reset for next service
    done
    
    print_success "All services are ready!"
    echo ""
    print_status "🎉 XORJ V1 LOCAL STAGING SIMULATION READY!"
    echo "=========================================="
    echo ""
    echo -e "${BLUE}📊 Service URLs:${NC}"
    echo "   Next.js App:          http://localhost:3001"
    echo "   FastAPI Gateway:      http://localhost:8000"
    echo "   Quantitative Engine:  http://localhost:8001" 
    echo "   Trade Execution Bot:  http://localhost:8002"
    echo "   Prometheus:           http://localhost:9090"
    echo "   Grafana:             http://localhost:3002"
    echo "   Database:            postgresql://localhost:5433/xorj_staging"
    echo "   Redis:               redis://localhost:6380"
    echo "   Chaos Proxy:         http://localhost:8474"
    echo ""
    echo -e "${BLUE}🔧 Available Commands:${NC}"
    echo "   View logs:      docker-compose -f docker-compose.staging.yml logs -f"
    echo "   Stop services:  docker-compose -f docker-compose.staging.yml down"
    echo "   Restart:        $0 --local-sim"
    echo ""
    echo -e "${GREEN}✅ Ready for Stage 2 Chaos Testing!${NC}"
}

# Function to deploy to cloud staging
deploy_staging() {
    print_status "Deploying to cloud staging environment"
    ./scripts/deploy-staging.sh
}

# Function to deploy to production
deploy_production() {
    print_status "Deploying to production environment"
    ./scripts/deploy-production.sh
}

# Main deployment logic
main() {
    if [ $# -eq 0 ]; then
        print_error "No arguments provided"
        show_usage
        exit 1
    fi
    
    case $1 in
        --help)
            show_usage
            exit 0
            ;;
        --local-sim)
            deploy_local_sim
            ;;
        --env)
            if [ $# -lt 2 ]; then
                print_error "Environment not specified"
                show_usage
                exit 1
            fi
            case $2 in
                staging)
                    deploy_staging
                    ;;
                production)
                    deploy_production
                    ;;
                *)
                    print_error "Unknown environment: $2"
                    show_usage
                    exit 1
                    ;;
            esac
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"