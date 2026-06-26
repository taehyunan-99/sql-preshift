-- ERP sample data. Generated via pg_dump --data-only --inserts --disable-triggers.
-- Includes intentional defects: orphan FK values, sentinels, soft-deleted parents,
-- near-saturated NULL columns. Loaded with NOT VALID FKs absent (see 03-defects.sql).

--
-- PostgreSQL database dump
--

\restrict 1vCQKjlqVViwQ7COxXEbhqweYl4QPiXJ7wbdscRr4bLUhqd0H8pyT9nDvV3abPG

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: activity_log; Type: TABLE DATA; Schema: public; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE public.activity_log DISABLE TRIGGER ALL;



ALTER TABLE public.activity_log ENABLE TRIGGER ALL;

--
-- Data for Name: countries; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.countries DISABLE TRIGGER ALL;

INSERT INTO public.countries VALUES (1, 'US', 'USA');
INSERT INTO public.countries VALUES (2, 'KR', 'Korea');


ALTER TABLE public.countries ENABLE TRIGGER ALL;

--
-- Data for Name: states; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.states DISABLE TRIGGER ALL;

INSERT INTO public.states VALUES (1, 1, 'CA', 'California');
INSERT INTO public.states VALUES (2, 2, '11', 'Seoul');


ALTER TABLE public.states ENABLE TRIGGER ALL;

--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.users DISABLE TRIGGER ALL;

INSERT INTO public.users VALUES (1, 'a@x.com', 'A', '2026-06-25 13:52:58.051076');
INSERT INTO public.users VALUES (2, 'b@x.com', 'B', '2026-06-25 13:52:58.051076');
INSERT INTO public.users VALUES (3, 'c@x.com', 'C', '2026-06-25 13:52:58.051076');


ALTER TABLE public.users ENABLE TRIGGER ALL;

--
-- Data for Name: addresses; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.addresses DISABLE TRIGGER ALL;

INSERT INTO public.addresses VALUES (1, 1, 1, 'L1', 'City', NULL);


ALTER TABLE public.addresses ENABLE TRIGGER ALL;

--
-- Data for Name: promotions; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.promotions DISABLE TRIGGER ALL;

INSERT INTO public.promotions VALUES (1, 'Launch', NULL, NULL);


ALTER TABLE public.promotions ENABLE TRIGGER ALL;

--
-- Data for Name: coupons; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.coupons DISABLE TRIGGER ALL;

INSERT INTO public.coupons VALUES (1, 1, 'SAVE10');


ALTER TABLE public.coupons ENABLE TRIGGER ALL;

--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.orders DISABLE TRIGGER ALL;

INSERT INTO public.orders VALUES (1, 1, 1, 1, 'complete', NULL, '2026-06-25 13:52:58.051076');
INSERT INTO public.orders VALUES (2, 1, 1, 0, 'complete', NULL, '2026-06-25 13:52:58.051076');
INSERT INTO public.orders VALUES (3, 1, 1, NULL, 'complete', NULL, '2026-06-25 13:52:58.051076');
INSERT INTO public.orders VALUES (4, 2, 1, NULL, 'complete', NULL, '2026-06-25 13:52:58.051076');
INSERT INTO public.orders VALUES (5, 2, 1, NULL, 'complete', NULL, '2026-06-25 13:52:58.051076');
INSERT INTO public.orders VALUES (6, 2, 1, NULL, 'complete', NULL, '2026-06-25 13:52:58.051076');
INSERT INTO public.orders VALUES (7, 3, 1, NULL, 'complete', NULL, '2026-06-25 13:52:58.051076');
INSERT INTO public.orders VALUES (8, 3, 1, NULL, 'complete', NULL, '2026-06-25 13:52:58.051076');
INSERT INTO public.orders VALUES (9, 3, 1, NULL, 'complete', NULL, '2026-06-25 13:52:58.051076');
INSERT INTO public.orders VALUES (10, 3, 1, NULL, 'complete', NULL, '2026-06-25 13:52:58.051076');


ALTER TABLE public.orders ENABLE TRIGGER ALL;

--
-- Data for Name: adjustments; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.adjustments DISABLE TRIGGER ALL;



ALTER TABLE public.adjustments ENABLE TRIGGER ALL;

--
-- Data for Name: api_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.api_tokens DISABLE TRIGGER ALL;



ALTER TABLE public.api_tokens ENABLE TRIGGER ALL;

--
-- Data for Name: brands; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.brands DISABLE TRIGGER ALL;

INSERT INTO public.brands VALUES (1, 'Acme');


ALTER TABLE public.brands ENABLE TRIGGER ALL;

--
-- Data for Name: calculators; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.calculators DISABLE TRIGGER ALL;



ALTER TABLE public.calculators ENABLE TRIGGER ALL;

--
-- Data for Name: carriers; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.carriers DISABLE TRIGGER ALL;

