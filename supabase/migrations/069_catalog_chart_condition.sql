-- Migration 069: let each treatment catalog item declare the tooth-chart condition it results in,
-- so the Anatomic Odontogram's treatment->chart auto-sync (src/lib/toothChartSync.ts) is driven by
-- the catalog the treatment types are actually chosen from (Catalog page → Procedures), not only a
-- hardcoded keyword guess. NULL = no explicit mapping → auto-sync falls back to the keyword map
-- (treatmentTypeToConditionLabel). Value is a canonical ToothCondition code
-- ('healthy'|'decayed'|'filled'|'root_canal'|'crown'|'bridge'|'implant'|'missing'|'extracted'|'impacted').

ALTER TABLE treatment_catalog_items
  ADD COLUMN IF NOT EXISTS chart_condition TEXT;

COMMENT ON COLUMN treatment_catalog_items.chart_condition IS
  'Optional tooth-chart condition (ToothCondition code) this procedure results in; used by the treatment->dental-chart auto-sync. NULL = fall back to keyword mapping.';

-- treatment_catalog_items uses a table-level grant (migration 057), so ADD COLUMN needs no
-- separate column grant. No backfill: existing items stay NULL and rely on the keyword fallback
-- until an admin sets an explicit mapping in Catalog → Procedures.

-- ROLLBACK (run manually if this migration needs to be reverted):
-- ALTER TABLE treatment_catalog_items DROP COLUMN IF EXISTS chart_condition;
