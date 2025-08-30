# XORJ Bot State Persistence & Reliability

## Overview

This implementation addresses the critical PRD requirement to move from in-memory bot state storage to persistent PostgreSQL database storage. This ensures fault-tolerance, prevents duplicate trades, and enables horizontal scaling.

## Architecture

### Database Schema

The system uses 6 core tables to track all bot operations:

1. **`scoring_runs`** - Tracks Quantitative Engine analysis jobs
2. **`trader_scores`** - Stores historical trader analysis results
3. **`execution_jobs`** - Tracks Trade Execution Bot runs
4. **`trades`** - Immutable log preventing duplicate trades (CRITICAL)
5. **`bot_states`** - User bot enable/disable state (replaces in-memory)
6. **`user_settings`** - User risk profiles and settings (replaces in-memory)

### Key Features

- **UUID Primary Keys** - Better for distributed systems
- **Immutable Trades Table** - Prevents duplicate trade execution
- **JSONB Storage** - Flexible configuration and metrics storage
- **Foreign Key Relationships** - Data integrity between related records
- **Automatic Timestamps** - Full audit trail
- **Database Views** - Optimized queries for common operations

## Implementation Files

### Core Database Layer
- `src/lib/database.ts` - PostgreSQL connection management
- `src/types/database.ts` - TypeScript interfaces and types
- `src/lib/botStateService.ts` - Service layer for all database operations

### Schema and Setup
- `database/schema.sql` - Complete PostgreSQL schema
- `database/init.ts` - Database initialization script
- `.env.example` - Environment configuration template

### Updated API Endpoints
- `src/app/api/bot/status/route.ts` - Bot status with database integration
- `src/app/api/bot/enable/route.ts` - Bot enable with state persistence
- `src/app/api/bot/disable/route.ts` - Bot disable with state persistence
- `src/app/api/user/settings/route.ts` - User settings from database

## PRD Compliance

### ✅ Architectural Requirements (Section 2)

**2.1 Technology Selection**
- ✅ PostgreSQL database for persistence
- ✅ Managed database support (AWS RDS, Supabase, Google Cloud SQL)
- ✅ Transactional integrity with ACID compliance

**2.2 Data Models/Schemas**
- ✅ All 4 required tables implemented with exact schema
- ✅ Additional tables for user settings and bot states
- ✅ Proper indexing for performance
- ✅ UUID primary keys and foreign key relationships

### ✅ Functional Requirements (Section 3)

**FR-1.1: Quantitative Engine - Create scoring run**
```typescript
const run = await ScoringRunService.create({
  status: 'PENDING',
  started_at: new Date()
});
```

**FR-1.2: GET /internal/ranked-traders refactoring**
```typescript
// No longer calculates on-the-fly
const scores = await TraderScoreService.getLatestScores();
```

**FR-1.3: Complete scoring run**
```typescript
await ScoringRunService.update(runId, { 
  status: 'COMPLETED',
  completed_at: new Date() 
});
await TraderScoreService.createBatch(scores);
```

**FR-2.1: Create execution job**
```typescript
const job = await ExecutionJobService.create({
  status: 'PENDING',
  trigger_reason: 'SCHEDULED_RUN'
});
```

**FR-2.2: Create trade with PENDING status**
```typescript
const trade = await TradeService.create({
  job_id: jobId,
  user_vault_address: vaultAddress,
  status: 'PENDING',
  from_token_address: fromToken,
  to_token_address: toToken,
  amount_in: amountIn,
  expected_amount_out: expectedOut
});
```

**FR-2.3: Update trade after Solana submission**
```typescript
await TradeService.updateToSubmitted(tradeId, transactionSignature);
```

**FR-2.4: Monitor and confirm trade**
```typescript
await TradeService.updateToConfirmed(tradeId, {
  actual_amount_out: actualAmount,
  slippage_realized: slippage,
  gas_fee: gasFee
});
```

