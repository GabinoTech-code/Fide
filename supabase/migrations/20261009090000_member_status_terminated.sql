-- Block 1 · E1 — a new member status for employees whose employment has ended.
--
-- Its own migration: a new enum value cannot be used in the transaction that
-- adds it, and 20261009090100_member_lifecycle.sql uses it in SQL functions.
alter type public.member_status add value if not exists 'terminated' after 'suspended';
