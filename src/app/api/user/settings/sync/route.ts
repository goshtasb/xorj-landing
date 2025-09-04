/**
 * Risk Profile Synchronization Status & Control API
 * GET /api/user/settings/sync - Check sync status across all systems
 * POST /api/user/settings/sync - Force manual reconciliation
 * 
 * Part of the permanent solution for risk profile sync issues
 */

import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';

interface SyncStatusResponse {
  success: boolean;
  walletAddress: string;
  isInSync: boolean;
  lastSyncAttempt: string;
  lastSuccessfulSync: string;
  failureCount: number;
  sources: {
    frontend: {
      riskProfile: string | null;
      investmentAmount: number | null;
      lastUpdated: string | null;
      available: boolean;
    };
    botService: {
      riskProfile: string | null;
      investmentAmount: number | null;
      lastUpdated: string | null;
      available: boolean;
    };
    database: {
      riskProfile: string | null;
      investmentAmount: number | null;
      lastUpdated: string | null;
      available: boolean;
    };
  };
  conflicts: string[];
  recommendations: string[];
  timestamp: string;
  requestId: string;
}

interface ReconciliationResponse {
  success: boolean;
  walletAddress: string;
  reconciliationPerformed: boolean;
  preReconciliationStatus: {
    isInSync: boolean;
    conflicts: string[];
  };
  postReconciliationStatus: {
    isInSync: boolean;
    conflicts: string[];
  };
  actions: string[];
  errors: string[];
  timestamp: string;
  requestId: string;
}

/**
 * GET /api/user/settings/sync
 * Check synchronization status across all systems
 */
export async function GET(request: NextRequest): Promise<NextResponse<SyncStatusResponse>> {
  const startTime = Date.now();
  const requestId = `sync_status_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    // Extract wallet address from query parameters
    const { searchParams } = new URL(request.url);
    const walletAddress = searchParams.get('walletAddress');

    if (!walletAddress) {
      return NextResponse.json<SyncStatusResponse>({
        success: false,
        walletAddress: '',
        isInSync: false,
        lastSyncAttempt: new Date().toISOString(),
        lastSuccessfulSync: new Date(0).toISOString(),
        failureCount: 1,
        sources: {
          frontend: { riskProfile: null, investmentAmount: null, lastUpdated: null, available: false },
          botService: { riskProfile: null, investmentAmount: null, lastUpdated: null, available: false },
          database: { riskProfile: null, investmentAmount: null, lastUpdated: null, available: false }
        },
        conflicts: ['Wallet address is required'],
        recommendations: ['Provide a valid wallet address'],
        timestamp: new Date().toISOString(),
        requestId
      } as SyncStatusResponse, { status: 400 });
    }

    // Validate wallet address format
    try {
      new PublicKey(walletAddress);
    } catch {
      return NextResponse.json<SyncStatusResponse>({
        success: false,
        walletAddress,
        isInSync: false,
        lastSyncAttempt: new Date().toISOString(),
        lastSuccessfulSync: new Date(0).toISOString(),
        failureCount: 1,
        sources: {
          frontend: { riskProfile: null, investmentAmount: null, lastUpdated: null, available: false },
          botService: { riskProfile: null, investmentAmount: null, lastUpdated: null, available: false },
          database: { riskProfile: null, investmentAmount: null, lastUpdated: null, available: false }
        },
        conflicts: ['Invalid wallet address format'],
        recommendations: ['Provide a valid Solana wallet address'],
        timestamp: new Date().toISOString(),
        requestId
      } as SyncStatusResponse, { status: 400 });
    }

    console.log(`🔍 Checking sync status for wallet: ${walletAddress}`);

    // Get sync status using the permanent solution service
    const { riskProfileSyncService } = await import('@/lib/riskProfileSyncService');
    const syncStatus = await riskProfileSyncService.getSyncStatus(walletAddress);

    // Transform internal format to API response format
    const apiResponse: SyncStatusResponse = {
      success: true,
      walletAddress,
      isInSync: syncStatus.isInSync,
      lastSyncAttempt: syncStatus.lastSyncAttempt.toISOString(),
      lastSuccessfulSync: syncStatus.lastSuccessfulSync.toISOString(),
      failureCount: syncStatus.failureCount,
      sources: {
        frontend: {
          riskProfile: syncStatus.sources.frontend?.riskProfile || null,
          investmentAmount: syncStatus.sources.frontend?.investmentAmount || null,
          lastUpdated: syncStatus.sources.frontend?.lastUpdated.toISOString() || null,
          available: !!syncStatus.sources.frontend
        },
        botService: {
          riskProfile: syncStatus.sources.botService?.riskProfile || null,
          investmentAmount: syncStatus.sources.botService?.investmentAmount || null,
          lastUpdated: syncStatus.sources.botService?.lastUpdated.toISOString() || null,
          available: !!syncStatus.sources.botService
        },
        database: {
          riskProfile: syncStatus.sources.database?.riskProfile || null,
          investmentAmount: syncStatus.sources.database?.investmentAmount || null,
          lastUpdated: syncStatus.sources.database?.lastUpdated.toISOString() || null,
          available: !!syncStatus.sources.database
        }
      },
      conflicts: generateConflictDescriptions(syncStatus.sources),
      recommendations: generateRecommendations(syncStatus),
      timestamp: new Date().toISOString(),
      requestId
    };

    const processingTime = Date.now() - startTime;

    console.log(`✅ Sync status check completed for ${walletAddress} in ${processingTime}ms - In Sync: ${syncStatus.isInSync}`);

    return NextResponse.json(apiResponse, {
      headers: {
        'X-Processing-Time': `${processingTime}ms`,
        'X-Request-ID': requestId,
        'Cache-Control': 'private, max-age=30' // Short cache due to dynamic nature
      }
    });

  } catch (error) {
    console.error(`❌ Sync status check failed ${requestId}:`, error);
    
    return NextResponse.json<SyncStatusResponse>({
      success: false,
      walletAddress: '',
      isInSync: false,
      lastSyncAttempt: new Date().toISOString(),
      lastSuccessfulSync: new Date(0).toISOString(),
      failureCount: 1,
      sources: {
        frontend: { riskProfile: null, investmentAmount: null, lastUpdated: null, available: false },
        botService: { riskProfile: null, investmentAmount: null, lastUpdated: null, available: false },
        database: { riskProfile: null, investmentAmount: null, lastUpdated: null, available: false }
      },
      conflicts: [`System error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      recommendations: ['Try again later or contact support'],
      timestamp: new Date().toISOString(),
      requestId
    } as SyncStatusResponse, { status: 500 });
  }
}

