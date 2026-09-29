ALTER TABLE sales_order_lines ADD CONSTRAINT chk_lines_qty_positive CHECK (qty > 0);
ALTER TABLE sales_order_lines ADD CONSTRAINT chk_lines_prices_nonneg CHECK (unit_price >= 0 AND line_total >= 0);
ALTER TABLE sales_orders ADD CONSTRAINT chk_orders_totals_nonneg CHECK (subtotal >= 0 AND vat >= 0 AND total >= 0);
ALTER TABLE invoices ADD CONSTRAINT chk_invoices_totals_nonneg CHECK (subtotal >= 0 AND vat >= 0 AND total >= 0);
ALTER TABLE credit_notes ADD CONSTRAINT chk_credits_totals_nonneg CHECK (subtotal >= 0 AND vat >= 0 AND total >= 0);
ALTER TABLE stock_balances ADD CONSTRAINT chk_stock_qty_nonneg CHECK (qty >= 0 AND reserved >= 0);
ALTER TABLE customer_product_prices ADD CONSTRAINT chk_custom_price_nonneg CHECK (unit_price >= 0);
ALTER TABLE users ADD CONSTRAINT chk_failed_logins_nonneg CHECK (failed_login_count >= 0);
