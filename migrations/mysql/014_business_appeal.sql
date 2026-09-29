ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_type VARCHAR(50) NULL AFTER is_new_prospect;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS vat_number VARCHAR(20) NULL AFTER business_type;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(12,2) NULL AFTER vat_number;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(20) NOT NULL DEFAULT 'NET_30' AFTER credit_limit;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500) NULL AFTER payment_terms;

CREATE TABLE IF NOT EXISTS business_settings (
  id INT PRIMARY KEY DEFAULT 1,
  company_name VARCHAR(255) NOT NULL DEFAULT 'Stationery Depot (Pty) Ltd',
  tagline VARCHAR(255) NOT NULL DEFAULT 'Wholesale Stationery • Since 2016',
  vat_number VARCHAR(20) NOT NULL DEFAULT '4920184729',
  reg_number VARCHAR(20) NOT NULL DEFAULT '2016/214905/07',
  phone VARCHAR(50) NOT NULL DEFAULT '+27 11 888 4000',
  email VARCHAR(255) NOT NULL DEFAULT 'accounts@stationerydepot.co.za',
  address_json JSON NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO business_settings (id, address_json, updated_at) VALUES (1, '{"street":"14 Apex Commerce Park","city":"Midrand","province":"Gauteng","postal_code":"1685"}', UTC_TIMESTAMP());
