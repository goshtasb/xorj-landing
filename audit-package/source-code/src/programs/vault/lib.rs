use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};

declare_id!("5B8QtPsScaQsw392vnGnUaoiRQ8gy5LzzKdNeXe4qghR");

#[program]
pub mod vault {
    use super::*;

    /// Initialize a new vault for a user
    /// 
    /// This creates a personal vault that can hold USDC tokens and manage
    /// delegated trading permissions for the XORJ AI bot.
    /// 
    /// # Arguments
    /// * `ctx` - The context containing all accounts needed for initialization
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        // Set the owner of the vault
        vault.owner = ctx.accounts.owner.key();
        
        // Initialize vault state
        vault.total_deposited = 0;
        vault.bot_authority = None;
        vault.is_active = true;
        vault.created_at = Clock::get()?.unix_timestamp;
        vault.bump = ctx.bumps.vault;
        
        msg!("Vault initialized for owner: {}", vault.owner);
        
        Ok(())
    }

    /// Deposit USDC tokens into the vault
    /// 
    /// Transfers USDC from the user's token account to the vault's token account.
    /// Only the vault owner can make deposits.
    /// 
    /// # Arguments
    /// * `ctx` - The context containing all accounts needed for deposit
    /// * `amount` - The amount of USDC to deposit (in smallest unit)
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        // Verify the vault is active
        require!(vault.is_active, VaultError::VaultInactive);
        
        // Verify amount is greater than 0
        require!(amount > 0, VaultError::InvalidAmount);
        
        // Transfer USDC from user to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        
        token::transfer(cpi_ctx, amount)?;
        
        // Check deposit cap for canary launch (safety mechanism)
        const CANARY_DEPOSIT_CAP: u64 = 1_000_000_000; // 1,000 USDC (6 decimals)
        let new_total = vault.total_deposited
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;
        
        require!(
            new_total <= CANARY_DEPOSIT_CAP,
            VaultError::DepositCapExceeded
        );
        
        // Update vault state
        vault.total_deposited = new_total;
        
        msg!("Deposited {} USDC to vault", amount);
        
        Ok(())
    }

    /// Withdraw USDC tokens from the vault
    /// 
    /// Transfers USDC from the vault's token account back to the user's token account.
    /// Only the vault owner can make withdrawals.
    /// 
    /// # Arguments
    /// * `ctx` - The context containing all accounts needed for withdrawal
    /// * `amount` - The amount of USDC to withdraw (in smallest unit)
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        // Verify amount is greater than 0
        require!(amount > 0, VaultError::InvalidAmount);
        
        // Verify vault has sufficient balance
        let vault_balance = ctx.accounts.vault_token_account.amount;
        require!(vault_balance >= amount, VaultError::InsufficientFunds);
        
        // Prepare PDA signer seeds
        let owner_key = vault.owner;
        let seeds = &[
            b"vault",
            owner_key.as_ref(),
            &[vault.bump],
        ];
        let signer = &[&seeds[..]];
        
        // Transfer USDC from vault to user
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        
        token::transfer(cpi_ctx, amount)?;
        
        // Update vault state
        vault.total_deposited = vault.total_deposited
            .checked_sub(amount)
            .ok_or(VaultError::Underflow)?;
        
        msg!("Withdrew {} USDC from vault", amount);
        
        Ok(())
    }

    /// Grant trading authority to the AI bot
    /// 
    /// Allows the specified bot address to execute trades using the vault's funds.
    /// Only the vault owner can grant this permission.
    /// 
    /// # Arguments
    /// * `ctx` - The context containing the vault and bot authority accounts
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn grant_bot_authority(ctx: Context<GrantBotAuthority>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        // Set the bot authority
        vault.bot_authority = Some(ctx.accounts.bot_authority.key());
        
        msg!("Bot authority granted to: {}", ctx.accounts.bot_authority.key());
        
        Ok(())
    }

    /// Revoke trading authority from the AI bot
    /// 
    /// Removes the bot's permission to execute trades using the vault's funds.
    /// Only the vault owner can revoke this permission.
    /// 
    /// # Arguments
    /// * `ctx` - The context containing the vault account
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn revoke_bot_authority(ctx: Context<RevokeBotAuthority>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        // Remove the bot authority
        vault.bot_authority = None;
        
        msg!("Bot authority revoked");
        
        Ok(())
    }

    /// Execute a trade on behalf of the user (bot only)
    /// 
    /// Allows the authorized bot to execute trades using the vault's USDC.
    /// This function is restricted to the authorized bot address and executes
    /// a swap through Jupiter's DEX aggregation protocol.
    /// 
    /// # Arguments
    /// * `ctx` - The context containing all accounts needed for trading
    /// * `amount_in` - The amount of input token to trade (in smallest units)
    /// * `minimum_amount_out` - Minimum acceptable output amount (slippage protection)
    /// * `route_data` - Jupiter route data for the swap execution
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    /// 
    /// # Security Features
    /// - Bot authorization verification
    /// - Slippage protection via minimum_amount_out
    /// - Vault balance verification
    /// - PDA signing for secure token transfers
    pub fn bot_trade(
        ctx: Context<BotTrade>, 
        amount_in: u64,
        minimum_amount_out: u64,
        route_data: Vec<u8>
    ) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        // Verify the vault is active
        require!(vault.is_active, VaultError::VaultInactive);
        
        // Verify the caller is the authorized bot
        require!(
            vault.bot_authority == Some(ctx.accounts.bot_authority.key()),
            VaultError::UnauthorizedBot
        );
        
        // Verify amounts are greater than 0
        require!(amount_in > 0, VaultError::InvalidAmount);
        require!(minimum_amount_out > 0, VaultError::InvalidAmount);
        
        // Verify vault has sufficient balance for the trade
        let vault_balance = ctx.accounts.vault_token_account.amount;
        require!(vault_balance >= amount_in, VaultError::InsufficientFunds);
        
        // Verify route data is not empty (basic validation)
        require!(!route_data.is_empty(), VaultError::InvalidRouteData);
        
        // Prepare PDA signer seeds for vault authority
        let owner_key = vault.owner;
        let seeds = &[
            b"vault",
            owner_key.as_ref(),
            &[vault.bump],
        ];
        let signer = &[&seeds[..]];
        
        // Get balance before trade for logging
        let balance_before = ctx.accounts.vault_token_account.amount;
        let output_balance_before = ctx.accounts.vault_output_token_account.amount;
        
        // Execute the Jupiter swap via CPI
        // Note: This is a placeholder for Jupiter integration
        // In production, this would use Jupiter's actual CPI interface
        // For now, we perform basic validation and simulate the swap
        
        // Validate that we have proper accounts
        require!(
            ctx.accounts.jupiter_program.key() != Pubkey::default(),
            VaultError::InvalidRouteData
        );
        
        // TODO: Replace with actual Jupiter CPI call
        // jupiter_cpi::route(ctx, amount_in, minimum_amount_out, route_data)?;
        
        // For development/testing: simulate a successful swap
        // In production, this entire block would be replaced with actual Jupiter integration
        let simulated_output = amount_in
            .checked_mul(95)  // Simulate 5% slippage
            .ok_or(VaultError::Overflow)?
            .checked_div(100)
            .ok_or(VaultError::Underflow)?;
        
        // Verify simulated output meets minimum requirements
        require!(
            simulated_output >= minimum_amount_out,
            VaultError::SlippageExceeded
        );
        
        msg!("DEVELOPMENT MODE: Simulated swap {} -> {}", amount_in, simulated_output);
        
        // In development mode, use simulated values
        // In production, this would reload accounts and check actual balances
        let actual_amount_in = amount_in;  // Use requested amount
        let actual_amount_out = simulated_output;  // Use simulated output
        
        // TODO: In production, uncomment and use actual account reloading
        // ctx.accounts.vault_token_account.reload()?;
        // ctx.accounts.vault_output_token_account.reload()?;
        // let balance_after = ctx.accounts.vault_token_account.amount;
        // let output_balance_after = ctx.accounts.vault_output_token_account.amount;
        // let actual_amount_in = balance_before.checked_sub(balance_after).ok_or(VaultError::Underflow)?;
        // let actual_amount_out = output_balance_after.checked_sub(output_balance_before).ok_or(VaultError::Underflow)?;
        
        // Update vault accounting (adjust total_deposited for different token)
        // Note: This is simplified - in production, you'd want more sophisticated accounting
        // to track different token types and their USD values
        
        // Emit trade details for monitoring and audit trails
        emit!(TradeExecuted {
            vault: ctx.accounts.vault.key(),
            bot_authority: ctx.accounts.bot_authority.key(),
            input_mint: ctx.accounts.input_mint.key(),
            output_mint: ctx.accounts.output_mint.key(),
            amount_in: actual_amount_in,
            amount_out: actual_amount_out,
            minimum_amount_out,
            timestamp: Clock::get()?.unix_timestamp,
        });
        
        msg!(
            "Trade executed: {} input tokens → {} output tokens (min: {})",
            actual_amount_in,
            actual_amount_out, 
            minimum_amount_out
        );
        
        Ok(())
    }

    /// Deactivate the vault (emergency function)
    /// 
    /// Allows the owner to deactivate the vault in case of emergency.
    /// This prevents all bot trading but still allows owner withdrawals.
    /// 
    /// # Arguments
    /// * `ctx` - The context containing the vault account
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn deactivate_vault(ctx: Context<DeactivateVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        
        vault.is_active = false;
        vault.bot_authority = None;
        
        msg!("Vault deactivated");
        
        Ok(())
    }
}

