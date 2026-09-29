ALTER TABLE customers ADD COLUMN IF NOT EXISTS public_id CHAR(36) NULL;
UPDATE customers SET public_id = UUID() WHERE public_id IS NULL;
ALTER TABLE customers MODIFY COLUMN public_id CHAR(36) NOT NULL;
ALTER TABLE customers ADD CONSTRAINT uq_customers_public_id UNIQUE (public_id);