INSERT INTO public.carriers VALUES (1, 'UPS');


ALTER TABLE public.carriers ENABLE TRIGGER ALL;

--
-- Data for Name: carts; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.carts DISABLE TRIGGER ALL;



ALTER TABLE public.carts ENABLE TRIGGER ALL;

--
-- Data for Name: categories; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.categories DISABLE TRIGGER ALL;

INSERT INTO public.categories VALUES (1, 'Root', NULL);
INSERT INTO public.categories VALUES (2, 'Sub', 1);


ALTER TABLE public.categories ENABLE TRIGGER ALL;

--
-- Data for Name: shipping_categories; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.shipping_categories DISABLE TRIGGER ALL;

INSERT INTO public.shipping_categories VALUES (1, 'Default');


ALTER TABLE public.shipping_categories ENABLE TRIGGER ALL;

--
-- Data for Name: tax_categories; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.tax_categories DISABLE TRIGGER ALL;

INSERT INTO public.tax_categories VALUES (1, 'Standard');


ALTER TABLE public.tax_categories ENABLE TRIGGER ALL;

--
-- Data for Name: products; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.products DISABLE TRIGGER ALL;

INSERT INTO public.products VALUES (1, 1, 1, 1, 1, 'P1', 10.00, NULL, '2026-06-25 13:52:58.051076');
INSERT INTO public.products VALUES (2, 1, 1, 1, 1, 'P2', 20.00, NULL, '2026-06-25 13:52:58.051076');
INSERT INTO public.products VALUES (3, 2, 1, 1, 1, 'P3', 30.00, NULL, '2026-06-25 13:52:58.051076');
INSERT INTO public.products VALUES (4, 2, 1, 1, 1, 'P4', 40.00, NULL, '2026-06-25 13:52:58.051076');
INSERT INTO public.products VALUES (5, 2, 1, 1, 1, 'P5-deleted', 50.00, '2026-06-25 13:52:58.051076', '2026-06-25 13:52:58.051076');


ALTER TABLE public.products ENABLE TRIGGER ALL;

--
-- Data for Name: product_variants; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.product_variants DISABLE TRIGGER ALL;



ALTER TABLE public.product_variants ENABLE TRIGGER ALL;

--
-- Data for Name: cart_items; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.cart_items DISABLE TRIGGER ALL;



ALTER TABLE public.cart_items ENABLE TRIGGER ALL;

--
-- Data for Name: category_closure; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.category_closure DISABLE TRIGGER ALL;



ALTER TABLE public.category_closure ENABLE TRIGGER ALL;

--
-- Data for Name: chart_of_accounts; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.chart_of_accounts DISABLE TRIGGER ALL;



ALTER TABLE public.chart_of_accounts ENABLE TRIGGER ALL;

--
-- Data for Name: cms_pages; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.cms_pages DISABLE TRIGGER ALL;



ALTER TABLE public.cms_pages ENABLE TRIGGER ALL;

--
-- Data for Name: comments; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.comments DISABLE TRIGGER ALL;



ALTER TABLE public.comments ENABLE TRIGGER ALL;

--
-- Data for Name: credit_cards; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.credit_cards DISABLE TRIGGER ALL;



ALTER TABLE public.credit_cards ENABLE TRIGGER ALL;

--
-- Data for Name: customer_groups; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.customer_groups DISABLE TRIGGER ALL;



ALTER TABLE public.customer_groups ENABLE TRIGGER ALL;

--
-- Data for Name: customer_group_members; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.customer_group_members DISABLE TRIGGER ALL;



ALTER TABLE public.customer_group_members ENABLE TRIGGER ALL;

--
-- Data for Name: return_reasons; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.return_reasons DISABLE TRIGGER ALL;

INSERT INTO public.return_reasons VALUES (1, 'Defective');
INSERT INTO public.return_reasons VALUES (2, 'Wrong item');


ALTER TABLE public.return_reasons ENABLE TRIGGER ALL;

--
-- Data for Name: return_authorizations; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.return_authorizations DISABLE TRIGGER ALL;

INSERT INTO public.return_authorizations VALUES (1, 1, 1, 'pending');


ALTER TABLE public.return_authorizations ENABLE TRIGGER ALL;

--
-- Data for Name: customer_returns; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.customer_returns DISABLE TRIGGER ALL;



ALTER TABLE public.customer_returns ENABLE TRIGGER ALL;

--
-- Data for Name: employees; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.employees DISABLE TRIGGER ALL;

