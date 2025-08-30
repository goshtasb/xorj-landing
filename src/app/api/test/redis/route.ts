/**
 * Redis Test Endpoint
 * Simple endpoint to test Redis connectivity and caching functionality
 */

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { redisService } = await import('@/lib/redis');
    
    // Test Redis connection
    const healthCheck = await redisService.healthCheck();
    
    if (!healthCheck.healthy) {
      return NextResponse.json({
        success: false,
        error: 'Redis not healthy',
        details: healthCheck.error
      }, { status: 500 });
    }
    
    // Test basic set/get operations
    const testKey = 'test:connection:' + Date.now();
    const testValue = { message: 'Hello Redis!', timestamp: Date.now() };
    
    // Set test data
    const setResult = await redisService.set(testKey, testValue, 10);
    if (!setResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to set test data',
        details: setResult.error
      }, { status: 500 });
    }
    
    // Get test data
    const getResult = await redisService.get(testKey);
    if (!getResult.success) {
      return NextResponse.json({
        success: false,
        error: 'Failed to get test data', 
        details: getResult.error
      }, { status: 500 });
    }
    
    // Clean up test data
    await redisService.delete(testKey);
    
    return NextResponse.json({
      success: true,
      redis_health: healthCheck,
      test_data: {
        original: testValue,
        retrieved: getResult.data,
        from_cache: getResult.fromCache
      },
      timestamp: Date.now()
    });
    
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: 'Redis test failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}