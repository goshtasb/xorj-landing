# XORJ Supabase Setup Guide

## Overview
This guide walks you through setting up the hybrid database architecture for XORJ, where:
- **Supabase** hosts user-facing data (user settings, bot states, trades)
- **Local PostgreSQL** keeps sensitive quantitative data (trader rankings, swap analysis)

## Step 1: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Name it: `xorj-platform`
4. Generate a strong database password
5. Select region closest to your users
6. Wait for project creation (takes ~2 minutes)

## Step 2: Get Your Credentials

Once created, go to Settings → API:

```bash
# Add these to your .env.local file:
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# For server-side operations (keep secret!):
SUPABASE_SERVICE_KEY=your_service_role_key_here
```

## Step 3: Run Migration Script

1. Go to Supabase Dashboard → SQL Editor
2. Copy contents of `/database/supabase-migration.sql`
3. Paste and run in SQL Editor
4. Verify tables created: user_settings, bot_states, trades

## Step 4: Export Existing Data (Optional)

If you have existing user data to migrate:

```bash
# Export current data
psql -U xorj -d xorj_quant -f database/export-user-data.sql

# Files will be created in /tmp/:
# - user_settings_export.csv
# - bot_states_export.csv  
# - trades_export.csv
```

## Step 5: Import to Supabase (Optional)

1. Go to Supabase Dashboard → Table Editor
2. For each table, click "Import data from CSV"
3. Upload the corresponding export file
4. Map columns and import

## Step 6: Update Environment Variables

Update your `.env.local`:

```bash
# Supabase (user-facing data)
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_KEY=your_service_role_key_here

# Local PostgreSQL (quantitative data)
LOCAL_DATABASE_URL=postgresql://xorj:xorj_password@localhost:5432/xorj_quant

# Keep existing for backward compatibility
DATABASE_URL=postgresql://xorj:xorj_password@localhost:5432/xorj_quant

# JWT Configuration (already set)
JWT_SECRET=pV39ESnXgR9buzm8RqdgCl+LBTENgSCwHfK/MOnitbBdNMXoDBu7Vge+rly46AlK
NEXTAUTH_SECRET=TGvxf3Y46eXP3djaY+4odtuboPgP/CwNKRBm2cv72THl2dhDF0zd7fui9KEH9WOy
```

## Step 7: Initialize Hybrid Database

In your code, initialize the hybrid database service:

```typescript
import { hybridDB } from '@/lib/database/hybrid-config';

// Initialize on app start
hybridDB.initialize();

// Use Supabase for user data
const userSettings = await hybridDB.getUserSettings(walletAddress);

// Use local DB for quantitative data  
const rankings = await hybridDB.getTraderRankings();
```

## Step 8: Enable Real-time Features

Real-time subscriptions are already configured for:
- Bot state changes
- New trades

Example usage:

```typescript
// Subscribe to bot state changes
const subscription = hybridDB.subscribeToBotStateChanges(
  walletAddress,
  (payload) => {
    console.log('Bot state updated:', payload);
    // Update UI
  }
);

// Clean up
subscription.unsubscribe();
```

## Data Separation Strategy

### Keep in Supabase (Public Cloud):
- ✅ user_settings - User preferences
- ✅ bot_states - Bot on/off status  
- ✅ trades - User's trade history
- ✅ sessions - Auth sessions
- ✅ audit_logs - User activity

### Keep Local (Private):
- 🔒 parsed_raydium_swaps - Raw blockchain data
- 🔒 trader_rankings - Proprietary algorithms
- 🔒 discovered_traders - Competitive advantage
- 🔒 token_metadata - Can be cached locally
- 🔒 quantitative_models - Trading strategies

## Security Features

1. **Row Level Security (RLS)**: Users can only access their own data
2. **Real-time Updates**: Live bot status and trade updates
3. **Automatic Backups**: Supabase handles daily backups
4. **SSL/TLS**: All connections encrypted

## Testing the Setup

```bash
# Test Supabase connection
curl https://YOUR_PROJECT_ID.supabase.co/rest/v1/user_settings \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_ANON_KEY"

# Should return [] if empty or list of user settings
```

## Monitoring

- Supabase Dashboard shows real-time metrics
- Database usage, API calls, storage
- Set up alerts for high usage

## Next Steps

1. Test the hybrid setup with the application
2. Monitor performance (Supabase has ~50-100ms latency)
3. Consider caching frequently accessed Supabase data
4. Set up backup strategy for local PostgreSQL data

## Troubleshooting

**Issue**: Cannot connect to Supabase
- Check API keys are correct
- Verify project is active (not paused)
- Check network/firewall settings

**Issue**: RLS blocking access
- Ensure JWT contains wallet_address claim
- Check RLS policies in Supabase dashboard

**Issue**: Real-time not working
- Enable real-time for tables in Supabase dashboard
- Check WebSocket connection not blocked

## Support

- Supabase Docs: https://supabase.com/docs
- XORJ GitHub: https://github.com/your-repo/xorj-platform
- Discord: Your Discord Server