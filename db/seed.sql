-- FrankBroker OS demonstration records.
-- All names, account numbers, prices, balances, and fee assumptions are sample data.
INSERT INTO brokers (id, name, license_number, status, base_currency) VALUES
  ('brk_abyssinia', 'Abyssinia Securities S.C.', 'ESCA-BR-004', 'active', 'ETB');

INSERT INTO users (id, broker_id, email, full_name, role, status) VALUES
  ('usr_demo_admin', 'brk_abyssinia', 'demo.admin@frankbroker.et', 'Mekdes Tadesse', 'broker_admin', 'active'),
  ('usr_trader', 'brk_abyssinia', 'dawit@frankbroker.et', 'Dawit Alemu', 'trader', 'active'),
  ('usr_compliance', 'brk_abyssinia', 'liya@frankbroker.et', 'Liya Girma', 'compliance', 'active'),
  ('usr_settlement', 'brk_abyssinia', 'rahel@frankbroker.et', 'Rahel Getachew', 'settlement', 'active');

INSERT INTO clients (id, broker_id, client_code, full_name, client_type, phone, email, kyc_status, risk_rating, status) VALUES
  ('cli_meron', 'brk_abyssinia', 'CL-10041', 'Meron Bekele', 'individual', '+251911000041', 'meron@example.et', 'approved', 'standard', 'active'),
  ('cli_wegagen', 'brk_abyssinia', 'CL-10008', 'Wegagen Pension Fund', 'institution', '+251115000008', 'ops@wegagen-pension.example', 'approved', 'enhanced', 'active'),
  ('cli_selam', 'brk_abyssinia', 'CL-10052', 'Selamawit Tesfaye', 'individual', '+251911000052', 'selam@example.et', 'review_due', 'review', 'restricted'),
  ('cli_blue', 'brk_abyssinia', 'CL-10017', 'Blue Nile Trading PLC', 'corporate', '+251115000017', 'finance@bluenile.example', 'approved', 'standard', 'active');

INSERT INTO accounts (id, client_id, account_number, total_cash, available_cash, blocked_cash, unsettled_cash, status) VALUES
  ('acc_meron', 'cli_meron', 'TRD-10041-01', 1840500, 1526850, 313650, 0, 'active'),
  ('acc_wegagen', 'cli_wegagen', 'TRD-10008-01', 12400000, 10172500, 2227500, 0, 'active'),
  ('acc_selam', 'cli_selam', 'TRD-10052-01', 428900, 428900, 0, 0, 'restricted'),
  ('acc_blue', 'cli_blue', 'TRD-10017-01', 4705300, 4120300, 585000, 0, 'active');

INSERT INTO instruments (id, symbol, name, asset_class, issuer, trading_status, currency, lot_size, tick_size, settlement_cycle, face_value, maturity_date, coupon_rate, coupon_frequency, last_price) VALUES
  ('ins_ethio_telecom', 'ETTEL', 'Ethio telecom', 'equity', 'Ethio telecom', 'tradable', 'ETB', 10, 0.5, 'T+2', NULL, NULL, NULL, NULL, 312.5),
  ('ins_wegagen', 'WEGA', 'Wegagen Bank S.C.', 'equity', 'Wegagen Bank', 'tradable', 'ETB', 10, 0.5, 'T+2', NULL, NULL, NULL, NULL, 186),
  ('ins_tbill_182', 'TB182-26', 'Treasury Bill 182D', 't_bill', 'FDRE Ministry of Finance', 'tradable', 'ETB', 1, 0.01, 'T+1', 100, '2026-12-31', 0, 'at_maturity', 94.35),
  ('ins_cbe_bond', 'CBE5Y30', 'CBE 5-Year Bond 2030', 'bond', 'Commercial Bank of Ethiopia', 'tradable', 'ETB', 1, 0.01, 'T+2', 1000, '2030-06-30', 9.25, 'semi_annual', 101.2),
  ('ins_green_bond', 'EEU7Y32', 'EEU Green Bond 2032', 'bond', 'Ethiopian Electric Utility', 'halted', 'ETB', 1, 0.01, 'T+2', 1000, '2032-03-15', 10.1, 'semi_annual', 99.1);

INSERT INTO holdings (id, account_id, instrument_id, total_quantity, available_quantity, blocked_quantity, unsettled_quantity, average_cost) VALUES
  ('hld_meron_wega', 'acc_meron', 'ins_wegagen', 3200, 2000, 1200, 0, 172.4),
  ('hld_meron_cbe', 'acc_meron', 'ins_cbe_bond', 3000, 3000, 0, 0, 101.2),
  ('hld_blue_wega', 'acc_blue', 'ins_wegagen', 8200, 5200, 3000, 0, 181.75),
  ('hld_wegagen_ettel', 'acc_wegagen', 'ins_ethio_telecom', 18000, 18000, 0, 0, 294.1);