INSERT INTO public.employees VALUES (1, NULL, 'E1');
INSERT INTO public.employees VALUES (2, NULL, 'E2');
INSERT INTO public.employees VALUES (3, 1, 'E3');
INSERT INTO public.employees VALUES (4, 1, 'E4');
INSERT INTO public.employees VALUES (5, 1, 'E5');
INSERT INTO public.employees VALUES (6, 1, 'E6');
INSERT INTO public.employees VALUES (7, 1, 'E7');
INSERT INTO public.employees VALUES (8, 1, 'E8');
INSERT INTO public.employees VALUES (9, 1, 'E9');
INSERT INTO public.employees VALUES (10, 1, 'E10');
INSERT INTO public.employees VALUES (11, 1, 'E11');
INSERT INTO public.employees VALUES (12, 1, 'E12');
INSERT INTO public.employees VALUES (13, 1, 'E13');
INSERT INTO public.employees VALUES (14, 1, 'E14');
INSERT INTO public.employees VALUES (15, 1, 'E15');
INSERT INTO public.employees VALUES (16, 1, 'E16');
INSERT INTO public.employees VALUES (17, 1, 'E17');
INSERT INTO public.employees VALUES (18, 1, 'E18');
INSERT INTO public.employees VALUES (19, 1, 'E19');
INSERT INTO public.employees VALUES (20, 1, 'E20');


ALTER TABLE public.employees ENABLE TRIGGER ALL;

--
-- Data for Name: departments; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.departments DISABLE TRIGGER ALL;



ALTER TABLE public.departments ENABLE TRIGGER ALL;

--
-- Data for Name: email_log; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.email_log DISABLE TRIGGER ALL;



ALTER TABLE public.email_log ENABLE TRIGGER ALL;

--
-- Data for Name: event_log; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.event_log DISABLE TRIGGER ALL;



ALTER TABLE public.event_log ENABLE TRIGGER ALL;

--
-- Data for Name: feature_flags; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.feature_flags DISABLE TRIGGER ALL;



ALTER TABLE public.feature_flags ENABLE TRIGGER ALL;

--
-- Data for Name: fiscal_periods; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.fiscal_periods DISABLE TRIGGER ALL;



ALTER TABLE public.fiscal_periods ENABLE TRIGGER ALL;

--
-- Data for Name: suppliers; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.suppliers DISABLE TRIGGER ALL;



ALTER TABLE public.suppliers ENABLE TRIGGER ALL;

--
-- Data for Name: purchase_orders; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.purchase_orders DISABLE TRIGGER ALL;



ALTER TABLE public.purchase_orders ENABLE TRIGGER ALL;

--
-- Data for Name: goods_receipts; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.goods_receipts DISABLE TRIGGER ALL;



ALTER TABLE public.goods_receipts ENABLE TRIGGER ALL;

--
-- Data for Name: purchase_order_lines; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.purchase_order_lines DISABLE TRIGGER ALL;



ALTER TABLE public.purchase_order_lines ENABLE TRIGGER ALL;

--
-- Data for Name: goods_receipt_lines; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.goods_receipt_lines DISABLE TRIGGER ALL;



ALTER TABLE public.goods_receipt_lines ENABLE TRIGGER ALL;

--
-- Data for Name: import_staging; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.import_staging DISABLE TRIGGER ALL;



ALTER TABLE public.import_staging ENABLE TRIGGER ALL;

--
-- Data for Name: inventory; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.inventory DISABLE TRIGGER ALL;

INSERT INTO public.inventory VALUES (1, 1, 100);
INSERT INTO public.inventory VALUES (2, 5, 0);


ALTER TABLE public.inventory ENABLE TRIGGER ALL;

--
-- Data for Name: shipping_methods; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.shipping_methods DISABLE TRIGGER ALL;

INSERT INTO public.shipping_methods VALUES (1, 'Ground');


ALTER TABLE public.shipping_methods ENABLE TRIGGER ALL;

--
-- Data for Name: stock_locations; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.stock_locations DISABLE TRIGGER ALL;

INSERT INTO public.stock_locations VALUES (1, 'Main WH');


ALTER TABLE public.stock_locations ENABLE TRIGGER ALL;

--
-- Data for Name: shipments; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.shipments DISABLE TRIGGER ALL;

