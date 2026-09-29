CREATE TABLE IF NOT EXISTS customer_product_prices (
  customer_id BIGINT NOT NULL,
  sku VARCHAR(100) NOT NULL,
  unit_price DECIMAL(12,2) NOT NULL,
  updated_by BIGINT NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (customer_id, sku),
  CONSTRAINT fk_custom_price_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
