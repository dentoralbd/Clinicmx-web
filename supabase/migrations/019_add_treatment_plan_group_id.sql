-- Groups treatment rows created together in a single "New Treatment Plan" submission
ALTER TABLE public.treatments
  ADD COLUMN IF NOT EXISTS treatment_plan_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_treatments_plan_group_id ON public.treatments(treatment_plan_group_id);
