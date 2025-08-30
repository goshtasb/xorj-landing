#!/bin/bash

# Real-time monitoring script for 5-minute load test
# Collects database connection and performance data during the test

echo "🔍 Starting Real-time Database Monitoring"
echo "========================================"
echo "Monitor will run for 6 minutes (load test duration + buffer)"
echo "Data will be collected every 10 seconds"
echo ""

LOG_FILE="monitoring/load-test-$(date +%Y%m%d-%H%M%S).log"
echo "📝 Logging to: $LOG_FILE"
echo ""

# Function to run monitoring queries
monitor_database() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo "=== MONITOR DATA: $timestamp ===" >> $LOG_FILE
    
    # 1. Connection counts
    echo "--- CONNECTION COUNTS ---" >> $LOG_FILE
    psql -h localhost -p 5432 -d xorj_production_localhost -t -c "
        SELECT 
            count(*) as total_connections,
            count(case when state = 'active' then 1 end) as active_connections,
            count(case when state = 'idle' then 1 end) as idle_connections,
            count(case when state = 'idle in transaction' then 1 end) as idle_in_transaction,
            max(extract(epoch from now() - query_start)) as longest_running_query_seconds
        FROM pg_stat_activity 
        WHERE datname = 'xorj_production_localhost';
    " >> $LOG_FILE 2>&1
    
    # 2. Slow queries from last 10 seconds
    echo "--- TOP 5 SLOWEST QUERIES (last period) ---" >> $LOG_FILE
    psql -h localhost -p 5432 -d xorj_production_localhost -t -c "
        SELECT 
            left(query, 60) as query_snippet,
            calls,
            total_exec_time,
            mean_exec_time,
            max_exec_time
        FROM pg_stat_statements 
        WHERE dbid = (SELECT oid FROM pg_database WHERE datname = 'xorj_production_localhost')
        ORDER BY mean_exec_time DESC 
        LIMIT 5;
    " >> $LOG_FILE 2>&1
    
    # 3. Lock information
    echo "--- ACTIVE LOCKS ---" >> $LOG_FILE
    psql -h localhost -p 5432 -d xorj_production_localhost -t -c "
        SELECT count(*) as lock_count
        FROM pg_locks l
        WHERE l.database = (SELECT oid FROM pg_database WHERE datname = 'xorj_production_localhost');
    " >> $LOG_FILE 2>&1
    
    echo "" >> $LOG_FILE
    
    # Console output
    echo "[$timestamp] Monitoring data collected (connections, queries, locks)"
}

# Reset pg_stat_statements for clean measurement
echo "🔄 Resetting pg_stat_statements..."
psql -h localhost -p 5432 -d xorj_production_localhost -c "SELECT pg_stat_statements_reset();" > /dev/null 2>&1

# Start monitoring loop
echo "⏱️  Starting monitoring loop (6 minutes)..."
MONITOR_END=$(date -d '+6 minutes' +%s)

while [ $(date +%s) -lt $MONITOR_END ]; do
    monitor_database
    sleep 10
done

echo ""
echo "✅ Monitoring complete. Log file: $LOG_FILE"
echo "🔍 Final database state:"

# Final comprehensive report
echo "=== FINAL REPORT: $(date '+%Y-%m-%d %H:%M:%S') ===" >> $LOG_FILE
echo "--- FINAL CONNECTION STATE ---" >> $LOG_FILE
psql -h localhost -p 5432 -d xorj_production_localhost -f monitoring/database-monitor.sql >> $LOG_FILE 2>&1

echo "📊 Check the log file for complete monitoring data during load test"