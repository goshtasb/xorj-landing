/**
 * Queue Status API Endpoint
 * GET /api/queue/status - Monitor write queue health and performance
 * 
 * Provides real-time monitoring for the write queue system
 */

import { NextResponse } from 'next/server';
import { writeQueueService } from '@/lib/queueService';

export async function GET() {
  const startTime = Date.now();
  
  try {
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

    // Get queue statistics
    const stats = await writeQueueService.getQueueStats();
    
    // Get failed jobs for inspection
    const failedJobs = await writeQueueService.getFailedJobs(5);
    const failedJobsInfo = failedJobs.map(job => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
    }));

    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      queue: {
        ready: isReady,
        stats: stats || {
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
          delayed: 0
        },
        failedJobs: failedJobsInfo,
        health: {
          totalPending: (stats?.waiting || 0) + (stats?.delayed || 0),
          processing: stats?.active || 0,
          hasFailures: (stats?.failed || 0) > 0
        }
      },
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error('❌ Queue status check failed:', error);
    
    return NextResponse.json({
      success: false,
      error: 'Failed to check queue status',
      details: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`
    }, { status: 500 });
  }
}