/**
 * User Settings Service Health Check Endpoint
 * GET /api/user-settings/health
 * 
 * Provides a simple health check for the UserSettingsService and its dependencies.
 * This endpoint facilitates validation and debugging of the service infrastructure.
 * 
 * Returns:
 * - 200 OK with { "status": "ok" } when service is healthy
 * - 500 Internal Server Error when service is unhealthy
 */

import { NextResponse } from 'next/server';
import { getSharedDatabase, getUserSettingsTable } from '@/lib/shared/database-utils';

export async function GET() {
  const startTime = Date.now();
  const requestId = `health_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  console.log(`🏥 [${requestId}] User Settings health check started`);
  
  try {
    // Test database connectivity
    const { db } = await getSharedDatabase();
    const userSettings = await getUserSettingsTable();
    
    // Perform a simple query to verify database is accessible
    await db
      .select({ count: userSettings.id })
      .from(userSettings)
      .limit(1);
    
    const responseTime = Date.now() - startTime;
    console.log(`✅ [${requestId}] User Settings health check passed (${responseTime}ms)`);
    
    return NextResponse.json(
      { 
        status: "ok",
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        requestId
      },
      { 
        status: 200,
        headers: {
          'X-Request-ID': requestId,
          'X-Response-Time': `${responseTime}ms`
        }
      }
    );
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ [${requestId}] User Settings health check failed (${responseTime}ms):`, error);
    
    return NextResponse.json(
      { 
        status: "error",
        error: "User Settings service is unhealthy",
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`,
        requestId
      },
      { 
        status: 500,
        headers: {
          'X-Request-ID': requestId,
          'X-Response-Time': `${responseTime}ms`
        }
      }
    );
  }
}