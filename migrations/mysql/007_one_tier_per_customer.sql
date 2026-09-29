DELETE cta1 FROM customer_tier_assignments cta1
JOIN customer_tier_assignments cta2 ON cta1.customer_id = cta2.customer_id AND cta1.assigned_at < cta2.assigned_at;

DELETE cta1 FROM customer_tier_assignments cta1
JOIN customer_tier_assignments cta2 ON cta1.customer_id = cta2.customer_id AND cta1.assigned_at = cta2.assigned_at AND cta1.tier_id < cta2.tier_id;

ALTER TABLE customer_tier_assignments DROP PRIMARY KEY, ADD PRIMARY KEY (customer_id);