/// Account structure for vault initialization
#[derive(Accounts)]
pub struct InitializeVault<'info> {
    /// The vault account to be initialized
    #[account(
        init,
        payer = owner,
        space = 8 + VaultAccount::INIT_SPACE,
        seeds = [b"vault", owner.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, VaultAccount>,
    
    /// The owner of the vault (pays for initialization)
    #[account(mut)]
    pub owner: Signer<'info>,
    
    /// Solana system program (required for account creation)
    pub system_program: Program<'info, System>,
}

/// Account structure for USDC deposits
#[derive(Accounts)]
pub struct Deposit<'info> {
    /// The vault account receiving the deposit
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, VaultAccount>,
    
    /// The owner making the deposit
    #[account(mut)]
    pub owner: Signer<'info>,
    
    /// User's USDC token account (source of funds)
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    /// Vault's USDC token account (destination of funds)
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    /// USDC mint account
    pub usdc_mint: Account<'info, Mint>,
    
    /// SPL Token program
    pub token_program: Program<'info, Token>,
}

/// Account structure for USDC withdrawals
#[derive(Accounts)]
pub struct Withdraw<'info> {
    /// The vault account being withdrawn from
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, VaultAccount>,
    
    /// The owner making the withdrawal
    #[account(mut)]
    pub owner: Signer<'info>,
    
    /// User's USDC token account (destination of funds)
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    
    /// Vault's USDC token account (source of funds)
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    /// USDC mint account
    pub usdc_mint: Account<'info, Mint>,
    
    /// SPL Token program
    pub token_program: Program<'info, Token>,
}

