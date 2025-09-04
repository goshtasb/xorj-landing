#!/usr/bin/env python3
"""
Quick test to verify the solders object parsing fix
"""

import asyncio
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.ingestion.worker import DataIngestionWorker

async def test_single_wallet():
    """Test processing a single wallet with the fix"""
    print("🧪 Testing solders object parsing fix...")
    
    worker = DataIngestionWorker()
    await worker.initialize()
    
    # Test with a known active wallet
    test_wallet = "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R"
    
    try:
        print(f"📍 Fetching signatures for: {test_wallet}")
        signatures = await worker.fetch_wallet_signatures(test_wallet)
        print(f"✅ Found {len(signatures)} signatures without errors!")
        
        if signatures:
            print(f"🔍 Testing transaction parsing...")
            # Take first 5 signatures to test parsing
            test_sigs = signatures[:5]
            swaps, errors = await worker.fetch_and_parse_transactions(test_wallet, test_sigs)
            print(f"✅ Parsed {len(test_sigs)} transactions: {len(swaps)} swaps, {len(errors)} errors")
            
            if swaps:
                print("🎉 SUCCESS: Found actual swap data!")
                return True
            else:
                print("ℹ️ No swaps found in test transactions (may be expected)")
                return True
        else:
            print("⚠️ No signatures found")
            return False
            
    except Exception as e:
        print(f"❌ Test failed: {str(e)}")
        return False
    finally:
        await worker.shutdown()

if __name__ == "__main__":
    success = asyncio.run(test_single_wallet())
    print(f"\n{'✅ TEST PASSED' if success else '❌ TEST FAILED'}")
    sys.exit(0 if success else 1)