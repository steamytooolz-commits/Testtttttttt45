 
 
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  executed_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50) NOT NULL,
  address_json JSON NOT NULL,
  status ENUM('PENDING_APPROVAL', 'APPROVED', 'SUSPENDED') NOT NULL DEFAULT 'PENDING_APPROVAL',
  created_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT NULL,
  role ENUM('CUSTOMER', 'SALES_STAFF', 'ADMIN') NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  totp_secret_encrypted TEXT NOT NULL,
  status ENUM('PENDING_APPROVAL', 'APPROVED', 'SUSPENDED') NOT NULL DEFAULT 'PENDING_APPROVAL',
  failed_login_count INT NOT NULL DEFAULT 0,
  locked_until DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_users_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS price_tiers (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  basis TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_tier_assignments (
  customer_id BIGINT NOT NULL,
  tier_id BIGINT NOT NULL,
  assigned_by BIGINT NOT NULL,
  assigned_at DATETIME NOT NULL,
  PRIMARY KEY (customer_id, tier_id),
  CONSTRAINT fk_tier_assign_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  CONSTRAINT fk_tier_assign_tier FOREIGN KEY (tier_id) REFERENCES price_tiers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS draft_orders (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT NOT NULL UNIQUE,
  payload_json JSON NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_draft_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_orders (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(100) NOT NULL UNIQUE,
  customer_id BIGINT NOT NULL,
  status ENUM('PENDING_SALES_REVIEW', 'APPROVED', 'INVOICED', 'FULFILLED', 'CANCELLED') NOT NULL DEFAULT 'PENDING_SALES_REVIEW',
  subtotal DECIMAL(12,2) NOT NULL,
  vat DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  cancel_reason TEXT NULL,
  created_by BIGINT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_sales_orders_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sales_order_lines (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT NOT NULL,
  sku VARCHAR(100) NOT NULL,
  description_snapshot VARCHAR(255) NOT NULL,
  qty INT NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  tier_code VARCHAR(50) NOT NULL,
  vat_rate DECIMAL(5,2) NOT NULL,
  line_total DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_lines_order FOREIGN KEY (order_id) REFERENCES sales_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoice_sequences (
  id INT PRIMARY KEY DEFAULT 1,
  next_value BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO invoice_sequences (id, next_value) VALUES (1, 10001);

CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(100) NOT NULL UNIQUE,
  order_id BIGINT NOT NULL,
  issued_by BIGINT NOT NULL,
  issued_at DATETIME NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  vat DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  status ENUM('ISSUED', 'CREDITED') NOT NULL DEFAULT 'ISSUED',
  CONSTRAINT fk_invoices_order FOREIGN KEY (order_id) REFERENCES sales_orders(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_balances (
  sku VARCHAR(100) PRIMARY KEY,
  qty INT NOT NULL DEFAULT 0,
  reserved INT NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(100) NOT NULL,
  delta INT NOT NULL,
  reason ENUM('ORDER', 'ADJUSTMENT', 'IMPORT', 'REFUND') NOT NULL,
  ref_type VARCHAR(50) NOT NULL,
  ref_id VARCHAR(100) NOT NULL,
  actor BIGINT NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_stock_movements_sku (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  actor_id BIGINT NULL,
  actor_role VARCHAR(50) NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id VARCHAR(100) NOT NULL,
  before_hash VARCHAR(64) NULL,
  after_hash VARCHAR(64) NULL,
  ip VARCHAR(45) NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX idx_audit_created_at (created_at),
  INDEX idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