/**
 * POST /api/user/settings/sync
 * Force manual reconciliation across all systems
 */
export async function POST(request: NextRequest): Promise<NextResponse<ReconciliationResponse>> {
  const startTime = Date.now();
  const requestId = `reconciliation_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const body = await request.json();
    const { walletAddress } = body;

    if (!walletAddress) {
      return NextResponse.json<ReconciliationResponse>({
        success: false,
        walletAddress: '',
        reconciliationPerformed: false,
        preReconciliationStatus: { isInSync: false, conflicts: ['Wallet address is required'] },
        postReconciliationStatus: { isInSync: false, conflicts: ['Wallet address is required'] },
        actions: [],
        errors: ['Wallet address is required'],
        timestamp: new Date().toISOString(),
        requestId
      } as ReconciliationResponse, { status: 400 });
    }

    // Validate wallet address format
    try {
      new PublicKey(walletAddress);
    } catch {
      return NextResponse.json<ReconciliationResponse>({
        success: false,
        walletAddress,
        reconciliationPerformed: false,
        preReconciliationStatus: { isInSync: false, conflicts: ['Invalid wallet address format'] },
        postReconciliationStatus: { isInSync: false, conflicts: ['Invalid wallet address format'] },
        actions: [],
        errors: ['Invalid wallet address format'],
        timestamp: new Date().toISOString(),
        requestId
      } as ReconciliationResponse, { status: 400 });
    }

    console.log(`🔧 Starting manual reconciliation for wallet: ${walletAddress}`);

    const { riskProfileSyncService } = await import('@/lib/riskProfileSyncService');

    // Get pre-reconciliation status
    const preStatus = await riskProfileSyncService.getSyncStatus(walletAddress);
    
    // Perform reconciliation
    const reconciliationResult = await riskProfileSyncService.performReconciliation(walletAddress);
    
    // Get post-reconciliation status
    const postStatus = await riskProfileSyncService.getSyncStatus(walletAddress);

    const actions = [];
    if (reconciliationResult.success) {
      actions.push('Reconciliation completed successfully');
      if (!preStatus.isInSync && postStatus.isInSync) {
        actions.push('Sync conflicts resolved');
      }
    } else {
      actions.push('Reconciliation encountered issues');
    }

    const response: ReconciliationResponse = {
      success: reconciliationResult.success,
      walletAddress,
      reconciliationPerformed: true,
      preReconciliationStatus: {
        isInSync: preStatus.isInSync,
        conflicts: generateConflictDescriptions(preStatus.sources)
      },
      postReconciliationStatus: {
        isInSync: postStatus.isInSync,
        conflicts: generateConflictDescriptions(postStatus.sources)
      },
      actions,
      errors: reconciliationResult.errors,
      timestamp: new Date().toISOString(),
      requestId
    };

    const processingTime = Date.now() - startTime;

    console.log(`✅ Manual reconciliation completed for ${walletAddress} in ${processingTime}ms - Success: ${reconciliationResult.success}`);

    return NextResponse.json(response, {
      headers: {
        'X-Processing-Time': `${processingTime}ms`,
        'X-Request-ID': requestId
      }
    });

  } catch (error) {
    console.error(`❌ Manual reconciliation failed ${requestId}:`, error);
    
    return NextResponse.json<ReconciliationResponse>({
      success: false,
      walletAddress: '',
      reconciliationPerformed: false,
      preReconciliationStatus: { isInSync: false, conflicts: [] },
      postReconciliationStatus: { isInSync: false, conflicts: [] },
      actions: [],
      errors: [`System error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      timestamp: new Date().toISOString(),
      requestId
    } as ReconciliationResponse, { status: 500 });
  }
}

