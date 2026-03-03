-- CocoCash Wallet DB Schema
-- PostgreSQL (RDS Aurora)
-- RF-15: Persist transactional and account data

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- ACCOUNTS TABLE
-- RF-04: Digital wallet account
-- RF-05: Monetary balance
-- ============================================
CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE,
    account_number VARCHAR(20) NOT NULL UNIQUE, -- RF-XX: Public identifier
    balance DECIMAL(18, 2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'CCC',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT chk_balance_non_negative CHECK (balance >= 0),
    CONSTRAINT chk_status CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED'))
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
-- Index for public account number lookups
CREATE INDEX IF NOT EXISTS idx_accounts_number ON accounts(account_number);

-- ============================================
-- TRANSFERS TABLE
-- RF-07: Transfer records
-- RF-09: Async processing with status tracking
-- ============================================
CREATE TABLE IF NOT EXISTS transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_account_id UUID NOT NULL REFERENCES accounts(id),
    destination_account_id UUID NOT NULL REFERENCES accounts(id),
    transfer_code VARCHAR(20) NOT NULL UNIQUE, -- Public receipt code
    amount DECIMAL(18, 2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'CCC',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP WITH TIME ZONE,
    failure_reason TEXT,
    
    CONSTRAINT chk_amount_positive CHECK (amount > 0),
    CONSTRAINT chk_different_accounts CHECK (source_account_id != destination_account_id),
    CONSTRAINT chk_transfer_status CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'))
);

-- Indexes for transfer queries
CREATE INDEX IF NOT EXISTS idx_transfers_source ON transfers(source_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_destination ON transfers(destination_account_id);
CREATE INDEX IF NOT EXISTS idx_transfers_transfer_code ON transfers(transfer_code);
CREATE INDEX IF NOT EXISTS idx_transfers_status ON transfers(status);
CREATE INDEX IF NOT EXISTS idx_transfers_created ON transfers(created_at DESC);

-- ============================================
-- FUNCTION: Update timestamp trigger
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_accounts_updated_at ON accounts;
CREATE TRIGGER trg_accounts_updated_at
    BEFORE UPDATE ON accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================
-- SEED DATA: Primordial rich account
-- Initial money supply for prototype
-- ============================================
INSERT INTO accounts (id, user_id, account_number, balance, currency, status)
VALUES (
    'a0000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    '1000000000',
    1000000.00,
    'CCC',
    'ACTIVE'
) ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE accounts IS 'Digital wallet accounts for CocoCash users';
COMMENT ON TABLE transfers IS 'Transfer records with async processing status';
