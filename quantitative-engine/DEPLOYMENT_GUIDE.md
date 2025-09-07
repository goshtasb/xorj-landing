# XORJ Quantitative Engine - Cloud Deployment Guide

## 🚀 Quick Deploy to Production

This guide will help you deploy the XORJ Quantitative Engine to the cloud for 24/7 data collection.

### Prerequisites

1. **Supabase Account** - ✅ Already configured
2. **Railway Account** - Sign up at railway.app
3. **Upstash Redis** - Sign up at upstash.com

### Step 1: Deploy to Railway

1. **Connect Repository**
   ```bash
   # Push to GitHub first
   git add .
   git commit -m "feat: Add cloud deployment configuration"
   git push origin main
   ```

2. **Create Railway Project**
   - Go to [railway.app](https://railway.app)
   - Click "Deploy from GitHub repo"
   - Select your repository
   - Choose `/quantitative-engine` folder

3. **Configure Environment Variables**
   Copy these environment variables to Railway:

   ```bash
   DATABASE_URL=postgresql://postgres.yywoynutnrkvpunnvvla:YOUR_DB_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   SUPABASE_URL=https://yywoynutnrkvpunnvvla.supabase.co
   SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5d295bnVnbnJrdnB1bm52dmxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTUzNjY2MzQsImV4cCI6MjA3MDk0MjYzNH0.VYhT1Utp3NGFmCmFZH6Fvt75axIDCOCajDPZJKVMYpQ
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5d285bnVnbnJrdnB1bm52dmxhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTM2NjYzNCwiZXhwIjoyMDcwOTQyNjM0fQ.ahWp9DgWXU4S4VI3Y_GtYN2rF32JAww8tDs2idoyRy4
   REDIS_URL=redis://default:YOUR_UPSTASH_PASSWORD@YOUR_UPSTASH_ENDPOINT
   HELIUS_API_KEY=e5fdf1c6-20b1-48b6-b33c-4be56e8e219c
   SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=e5fdf1c6-20b1-48b6-b33c-4be56e8e219c
   ENVIRONMENT=production
   XORJ_INTERNAL_API_KEY=xorj-internal-api-key-v1-prod-2025
   ```

### Step 2: Setup Upstash Redis

1. Go to [upstash.com](https://upstash.com)
2. Create account and new Redis database
3. Copy the connection URL
4. Update `REDIS_URL` in Railway environment variables

### Step 3: Setup Supabase Database

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the schema creation script:

```sql
-- Run the contents of supabase_schema.sql
-- This will create all necessary tables
```

### Step 4: Deploy Services

Railway will automatically detect the Procfile and deploy:

- **Web Service** (API): `uvicorn app.main:app`
- **Worker Service**: `celery -A app.worker worker`  
- **Beat Service**: `celery -A app.worker beat`

### Step 5: Verify Deployment

1. **Check API Health**
   ```bash
   curl https://your-railway-app.up.railway.app/
   # Should return: {"message": "XORJ Quantitative Engine", "docs": "/docs"}
   ```

2. **Monitor Data Collection**
   - Check Railway logs for successful data ingestion
   - Verify new trader profiles in Supabase dashboard
   - Confirm scheduled tasks are running every 4 hours

### Step 6: Monitor and Scale

- **Logs**: View real-time logs in Railway dashboard
- **Metrics**: Monitor CPU/memory usage
- **Scaling**: Increase replicas if needed for high volume

## 🎯 Expected Results

After deployment:

- ✅ **24/7 data collection** from 20+ Raydium traders
- ✅ **Premium API optimization** with 50 RPS rate limiting
- ✅ **Automatic scheduling** every 4 hours
- ✅ **Cloud database** storage in Supabase
- ✅ **Redis caching** for improved performance

## 📊 Timeline to Trading

- **Week 1**: Basic pattern recognition data
- **Week 3**: Minimum viable trading data
- **Month 2**: Recommended trading threshold
- **Month 3+**: Full confidence trading

## 🔧 Troubleshooting

### Common Issues

1. **Database Connection**: Verify Supabase connection string
2. **Redis Connection**: Check Upstash Redis URL format
3. **Rate Limiting**: Monitor 429 errors in logs
4. **Memory Issues**: Scale up Railway plan if needed

### Support

- Railway: Check deployment logs and metrics
- Supabase: Monitor database performance
- Helius: Verify API usage and limits

---

**Ready to Deploy?** Follow the steps above to get your 24/7 data collection running immediately!