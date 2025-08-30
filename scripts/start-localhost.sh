#!/bin/bash

# XORJ Localhost Environment Startup Script
# This starts a production-like environment on localhost for final testing

set -e

echo "🚀 STARTING XORJ LOCALHOST ENVIRONMENT"
echo "====================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check prerequisites
echo -e "${BLUE}📋 Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}❌ Docker Compose is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites satisfied${NC}"

# Stop any existing services
echo -e "${YELLOW}🛑 Stopping any existing localhost services...${NC}"
docker-compose -f docker-compose.localhost.yml down --remove-orphans 2>/dev/null || true

# Clean up old containers if they exist
echo -e "${YELLOW}🧹 Cleaning up old containers...${NC}"
docker container rm -f xorj-localhost-db xorj-localhost-redis xorj-localhost-quant-engine xorj-localhost-trade-bot xorj-localhost-gateway 2>/dev/null || true

# Clean up old volumes if requested
if [ "$1" = "--clean" ]; then
    echo -e "${YELLOW}🧹 Cleaning up old volumes (--clean flag detected)...${NC}"
    docker volume rm xorj-landing_localhost_db_data xorj-landing_localhost_redis_data 2>/dev/null || true
fi

# Start services
echo -e "${BLUE}🚀 Starting localhost backend services...${NC}"
docker-compose -f docker-compose.localhost.yml up -d

# Wait for services to be healthy
echo -e "${BLUE}⏳ Waiting for services to be healthy...${NC}"

services=("localhost-database" "localhost-redis" "localhost-quantitative-engine" "localhost-trade-bot" "localhost-fastapi-gateway")
max_wait=300  # 5 minutes
wait_time=0

for service in "${services[@]}"; do
    echo -e "${YELLOW}   Waiting for ${service}...${NC}"
    
    while [ $wait_time -lt $max_wait ]; do
        if docker-compose -f docker-compose.localhost.yml ps | grep -q "${service}.*healthy"; then
            echo -e "${GREEN}   ✅ ${service} is healthy${NC}"
            break
        fi
        
        if [ $wait_time -ge $max_wait ]; then
            echo -e "${RED}   ❌ ${service} failed to become healthy within ${max_wait}s${NC}"
            echo -e "${RED}   Showing logs:${NC}"
            docker-compose -f docker-compose.localhost.yml logs --tail=20 $service
            exit 1
        fi
        
        sleep 5
        wait_time=$((wait_time + 5))
        echo -n "."
    done
    echo ""
done

# Test service connectivity
echo -e "${BLUE}🔍 Testing service connectivity...${NC}"

# Test database
if psql "postgresql://xorj_localhost_user:localhost_password_2024@localhost:5434/xorj_localhost" -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${GREEN}   ✅ Database connection successful${NC}"
else
    echo -e "${RED}   ❌ Database connection failed${NC}"
    exit 1
fi

# Test Redis
if redis-cli -h localhost -p 6381 ping > /dev/null 2>&1; then
    echo -e "${GREEN}   ✅ Redis connection successful${NC}"
else
    echo -e "${RED}   ❌ Redis connection failed${NC}"
    exit 1
fi

# Test FastAPI Gateway
if curl -s http://localhost:8010/health > /dev/null 2>&1; then
    echo -e "${GREEN}   ✅ FastAPI Gateway responding${NC}"
else
    echo -e "${RED}   ❌ FastAPI Gateway not responding${NC}"
    exit 1
fi

# Test Quantitative Engine
if curl -s http://localhost:8011/health > /dev/null 2>&1; then
    echo -e "${GREEN}   ✅ Quantitative Engine responding${NC}"
else
    echo -e "${RED}   ❌ Quantitative Engine not responding${NC}"
    exit 1
fi

# Test Trade Bot
if curl -s http://localhost:8012/health > /dev/null 2>&1; then
    echo -e "${GREEN}   ✅ Trade Bot responding${NC}"
else
    echo -e "${RED}   ❌ Trade Bot not responding${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 LOCALHOST ENVIRONMENT READY!${NC}"
echo "=================================="
echo ""
echo -e "${BLUE}📊 Service URLs:${NC}"
echo "   FastAPI Gateway:      http://localhost:8010"
echo "   Quantitative Engine:  http://localhost:8011" 
echo "   Trade Execution Bot:  http://localhost:8012"
echo "   Database:             postgresql://localhost:5434/xorj_localhost"
echo "   Redis:                redis://localhost:6381"
echo ""
echo -e "${BLUE}🔧 Next Steps:${NC}"
echo "   1. Start Next.js app with localhost config:"
echo "      ${YELLOW}npm run dev:localhost${NC}"
echo ""
echo "   2. Run end-to-end test with live backend:"
echo "      ${YELLOW}npm run test:localhost${NC}"
echo ""
echo -e "${BLUE}📋 Available Commands:${NC}"
echo "   View logs:     ${YELLOW}docker-compose -f docker-compose.localhost.yml logs -f${NC}"
echo "   Stop services: ${YELLOW}docker-compose -f docker-compose.localhost.yml down${NC}"
echo "   Restart:       ${YELLOW}./scripts/start-localhost.sh${NC}"
echo "   Clean restart: ${YELLOW}./scripts/start-localhost.sh --clean${NC}"
echo ""
echo -e "${GREEN}✅ Ready for final testing before production deployment!${NC}"