use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use jupiter_cpi::cpi as jupiter_cpi;
use jupiter_cpi::Route;

declare_id!("5B8QtPsScaQsw392vnGnUaoiRQ8gy5LzzKdNeXe4qghR");

#[program]
pub mod vault {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.owner = ctx.accounts.owner.key();
        vault.bot_authority = None;
        vault.is_active = true;
        vault.created_at = Clock::get()?.unix_timestamp;
        vault.bump = ctx.bumps.vault;
        msg!("Vault initialized for owner: {}", vault.owner);
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        require!(vault.is_active, VaultError::VaultInactive);
        require!(amount > 0, VaultError::InvalidAmount);

        let cpi_accounts = Transfer {
            from: ctx.accounts.user_token_account.to_account_info(),
            to: ctx.accounts.vault_token_account.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        msg!("Deposited {} USDC to vault", amount);
        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        require!(amount > 0, VaultError::InvalidAmount);
        let vault_balance = ctx.accounts.vault_token_account.amount;
        require!(vault_balance >= amount, VaultError::InsufficientFunds);

        let owner_key = ctx.accounts.vault.owner;
        let bump = ctx.accounts.vault.bump;
        let seeds = &[
            b"vault",
            owner_key.as_ref(),
            &[bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;

        msg!("Withdrew {} USDC from vault", amount);
        Ok(())
    }

    pub fn grant_bot_authority(ctx: Context<GrantBotAuthority>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.bot_authority = Some(ctx.accounts.bot_authority.key());
        msg!("Bot authority granted to: {}", ctx.accounts.bot_authority.key());
        Ok(())
    }

    pub fn revoke_bot_authority(ctx: Context<RevokeBotAuthority>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.bot_authority = None;
        msg!("Bot authority revoked");
        Ok(())
    }

    pub fn bot_trade(ctx: Context<BotTrade>, route: Route, amount_in: u64, minimum_amount_out: u64) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        require!(vault.is_active, VaultError::VaultInactive);
        require!(
            vault.bot_authority == Some(ctx.accounts.bot_authority.key()),
            VaultError::UnauthorizedBot
        );

        let owner_key = vault.owner;
        let seeds = &[
            b"vault",
            owner_key.as_ref(),
            &[vault.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = jupiter_cpi::Route {
            token_program: ctx.accounts.token_program.to_account_info(),
            user_transfer_authority: ctx.accounts.vault.to_account_info(),
            user_source_token_account: ctx.accounts.vault_token_account.to_account_info(),
            user_destination_token_account: ctx.accounts.vault_output_token_account.to_account_info(),
            destination_token_account: None,
            destination_mint: ctx.accounts.output_mint.to_account_info(),
            source_mint: ctx.accounts.input_mint.to_account_info(),
        };

        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.jupiter_program.to_account_info(),
            cpi_accounts,
            signer,
        ).with_remaining_accounts(ctx.remaining_accounts.to_vec());

        jupiter_cpi::route(cpi_ctx, route)?;

        emit!(TradeExecuted {
            vault: ctx.accounts.vault.key(),
            bot_authority: ctx.accounts.bot_authority.key(),
            input_mint: ctx.accounts.input_mint.key(),
            output_mint: ctx.accounts.output_mint.key(),
            amount_in,
            amount_out: minimum_amount_out, // Not the actual amount out, but the minimum expected
            minimum_amount_out,
            timestamp: Clock::get()?.unix_timestamp,
        });

        Ok(())
    }

    pub fn deactivate_vault(ctx: Context<DeactivateVault>) -> Result<()> {
        let vault = &mut ctx.accounts.vault;
        vault.is_active = false;
        vault.bot_authority = None;
        msg!("Vault deactivated");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        init,
        payer = owner,
        space = 8 + VaultAccount::INIT_SPACE,
        seeds = [b"vault", owner.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, VaultAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, VaultAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, VaultAccount>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct GrantBotAuthority<'info> {
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, VaultAccount>,
    pub owner: Signer<'info>,
    /// CHECK: This is the bot's public key, validated by the owner
    pub bot_authority: SystemAccount<'info>,
}

#[derive(Accounts)]
pub struct RevokeBotAuthority<'info> {
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, VaultAccount>,
    pub owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct BotTrade<'info> {
    #[account(
        mut,
        seeds = [b"vault", vault.owner.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, VaultAccount>,
    pub bot_authority: Signer<'info>,
    #[account(
        mut,
        token::mint = input_mint,
        token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = output_mint,
        token::authority = vault
    )]
    pub vault_output_token_account: Account<'info, TokenAccount>,
    pub input_mint: Account<'info, Mint>,
    pub output_mint: Account<'info, Mint>,
    #[account(address = jupiter_cpi::ID)]
    pub jupiter_program: Program<'info, jupiter_cpi::program::Jupiter>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct DeactivateVault<'info> {
    #[account(
        mut,
        seeds = [b"vault", owner.key().as_ref()],
        bump = vault.bump,
        has_one = owner
    )]
    pub vault: Account<'info, VaultAccount>,
    pub owner: Signer<'info>,
}

#[account]
pub struct VaultAccount {
    pub owner: Pubkey,
    pub bot_authority: Option<Pubkey>,
    pub is_active: bool,
    pub created_at: i64,
    pub bump: u8,
}

impl Space for VaultAccount {
    const INIT_SPACE: usize = 32 + 1 + 32 + 1 + 8 + 1;
}

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
}

#[event]
pub struct TradeExecuted {
    pub vault: Pubkey,
    pub bot_authority: Pubkey,
    pub input_mint: Pubkey,
    pub output_mint: Pubkey,
    pub amount_in: u64,
    pub amount_out: u64,
    pub minimum_amount_out: u64,
    pub timestamp: i64,
}