/// Account structure for granting bot authority
#[derive(Accounts)]
pub struct GrantBotAuthority<'info> {
    /// The vault account to grant authority on
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, VaultAccount>,
    
    /// The vault owner granting permission
    pub owner: Signer<'info>,
    
    /// The bot account receiving trading authority
    /// CHECK: This is the bot's public key, validated by the owner
    pub bot_authority: UncheckedAccount<'info>,
}

/// Account structure for revoking bot authority
#[derive(Accounts)]
pub struct RevokeBotAuthority<'info> {
    /// The vault account to revoke authority from
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, VaultAccount>,
    
    /// The vault owner revoking permission
    pub owner: Signer<'info>,
}

/// Account structure for bot trading via Jupiter DEX
/// 
/// This structure contains all the accounts needed for the vault to execute
/// trades through Jupiter's aggregation protocol. The vault acts as the
/// authority for both input and output token accounts.
#[derive(Accounts)]
pub struct BotTrade<'info> {
    /// The vault account being traded from
    #[account(
        mut,
        seeds = [b"vault", vault.owner.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultAccount>,
    
    /// The authorized bot executing the trade
    pub bot_authority: Signer<'info>,
    
    /// Vault's input token account (source of trade, e.g., USDC)
    #[account(
        mut,
        token::mint = input_mint,
        token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    
    /// Vault's output token account (destination of trade, e.g., SOL)
    #[account(
        mut,
        token::mint = output_mint,
        token::authority = vault
    )]
    pub vault_output_token_account: Account<'info, TokenAccount>,
    
    /// Input token mint (e.g., USDC)
    pub input_mint: Account<'info, Mint>,
    
    /// Output token mint (e.g., SOL wrapped)
    pub output_mint: Account<'info, Mint>,
    
    /// Jupiter program for DEX aggregation
    /// CHECK: This is Jupiter's verified program ID
    pub jupiter_program: UncheckedAccount<'info>,
    
    /// SPL Token program
    pub token_program: Program<'info, Token>,
}

