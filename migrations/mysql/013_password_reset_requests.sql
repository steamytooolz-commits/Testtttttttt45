CREATE TABLE IF NOT EXISTS password_reset_requests (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NULL,
  email VARCHAR(255) NOT NULL,
  status ENUM('PENDING', 'FULFILLED', 'DISMISSED') NOT NULL DEFAULT 'PENDING',
  requested_ip VARCHAR(45) NOT NULL,
  created_at DATETIME NOT NULL,
  resolved_at DATETIME NULL,
  resolved_by BIGINT NULL,
  INDEX idx_pwd_reset_status (status),
  INDEX idx_pwd_reset_email (email),
  CONSTRAINT fk_pwd_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