INSERT INTO public.shipments VALUES (1, 1, 1, 1, 1, 1, 'TRK1');
INSERT INTO public.shipments VALUES (2, 2, 1, 1, 1, NULL, 'TRK2');
INSERT INTO public.shipments VALUES (3, 3, 1, 1, 1, NULL, 'TRK3');
INSERT INTO public.shipments VALUES (4, 4, 1, 1, 1, NULL, 'TRK4');
INSERT INTO public.shipments VALUES (5, 5, 1, 1, 1, NULL, 'TRK5');
INSERT INTO public.shipments VALUES (6, 6, 1, 1, 1, NULL, 'TRK6');
INSERT INTO public.shipments VALUES (7, 7, 1, 1, 1, NULL, 'TRK7');
INSERT INTO public.shipments VALUES (8, 8, 1, 1, 1, NULL, 'TRK8');
INSERT INTO public.shipments VALUES (9, 9, 1, 1, 1, NULL, 'TRK9');
INSERT INTO public.shipments VALUES (10, 10, 1, 1, 1, NULL, 'TRK10');
INSERT INTO public.shipments VALUES (11, 1, 1, 1, 1, NULL, 'TRK11');
INSERT INTO public.shipments VALUES (12, 2, 1, 1, 1, NULL, 'TRK12');
INSERT INTO public.shipments VALUES (13, 3, 1, 1, 1, NULL, 'TRK13');
INSERT INTO public.shipments VALUES (14, 4, 1, 1, 1, NULL, 'TRK14');
INSERT INTO public.shipments VALUES (15, 5, 1, 1, 1, NULL, 'TRK15');
INSERT INTO public.shipments VALUES (16, 6, 1, 1, 1, NULL, 'TRK16');
INSERT INTO public.shipments VALUES (17, 7, 1, 1, 1, NULL, 'TRK17');
INSERT INTO public.shipments VALUES (18, 8, 1, 1, 1, NULL, 'TRK18');
INSERT INTO public.shipments VALUES (19, 9, 1, 1, 1, NULL, 'TRK19');
INSERT INTO public.shipments VALUES (20, 10, 1, 1, 1, NULL, 'TRK20');
INSERT INTO public.shipments VALUES (21, 1, 1, 1, 1, NULL, 'TRK21');
INSERT INTO public.shipments VALUES (22, 2, 1, 1, 1, NULL, 'TRK22');
INSERT INTO public.shipments VALUES (23, 3, 1, 1, 1, NULL, 'TRK23');
INSERT INTO public.shipments VALUES (24, 4, 1, 1, 1, NULL, 'TRK24');
INSERT INTO public.shipments VALUES (25, 5, 1, 1, 1, NULL, 'TRK25');
INSERT INTO public.shipments VALUES (26, 6, 1, 1, 1, NULL, 'TRK26');
INSERT INTO public.shipments VALUES (27, 7, 1, 1, 1, NULL, 'TRK27');
INSERT INTO public.shipments VALUES (28, 8, 1, 1, 1, NULL, 'TRK28');
INSERT INTO public.shipments VALUES (29, 9, 1, 1, 1, NULL, 'TRK29');
INSERT INTO public.shipments VALUES (30, 10, 1, 1, 1, NULL, 'TRK30');
INSERT INTO public.shipments VALUES (31, 1, 1, 1, 1, NULL, 'TRK31');
INSERT INTO public.shipments VALUES (32, 2, 1, 1, 1, NULL, 'TRK32');
INSERT INTO public.shipments VALUES (33, 3, 1, 1, 1, NULL, 'TRK33');
INSERT INTO public.shipments VALUES (34, 4, 1, 1, 1, NULL, 'TRK34');
INSERT INTO public.shipments VALUES (35, 5, 1, 1, 1, NULL, 'TRK35');
INSERT INTO public.shipments VALUES (36, 6, 1, 1, 1, NULL, 'TRK36');
INSERT INTO public.shipments VALUES (37, 7, 1, 1, 1, NULL, 'TRK37');
INSERT INTO public.shipments VALUES (38, 8, 1, 1, 1, NULL, 'TRK38');
INSERT INTO public.shipments VALUES (39, 9, 1, 1, 1, NULL, 'TRK39');
INSERT INTO public.shipments VALUES (40, 10, 1, 1, 1, NULL, 'TRK40');
INSERT INTO public.shipments VALUES (41, 1, 1, 1, 1, NULL, 'TRK41');
INSERT INTO public.shipments VALUES (42, 2, 1, 1, 1, NULL, 'TRK42');
INSERT INTO public.shipments VALUES (43, 3, 1, 1, 1, NULL, 'TRK43');
INSERT INTO public.shipments VALUES (44, 4, 1, 1, 1, NULL, 'TRK44');
INSERT INTO public.shipments VALUES (45, 5, 1, 1, 1, NULL, 'TRK45');
INSERT INTO public.shipments VALUES (46, 6, 1, 1, 1, NULL, 'TRK46');
INSERT INTO public.shipments VALUES (47, 7, 1, 1, 1, NULL, 'TRK47');
INSERT INTO public.shipments VALUES (48, 8, 1, 1, 1, NULL, 'TRK48');
INSERT INTO public.shipments VALUES (49, 9, 1, 1, 1, NULL, 'TRK49');
INSERT INTO public.shipments VALUES (50, 10, 1, 1, 1, NULL, 'TRK50');
INSERT INTO public.shipments VALUES (51, 1, 1, 1, 1, NULL, 'TRK51');
INSERT INTO public.shipments VALUES (52, 2, 1, 1, 1, NULL, 'TRK52');
INSERT INTO public.shipments VALUES (53, 3, 1, 1, 1, NULL, 'TRK53');
INSERT INTO public.shipments VALUES (54, 4, 1, 1, 1, NULL, 'TRK54');
INSERT INTO public.shipments VALUES (55, 5, 1, 1, 1, NULL, 'TRK55');
INSERT INTO public.shipments VALUES (56, 6, 1, 1, 1, NULL, 'TRK56');
INSERT INTO public.shipments VALUES (57, 7, 1, 1, 1, NULL, 'TRK57');
INSERT INTO public.shipments VALUES (58, 8, 1, 1, 1, NULL, 'TRK58');
INSERT INTO public.shipments VALUES (59, 9, 1, 1, 1, NULL, 'TRK59');
INSERT INTO public.shipments VALUES (60, 10, 1, 1, 1, NULL, 'TRK60');
INSERT INTO public.shipments VALUES (61, 1, 1, 1, 1, NULL, 'TRK61');
INSERT INTO public.shipments VALUES (62, 2, 1, 1, 1, NULL, 'TRK62');
INSERT INTO public.shipments VALUES (63, 3, 1, 1, 1, NULL, 'TRK63');
INSERT INTO public.shipments VALUES (64, 4, 1, 1, 1, NULL, 'TRK64');
INSERT INTO public.shipments VALUES (65, 5, 1, 1, 1, NULL, 'TRK65');
INSERT INTO public.shipments VALUES (66, 6, 1, 1, 1, NULL, 'TRK66');
INSERT INTO public.shipments VALUES (67, 7, 1, 1, 1, NULL, 'TRK67');
INSERT INTO public.shipments VALUES (68, 8, 1, 1, 1, NULL, 'TRK68');
INSERT INTO public.shipments VALUES (69, 9, 1, 1, 1, NULL, 'TRK69');
INSERT INTO public.shipments VALUES (70, 10, 1, 1, 1, NULL, 'TRK70');
INSERT INTO public.shipments VALUES (71, 1, 1, 1, 1, NULL, 'TRK71');
INSERT INTO public.shipments VALUES (72, 2, 1, 1, 1, NULL, 'TRK72');
INSERT INTO public.shipments VALUES (73, 3, 1, 1, 1, NULL, 'TRK73');
INSERT INTO public.shipments VALUES (74, 4, 1, 1, 1, NULL, 'TRK74');
INSERT INTO public.shipments VALUES (75, 5, 1, 1, 1, NULL, 'TRK75');
INSERT INTO public.shipments VALUES (76, 6, 1, 1, 1, NULL, 'TRK76');
INSERT INTO public.shipments VALUES (77, 7, 1, 1, 1, NULL, 'TRK77');
INSERT INTO public.shipments VALUES (78, 8, 1, 1, 1, NULL, 'TRK78');
INSERT INTO public.shipments VALUES (79, 9, 1, 1, 1, NULL, 'TRK79');
INSERT INTO public.shipments VALUES (80, 10, 1, 1, 1, NULL, 'TRK80');
INSERT INTO public.shipments VALUES (81, 1, 1, 1, 1, NULL, 'TRK81');
INSERT INTO public.shipments VALUES (82, 2, 1, 1, 1, NULL, 'TRK82');
INSERT INTO public.shipments VALUES (83, 3, 1, 1, 1, NULL, 'TRK83');
INSERT INTO public.shipments VALUES (84, 4, 1, 1, 1, NULL, 'TRK84');
INSERT INTO public.shipments VALUES (85, 5, 1, 1, 1, NULL, 'TRK85');
INSERT INTO public.shipments VALUES (86, 6, 1, 1, 1, NULL, 'TRK86');
INSERT INTO public.shipments VALUES (87, 7, 1, 1, 1, NULL, 'TRK87');
INSERT INTO public.shipments VALUES (88, 8, 1, 1, 1, NULL, 'TRK88');
INSERT INTO public.shipments VALUES (89, 9, 1, 1, 1, NULL, 'TRK89');
INSERT INTO public.shipments VALUES (90, 10, 1, 1, 1, NULL, 'TRK90');
INSERT INTO public.shipments VALUES (91, 1, 1, 1, 1, NULL, 'TRK91');
INSERT INTO public.shipments VALUES (92, 2, 1, 1, 1, NULL, 'TRK92');
INSERT INTO public.shipments VALUES (93, 3, 1, 1, 1, NULL, 'TRK93');
INSERT INTO public.shipments VALUES (94, 4, 1, 1, 1, NULL, 'TRK94');
INSERT INTO public.shipments VALUES (95, 5, 1, 1, 1, NULL, 'TRK95');
INSERT INTO public.shipments VALUES (96, 6, 1, 1, 1, NULL, 'TRK96');
INSERT INTO public.shipments VALUES (97, 7, 1, 1, 1, NULL, 'TRK97');
INSERT INTO public.shipments VALUES (98, 8, 1, 1, 1, NULL, 'TRK98');
INSERT INTO public.shipments VALUES (99, 9, 1, 1, 1, NULL, 'TRK99');
INSERT INTO public.shipments VALUES (100, 10, 1, 1, 1, NULL, 'TRK100');