// Define interface for sources data
interface SourceData {
  riskProfile?: string;
  [key: string]: unknown;
}

interface Sources {
  frontend?: SourceData;
  botService?: SourceData;
  database?: SourceData;
}

// Helper functions
function generateConflictDescriptions(sources: Sources): string[] {
  const conflicts: string[] = [];
  
  const validSources = [
    sources.frontend,
    sources.botService,
    sources.database
  ].filter(Boolean);

  if (validSources.length === 0) {
    conflicts.push('No data available from any source');
    return conflicts;
  }

  if (validSources.length === 1) {
    return conflicts; // Single source is consistent by definition
  }

  // Check risk profile consistency
  const riskProfiles = validSources
    .map(s => s.riskProfile)
    .filter(Boolean);
  
  if (riskProfiles.length > 1) {
    const uniqueProfiles = [...new Set(riskProfiles)];
    if (uniqueProfiles.length > 1) {
      conflicts.push(`Risk profile mismatch: ${uniqueProfiles.join(', ')}`);
    }
  }

  // Check investment amount consistency
  const investmentAmounts = validSources
    .map(s => s.investmentAmount)
    .filter(amount => amount !== null && amount !== undefined);
  
  if (investmentAmounts.length > 1) {
    const uniqueAmounts = [...new Set(investmentAmounts)];
    if (uniqueAmounts.length > 1) {
      conflicts.push(`Investment amount mismatch: $${uniqueAmounts.join(', $')}`);
    }
  }

  return conflicts;
}

interface SyncStatus {
  hasConflicts: boolean;
  conflictSeverity: 'low' | 'medium' | 'high';
  sourceCount: number;
  [key: string]: unknown;
}

function generateRecommendations(syncStatus: SyncStatus): string[] {
  const recommendations: string[] = [];

  if (syncStatus.isInSync) {
    recommendations.push('All systems are synchronized');
    return recommendations;
  }

  const availableSources = Object.values(syncStatus.sources).filter(Boolean).length;
  
  if (availableSources === 0) {
    recommendations.push('No data found - please configure your risk profile');
  } else if (availableSources === 1) {
    recommendations.push('Only one data source available - sync to other systems recommended');
  } else {
    recommendations.push('Multiple data sources conflict - manual reconciliation recommended');
  }

  if (syncStatus.failureCount > 0) {
    recommendations.push('Recent sync failures detected - check system connectivity');
  }

  return recommendations;
}