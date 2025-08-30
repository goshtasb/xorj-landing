const { Pool } = require('pg');

// Test database connection
async function testDatabaseConnection() {
  const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'xorj_development',
    user: 'aflatoongoshtasb',
    password: '',
    ssl: false
  });

  try {
    console.log('🔍 Testing database connection...');
    
    // Test basic connection
    const result = await pool.query('SELECT 1 as test');
    console.log('✅ Basic connection successful:', result.rows[0]);
    
    // Test schema tables exist
    const tableCheck = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    
    console.log('✅ Database tables found:', tableCheck.rows.map(r => r.table_name));
    
    // Test a simple insert/select to scoring_runs
    const runId = await pool.query(`
      INSERT INTO scoring_runs (status) 
      VALUES ('PENDING') 
      RETURNING id, status, created_at
    `);
    
    console.log('✅ Insert test successful:', runId.rows[0]);
    
    // Test query performance
    const start = Date.now();
    await pool.query('SELECT COUNT(*) FROM scoring_runs');
    const duration = Date.now() - start;
    
    console.log(`✅ Query performance: ${duration}ms`);
    
    await pool.end();
    console.log('🎉 All database tests passed!');
    
  } catch (error) {
    console.error('❌ Database test failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

testDatabaseConnection();
