-- Real-time Database Monitoring Queries for Load Testing
-- Run these queries during the 5-minute load test to profile performance

-- 1. ACTIVE CONNECTIONS MONITORING
-- Shows current active connections and their states
SELECT 
    count(*) as total_connections,
    count(case when state = 'active' then 1 end) as active_connections,
    count(case when state = 'idle' then 1 end) as idle_connections,
    count(case when state = 'idle in transaction' then 1 end) as idle_in_transaction,
    count(case when state = 'idle in transaction (aborted)' then 1 end) as idle_aborted,
    max(extract(epoch from now() - query_start)) as longest_running_query_seconds
FROM pg_stat_activity 
WHERE datname = 'xorj_production_localhost';

-- 2. CONNECTION DETAILS BY APPLICATION
-- Shows which applications are using connections
SELECT 
    application_name,
    count(*) as connections,
    count(case when state = 'active' then 1 end) as active,
    count(case when state = 'idle' then 1 end) as idle
FROM pg_stat_activity 
WHERE datname = 'xorj_production_localhost' AND pid != pg_backend_pid()
GROUP BY application_name
ORDER BY connections DESC;

-- 3. SLOW QUERIES FROM pg_stat_statements
-- Shows the slowest queries during the load test
SELECT 
    left(query, 100) as query_snippet,
    calls,
    total_exec_time,
    mean_exec_time,
    max_exec_time,
    rows
FROM pg_stat_statements 
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = 'xorj_production_localhost')
ORDER BY mean_exec_time DESC 
LIMIT 10;

-- 4. MOST FREQUENTLY CALLED QUERIES
-- Shows which queries are being called most often
SELECT 
    left(query, 100) as query_snippet,
    calls,
    total_exec_time,
    mean_exec_time,
    (total_exec_time/calls) as avg_time_per_call
FROM pg_stat_statements 
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = 'xorj_production_localhost')
ORDER BY calls DESC 
LIMIT 10;

-- 5. LOCK MONITORING
-- Shows any locks that might be causing contention
SELECT 
    l.locktype,
    l.database,
    l.relation::regclass,
    l.mode,
    l.granted,
    a.usename,
    a.query,
    a.query_start,
    age(now(), a.query_start) AS "age"
FROM pg_locks l
LEFT JOIN pg_stat_activity a ON l.pid = a.pid
WHERE l.database = (SELECT oid FROM pg_database WHERE datname = 'xorj_production_localhost')
ORDER BY a.query_start;

-- 6. TABLE ACCESS STATISTICS
-- Shows which tables are being accessed most during load test
SELECT 
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch,
    n_tup_ins,
    n_tup_upd,
    n_tup_del
FROM pg_stat_user_tables
ORDER BY (seq_tup_read + idx_tup_fetch) DESC;

-- 7. INDEX USAGE STATISTICS
-- Shows index usage patterns during load test
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan > 0
ORDER BY idx_scan DESC;