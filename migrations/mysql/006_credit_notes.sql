CREATE TABLE IF NOT EXISTS credit_note_sequences (
  id INT PRIMARY KEY DEFAULT 1,
  next_value BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO credit_note_sequences (id, next_value) VALUES (1, 50001);

CREATE TABLE IF NOT EXISTS credit_notes (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  credit_number VARCHAR(100) NOT NULL UNIQUE,
  invoice_id BIGINT NOT NULL,
  order_id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  vat DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  reason TEXT NOT NULL,
  created_by BIGINT NOT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_credit_invoice FOREIGN KEY (invoice_id) REFERENCES invoices(id),
  CONSTRAINT fk_credit_order FOREIGN KEY (order_id) REFERENCES sales_orders(id),
  CONSTRAINT fk_credit_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
