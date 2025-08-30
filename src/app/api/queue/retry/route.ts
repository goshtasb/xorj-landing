/**
 * Queue Retry API Endpoint
 * POST /api/queue/retry - Retry failed jobs in the write queue
 * 
 * Allows manual retry of failed write operations for recovery
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeQueueService } from '@/lib/queueService';

interface RetryRequest {
  jobIds?: string[];
  retryAll?: boolean;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const body = await request.json() as RetryRequest;
    const { jobIds, retryAll = false } = body;

    // Check if queue is ready
    const isReady = await writeQueueService.isReady();
    
    if (!isReady) {
      return NextResponse.json({
        success: false,
        error: 'Write queue not available',
        timestamp: new Date().toISOString(),
        responseTime: `${Date.now() - startTime}ms`
      }, { status: 503 });
    }

    // Retry jobs
    let result;
    if (retryAll) {
      console.log('🔄 Retrying all failed jobs');
      result = await writeQueueService.retryFailedJobs();
    } else if (jobIds && jobIds.length > 0) {
      console.log(`🔄 Retrying specific jobs: ${jobIds.join(', ')}`);
      result = await writeQueueService.retryFailedJobs(jobIds);
    } else {
      return NextResponse.json({
        success: false,
        error: 'Must specify either jobIds or retryAll: true',
        timestamp: new Date().toISOString(),
        responseTime: `${Date.now() - startTime}ms`
      }, { status: 400 });
    }

    const responseTime = Date.now() - startTime;

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: retryAll ? 'All failed jobs retried' : `${jobIds?.length} jobs retried`,
        retried: retryAll ? 'all' : jobIds,
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Failed to retry jobs',
        details: result.error,
        timestamp: new Date().toISOString(),
        responseTime: `${responseTime}ms`
      }, { status: 500 });
    }

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('❌ Queue retry failed:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to process retry request',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`
    }, { status: 500 });
  }
}