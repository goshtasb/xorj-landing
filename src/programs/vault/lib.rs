use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};

declare_id!("VauLt1111111111111111111111111111111111111");

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
        
        // Update vault state
        vault.total_deposited = vault.total_deposited
            .checked_add(amount)
            .ok_or(VaultError::Overflow)?;
        
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
    /// This function is restricted to the authorized bot address.
    /// 
    /// # Arguments
    /// * `ctx` - The context containing all accounts needed for trading
    /// * `amount` - The amount of USDC to trade
    /// 
    /// # Returns
    /// * `Result<()>` - Success or error
    pub fn bot_trade(ctx: Context<BotTrade>, amount: u64) -> Result<()> {
        let vault = &ctx.accounts.vault;
        
        // Verify the vault is active
        require!(vault.is_active, VaultError::VaultInactive);
        
        // Verify the caller is the authorized bot
        require!(
            vault.bot_authority == Some(ctx.accounts.bot_authority.key()),
            VaultError::UnauthorizedBot
        );
        
        // Verify amount is greater than 0
        require!(amount > 0, VaultError::InvalidAmount);
        
        // Verify vault has sufficient balance
        let vault_balance = ctx.accounts.vault_token_account.amount;
        require!(vault_balance >= amount, VaultError::InsufficientFunds);
        
        // TODO: Implement actual trading logic here
        // This would integrate with Jupiter or other Solana DEX protocols
        
        msg!("Bot executed trade for {} USDC", amount);
        
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

/// Account structure for bot trading
#[derive(Accounts)]
pub struct BotTrade<'info> {
    /// The vault account being traded from
    #[account(
        seeds = [b"vault", vault.owner.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultAccount>,
    
    /// The authorized bot executing the trade
    pub bot_authority: Signer<'info>,
    
    /// Vault's USDC token account
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
}