/**
 * XORJ Chaos Engineering Controller
 * Orchestrates failure injection and validates system resilience
 */

const express = require('express');
const { Pool } = require('pg');
const axios = require('axios');
const Toxiproxy = require('toxiproxy-node-client');
const winston = require('winston');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Initialize logger
const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: '/app/results/chaos-controller.log' })
    ]
});

// Initialize database connection
const db = new Pool({
    host: process.env.STAGING_DB_HOST,
    port: process.env.STAGING_DB_PORT,
    user: process.env.STAGING_DB_USER,
    password: process.env.STAGING_DB_PASSWORD,
    database: process.env.STAGING_DB_NAME,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000
});

// Initialize Toxiproxy client
const toxiproxy = new Toxiproxy(process.env.TOXIPROXY_URL);

// Service URLs
const services = {
    quantEngine: 'http://staging-quantitative-engine:8001',
    tradeBot: 'http://staging-trade-bot:8002',
    gateway: 'http://staging-fastapi-gateway:8000',
    app: 'http://staging-nextjs-app:3000'
};

class ChaosController {
    constructor() {
        this.app = express();
        this.app.use(express.json());
        this.testResults = [];
        this.setupRoutes();
        this.setupCronJobs();
    }

    setupRoutes() {
        // Health check
        this.app.get('/health', (req, res) => {
            res.json({ status: 'healthy', timestamp: new Date().toISOString() });
        });

        // Get test results
        this.app.get('/results', (req, res) => {
            res.json({ results: this.testResults });
        });

        // Manually trigger specific chaos tests
        this.app.post('/chaos/rpc-failure', async (req, res) => {
            const result = await this.runRPCFailureTest();
            res.json(result);
        });

        this.app.post('/chaos/db-failure', async (req, res) => {
            const result = await this.runDBFailureTest();
            res.json(result);
        });

        this.app.post('/chaos/onchain-failure', async (req, res) => {
            const result = await this.runOnchainFailureTest();
            res.json(result);
        });

        this.app.post('/chaos/full-suite', async (req, res) => {
            const result = await this.runFullChaosSuite();
            res.json(result);
        });

        // Emergency recovery
        this.app.post('/recovery/restore', async (req, res) => {
            const result = await this.restoreAllServices();
            res.json(result);
        });
    }

    setupCronJobs() {
        // Run chaos tests every hour
        cron.schedule('0 * * * *', async () => {
            logger.info('🔥 Starting scheduled chaos test cycle');
            await this.runFullChaosSuite();
        });

        // Health monitoring every 5 minutes
        cron.schedule('*/5 * * * *', async () => {
            await this.monitorSystemHealth();
        });
    }

    async logTestResult(testType, description, status, data = {}) {
        const testResult = {
            id: uuidv4(),
            test_type: testType,
            test_description: description,
            status: status,
            failure_injected_at: data.failureTime || null,
            recovery_detected_at: data.recoveryTime || null,
            recovery_time_ms: data.recoveryTimeMs || null,
            expected_behavior: data.expectedBehavior || null,
            actual_behavior: data.actualBehavior || null,
            assertions_passed: data.assertionsPassed || 0,
            assertions_failed: data.assertionsFailed || 0,
            test_data: JSON.stringify(data),
            error_logs: data.errorLogs || null,
            created_at: new Date(),
            updated_at: new Date()
        };

        try {
            const query = `
                INSERT INTO chaos_test_results (
                    test_type, test_description, status, failure_injected_at,
                    recovery_detected_at, recovery_time_ms, expected_behavior,
                    actual_behavior, assertions_passed, assertions_failed,
                    test_data, error_logs, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                RETURNING id
            `;

            const values = [
                testResult.test_type, testResult.test_description, testResult.status,
                testResult.failure_injected_at, testResult.recovery_detected_at,
                testResult.recovery_time_ms, testResult.expected_behavior,
                testResult.actual_behavior, testResult.assertions_passed,
                testResult.assertions_failed, testResult.test_data,
                testResult.error_logs, testResult.created_at, testResult.updated_at
            ];

            const result = await db.query(query, values);
            testResult.id = result.rows[0].id;
            
            this.testResults.push(testResult);
            logger.info(`✅ Test result logged: ${testType} - ${status}`, { testId: testResult.id });
            
            return testResult;
        } catch (error) {
            logger.error('❌ Failed to log test result:', error);
            return testResult;
        }
    }

