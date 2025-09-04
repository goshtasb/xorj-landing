"""
Database client for XORJ On-Chain Data Ingestion Service
Handles PostgreSQL connection and raw transaction persistence
FR-4: Database Persistence
"""

import uuid
import json
from typing import Dict, Any, List, Optional
import asyncio

import structlog

# For now using simple approach without asyncpg dependency issues
import subprocess
import tempfile
import os

logger = structlog.get_logger(__name__)

class DatabaseClient:
    """
    PostgreSQL database client for storing raw transaction data
    FR-4: Database Persistence implementation
    """
    
    def __init__(self, connection_string: str = "postgresql://xorj:@localhost:5432/xorj_quant"):
        self.connection_string = connection_string
        logger.info("Database client initialized")
    
    async def store_raw_transactions(self, job_id: str, wallet_address: str, transactions: List[Dict[str, Any]]) -> int:
        """
        Store raw transaction data from Helius API into raw_transactions table
        FR-4: Database Persistence
        
        Args:
            job_id: UUID of the fetch job
            wallet_address: Solana wallet address
            transactions: List of transaction data from Helius API
            
        Returns:
            Number of transactions successfully stored
        """
        if not transactions:
            logger.info("No transactions to store")
            return 0
        
        logger.info("Storing raw transactions to database",
                   job_id=job_id,
                   wallet_address=wallet_address[:10] + "...",
                   transaction_count=len(transactions))
        
        stored_count = 0
        
        for transaction in transactions:
            try:
                await self._store_single_transaction(job_id, wallet_address, transaction)
                stored_count += 1
            except Exception as e:
                logger.warning("Failed to store transaction",
                             signature=transaction.get('signature', 'unknown')[:10] + "...",
                             error=str(e))
                # Continue with other transactions even if one fails
                continue
        
        logger.info("Raw transactions stored successfully",
                   job_id=job_id,
                   stored_count=stored_count,
                   total_count=len(transactions))
        
        return stored_count
    
    async def _store_single_transaction(self, job_id: str, wallet_address: str, transaction: Dict[str, Any]):
        """Store a single transaction record"""
        signature = transaction.get('signature')
        block_time = transaction.get('blockTime', 0)
        
        if not signature:
            raise ValueError("Transaction missing signature")
        
        # Prepare SQL insert statement
        sql = """
        INSERT INTO raw_transactions (job_id, wallet_address, signature, block_time, raw_transaction_data)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (signature) DO NOTHING
        """
        
        # Convert transaction data to JSON string for JSONB storage
        raw_data = json.dumps(transaction)
        
        # Execute using psql command (avoiding asyncpg compilation issues)
        await self._execute_sql(sql, [job_id, wallet_address, signature, block_time, raw_data])
    
    async def _execute_sql(self, sql: str, params: List[Any] = None):
        """Execute SQL command using psql subprocess"""
        # Create temporary SQL file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.sql', delete=False) as f:
            if params:
                # Simple parameter substitution for this specific use case
                escaped_params = []
                for param in params:
                    escaped_param = str(param).replace("'", "''")
                    escaped_params.append(f"'{escaped_param}'")
                formatted_sql = sql.replace('%s', '{}').format(*escaped_params)
            else:
                formatted_sql = sql
            
            f.write(formatted_sql)
            temp_file = f.name
        
        try:
            # Execute SQL using psql
            result = subprocess.run([
                'psql', 
                '-h', 'localhost',
                '-U', 'xorj',
                '-d', 'xorj_quant',
                '-f', temp_file
            ], 
            env={**os.environ, 'PGPASSWORD': ''},
            capture_output=True, 
            text=True, 
            timeout=30)
            
            if result.returncode != 0:
                logger.error("SQL execution failed",
                           error=result.stderr,
                           sql_snippet=sql[:100] + "...")
                raise Exception(f"SQL execution failed: {result.stderr}")
                
        finally:
            # Clean up temporary file
            try:
                os.unlink(temp_file)
            except OSError:
                pass
    
    async def get_job_transaction_count(self, job_id: str) -> int:
        """Get count of transactions stored for a specific job"""
        try:
            sql = f"SELECT COUNT(*) FROM raw_transactions WHERE job_id = '{job_id}'"
            
            result = subprocess.run([
                'psql',
                '-h', 'localhost', 
                '-U', 'xorj',
                '-d', 'xorj_quant',
                '-t', '-c', sql
            ],
            env={**os.environ, 'PGPASSWORD': ''},
            capture_output=True,
            text=True,
            timeout=10)
            
            if result.returncode == 0:
                count = int(result.stdout.strip())
                return count
            else:
                logger.error("Failed to get job transaction count", error=result.stderr)
                return 0
                
        except Exception as e:
            logger.error("Error getting job transaction count", error=str(e))
            return 0


# Global database client instance
_db_client: Optional[DatabaseClient] = None

async def get_database_client() -> DatabaseClient:
    """Get or create the global database client instance"""
    global _db_client
    
    if _db_client is None:
        _db_client = DatabaseClient()
        logger.info("Database client initialized")
    
    return _db_client