ALTER TABLE public.shipments ENABLE TRIGGER ALL;

--
-- Data for Name: inventory_units; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.inventory_units DISABLE TRIGGER ALL;



ALTER TABLE public.inventory_units ENABLE TRIGGER ALL;

--
-- Data for Name: invoices; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.invoices DISABLE TRIGGER ALL;



ALTER TABLE public.invoices ENABLE TRIGGER ALL;

--
-- Data for Name: order_items; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.order_items DISABLE TRIGGER ALL;

INSERT INTO public.order_items VALUES (1, 1, 1, 1, 10.00, 'P1');
INSERT INTO public.order_items VALUES (2, 1, 2, 1, 20.00, 'P2');
INSERT INTO public.order_items VALUES (3, 2, 5, 1, 50.00, 'P5-deleted');
INSERT INTO public.order_items VALUES (4, 3, 99999, 1, 99.00, 'Removed SKU');
INSERT INTO public.order_items VALUES (5, 4, 99998, 1, 99.00, 'Removed SKU2');


ALTER TABLE public.order_items ENABLE TRIGGER ALL;

--
-- Data for Name: invoice_lines; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.invoice_lines DISABLE TRIGGER ALL;



ALTER TABLE public.invoice_lines ENABLE TRIGGER ALL;

--
-- Data for Name: journals; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.journals DISABLE TRIGGER ALL;



