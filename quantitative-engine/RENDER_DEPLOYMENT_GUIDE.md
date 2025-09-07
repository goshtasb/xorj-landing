# XORJ Quantitative Engine - Render Cloud Deployment Guide

## 🚀 Deploy to Render (Free Tier) for 24/7 Data Collection

Since Railway requires a paid plan, we'll use **Render** which offers a generous free tier perfect for your 24/7 data collection needs.

### Prerequisites ✅

1. **Supabase Account** - Already configured
2. **Upstash Redis** - Already connected  
3. **GitHub Repository** - Already pushed
4. **Render Account** - Sign up at render.com

### Step 1: Create Render Account

1. Go to [render.com](https://render.com)
2. Sign up with GitHub (this will automatically connect your repositories)
3. Verify your email address

### Step 2: Deploy from GitHub

1. **Click "New +"** in Render dashboard
2. **Select "Blueprint"** deployment option
3. **Connect GitHub repository**: `xorj-landing`
4. **Set root directory**: `/quantitative-engine`
5. Render will auto-detect the `render.yaml` configuration

### Step 3: Configure Environment Variables

Render will automatically create 3 services from `render.yaml`:
- **xorj-quantitative-engine-api** (Web service)
- **xorj-quantitative-engine-worker** (Background worker)
- **xorj-quantitative-engine-beat** (Task scheduler)

**Update these environment variables in each service:**

```bash
DATABASE_URL=postgresql://postgres.yywoynutnrkvpunnvvla:YOUR_SUPABASE_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
REDIS_URL=YOUR_UPSTASH_REDIS_URL
```

Replace:
- `YOUR_SUPABASE_PASSWORD` - Your actual Supabase database password
- `YOUR_UPSTASH_REDIS_URL` - Your Upstash Redis connection URL

### Step 4: Deploy Services

Render will automatically:
1. **Build** from your GitHub repository
2. **Install** Python dependencies from `requirements.txt`
3. **Start** all 3 services simultaneously:
   - API server on port 80
   - Background data collector 
   - Task scheduler for every 4-hour runs

### Step 5: Verify Deployment

1. **Check Service Status** - All services should show "Live" 
2. **Test API Health**: Visit your Render URL
   ```
   https://your-render-app.onrender.com/
   ```
   Should return: `{"message": "XORJ Quantitative Engine", "docs": "/docs"}`

3. **Monitor Logs** - Check each service for:
   - ✅ Database connections
   - ✅ Redis connections  
   - ✅ Scheduled data collection every 4 hours
   - ✅ Trader discovery and profile updates

### Step 6: Supabase Database Setup

**Go to Supabase SQL Editor** and run the complete schema:

```sql
-- Copy the entire contents of quantitative-engine/supabase_schema.sql
-- This creates all tables: trader_profiles, wallet_transactions, etc.
```

### Expected Results After Deployment 🎯

- ✅ **24/7 Data Collection** - Runs every 4 hours automatically
- ✅ **20+ Elite Traders** - Premium API optimized discovery  
- ✅ **Cloud Database** - All data stored in Supabase
- ✅ **Redis Caching** - Fast performance with Upstash
- ✅ **Free Hosting** - 750 hours/month on Render free tier

### Free Tier Limits

**Render Free Tier:**
- ✅ 750 hours/month (enough for 24/7 for 31 days)
- ✅ Multiple services
- ✅ GitHub auto-deploy
- ✅ Custom domains
- ⚠️ Services sleep after 15 minutes of inactivity

**Note**: The scheduler will wake up services every 4 hours, so this shouldn't be an issue for your data collection.

### Timeline to Live Trading 📈

- **Week 1**: Basic pattern data collected
- **Week 3**: Minimum viable trading intelligence  
- **Month 2**: Recommended confidence level
- **Month 3+**: Full production trading ready

### Troubleshooting 🔧

1. **Build Failures**: Check Python version and requirements.txt
2. **Database Connection**: Verify Supabase DATABASE_URL format
3. **Redis Connection**: Confirm Upstash REDIS_URL format  
4. **Service Sleep**: Use a cron service to ping API every 14 minutes if needed

### Monitoring

- **Render Dashboard**: Monitor all 3 services health
- **Supabase Dashboard**: Watch trader_profiles table growth
- **Service Logs**: Check data collection success every 4 hours

---

🎉 **You're Ready!** Your quantitative engine will now collect elite trader data 24/7 in the cloud, building the intelligence needed for automated copy trading.