    async runRPCFailureTest() {
        logger.info('🔥 Starting RPC Failure Test');
        const startTime = Date.now();

        try {
            // Step 1: Verify system is healthy
            const healthBefore = await this.checkSystemHealth();
            logger.info('📊 System health before RPC failure:', healthBefore);

            // Step 2: Inject RPC failure via Toxiproxy
            logger.info('💥 Injecting RPC failures...');
            await toxiproxy.get('helius_rpc').addToxic('latency_downstream', 'latency', {
                latency: 10000,  // 10 second delay
                jitter: 2000     // ±2 second jitter
            });

            await toxiproxy.get('helius_rpc').addToxic('timeout_downstream', 'timeout', {
                timeout: 5000    // 5 second timeout
            });

            const failureTime = new Date();

            // Step 3: Trigger a trading cycle that should encounter failures
            logger.info('🤖 Triggering trade execution that will encounter RPC failures...');
            
            let tradeResponse, tradeError;
            try {
                tradeResponse = await axios.post(`${services.gateway}/api/execute-trade`, {
                    userId: 'staging-user-1',
                    amount: 100,
                    targetTrader: 'test-trader-wallet'
                }, { timeout: 30000 });
            } catch (error) {
                tradeError = error;
                logger.info('⚠️ Trade request failed as expected due to RPC issues:', error.message);
            }

            // Step 4: Wait and monitor for recovery
            logger.info('⏳ Waiting for system to handle RPC failures...');
            await this.sleep(15000); // 15 second observation period

            // Step 5: Remove RPC failures
            logger.info('🔧 Removing RPC failures...');
            await toxiproxy.get('helius_rpc').removeToxic('latency_downstream');
            await toxiproxy.get('helius_rpc').removeToxic('timeout_downstream');

            // Step 6: Wait for recovery
            logger.info('⏳ Waiting for system recovery...');
            await this.sleep(10000);

            const recoveryTime = new Date();

            // Step 7: Verify system recovery
            const healthAfter = await this.checkSystemHealth();
            logger.info('📊 System health after recovery:', healthAfter);

            // Step 8: Verify no duplicate trades were created
            const duplicateTrades = await this.checkForDuplicateTrades('staging-user-1', failureTime);

            // Step 9: Assess results
            const assertions = {
                passed: 0,
                failed: 0,
                details: []
            };

            // Assertion 1: System should handle RPC failures gracefully
            if (tradeError && tradeError.message.includes('timeout')) {
                assertions.passed++;
                assertions.details.push('✅ System correctly failed trade due to RPC timeout');
            } else {
                assertions.failed++;
                assertions.details.push('❌ System did not handle RPC failure properly');
            }

            // Assertion 2: No duplicate trades should be created
            if (duplicateTrades.length === 0) {
                assertions.passed++;
                assertions.details.push('✅ No duplicate trades created during RPC failure');
            } else {
                assertions.failed++;
                assertions.details.push(`❌ Found ${duplicateTrades.length} duplicate trades`);
            }

            // Assertion 3: System should recover after RPC restoration
            const finalHealthCheck = await axios.get(`${services.gateway}/health`, { timeout: 5000 });
            if (finalHealthCheck.status === 200) {
                assertions.passed++;
                assertions.details.push('✅ System recovered successfully after RPC restoration');
            } else {
                assertions.failed++;
                assertions.details.push('❌ System failed to recover after RPC restoration');
            }

            const testStatus = assertions.failed === 0 ? 'PASSED' : 'FAILED';
            const recoveryTimeMs = recoveryTime.getTime() - failureTime.getTime();

            const result = await this.logTestResult('RPC_FAILURE', 'Network RPC failure injection and recovery test', testStatus, {
                failureTime,
                recoveryTime,
                recoveryTimeMs,
                expectedBehavior: 'System should gracefully handle RPC failures, avoid duplicates, and recover',
                actualBehavior: assertions.details.join('; '),
                assertionsPassed: assertions.passed,
                assertionsFailed: assertions.failed,
                healthBefore,
                healthAfter,
                duplicateTrades: duplicateTrades.length
            });

            logger.info(`🎯 RPC Failure Test completed: ${testStatus}`, {
                assertionsPassed: assertions.passed,
                assertionsFailed: assertions.failed,
                recoveryTimeMs
            });

            return result;

        } catch (error) {
            logger.error('💥 RPC Failure Test encountered error:', error);
            
            // Ensure cleanup
            try {
                await toxiproxy.get('helius_rpc').removeToxic('latency_downstream');
                await toxiproxy.get('helius_rpc').removeToxic('timeout_downstream');
            } catch (cleanupError) {
                logger.error('Failed to cleanup RPC toxics:', cleanupError);
            }

            return await this.logTestResult('RPC_FAILURE', 'Network RPC failure test - ERROR', 'FAILED', {
                errorLogs: error.message,
                assertionsFailed: 1
            });
        }
    }

