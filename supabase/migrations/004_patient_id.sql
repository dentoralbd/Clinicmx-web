CREATE SEQUENCE IF NOT EXISTS patient_code_seq START 1000;

ALTER TABLE patients ADD COLUMN IF NOT EXISTS patient_code TEXT UNIQUE;

UPDATE patients 
SET patient_code = 'PT-' || nextval('patient_code_seq')::text 
WHERE patient_code IS NULL;

ALTER TABLE patients ALTER COLUMN patient_code SET DEFAULT 'PT-' || nextval('patient_code_seq')::text;
