--
-- PostgreSQL database dump
--

\restrict bxSixWfDOA1V2KW6VIcTddZrRwhcqz7qpdWofMQ8H5R2K3MBzmPPAsmVSerV9m6

-- Dumped from database version 15.14 (Homebrew)
-- Dumped by pg_dump version 15.14 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: execution_job_status; Type: TYPE; Schema: public; Owner: xorj
--

CREATE TYPE public.execution_job_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'cancelled'
);


ALTER TYPE public.execution_job_status OWNER TO xorj;

--
-- Name: risk_profile; Type: TYPE; Schema: public; Owner: xorj
--

CREATE TYPE public.risk_profile AS ENUM (
    'conservative',
    'balanced',
    'aggressive'
);


ALTER TYPE public.risk_profile OWNER TO xorj;

--
-- Name: scoring_run_status; Type: TYPE; Schema: public; Owner: xorj
--

CREATE TYPE public.scoring_run_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed'
);


ALTER TYPE public.scoring_run_status OWNER TO xorj;

--
-- Name: signup_source; Type: TYPE; Schema: public; Owner: xorj
--

CREATE TYPE public.signup_source AS ENUM (
    'website',
    'referral',
    'social',
    'email',
    'other'
);


ALTER TYPE public.signup_source OWNER TO xorj;

--
-- Name: trade_side; Type: TYPE; Schema: public; Owner: xorj
--

CREATE TYPE public.trade_side AS ENUM (
    'buy',
    'sell'
);


ALTER TYPE public.trade_side OWNER TO xorj;

--
-- Name: trade_status; Type: TYPE; Schema: public; Owner: xorj
--

CREATE TYPE public.trade_status AS ENUM (
    'pending',
    'processing',
    'completed',
    'failed',
    'cancelled'
);


ALTER TYPE public.trade_status OWNER TO xorj;

--
-- Name: waitlist_status; Type: TYPE; Schema: public; Owner: xorj
--

CREATE TYPE public.waitlist_status AS ENUM (
    'pending',
    'approved',
    'invited',
    'converted'
);


ALTER TYPE public.waitlist_status OWNER TO xorj;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name character varying(100) NOT NULL,
    operation character varying(20) NOT NULL,
    user_id uuid,
    old_values jsonb,
    new_values jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.audit_log OWNER TO xorj;

--
-- Name: bot_states; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.bot_states (
    user_wallet character varying(64) NOT NULL,
    user_id character varying(255),
    enabled boolean DEFAULT false NOT NULL,
    status character varying(20) DEFAULT 'stopped'::character varying NOT NULL,
    configuration jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_execution timestamp with time zone,
    kill_switch_active boolean DEFAULT false NOT NULL,
    last_emergency_action jsonb,
    trades_executed integer DEFAULT 0 NOT NULL,
    total_volume numeric(20,10) DEFAULT 0.0 NOT NULL,
    last_updated timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT bot_states_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'stopped'::character varying, 'paused'::character varying, 'error'::character varying])::text[])))
);


ALTER TABLE public.bot_states OWNER TO xorj;

--
-- Name: compliance_events; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.compliance_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type character varying(100) NOT NULL,
    severity character varying(20) NOT NULL,
    description text NOT NULL,
    user_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    resolved boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.compliance_events OWNER TO xorj;

--
-- Name: data_ingestion_log; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.data_ingestion_log (
    ingestion_id uuid NOT NULL,
    started_at timestamp with time zone NOT NULL,
    completed_at timestamp with time zone,
    status character varying(20) NOT NULL,
    ingestion_type character varying(50) NOT NULL,
    total_addresses_processed integer,
    total_transactions_processed integer,
    new_traders_found integer,
    block_range_start bigint,
    block_range_end bigint,
    filters_applied jsonb,
    error_message text,
    summary_stats jsonb,
    ingestion_method text DEFAULT 'FULL'::text NOT NULL
);


ALTER TABLE public.data_ingestion_log OWNER TO xorj;

--
-- Name: execution_jobs; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.execution_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    status public.execution_job_status DEFAULT 'pending'::public.execution_job_status NOT NULL,
    job_type character varying(50) NOT NULL,
    target_trader character varying(255),
    parameters jsonb DEFAULT '{}'::jsonb,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.execution_jobs OWNER TO xorj;