ALTER TABLE public.journals ENABLE TRIGGER ALL;

--
-- Data for Name: journal_entries; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.journal_entries DISABLE TRIGGER ALL;



ALTER TABLE public.journal_entries ENABLE TRIGGER ALL;

--
-- Data for Name: journal_entry_lines; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.journal_entry_lines DISABLE TRIGGER ALL;



ALTER TABLE public.journal_entry_lines ENABLE TRIGGER ALL;

--
-- Data for Name: notifications; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.notifications DISABLE TRIGGER ALL;



ALTER TABLE public.notifications ENABLE TRIGGER ALL;

--
-- Data for Name: option_types; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.option_types DISABLE TRIGGER ALL;



ALTER TABLE public.option_types ENABLE TRIGGER ALL;

--
-- Data for Name: option_values; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.option_values DISABLE TRIGGER ALL;



ALTER TABLE public.option_values ENABLE TRIGGER ALL;

--
-- Data for Name: order_promotions; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.order_promotions DISABLE TRIGGER ALL;



ALTER TABLE public.order_promotions ENABLE TRIGGER ALL;

--
-- Data for Name: order_state_changes; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.order_state_changes DISABLE TRIGGER ALL;



ALTER TABLE public.order_state_changes ENABLE TRIGGER ALL;

--
-- Data for Name: payment_methods; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.payment_methods DISABLE TRIGGER ALL;



ALTER TABLE public.payment_methods ENABLE TRIGGER ALL;

--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.payments DISABLE TRIGGER ALL;



ALTER TABLE public.payments ENABLE TRIGGER ALL;

--
-- Data for Name: payment_capture_events; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.payment_capture_events DISABLE TRIGGER ALL;



ALTER TABLE public.payment_capture_events ENABLE TRIGGER ALL;

--
-- Data for Name: payroll_runs; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.payroll_runs DISABLE TRIGGER ALL;



ALTER TABLE public.payroll_runs ENABLE TRIGGER ALL;

--
-- Data for Name: payroll_entries; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.payroll_entries DISABLE TRIGGER ALL;



ALTER TABLE public.payroll_entries ENABLE TRIGGER ALL;

--
-- Data for Name: permissions; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.permissions DISABLE TRIGGER ALL;



ALTER TABLE public.permissions ENABLE TRIGGER ALL;

--
-- Data for Name: positions; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.positions DISABLE TRIGGER ALL;



ALTER TABLE public.positions ENABLE TRIGGER ALL;

--
-- Data for Name: prices; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.prices DISABLE TRIGGER ALL;



ALTER TABLE public.prices ENABLE TRIGGER ALL;

--
-- Data for Name: product_categories; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.product_categories DISABLE TRIGGER ALL;



ALTER TABLE public.product_categories ENABLE TRIGGER ALL;

--
-- Data for Name: product_images; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.product_images DISABLE TRIGGER ALL;



ALTER TABLE public.product_images ENABLE TRIGGER ALL;

--
-- Data for Name: properties; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.properties DISABLE TRIGGER ALL;



ALTER TABLE public.properties ENABLE TRIGGER ALL;

--
-- Data for Name: product_properties; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.product_properties DISABLE TRIGGER ALL;



ALTER TABLE public.product_properties ENABLE TRIGGER ALL;

--
-- Data for Name: promotion_actions; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.promotion_actions DISABLE TRIGGER ALL;



ALTER TABLE public.promotion_actions ENABLE TRIGGER ALL;

--
-- Data for Name: promotion_rules; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.promotion_rules DISABLE TRIGGER ALL;



