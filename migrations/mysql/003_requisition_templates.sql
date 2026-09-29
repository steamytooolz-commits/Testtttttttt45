 
CREATE TABLE IF NOT EXISTS requisition_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  items_json LONGTEXT NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_req_customer (customer_id),
  CONSTRAINT fk_req_customer FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
