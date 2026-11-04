-- ============================================================================
-- OpenFSM: Multi-Tenant Relational Schema (RDS Pattern 2: Single Database, Multiple Schemas)
-- ============================================================================
-- Target Engines: PostgreSQL 14+ / MySQL 8.0+
-- Tenant 1: tenant_alpha (Apex HVAC Solutions)
-- Tenant 2: tenant_beta  (BlueSky Telecom Services)
-- Tenant 3: tenant_gamma (GreenField Electrical & Power)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TENANT 1: tenant_alpha
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS tenant_alpha;

CREATE TABLE IF NOT EXISTS tenant_alpha.customers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(64),
    email VARCHAR(255),
    phone VARCHAR(64),
    service_address VARCHAR(255),
    city VARCHAR(100),
    postal_code VARCHAR(32),
    contract_type VARCHAR(32) DEFAULT 'STANDARD',
    status VARCHAR(32) DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_alpha.technicians (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(64),
    specialty VARCHAR(100),
    skills JSONB,
    certification_level VARCHAR(32) DEFAULT 'LEVEL_1',
    vehicle_id VARCHAR(64),
    status VARCHAR(32) DEFAULT 'AVAILABLE',
    current_latitude NUMERIC(10, 6) DEFAULT 0.0,
    current_longitude NUMERIC(10, 6) DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_alpha.work_orders (
    id VARCHAR(64) PRIMARY KEY,
    customer_id VARCHAR(64) REFERENCES tenant_alpha.customers(id) ON DELETE CASCADE,
    assigned_technician_id VARCHAR(64) REFERENCES tenant_alpha.technicians(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(32) DEFAULT 'NORMAL',
    status VARCHAR(32) DEFAULT 'CREATED',
    sla_due_date TIMESTAMP WITH TIME ZONE,
    estimated_hours NUMERIC(6, 2) DEFAULT 2.00,
    created_by VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_alpha.visits (
    id VARCHAR(64) PRIMARY KEY,
    work_order_id VARCHAR(64) REFERENCES tenant_alpha.work_orders(id) ON DELETE CASCADE,
    technician_id VARCHAR(64) REFERENCES tenant_alpha.technicians(id) ON DELETE SET NULL,
    scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
    scheduled_end TIMESTAMP WITH TIME ZONE,
    actual_start TIMESTAMP WITH TIME ZONE,
    actual_end TIMESTAMP WITH TIME ZONE,
    status VARCHAR(32) DEFAULT 'SCHEDULED',
    notes TEXT,
    checklist JSONB,
    evidence_photos JSONB,
    signature_key VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_alpha.inventory_items (
    id VARCHAR(64) PRIMARY KEY,
    sku VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    unit_cost NUMERIC(10, 2) DEFAULT 0.00,
    unit_price NUMERIC(10, 2) DEFAULT 0.00,
    stock_quantity INTEGER DEFAULT 0,
    warehouse_location VARCHAR(100),
    reorder_point INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_alpha.work_order_parts (
    id VARCHAR(64) PRIMARY KEY,
    work_order_id VARCHAR(64) REFERENCES tenant_alpha.work_orders(id) ON DELETE CASCADE,
    inventory_item_id VARCHAR(64) REFERENCES tenant_alpha.inventory_items(id) ON DELETE CASCADE,
    quantity_used INTEGER DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- TENANT 2: tenant_beta
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS tenant_beta;

CREATE TABLE IF NOT EXISTS tenant_beta.customers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(64),
    email VARCHAR(255),
    phone VARCHAR(64),
    service_address VARCHAR(255),
    city VARCHAR(100),
    postal_code VARCHAR(32),
    contract_type VARCHAR(32) DEFAULT 'STANDARD',
    status VARCHAR(32) DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_beta.technicians (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(64),
    specialty VARCHAR(100),
    skills JSONB,
    certification_level VARCHAR(32) DEFAULT 'LEVEL_1',
    vehicle_id VARCHAR(64),
    status VARCHAR(32) DEFAULT 'AVAILABLE',
    current_latitude NUMERIC(10, 6) DEFAULT 0.0,
    current_longitude NUMERIC(10, 6) DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_beta.work_orders (
    id VARCHAR(64) PRIMARY KEY,
    customer_id VARCHAR(64) REFERENCES tenant_beta.customers(id) ON DELETE CASCADE,
    assigned_technician_id VARCHAR(64) REFERENCES tenant_beta.technicians(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(32) DEFAULT 'NORMAL',
    status VARCHAR(32) DEFAULT 'CREATED',
    sla_due_date TIMESTAMP WITH TIME ZONE,
    estimated_hours NUMERIC(6, 2) DEFAULT 2.00,
    created_by VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_beta.visits (
    id VARCHAR(64) PRIMARY KEY,
    work_order_id VARCHAR(64) REFERENCES tenant_beta.work_orders(id) ON DELETE CASCADE,
    technician_id VARCHAR(64) REFERENCES tenant_beta.technicians(id) ON DELETE SET NULL,
    scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
    scheduled_end TIMESTAMP WITH TIME ZONE,
    actual_start TIMESTAMP WITH TIME ZONE,
    actual_end TIMESTAMP WITH TIME ZONE,
    status VARCHAR(32) DEFAULT 'SCHEDULED',
    notes TEXT,
    checklist JSONB,
    evidence_photos JSONB,
    signature_key VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_beta.inventory_items (
    id VARCHAR(64) PRIMARY KEY,
    sku VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    unit_cost NUMERIC(10, 2) DEFAULT 0.00,
    unit_price NUMERIC(10, 2) DEFAULT 0.00,
    stock_quantity INTEGER DEFAULT 0,
    warehouse_location VARCHAR(100),
    reorder_point INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_beta.work_order_parts (
    id VARCHAR(64) PRIMARY KEY,
    work_order_id VARCHAR(64) REFERENCES tenant_beta.work_orders(id) ON DELETE CASCADE,
    inventory_item_id VARCHAR(64) REFERENCES tenant_beta.inventory_items(id) ON DELETE CASCADE,
    quantity_used INTEGER DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------------------------
-- TENANT 3: tenant_gamma
-- ----------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS tenant_gamma;

CREATE TABLE IF NOT EXISTS tenant_gamma.customers (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    tax_id VARCHAR(64),
    email VARCHAR(255),
    phone VARCHAR(64),
    service_address VARCHAR(255),
    city VARCHAR(100),
    postal_code VARCHAR(32),
    contract_type VARCHAR(32) DEFAULT 'STANDARD',
    status VARCHAR(32) DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_gamma.technicians (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(64),
    specialty VARCHAR(100),
    skills JSONB,
    certification_level VARCHAR(32) DEFAULT 'LEVEL_1',
    vehicle_id VARCHAR(64),
    status VARCHAR(32) DEFAULT 'AVAILABLE',
    current_latitude NUMERIC(10, 6) DEFAULT 0.0,
    current_longitude NUMERIC(10, 6) DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_gamma.work_orders (
    id VARCHAR(64) PRIMARY KEY,
    customer_id VARCHAR(64) REFERENCES tenant_gamma.customers(id) ON DELETE CASCADE,
    assigned_technician_id VARCHAR(64) REFERENCES tenant_gamma.technicians(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    priority VARCHAR(32) DEFAULT 'NORMAL',
    status VARCHAR(32) DEFAULT 'CREATED',
    sla_due_date TIMESTAMP WITH TIME ZONE,
    estimated_hours NUMERIC(6, 2) DEFAULT 2.00,
    created_by VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_gamma.visits (
    id VARCHAR(64) PRIMARY KEY,
    work_order_id VARCHAR(64) REFERENCES tenant_gamma.work_orders(id) ON DELETE CASCADE,
    technician_id VARCHAR(64) REFERENCES tenant_gamma.technicians(id) ON DELETE SET NULL,
    scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
    scheduled_end TIMESTAMP WITH TIME ZONE,
    actual_start TIMESTAMP WITH TIME ZONE,
    actual_end TIMESTAMP WITH TIME ZONE,
    status VARCHAR(32) DEFAULT 'SCHEDULED',
    notes TEXT,
    checklist JSONB,
    evidence_photos JSONB,
    signature_key VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_gamma.inventory_items (
    id VARCHAR(64) PRIMARY KEY,
    sku VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100),
    unit_cost NUMERIC(10, 2) DEFAULT 0.00,
    unit_price NUMERIC(10, 2) DEFAULT 0.00,
    stock_quantity INTEGER DEFAULT 0,
    warehouse_location VARCHAR(100),
    reorder_point INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tenant_gamma.work_order_parts (
    id VARCHAR(64) PRIMARY KEY,
    work_order_id VARCHAR(64) REFERENCES tenant_gamma.work_orders(id) ON DELETE CASCADE,
    inventory_item_id VARCHAR(64) REFERENCES tenant_gamma.inventory_items(id) ON DELETE CASCADE,
    quantity_used INTEGER DEFAULT 1,
    unit_price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_alpha_wo_status ON tenant_alpha.work_orders(status);
CREATE INDEX IF NOT EXISTS idx_alpha_visits_status ON tenant_alpha.visits(status);
CREATE INDEX IF NOT EXISTS idx_beta_wo_status ON tenant_beta.work_orders(status);
CREATE INDEX IF NOT EXISTS idx_beta_visits_status ON tenant_beta.visits(status);
CREATE INDEX IF NOT EXISTS idx_gamma_wo_status ON tenant_gamma.work_orders(status);
CREATE INDEX IF NOT EXISTS idx_gamma_visits_status ON tenant_gamma.visits(status);