INSERT INTO orders (id, broker_id, account_id, instrument_id, side, quantity, price, order_type, validity, estimated_gross, estimated_fees, estimated_net, status, source, assigned_trader_id, risk_flag, submitted_at) VALUES
  ('ORD-2026-1048', 'brk_abyssinia', 'acc_wegagen', 'ins_ethio_telecom', 'buy', 7000, 312.5, 'limit', 'day', 2187500, 10937.5, 2198437.5, 'pending_broker_review', 'manual', 'usr_trader', 'review', '2026-07-14T10:42:00Z'),
  ('ORD-2026-1047', 'brk_abyssinia', 'acc_meron', 'ins_wegagen', 'sell', 1200, 186, 'limit', 'day', 223200, 1116, 222084, 'approved', 'manual', 'usr_trader', 'none', '2026-07-14T10:19:00Z'),
  ('ORD-2026-1046', 'brk_abyssinia', 'acc_blue', 'ins_tbill_182', 'buy', 25000, 94.35, 'limit', 'day', 2358750, 11793.75, 2370543.75, 'settlement_pending', 'manual', 'usr_trader', 'review', '2026-07-14T09:54:00Z'),
  ('ORD-2026-1045', 'brk_abyssinia', 'acc_meron', 'ins_cbe_bond', 'buy', 3000, 101.2, 'limit', 'day', 303600, 1518, 305118, 'settled', 'manual', 'usr_trader', 'none', '2026-07-14T09:31:00Z'),
  ('ORD-2026-1044', 'brk_abyssinia', 'acc_selam', 'ins_ethio_telecom', 'buy', 500, 311, 'limit', 'day', 155500, 777.5, 156277.5, 'validation_failed', 'manual', NULL, 'high', '2026-07-14T09:08:00Z');

INSERT INTO order_validations (id, order_id, rule_code, label, result, message) VALUES
  ('val_1048_kyc', 'ORD-2026-1048', 'KYC_APPROVED', 'KYC approved', 'passed', 'KYC is current'),
  ('val_1048_cash', 'ORD-2026-1048', 'SUFFICIENT_CASH', 'Sufficient available cash', 'passed', 'Cash including fees is available'),
  ('val_1044_kyc', 'ORD-2026-1044', 'KYC_APPROVED', 'KYC approved', 'failed', 'KYC review is due'),
  ('val_1044_account', 'ORD-2026-1044', 'ACCOUNT_ACTIVE', 'Account active', 'failed', 'Account is restricted');

INSERT INTO trades (id, order_id, execution_price, quantity_filled, gross_amount, fees, net_amount, trade_date, settlement_date, captured_by) VALUES
  ('TRD-2026-0772', 'ORD-2026-1046', 94.35, 25000, 2358750, 11793.75, 2370543.75, '2026-07-14', '2026-07-15', 'usr_trader'),
  ('TRD-2026-0768', 'ORD-2026-1045', 101.2, 3000, 303600, 1518, 305118, '2026-07-10', '2026-07-14', 'usr_trader');

INSERT INTO settlements (id, trade_id, status, settlement_date, cash_status, securities_status, confirmed_by, confirmed_at) VALUES
  ('STL-0772', 'TRD-2026-0772', 'pending', '2026-07-15', 'pending', 'pending', NULL, NULL),
  ('STL-0768', 'TRD-2026-0768', 'settled', '2026-07-14', 'settled', 'settled', 'usr_settlement', '2026-07-14T09:33:18Z');

INSERT INTO reconciliation_batches (id, broker_id, batch_date, file_name, source, total_records, matched_records, exception_records, status, uploaded_by) VALUES
  ('REC-2026-0714-A', 'brk_abyssinia', '2026-07-14', 'cash-confirmations-2026-07-14.csv', 'manual_upload', 248, 246, 2, 'exceptions', 'usr_settlement');

INSERT INTO reconciliation_exceptions (id, batch_id, reference, exception_type, expected_value, actual_value, status) VALUES
  ('rec_exc_1', 'REC-2026-0714-A', 'TRD-2026-0759', 'cash_variance', '418250.00', '400000.00', 'open'),
  ('rec_exc_2', 'REC-2026-0714-A', 'ETTEL', 'quantity_mismatch', '12500', '12495', 'open');

INSERT INTO audit_logs (id, broker_id, actor_id, action, entity_type, entity_id, summary, created_at) VALUES
  ('aud_1', 'brk_abyssinia', 'usr_demo_admin', 'ORDER_CREATED', 'order', 'ORD-2026-1048', 'Buy 7,000 ETTEL at 312.50 ETB', '2026-07-14T10:42:51Z'),
  ('aud_2', 'brk_abyssinia', 'usr_demo_admin', 'ORDER_VALIDATED', 'order', 'ORD-2026-1048', 'All required pre-trade checks passed', '2026-07-14T10:43:12Z'),
  ('aud_3', 'brk_abyssinia', 'usr_trader', 'TRADE_CAPTURED', 'trade', 'TRD-2026-0772', 'Manual trade linked to ORD-2026-1046', '2026-07-14T09:58:37Z'),
  ('aud_4', 'brk_abyssinia', 'usr_settlement', 'SETTLEMENT_UPDATED', 'settlement', 'STL-0768', 'Cash and securities legs confirmed', '2026-07-14T09:33:18Z');