--
-- Name: parsed_raydium_swaps; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.parsed_raydium_swaps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ingestion_job_id uuid NOT NULL,
    raw_transaction_id uuid,
    wallet_address text NOT NULL,
    signature text NOT NULL,
    block_time timestamp with time zone NOT NULL,
    from_token_mint text NOT NULL,
    to_token_mint text NOT NULL,
    amount_in bigint NOT NULL,
    amount_out bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.parsed_raydium_swaps OWNER TO xorj;

--
-- Name: raw_transactions; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.raw_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid NOT NULL,
    wallet_address text NOT NULL,
    signature text NOT NULL,
    block_time bigint NOT NULL,
    raw_transaction_data jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.raw_transactions OWNER TO xorj;

--
-- Name: scoring_runs; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.scoring_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    status public.scoring_run_status DEFAULT 'pending'::public.scoring_run_status NOT NULL,
    traders_analyzed integer DEFAULT 0 NOT NULL,
    total_traders integer DEFAULT 0 NOT NULL,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    error_message text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.scoring_runs OWNER TO xorj;

--
-- Name: swap_history; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.swap_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_address text NOT NULL,
    signature text NOT NULL,
    block_time timestamp with time zone NOT NULL,
    from_token_mint text NOT NULL,
    to_token_mint text NOT NULL,
    amount_in bigint NOT NULL,
    amount_out bigint NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


ALTER TABLE public.swap_history OWNER TO xorj;

