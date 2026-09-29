-- Payment proofs: customer-uploaded proof of payment (bank transfer receipt)
-- attached at checkout. Sales staff review them from the staff dashboard.
CREATE TABLE IF NOT EXISTS payment_proofs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT NOT NULL,
  customer_id BIGINT NOT NULL,
  filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INT NOT NULL,
  sha256 CHAR(64) NOT NULL,
  uploaded_by BIGINT NOT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT fk_proof_order FOREIGN KEY (order_id) REFERENCES sales_orders(id),
  CONSTRAINT fk_proof_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_payment_proofs_order ON payment_proofs(order_id);
CREATE INDEX idx_payment_proofs_customer ON payment_proofs(customer_id);