    async runDBFailureTest() {
        logger.info('🔥 Starting Database Failure Test');

        try {
            // Step 1: Start a trade execution that will be interrupted
            logger.info('🤖 Starting trade execution...');
            
            const tradePromise = axios.post(`${services.gateway}/api/execute-trade`, {
                userId: 'staging-user-2',
                amount: 200,
                targetTrader: 'test-trader-wallet-2'
            });

            // Step 2: Wait briefly then kill database connection
            await this.sleep(2000);
            logger.info('💥 Killing database connections...');
            
            const failureTime = new Date();
            
            // Terminate all connections to the database
            await db.query(`
                SELECT pg_terminate_backend(pg_stat_activity.pid)
                FROM pg_stat_activity
                WHERE pg_stat_activity.datname = $1
                  AND pid <> pg_backend_pid()
            `, [process.env.STAGING_DB_NAME]);

            // Step 3: Wait for the trade to encounter database issues
            await this.sleep(10000);

            // Step 4: Allow database to recover
            logger.info('🔧 Allowing database to recover...');
            await this.sleep(5000);
            
            const recoveryTime = new Date();

            // Step 5: Check for orphaned/inconsistent state
            const orphanedTrades = await this.checkForOrphanedTrades();
            const inconsistentStates = await this.checkForInconsistentStates();

            // Step 6: Verify system can handle new requests
            let newTradeSuccess = false;
            try {
                const newTrade = await axios.post(`${services.gateway}/api/execute-trade`, {
                    userId: 'staging-user-1',
                    amount: 50,
                    targetTrader: 'recovery-test-trader'
                }, { timeout: 20000 });
                newTradeSuccess = newTrade.status === 200;
            } catch (error) {
                logger.warn('New trade after DB recovery failed:', error.message);
            }

            // Assessment
            const assertions = {
                passed: 0,
                failed: 0,
                details: []
            };

            if (orphanedTrades.length === 0) {
                assertions.passed++;
                assertions.details.push('✅ No orphaned trades found after DB failure');
            } else {
                assertions.failed++;
                assertions.details.push(`❌ Found ${orphanedTrades.length} orphaned trades`);
            }

            if (inconsistentStates.length === 0) {
                assertions.passed++;
                assertions.details.push('✅ No inconsistent states found');
            } else {
                assertions.failed++;
                assertions.details.push(`❌ Found ${inconsistentStates.length} inconsistent states`);
            }

            if (newTradeSuccess) {
                assertions.passed++;
                assertions.details.push('✅ System recovered and can process new trades');
            } else {
                assertions.failed++;
                assertions.details.push('❌ System failed to recover for new trades');
            }

            const testStatus = assertions.failed === 0 ? 'PASSED' : 'FAILED';
            const recoveryTimeMs = recoveryTime.getTime() - failureTime.getTime();

            const result = await this.logTestResult('DB_FAILURE', 'Database connection failure during trade execution', testStatus, {
                failureTime,
                recoveryTime,
                recoveryTimeMs,
                expectedBehavior: 'System should handle DB failures gracefully, maintain consistency, and recover',
                actualBehavior: assertions.details.join('; '),
                assertionsPassed: assertions.passed,
                assertionsFailed: assertions.failed,
                orphanedTrades: orphanedTrades.length,
                inconsistentStates: inconsistentStates.length
            });

            logger.info(`🎯 Database Failure Test completed: ${testStatus}`);
            return result;

        } catch (error) {
            logger.error('💥 Database Failure Test encountered error:', error);
            return await this.logTestResult('DB_FAILURE', 'Database failure test - ERROR', 'FAILED', {
                errorLogs: error.message,
                assertionsFailed: 1
            });
        }
    }

