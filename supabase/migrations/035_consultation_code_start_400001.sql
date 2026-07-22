-- Revises the CO- consultation patient-code series (034) to start at
-- 400001 instead of 200001, per user request. RESTART WITH is safe to
-- re-run and is a no-op in effect if run again with the same value.
--
-- Safe as long as no consultation patient has been created since 034 was
-- applied (i.e. no CO-2xxxxx code has been issued yet) -- otherwise this
-- would let the sequence re-issue numbers below 400001 that were already
-- skipped, which is harmless (they're just unused) but worth knowing.

ALTER SEQUENCE consultation_code_seq RESTART WITH 400001;