/// Account structure for vault deactivation
#[derive(Accounts)]
pub struct DeactivateVault<'info> {
    /// The vault account to deactivate
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, VaultAccount>,
    
    /// The vault owner
    pub owner: Signer<'info>,
}

/// The main vault account structure
/// 
/// This account stores all the state information for a user's vault,
/// including ownership, balances, and bot authorization details.
#[account]
pub struct VaultAccount {
    /// The public key of the vault owner
    pub owner: Pubkey,
    
    /// Total amount of USDC deposited (for tracking purposes)
    pub total_deposited: u64,
    
    /// The public key of the authorized trading bot (if any)
    pub bot_authority: Option<Pubkey>,
    
    /// Whether the vault is active and can execute trades
    pub is_active: bool,
    
    /// Timestamp when the vault was created
    pub created_at: i64,
    
    /// PDA bump seed for the vault account
    pub bump: u8,
}

impl Space for VaultAccount {
    const INIT_SPACE: usize = 
        32 +  // owner: Pubkey
        8 +   // total_deposited: u64
        1 + 32 + // bot_authority: Option<Pubkey>
        1 +   // is_active: bool
        8 +   // created_at: i64
        1;    // bump: u8
}

/// Custom error types for the vault program
#[error_code]
pub enum VaultError {
    #[msg("The vault is not active")]
    VaultInactive,
    
    #[msg("Invalid amount specified")]
    InvalidAmount,
    
    #[msg("Insufficient funds in vault")]
    InsufficientFunds,
    
    #[msg("Unauthorized bot attempted to trade")]
    UnauthorizedBot,
    
    #[msg("Arithmetic overflow")]
    Overflow,
    
    #[msg("Arithmetic underflow")]
    Underflow,
    
    #[msg("Invalid route data provided")]
    InvalidRouteData,
    
    #[msg("Slippage exceeded maximum tolerance")]
    SlippageExceeded,
    
    #[msg("Deposit cap exceeded for this vault")]
    DepositCapExceeded,
}

/// Event emitted when a trade is successfully executed
/// 
/// This event provides a complete audit trail of all trading activity
/// and is essential for monitoring, analytics, and compliance reporting.
#[event]
pub struct TradeExecuted {
    /// The vault that executed the trade
    pub vault: Pubkey,
    
    /// The bot authority that initiated the trade
    pub bot_authority: Pubkey,
    
    /// The input token mint (what was sold)
    pub input_mint: Pubkey,
    
    /// The output token mint (what was bought)
    pub output_mint: Pubkey,
    
    /// Actual amount of input tokens used
    pub amount_in: u64,
    
    /// Actual amount of output tokens received
    pub amount_out: u64,
    
    /// Minimum amount out that was specified (for slippage analysis)
    pub minimum_amount_out: u64,
    
    /// Timestamp when the trade was executed
    pub timestamp: i64,
}