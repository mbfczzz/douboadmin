-- One-off cleanup after records were split into one table per business
-- object (users, orders, partners, …; see server/internal/store/tables_*.go).
--
-- 1. Run `doubo-server migrate`. It creates the new tables and copies every
--    old row that fits them (same id, owner, version and created_at). Fields
--    that no longer exist are dropped; rows of retired namespaces or with
--    wrongly typed values are skipped. The log line "legacy records imported"
--    lists the counts.
-- 2. Check the API, then run this file. Back up first if anything must stay:
--      mysqldump --single-transaction doubo records > records-backup.sql

DROP TABLE IF EXISTS records;