--
-- Name: trade_execution_audit_log; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.trade_execution_audit_log (
    entry_id uuid NOT NULL,
    "timestamp" timestamp with time zone NOT NULL,
    event_type character varying(50) NOT NULL,
    severity character varying(20) NOT NULL,
    user_id character varying(100),
    wallet_address character varying(44),
    trader_address character varying(44),
    event_data jsonb,
    decision_rationale text,
    risk_assessment jsonb,
    trade_details jsonb,
    transaction_signature character varying(128),
    error_message text,
    error_type character varying(100),
    stack_trace text,
    bot_version character varying(20) NOT NULL,
    system_state jsonb,
    calculation_inputs jsonb,
    calculation_outputs jsonb,
    decision_factors jsonb,
    validation_results jsonb,
    performance_metrics jsonb,
    context_snapshot jsonb,
    correlation_id character varying(64),
    entry_hash character varying(64) NOT NULL,
    previous_entry_hash character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.trade_execution_audit_log OWNER TO xorj;

--
-- Name: trader_performance_metrics; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.trader_performance_metrics (
    metrics_id uuid NOT NULL,
    wallet_address character varying(44) NOT NULL,
    calculation_date timestamp with time zone NOT NULL,
    period_days integer NOT NULL,
    total_trades integer NOT NULL,
    total_volume_usd double precision NOT NULL,
    total_profit_usd double precision NOT NULL,
    net_roi_percent double precision NOT NULL,
    sharpe_ratio double precision,
    maximum_drawdown_percent double precision,
    volatility double precision,
    win_loss_ratio double precision,
    winning_trades integer,
    losing_trades integer,
    average_win_usd double precision,
    average_loss_usd double precision,
    largest_win_usd double precision,
    largest_loss_usd double precision,
    performance_score double precision,
    risk_penalty double precision,
    trust_score double precision NOT NULL,
    data_points integer NOT NULL,
    calculation_version character varying(20) NOT NULL,
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE public.trader_performance_metrics OWNER TO xorj;

--
-- Name: trader_profiles; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.trader_profiles (
    trader_id uuid NOT NULL,
    wallet_address character varying(44) NOT NULL,
    first_seen timestamp with time zone NOT NULL,
    last_activity timestamp with time zone NOT NULL,
    is_active boolean,
    total_trades integer,
    total_volume_sol double precision,
    created_at timestamp with time zone NOT NULL,
    updated_at timestamp with time zone NOT NULL,
    current_trust_score double precision,
    performance_rank integer
);


ALTER TABLE public.trader_profiles OWNER TO xorj;

--
-- Name: trader_rankings; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.trader_rankings (
    ranking_id uuid NOT NULL,
    calculation_timestamp timestamp with time zone NOT NULL,
    period_days integer NOT NULL,
    algorithm_version character varying(20) NOT NULL,
    wallet_address character varying(44) NOT NULL,
    rank integer NOT NULL,
    trust_score double precision NOT NULL,
    performance_metrics jsonb NOT NULL,
    eligibility_check jsonb NOT NULL,
    min_trust_score_tier character varying(20) NOT NULL,
    is_eligible boolean NOT NULL,
    created_at timestamp with time zone NOT NULL
);


ALTER TABLE public.trader_rankings OWNER TO xorj;

--
-- Name: trader_scores; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.trader_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    wallet_address character varying(255) NOT NULL,
    xorj_trust_score numeric(5,2) NOT NULL,
    win_rate numeric(5,2),
    total_return numeric(10,2),
    max_drawdown numeric(5,2),
    trade_count integer DEFAULT 0,
    percentile numeric(5,2),
    trend character varying(20),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.trader_scores OWNER TO xorj;

--
-- Name: trader_transactions; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.trader_transactions (
    transaction_id uuid NOT NULL,
    wallet_address character varying(44) NOT NULL,
    signature character varying(128) NOT NULL,
    block_time timestamp with time zone NOT NULL,
    slot bigint NOT NULL,
    transaction_type character varying(50) NOT NULL,
    program_id character varying(44) NOT NULL,
    input_token_mint character varying(44),
    output_token_mint character varying(44),
    input_amount bigint,
    output_amount bigint,
    input_decimals integer,
    output_decimals integer,
    input_usd double precision,
    output_usd double precision,
    net_usd double precision,
    processed_at timestamp with time zone NOT NULL,
    price_data_source character varying(50),
    raw_transaction_data jsonb
);


ALTER TABLE public.trader_transactions OWNER TO xorj;

--
-- Name: trades; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.trades (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id uuid,
    user_id uuid NOT NULL,
    symbol character varying(50) NOT NULL,
    side public.trade_side NOT NULL,
    quantity numeric(20,8) NOT NULL,
    price numeric(20,8),
    status public.trade_status DEFAULT 'pending'::public.trade_status NOT NULL,
    transaction_hash character varying(255),
    slippage numeric(5,2),
    fees numeric(20,8),
    executed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    client_order_id character varying(255),
    user_vault_address character varying(255),
    from_token_address character varying(255),
    to_token_address character varying(255),
    amount_in numeric(20,8),
    expected_amount_out numeric(20,8)
);


ALTER TABLE public.trades OWNER TO xorj;

--
-- Name: user_risk_profiles; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.user_risk_profiles (
    user_id character varying(255) NOT NULL,
    wallet_address character varying(64) NOT NULL,
    risk_profile character varying(20) NOT NULL,
    max_position_size_sol numeric(20,10) NOT NULL,
    max_daily_trades integer NOT NULL,
    auto_trading_enabled boolean DEFAULT true NOT NULL,
    vault_address character varying(64),
    last_updated timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT user_risk_profiles_max_daily_trades_check CHECK ((max_daily_trades > 0)),
    CONSTRAINT user_risk_profiles_max_position_size_sol_check CHECK ((max_position_size_sol > (0)::numeric)),
    CONSTRAINT user_risk_profiles_risk_profile_check CHECK (((risk_profile)::text = ANY ((ARRAY['conservative'::character varying, 'moderate'::character varying, 'aggressive'::character varying])::text[])))
);


ALTER TABLE public.user_risk_profiles OWNER TO xorj;

--
-- Name: user_settings; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.user_settings (
    user_id uuid NOT NULL,
    risk_profile public.risk_profile DEFAULT 'balanced'::public.risk_profile NOT NULL,
    max_trade_amount numeric(20,8) DEFAULT 1000 NOT NULL,
    slippage_tolerance numeric(5,2) DEFAULT 1.0 NOT NULL,
    auto_compound boolean DEFAULT false NOT NULL,
    notifications_enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.user_settings OWNER TO xorj;

--
-- Name: users; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_address character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.users OWNER TO xorj;

--
-- Name: waitlist_signups; Type: TABLE; Schema: public; Owner: xorj
--

CREATE TABLE public.waitlist_signups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255) NOT NULL,
    wallet_address character varying(255),
    status public.waitlist_status DEFAULT 'pending'::public.waitlist_status NOT NULL,
    signup_source public.signup_source DEFAULT 'website'::public.signup_source NOT NULL,
    referral_code character varying(50),
    "position" integer,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.waitlist_signups OWNER TO xorj;

--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: bot_states bot_states_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.bot_states
    ADD CONSTRAINT bot_states_pkey PRIMARY KEY (user_wallet);


--
-- Name: compliance_events compliance_events_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.compliance_events
    ADD CONSTRAINT compliance_events_pkey PRIMARY KEY (id);


--
-- Name: data_ingestion_log data_ingestion_log_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.data_ingestion_log
    ADD CONSTRAINT data_ingestion_log_pkey PRIMARY KEY (ingestion_id);


--
-- Name: execution_jobs execution_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.execution_jobs
    ADD CONSTRAINT execution_jobs_pkey PRIMARY KEY (id);


--
-- Name: parsed_raydium_swaps parsed_raydium_swaps_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.parsed_raydium_swaps
    ADD CONSTRAINT parsed_raydium_swaps_pkey PRIMARY KEY (id);


--
-- Name: parsed_raydium_swaps parsed_raydium_swaps_signature_key; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.parsed_raydium_swaps
    ADD CONSTRAINT parsed_raydium_swaps_signature_key UNIQUE (signature);


--
-- Name: raw_transactions raw_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.raw_transactions
    ADD CONSTRAINT raw_transactions_pkey PRIMARY KEY (id);


--
-- Name: raw_transactions raw_transactions_signature_key; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.raw_transactions
    ADD CONSTRAINT raw_transactions_signature_key UNIQUE (signature);


--
-- Name: scoring_runs scoring_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.scoring_runs
    ADD CONSTRAINT scoring_runs_pkey PRIMARY KEY (id);


--
-- Name: swap_history swap_history_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.swap_history
    ADD CONSTRAINT swap_history_pkey PRIMARY KEY (id);


--
-- Name: swap_history swap_history_signature_key; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.swap_history
    ADD CONSTRAINT swap_history_signature_key UNIQUE (signature);


--
-- Name: trade_execution_audit_log trade_execution_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.trade_execution_audit_log
    ADD CONSTRAINT trade_execution_audit_log_pkey PRIMARY KEY (entry_id);


--
-- Name: trader_performance_metrics trader_performance_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.trader_performance_metrics
    ADD CONSTRAINT trader_performance_metrics_pkey PRIMARY KEY (metrics_id);


--
-- Name: trader_profiles trader_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.trader_profiles
    ADD CONSTRAINT trader_profiles_pkey PRIMARY KEY (trader_id);


--
-- Name: trader_rankings trader_rankings_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.trader_rankings
    ADD CONSTRAINT trader_rankings_pkey PRIMARY KEY (ranking_id);


--
-- Name: trader_scores trader_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.trader_scores
    ADD CONSTRAINT trader_scores_pkey PRIMARY KEY (id);


--
-- Name: trader_transactions trader_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.trader_transactions
    ADD CONSTRAINT trader_transactions_pkey PRIMARY KEY (transaction_id);


--
-- Name: trades trades_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_pkey PRIMARY KEY (id);


--
-- Name: trades trades_transaction_hash_key; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_transaction_hash_key UNIQUE (transaction_hash);


--
-- Name: user_risk_profiles user_risk_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.user_risk_profiles
    ADD CONSTRAINT user_risk_profiles_pkey PRIMARY KEY (user_id);


--
-- Name: user_settings user_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_pkey PRIMARY KEY (user_id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_wallet_address_key; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_wallet_address_key UNIQUE (wallet_address);


--
-- Name: waitlist_signups waitlist_signups_email_key; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.waitlist_signups
    ADD CONSTRAINT waitlist_signups_email_key UNIQUE (email);


--
-- Name: waitlist_signups waitlist_signups_pkey; Type: CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.waitlist_signups
    ADD CONSTRAINT waitlist_signups_pkey PRIMARY KEY (id);


--
-- Name: idx_audit_log_created_at; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_audit_log_created_at ON public.audit_log USING btree (created_at);


--
-- Name: idx_audit_log_table_name; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_audit_log_table_name ON public.audit_log USING btree (table_name);


--
-- Name: idx_bot_states_enabled; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_bot_states_enabled ON public.bot_states USING btree (enabled);


--
-- Name: idx_bot_states_last_updated; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_bot_states_last_updated ON public.bot_states USING btree (last_updated);


--
-- Name: idx_bot_states_status; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_bot_states_status ON public.bot_states USING btree (status);


--
-- Name: idx_compliance_events_resolved; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_compliance_events_resolved ON public.compliance_events USING btree (resolved);


--
-- Name: idx_execution_jobs_status; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_execution_jobs_status ON public.execution_jobs USING btree (status);


--
-- Name: idx_execution_jobs_user_id; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_execution_jobs_user_id ON public.execution_jobs USING btree (user_id);


--
-- Name: idx_ingestion_status_time; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_ingestion_status_time ON public.data_ingestion_log USING btree (status, started_at);


--
-- Name: idx_parsed_raydium_swaps_ingestion_job_id; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_parsed_raydium_swaps_ingestion_job_id ON public.parsed_raydium_swaps USING btree (ingestion_job_id);


--
-- Name: idx_parsed_raydium_swaps_signature; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_parsed_raydium_swaps_signature ON public.parsed_raydium_swaps USING btree (signature);


--
-- Name: idx_parsed_raydium_swaps_wallet_address; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_parsed_raydium_swaps_wallet_address ON public.parsed_raydium_swaps USING btree (wallet_address);


--
-- Name: idx_swap_history_block_time; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_swap_history_block_time ON public.swap_history USING btree (block_time DESC);


--
-- Name: idx_swap_history_wallet_address; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_swap_history_wallet_address ON public.swap_history USING btree (wallet_address);


--
-- Name: idx_trade_execution_audit_log_correlation_id; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trade_execution_audit_log_correlation_id ON public.trade_execution_audit_log USING btree (correlation_id) WHERE (correlation_id IS NOT NULL);


--
-- Name: idx_trade_execution_audit_log_event_correlation; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trade_execution_audit_log_event_correlation ON public.trade_execution_audit_log USING btree (event_type, correlation_id) WHERE (correlation_id IS NOT NULL);


--
-- Name: idx_trade_execution_audit_log_event_type; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trade_execution_audit_log_event_type ON public.trade_execution_audit_log USING btree (event_type);


--
-- Name: idx_trade_execution_audit_log_severity; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trade_execution_audit_log_severity ON public.trade_execution_audit_log USING btree (severity);


--
-- Name: idx_trade_execution_audit_log_timestamp; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trade_execution_audit_log_timestamp ON public.trade_execution_audit_log USING btree ("timestamp" DESC);


--
-- Name: idx_trade_execution_audit_log_tx_sig; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trade_execution_audit_log_tx_sig ON public.trade_execution_audit_log USING btree (transaction_signature) WHERE (transaction_signature IS NOT NULL);


--
-- Name: idx_trade_execution_audit_log_user_id; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trade_execution_audit_log_user_id ON public.trade_execution_audit_log USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_trade_execution_audit_log_wallet; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trade_execution_audit_log_wallet ON public.trade_execution_audit_log USING btree (wallet_address) WHERE (wallet_address IS NOT NULL);


--
-- Name: idx_trader_activity; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trader_activity ON public.trader_profiles USING btree (last_activity, is_active);


--
-- Name: idx_trader_metrics_roi; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trader_metrics_roi ON public.trader_performance_metrics USING btree (net_roi_percent, period_days);


--
-- Name: idx_trader_metrics_trust_score; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trader_metrics_trust_score ON public.trader_performance_metrics USING btree (trust_score, period_days);


--
-- Name: idx_trader_metrics_wallet_period; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trader_metrics_wallet_period ON public.trader_performance_metrics USING btree (wallet_address, period_days, calculation_date);


--
-- Name: idx_trader_ranking_current; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trader_ranking_current ON public.trader_rankings USING btree (calculation_timestamp, rank, is_eligible);


--
-- Name: idx_trader_ranking_trust_tier; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trader_ranking_trust_tier ON public.trader_rankings USING btree (min_trust_score_tier, rank);


--
-- Name: idx_trader_scores_run_id; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trader_scores_run_id ON public.trader_scores USING btree (run_id);


--
-- Name: idx_trader_scores_wallet_address; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trader_scores_wallet_address ON public.trader_scores USING btree (wallet_address);


--
-- Name: idx_trader_trust_score; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trader_trust_score ON public.trader_profiles USING btree (current_trust_score) WHERE is_active;


--
-- Name: idx_trader_tx_type_time; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trader_tx_type_time ON public.trader_transactions USING btree (transaction_type, block_time);


--
-- Name: idx_trader_tx_usd_value; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trader_tx_usd_value ON public.trader_transactions USING btree (net_usd) WHERE (net_usd IS NOT NULL);


--
-- Name: idx_trader_tx_wallet_time; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trader_tx_wallet_time ON public.trader_transactions USING btree (wallet_address, block_time);


--
-- Name: idx_trades_status; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trades_status ON public.trades USING btree (status);


--
-- Name: idx_trades_symbol; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trades_symbol ON public.trades USING btree (symbol);


--
-- Name: idx_trades_user_id; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_trades_user_id ON public.trades USING btree (user_id);


--
-- Name: idx_user_risk_profiles_auto_trading; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_user_risk_profiles_auto_trading ON public.user_risk_profiles USING btree (auto_trading_enabled);


--
-- Name: idx_user_risk_profiles_wallet; Type: INDEX; Schema: public; Owner: xorj
--

CREATE UNIQUE INDEX idx_user_risk_profiles_wallet ON public.user_risk_profiles USING btree (wallet_address);


--
-- Name: idx_users_wallet_address; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX idx_users_wallet_address ON public.users USING btree (wallet_address);


--
-- Name: ix_trader_performance_metrics_calculation_date; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX ix_trader_performance_metrics_calculation_date ON public.trader_performance_metrics USING btree (calculation_date);


--
-- Name: ix_trader_performance_metrics_trust_score; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX ix_trader_performance_metrics_trust_score ON public.trader_performance_metrics USING btree (trust_score);


--
-- Name: ix_trader_performance_metrics_wallet_address; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX ix_trader_performance_metrics_wallet_address ON public.trader_performance_metrics USING btree (wallet_address);


--
-- Name: ix_trader_profiles_current_trust_score; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX ix_trader_profiles_current_trust_score ON public.trader_profiles USING btree (current_trust_score);


--
-- Name: ix_trader_profiles_is_active; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX ix_trader_profiles_is_active ON public.trader_profiles USING btree (is_active);


--
-- Name: ix_trader_profiles_performance_rank; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX ix_trader_profiles_performance_rank ON public.trader_profiles USING btree (performance_rank);


--
-- Name: ix_trader_profiles_wallet_address; Type: INDEX; Schema: public; Owner: xorj
--

CREATE UNIQUE INDEX ix_trader_profiles_wallet_address ON public.trader_profiles USING btree (wallet_address);


--
-- Name: ix_trader_rankings_calculation_timestamp; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX ix_trader_rankings_calculation_timestamp ON public.trader_rankings USING btree (calculation_timestamp);


--
-- Name: ix_trader_rankings_is_eligible; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX ix_trader_rankings_is_eligible ON public.trader_rankings USING btree (is_eligible);


--
-- Name: ix_trader_rankings_min_trust_score_tier; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX ix_trader_rankings_min_trust_score_tier ON public.trader_rankings USING btree (min_trust_score_tier);


--
-- Name: ix_trader_rankings_rank; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX ix_trader_rankings_rank ON public.trader_rankings USING btree (rank);


--
-- Name: ix_trader_rankings_wallet_address; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX ix_trader_rankings_wallet_address ON public.trader_rankings USING btree (wallet_address);


--
-- Name: ix_trader_transactions_block_time; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX ix_trader_transactions_block_time ON public.trader_transactions USING btree (block_time);


--
-- Name: ix_trader_transactions_signature; Type: INDEX; Schema: public; Owner: xorj
--

CREATE UNIQUE INDEX ix_trader_transactions_signature ON public.trader_transactions USING btree (signature);


--
-- Name: ix_trader_transactions_wallet_address; Type: INDEX; Schema: public; Owner: xorj
--

CREATE INDEX ix_trader_transactions_wallet_address ON public.trader_transactions USING btree (wallet_address);


--
-- Name: trades_client_order_id_user_id_key; Type: INDEX; Schema: public; Owner: xorj
--

CREATE UNIQUE INDEX trades_client_order_id_user_id_key ON public.trades USING btree (client_order_id, user_id) WHERE (client_order_id IS NOT NULL);


--
-- Name: execution_jobs execution_jobs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.execution_jobs
    ADD CONSTRAINT execution_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: parsed_raydium_swaps parsed_raydium_swaps_raw_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.parsed_raydium_swaps
    ADD CONSTRAINT parsed_raydium_swaps_raw_transaction_id_fkey FOREIGN KEY (raw_transaction_id) REFERENCES public.raw_transactions(id);


--
-- Name: trader_scores trader_scores_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.trader_scores
    ADD CONSTRAINT trader_scores_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.scoring_runs(id) ON DELETE CASCADE;


--
-- Name: trades trades_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.execution_jobs(id) ON DELETE SET NULL;


--
-- Name: trades trades_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.trades
    ADD CONSTRAINT trades_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_settings user_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: xorj
--

ALTER TABLE ONLY public.user_settings
    ADD CONSTRAINT user_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict bxSixWfDOA1V2KW6VIcTddZrRwhcqz7qpdWofMQ8H5R2K3MBzmPPAsmVSerV9m6

