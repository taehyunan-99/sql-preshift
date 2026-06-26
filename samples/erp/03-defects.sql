-- ERP intentional defects: NOT VALID foreign keys for broken-referential diagnostics demo.
-- Applied AFTER data load so existing orphan rows are not scanned (NOT VALID skips validation).
-- VALIDATE CONSTRAINT is intentionally never run (would fail on orphans).

ALTER TABLE ONLY public.order_items
    ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) NOT VALID;

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id) NOT VALID;

ANALYZE;