**FR-2.5: Recovery on startup**
```typescript
const submittedTrades = await TradeService.getSubmittedTrades();
// Resume monitoring each submitted trade
```

## Database Services

### ScoringRunService
- Create and track Quantitative Engine analysis jobs
- Update job status and completion data
- Query for latest completed runs

### TraderScoreService  
- Store trader analysis results from completed runs
- Retrieve latest scores for ranked traders API
- Batch insert for performance

### ExecutionJobService
- Track Trade Execution Bot run lifecycle  
- Create and update execution jobs
- Query active jobs

### TradeService (Most Critical)
- **Duplicate Prevention**: Check for existing similar trades
- **State Tracking**: PENDING → SUBMITTED → CONFIRMED/FAILED
- **Recovery**: Find submitted trades on startup
- **Immutable Log**: Complete audit trail

### BotStateService
- Replace in-memory bot enable/disable state
- Per-user bot configuration storage
- Convert to API response format

### UserSettingsService
- Replace in-memory user settings storage
- Risk profile and trading preferences
- Database-backed CRUD operations

## Setup Instructions

### 1. Database Setup

For local development with PostgreSQL:
```bash
# Install PostgreSQL
brew install postgresql

# Start PostgreSQL service
brew services start postgresql

# Create database
createdb xorj_bot_state
```

For managed PostgreSQL (Supabase):
1. Create project at https://supabase.com
2. Get connection details from Settings → Database
3. Use connection string in environment variables

### 2. Environment Configuration

Copy `.env.example` to `.env.local`:
```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=xorj_bot_state
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password_here
DATABASE_SSL=false
DATABASE_MAX_CONNECTIONS=20
```

### 3. Initialize Database

```bash
# Install dependencies
npm install pg @types/pg jsonwebtoken @types/jsonwebtoken

# Run database initialization
npx ts-node database/init.ts

# Optional: Add sample data for testing
npx ts-node database/init.ts --sample-data
```

### 4. Test Integration

Start your development server and test the endpoints:

```bash
npm run dev

# Test bot status (should use database)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/bot/status

# Test bot enable (should persist to database)  
curl -X POST -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  http://localhost:3000/api/bot/enable

# Test user settings (should use database)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  "http://localhost:3000/api/user/settings?walletAddress=YOUR_WALLET"
```

## Migration Strategy

### Phase 1: Database Integration (Current)
- ✅ Database schema created
- ✅ Service layer implemented  
- ✅ API endpoints updated with database integration
- ✅ Backward compatibility maintained

### Phase 2: Full Migration (Next)
- Update quantitative engine to use database
- Update trade execution bot to use database
- Implement recovery logic on bot startup
- Add comprehensive error handling

### Phase 3: Production Deployment
- Set up managed PostgreSQL database
- Configure connection pooling and monitoring
- Implement backup and disaster recovery
- Performance optimization and scaling

## Error Handling

The implementation provides graceful fallbacks:

1. **Database Unavailable**: Falls back to gateway-only operations
2. **Gateway Unavailable**: Uses database-only operations  
3. **Both Unavailable**: Returns appropriate error messages
4. **Partial Failures**: Logs errors but continues operation

## Monitoring

Key metrics to monitor:

- Database connection pool utilization
- Query performance and slow queries  
- Failed database operations
- Trade duplicate detection events
- Recovery operations on startup

## Security Considerations

- JWT token validation for user identification
- SQL injection prevention through parameterized queries
- Connection string security (no hardcoded credentials)
- Database user permissions (principle of least privilege)

## Performance Optimizations

- Proper database indexing on frequently queried columns
- Connection pooling for efficient resource usage
- JSONB for flexible configuration storage
- Database views for complex queries
- Pagination support for large result sets

## Compliance & Audit

The system provides:
- Complete audit trail of all trade operations
- Immutable trade log for regulatory compliance  
- Timestamp tracking on all operations
- User action attribution through JWT tokens
- Error logging for debugging and compliance