 
 
ALTER TABLE price_tiers MODIFY COLUMN basis TEXT NOT NULL;

INSERT IGNORE INTO price_tiers (id, code, name, basis, active) VALUES
(1, 'TIER_1', 'Standard Wholesale', '{"SKU-PPR-A4-80G":"85.00","SKU-PPR-A4-75G":"79.50","SKU-PEN-BLU-05":"110.00","SKU-PEN-RED-05":"110.00","SKU-FIL-LVR-BLK":"42.00","SKU-FIL-LVR-BLU":"42.00"}', 1),
(2, 'TIER_2', 'Commercial Volume Wholesale', '{"SKU-PPR-A4-80G":"78.50","SKU-PPR-A4-75G":"73.00","SKU-PEN-BLU-05":"98.00","SKU-PEN-RED-05":"98.00","SKU-FIL-LVR-BLK":"38.50","SKU-FIL-LVR-BLU":"38.50"}', 1),
(3, 'TIER_3', 'Government & Educational Contract', '{"SKU-PPR-A4-80G":"72.00","SKU-PPR-A4-75G":"68.00","SKU-PEN-BLU-05":"92.50","SKU-PEN-RED-05":"92.50","SKU-FIL-LVR-BLK":"35.00","SKU-FIL-LVR-BLU":"35.00"}', 1);

INSERT IGNORE INTO stock_balances (sku, qty, reserved, updated_at) VALUES
('SKU-PPR-A4-80G', 1500, 0, UTC_TIMESTAMP()),
('SKU-PPR-A4-75G', 1200, 0, UTC_TIMESTAMP()),
('SKU-PEN-BLU-05', 800, 0, UTC_TIMESTAMP()),
('SKU-PEN-RED-05', 600, 0, UTC_TIMESTAMP()),
('SKU-FIL-LVR-BLK', 450, 0, UTC_TIMESTAMP()),
('SKU-FIL-LVR-BLU', 400, 0, UTC_TIMESTAMP());
