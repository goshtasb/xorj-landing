/**
 * Database Initialization Script
 * Sets up PostgreSQL database with XORJ bot state persistence schema
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { initializeDatabase, query, healthCheck, closeDatabase } from '../src/lib/database.js';

async function initializeXORJDatabase() {
  console.log('🚀 Starting XORJ Bot State Database Initialization...\n');

  try {
    // Initialize database connection
    console.log('📦 Connecting to database...');
    const db = initializeDatabase();
    
    // Health check
    console.log('🏥 Performing health check...');
    const health = await healthCheck();
    if (!health.healthy) {
      throw new Error(`Database health check failed: ${health.error}`);
    }
    console.log(`✅ Database healthy (latency: ${health.latency}ms)\n`);

    // Read schema file
    console.log('📄 Reading schema file...');
    const schemaPath = join(__dirname, 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');
    console.log('✅ Schema file loaded\n');

    // Execute schema
    console.log('🔨 Creating database schema...');
    await query(schema);
    console.log('✅ Database schema created successfully\n');

    // Verify tables were created
    console.log('🔍 Verifying table creation...');
    const tables = await query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    console.log('📋 Created tables:');
    tables.rows.forEach((row: any) => {
      console.log(`  ✓ ${row.table_name}`);
    });

    // Verify views were created
    const views = await query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    if (views.rows.length > 0) {
      console.log('\n📋 Created views:');
      views.rows.forEach((row: any) => {
        console.log(`  ✓ ${row.table_name}`);
      });
    }

    // Insert sample data for testing (optional)
    if (process.argv.includes('--sample-data')) {
      console.log('\n🎯 Inserting sample data for testing...');
      await insertSampleData();
      console.log('✅ Sample data inserted');
    }

    console.log('\n🎉 Database initialization completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Update your .env.local file with database credentials');
    console.log('   2. Restart your Next.js development server');
    console.log('   3. Test the bot endpoints to verify database integration');
    console.log('   4. Check database logs for any connection issues\n');

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

async function insertSampleData() {
  // Insert sample bot states
  await query(`
    INSERT INTO bot_states (user_id, enabled, configuration) 
    VALUES 
      ('test_user_1', true, '{"risk_profile": "balanced", "max_position": 1000}'::jsonb),
      ('test_user_2', false, '{"risk_profile": "conservative", "max_position": 500}'::jsonb)
    ON CONFLICT (user_id) DO NOTHING;
  `);

  // Insert sample user settings
  await query(`
    INSERT INTO user_settings (wallet_address, risk_profile, settings) 
    VALUES 
      ('11111111112111111111211111111121', 'Balanced', '{"maxDrawdownLimit": 15, "positionSizePercent": 5, "stopLossEnabled": true, "takeProfitEnabled": true}'::jsonb),
      ('22222222222222222222222222222222', 'Conservative', '{"maxDrawdownLimit": 10, "positionSizePercent": 3, "stopLossEnabled": true, "takeProfitEnabled": false}'::jsonb)
    ON CONFLICT (wallet_address) DO NOTHING;
  `);

  // Insert sample scoring run
  const scoringRun = await query(`
    INSERT INTO scoring_runs (status, started_at, completed_at) 
    VALUES ('COMPLETED', now() - interval '1 hour', now() - interval '30 minutes')
    RETURNING id;
  `);

  // Insert sample trader scores
  if (scoringRun.rows.length > 0) {
    const runId = scoringRun.rows[0].id;
    await query(`
      INSERT INTO trader_scores (run_id, wallet_address, xorj_trust_score, metrics) 
      VALUES 
        ($1, '11111111112111111111211111111121', 85.5, '{"total_trades": 150, "win_rate": 0.87, "avg_profit": 245.67}'::jsonb),
        ($1, '22222222222222222222222222222222', 92.3, '{"total_trades": 203, "win_rate": 0.91, "avg_profit": 189.23}'::jsonb),
        ($1, '33333333333333333333333333333333', 78.1, '{"total_trades": 98, "win_rate": 0.82, "avg_profit": 312.45}'::jsonb);
    `, [runId]);
  }
}

// Run if called directly
if (require.main === module) {
  initializeXORJDatabase();
}