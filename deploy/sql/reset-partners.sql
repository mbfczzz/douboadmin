-- One-off reset of provider test data before the 分公司 → S1 → S2 → 会员
-- rules (scan registration, platform approval, no seat quotas).
--
-- Removes every provider, provider login, code, membership, registration
-- and commission record, plus the retired open-signup / direct-access and
-- quota data. Mini-program users, wallets, orders, works and platform
-- settings stay. Back up first:
--   mysqldump --single-transaction doubo records > records-backup.sql
-- then run this file against the same database and restart the API.

START TRANSACTION;

DELETE FROM records WHERE namespace IN (
  'partners', 'partner_owners', 'partner_commands', 'partner_control', 'partner_audit',
  'memberships', 'registrations', 'direct_access',
  'share_codes', 'partner_share_codes', 'partner_s1_codes', 'partner_s2_codes',
  'partner_invite_codes', 'partner_bind_codes', 'user_promo_codes', 'provider_logins',
  'partner_quotas', 'quota_moves', 'quota_requests', 'activation_codes',
  'commission_accounts', 'commission_ledger', 'commission_payouts', 'commission_settlements'
);

-- Provider logins are admin accounts tied to a provider.
DELETE FROM records
WHERE namespace = 'admin_accounts'
  AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.partnerId')) <> ''
  AND JSON_EXTRACT(data, '$.partnerId') IS NOT NULL;

-- Unpaid orders must not credit commission to providers that no longer
-- exist; paid orders keep their snapshot (refunds skip the missing ledger).
UPDATE records SET data = JSON_REMOVE(data, '$.distribution')
WHERE namespace = 'orders'
  AND JSON_UNQUOTE(JSON_EXTRACT(data, '$.status')) = 'created'
  AND JSON_EXTRACT(data, '$.distribution') IS NOT NULL;

-- The open-signup switch is gone.
DELETE FROM records WHERE namespace = 'settings' AND id = 'signup';

COMMIT;