    async runOnchainFailureTest() {
        logger.info('🔥 Starting On-Chain Failure Test');
        // Implementation for testing on-chain transaction failures
        // This will simulate front-running and slippage failures
        
        // TODO: Implement sophisticated on-chain failure injection
        return await this.logTestResult('ONCHAIN_FAILURE', 'On-chain transaction failure test', 'PENDING', {
            expectedBehavior: 'System should handle on-chain failures and retry appropriately'
        });
    }

    async runFullChaosSuite() {
        logger.info('🔥🔥🔥 Starting Full Chaos Test Suite');
        
        const suiteResults = {
            rpc: await this.runRPCFailureTest(),
            database: await this.runDBFailureTest(),
            onchain: await this.runOnchainFailureTest()
        };

        const overallStatus = Object.values(suiteResults).every(r => r.status === 'PASSED') ? 'PASSED' : 'FAILED';

        return await this.logTestResult('FULL_CHAOS_SUITE', 'Complete chaos engineering test suite', overallStatus, {
            suiteResults,
            expectedBehavior: 'All chaos tests should pass',
            actualBehavior: `RPC: ${suiteResults.rpc.status}, DB: ${suiteResults.database.status}, OnChain: ${suiteResults.onchain.status}`
        });
    }

    async checkSystemHealth() {
        const health = {};
        
        for (const [name, url] of Object.entries(services)) {
            try {
                const response = await axios.get(`${url}/health`, { timeout: 5000 });
                health[name] = { status: 'healthy', responseTime: response.headers['x-response-time'] };
            } catch (error) {
                health[name] = { status: 'unhealthy', error: error.message };
            }
        }

        return health;
    }

    async checkForDuplicateTrades(userId, since) {
        const query = `
            SELECT id, created_at, amount, from_token, to_token
            FROM trades 
            WHERE user_id = $1 AND created_at > $2
            GROUP BY amount, from_token, to_token
            HAVING COUNT(*) > 1
        `;
        
        const result = await db.query(query, [userId, since]);
        return result.rows;
    }

    async checkForOrphanedTrades() {
        const query = `
            SELECT t.id, t.status, t.created_at
            FROM trades t
            LEFT JOIN execution_jobs ej ON t.execution_job_id = ej.id
            WHERE t.status = 'PENDING' 
              AND t.created_at < NOW() - INTERVAL '10 minutes'
              AND (ej.status IS NULL OR ej.status NOT IN ('RUNNING', 'PENDING'))
        `;
        
        const result = await db.query(query);
        return result.rows;
    }

    async checkForInconsistentStates() {
        const query = `
            SELECT ej.id, ej.status as job_status, COUNT(t.id) as trade_count
            FROM execution_jobs ej
            LEFT JOIN trades t ON ej.id = t.execution_job_id
            WHERE ej.status = 'COMPLETED'
            GROUP BY ej.id, ej.status
            HAVING COUNT(t.id) = 0 OR COUNT(CASE WHEN t.status != 'CONFIRMED' THEN 1 END) > 0
        `;
        
        const result = await db.query(query);
        return result.rows;
    }

    async monitorSystemHealth() {
        const health = await this.checkSystemHealth();
        
        for (const [service, status] of Object.entries(health)) {
            await db.query(`
                INSERT INTO system_health (service_name, status, response_time_ms, created_at)
                VALUES ($1, $2, $3, NOW())
            `, [service, status.status, status.responseTime || null]);
        }
    }

    async restoreAllServices() {
        logger.info('🔧 Initiating emergency service restoration...');
        
        try {
            // Remove all Toxiproxy toxics
            await toxiproxy.get('helius_rpc').removeAllToxics();
            await toxiproxy.get('price_api').removeAllToxics();
            
            // Wait for services to stabilize
            await this.sleep(10000);
            
            const health = await this.checkSystemHealth();
            
            return {
                status: 'completed',
                timestamp: new Date(),
                servicesRestored: Object.keys(health),
                healthStatus: health
            };
            
        } catch (error) {
            logger.error('Failed to restore services:', error);
            return {
                status: 'failed',
                error: error.message,
                timestamp: new Date()
            };
        }
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    start() {
        const port = process.env.PORT || 9000;
        this.app.listen(port, () => {
            logger.info(`🚀 XORJ Chaos Controller started on port ${port}`);
            logger.info('🔥 Ready to inject chaos and validate resilience');
        });
    }
}

// Start the chaos controller
if (require.main === module) {
    const controller = new ChaosController();
    controller.start();
}

module.exports = ChaosController;