ALTER TABLE public.promotion_rules ENABLE TRIGGER ALL;

--
-- Data for Name: refunds; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.refunds DISABLE TRIGGER ALL;



ALTER TABLE public.refunds ENABLE TRIGGER ALL;

--
-- Data for Name: reimbursements; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.reimbursements DISABLE TRIGGER ALL;



ALTER TABLE public.reimbursements ENABLE TRIGGER ALL;

--
-- Data for Name: return_items; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.return_items DISABLE TRIGGER ALL;



ALTER TABLE public.return_items ENABLE TRIGGER ALL;

--
-- Data for Name: roles; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.roles DISABLE TRIGGER ALL;



ALTER TABLE public.roles ENABLE TRIGGER ALL;

--
-- Data for Name: role_permissions; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.role_permissions DISABLE TRIGGER ALL;



ALTER TABLE public.role_permissions ENABLE TRIGGER ALL;

--
-- Data for Name: role_users; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.role_users DISABLE TRIGGER ALL;



ALTER TABLE public.role_users ENABLE TRIGGER ALL;

--
-- Data for Name: shipping_method_categories; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.shipping_method_categories DISABLE TRIGGER ALL;



ALTER TABLE public.shipping_method_categories ENABLE TRIGGER ALL;

--
-- Data for Name: zones; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.zones DISABLE TRIGGER ALL;



ALTER TABLE public.zones ENABLE TRIGGER ALL;

--
-- Data for Name: shipping_method_zones; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.shipping_method_zones DISABLE TRIGGER ALL;



ALTER TABLE public.shipping_method_zones ENABLE TRIGGER ALL;

--
-- Data for Name: stock_items; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.stock_items DISABLE TRIGGER ALL;



ALTER TABLE public.stock_items ENABLE TRIGGER ALL;

--
-- Data for Name: stock_movements; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.stock_movements DISABLE TRIGGER ALL;



ALTER TABLE public.stock_movements ENABLE TRIGGER ALL;

--
-- Data for Name: stock_transfers; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.stock_transfers DISABLE TRIGGER ALL;



ALTER TABLE public.stock_transfers ENABLE TRIGGER ALL;

--
-- Data for Name: supplier_products; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.supplier_products DISABLE TRIGGER ALL;



ALTER TABLE public.supplier_products ENABLE TRIGGER ALL;

--
-- Data for Name: tax_exemptions; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.tax_exemptions DISABLE TRIGGER ALL;



ALTER TABLE public.tax_exemptions ENABLE TRIGGER ALL;

--
-- Data for Name: tax_rates; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.tax_rates DISABLE TRIGGER ALL;



ALTER TABLE public.tax_rates ENABLE TRIGGER ALL;

--
-- Data for Name: variant_option_values; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.variant_option_values DISABLE TRIGGER ALL;



ALTER TABLE public.variant_option_values ENABLE TRIGGER ALL;

--
-- Data for Name: vendor_invoices; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.vendor_invoices DISABLE TRIGGER ALL;



ALTER TABLE public.vendor_invoices ENABLE TRIGGER ALL;

--
-- Data for Name: warehouse_zones; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.warehouse_zones DISABLE TRIGGER ALL;



ALTER TABLE public.warehouse_zones ENABLE TRIGGER ALL;

--
-- Data for Name: wishlists; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.wishlists DISABLE TRIGGER ALL;



ALTER TABLE public.wishlists ENABLE TRIGGER ALL;

--
-- Data for Name: zone_members; Type: TABLE DATA; Schema: public; Owner: -
--

ALTER TABLE public.zone_members DISABLE TRIGGER ALL;



ALTER TABLE public.zone_members ENABLE TRIGGER ALL;

--
-- Name: activity_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.activity_log_id_seq', 1, false);


--
-- Name: addresses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.addresses_id_seq', 1, true);


--
-- Name: adjustments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.adjustments_id_seq', 1, false);


--
-- Name: api_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.api_tokens_id_seq', 1, false);


--
-- Name: brands_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.brands_id_seq', 1, true);


--
-- Name: calculators_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.calculators_id_seq', 1, false);


--
-- Name: carriers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.carriers_id_seq', 1, true);


--
-- Name: cart_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cart_items_id_seq', 1, false);


--
-- Name: carts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.carts_id_seq', 1, false);


--
-- Name: categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.categories_id_seq', 2, true);


--
-- Name: chart_of_accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.chart_of_accounts_id_seq', 1, false);


--
-- Name: cms_pages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cms_pages_id_seq', 1, false);


--
-- Name: comments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.comments_id_seq', 1, false);


--
-- Name: countries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.countries_id_seq', 2, true);


--
-- Name: coupons_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.coupons_id_seq', 1, true);


--
-- Name: credit_cards_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.credit_cards_id_seq', 1, false);


--
-- Name: customer_groups_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customer_groups_id_seq', 1, false);


--
-- Name: customer_returns_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.customer_returns_id_seq', 1, false);


