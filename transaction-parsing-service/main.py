"""
XORJ Transaction Parsing & Filtering Service
Main entry point for the transaction parsing service
Complete implementation of PRD Core Logic & Functional Requirements (FR-1 through FR-5)
"""

import sys
import argparse
from transaction_parser import RaydiumSwapParser
import structlog

logger = structlog.get_logger(__name__)

def main():
    """Main entry point for the transaction parsing service"""
    parser = argparse.ArgumentParser(description='XORJ Transaction Parsing & Filtering Service')
    parser.add_argument('job_id', help='Ingestion job ID to process')
    
    args = parser.parse_args()
    job_id = args.job_id
    
    logger.info("XORJ Transaction Parsing Service starting", job_id=job_id)
    
    try:
        # Initialize parser with all components
        raydium_parser = RaydiumSwapParser()
        
        # Process the job
        results = raydium_parser.process_job(job_id)
        
        # Log final results
        if results['status'] == 'completed':
            logger.info("Transaction parsing completed successfully",
                       **results)
            
            if results['raydium_swaps_found'] > 0:
                print(f"✅ SUCCESS: Parsed {results['raydium_swaps_found']} Raydium swaps from {results['raw_transactions_processed']} raw transactions")
                print(f"   Saved {results['raydium_swaps_saved']} swaps to parsed_raydium_swaps table")
            else:
                print(f"✅ SUCCESS: No Raydium swaps found in {results['raw_transactions_processed']} raw transactions")
            
            return 0
            
        else:
            logger.error("Transaction parsing failed", **results)
            print(f"❌ ERROR: {results.get('error', 'Unknown error')}")
            return 1
            
    except Exception as e:
        logger.error("Transaction parsing service crashed", error=str(e))
        print(f"❌ CRITICAL ERROR: {str(e)}")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)