--
-- Name: departments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.departments_id_seq', 1, false);


--
-- Name: email_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.email_log_id_seq', 1, false);


--
-- Name: employees_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.employees_id_seq', 20, true);


--
-- Name: event_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.event_log_id_seq', 1, false);


--
-- Name: feature_flags_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.feature_flags_id_seq', 1, false);


--
-- Name: fiscal_periods_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.fiscal_periods_id_seq', 1, false);


--
-- Name: goods_receipt_lines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.goods_receipt_lines_id_seq', 1, false);


--
-- Name: goods_receipts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.goods_receipts_id_seq', 1, false);


--
-- Name: import_staging_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.import_staging_id_seq', 1, false);


--
-- Name: inventory_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.inventory_id_seq', 2, true);


--
-- Name: inventory_units_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.inventory_units_id_seq', 1, false);


--
-- Name: invoice_lines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.invoice_lines_id_seq', 1, false);


--
-- Name: invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.invoices_id_seq', 1, false);


--
-- Name: journal_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.journal_entries_id_seq', 1, false);


--
-- Name: journal_entry_lines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.journal_entry_lines_id_seq', 1, false);


--
-- Name: journals_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.journals_id_seq', 1, false);


--
-- Name: notifications_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.notifications_id_seq', 1, false);


--
-- Name: option_types_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.option_types_id_seq', 1, false);


--
-- Name: option_values_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.option_values_id_seq', 1, false);


--
-- Name: order_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_items_id_seq', 5, true);


--
-- Name: order_state_changes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.order_state_changes_id_seq', 1, false);


--
-- Name: orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.orders_id_seq', 10, true);


--
-- Name: payment_capture_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.payment_capture_events_id_seq', 1, false);


--
-- Name: payment_methods_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.payment_methods_id_seq', 1, false);


--
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.payments_id_seq', 1, false);


--
-- Name: payroll_entries_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.payroll_entries_id_seq', 1, false);


--
-- Name: payroll_runs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.payroll_runs_id_seq', 1, false);


--
-- Name: permissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.permissions_id_seq', 1, false);


--
-- Name: positions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.positions_id_seq', 1, false);


--
-- Name: prices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.prices_id_seq', 1, false);


--
-- Name: product_images_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_images_id_seq', 1, false);


--
-- Name: product_variants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.product_variants_id_seq', 1, false);


--
-- Name: products_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.products_id_seq', 5, true);


--
-- Name: promotion_actions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.promotion_actions_id_seq', 1, false);


--
-- Name: promotion_rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.promotion_rules_id_seq', 1, false);


--
-- Name: promotions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.promotions_id_seq', 1, true);


--
-- Name: properties_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.properties_id_seq', 1, false);


--
-- Name: purchase_order_lines_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchase_order_lines_id_seq', 1, false);


--
-- Name: purchase_orders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.purchase_orders_id_seq', 1, false);


--
-- Name: refunds_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.refunds_id_seq', 1, false);


--
-- Name: reimbursements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.reimbursements_id_seq', 1, false);


--
-- Name: return_authorizations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.return_authorizations_id_seq', 1, true);


--
-- Name: return_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.return_items_id_seq', 1, false);


--
-- Name: return_reasons_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.return_reasons_id_seq', 2, true);


--
-- Name: roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.roles_id_seq', 1, false);


--
-- Name: shipments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shipments_id_seq', 100, true);


--
-- Name: shipping_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shipping_categories_id_seq', 1, true);


--
-- Name: shipping_methods_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.shipping_methods_id_seq', 1, true);


--
-- Name: states_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.states_id_seq', 2, true);


--
-- Name: stock_items_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.stock_items_id_seq', 1, false);


--
-- Name: stock_locations_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.stock_locations_id_seq', 1, true);


--
-- Name: stock_movements_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.stock_movements_id_seq', 1, false);


--
-- Name: stock_transfers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.stock_transfers_id_seq', 1, false);


--
-- Name: suppliers_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.suppliers_id_seq', 1, false);


--
-- Name: tax_categories_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tax_categories_id_seq', 1, true);


--
-- Name: tax_exemptions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tax_exemptions_id_seq', 1, false);


--
-- Name: tax_rates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tax_rates_id_seq', 1, false);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 3, true);


--
-- Name: vendor_invoices_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.vendor_invoices_id_seq', 1, false);


--
-- Name: warehouse_zones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.warehouse_zones_id_seq', 1, false);


--
-- Name: wishlists_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.wishlists_id_seq', 1, false);


--
-- Name: zone_members_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.zone_members_id_seq', 1, false);


--
-- Name: zones_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.zones_id_seq', 1, false);


--
-- PostgreSQL database dump complete
--

\unrestrict 1vCQKjlqVViwQ7COxXEbhqweYl4QPiXJ7wbdscRr4bLUhqd0H8pyT9nDvV3abPG

