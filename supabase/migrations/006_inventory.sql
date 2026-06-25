-- Create inventory_items table
CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Materials', 'Instruments', 'Others')),
  description TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'piece',
  low_stock_threshold INTEGER NOT NULL DEFAULT 5,
  supplier TEXT,
  cost DECIMAL(10,2),
  notes TEXT,
  expiry_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create inventory_movements table for stock adjustment history
CREATE TABLE inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('restock', 'use', 'adjust', 'initial')),
  quantity_change INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_inventory_items_category ON inventory_items(category);
CREATE INDEX idx_inventory_movements_item ON inventory_movements(item_id);

-- Row Level Security
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on inventory_items" ON inventory_items FOR ALL USING (true);
CREATE POLICY "Allow all on inventory_movements" ON inventory_movements FOR ALL USING (true);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_inventory_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inventory_items_updated_at
BEFORE UPDATE ON inventory_items
FOR EACH ROW EXECUTE FUNCTION update_inventory_updated_at();

-- Seed data: Materials (dental clinic supplies)
INSERT INTO inventory_items (name, category, description, quantity, unit, low_stock_threshold, supplier, expiry_date) VALUES
  ('Dental Composite (A2 Shade)', 'Materials', 'Tooth-colored resin composite for anterior restorations', 8, 'syringe', 3, 'DentalPro Supplies', NOW() + INTERVAL '18 months'),
  ('Dental Composite (A3 Shade)', 'Materials', 'Tooth-colored resin composite for posterior restorations', 6, 'syringe', 3, 'DentalPro Supplies', NOW() + INTERVAL '18 months'),
  ('Glass Ionomer Cement', 'Materials', 'Luting cement for crowns and bridges', 4, 'kit', 2, 'GC Dental', NOW() + INTERVAL '12 months'),
  ('Alginate Impression Material', 'Materials', 'Fast-set alginate for diagnostic models', 5, 'bag', 2, 'DentalPro Supplies', NOW() + INTERVAL '6 months'),
  ('Zinc Oxide Eugenol Paste', 'Materials', 'Temporary filling and sedative dressing', 3, 'tube', 2, 'Kerr Dental', NOW() + INTERVAL '24 months'),
  ('Lidocaine 2% with Epinephrine', 'Materials', 'Local anesthetic cartridges', 40, 'cartridge', 10, 'Septodont', NOW() + INTERVAL '24 months'),
  ('Articaine 4% Anesthetic', 'Materials', 'High-potency local anesthetic', 20, 'cartridge', 8, 'Septodont', NOW() + INTERVAL '20 months'),
  ('Hydrogen Peroxide 3%', 'Materials', 'Wound irrigation and antiseptic rinse', 10, 'bottle', 3, 'PharmaChem', NOW() + INTERVAL '12 months'),
  ('Chlorhexidine 0.12% Mouthwash', 'Materials', 'Antibacterial oral rinse', 12, 'bottle', 4, 'PharmaChem', NOW() + INTERVAL '18 months'),
  ('Fluoride Varnish', 'Materials', 'Sodium fluoride 5% varnish for caries prevention', 30, 'unit-dose', 10, 'Colgate Professional', NOW() + INTERVAL '36 months'),
  ('Dental Etchant (37% Phosphoric Acid)', 'Materials', 'Acid etch gel for bonding procedures', 5, 'syringe', 2, 'Kerr Dental', NOW() + INTERVAL '24 months'),
  ('Dental Bonding Agent', 'Materials', 'Single-component self-etch adhesive', 4, 'bottle', 2, 'Kerr Dental', NOW() + INTERVAL '12 months'),
  ('Latex Gloves (Medium)', 'Materials', 'Sterile examination gloves', 150, 'pair', 30, 'MedSupply Co.', NOW() + INTERVAL '36 months'),
  ('Latex Gloves (Large)', 'Materials', 'Sterile examination gloves', 100, 'pair', 30, 'MedSupply Co.', NOW() + INTERVAL '36 months'),
  ('Surgical Masks (Type IIR)', 'Materials', 'Fluid-resistant surgical masks', 200, 'piece', 50, 'MedSupply Co.', NOW() + INTERVAL '48 months'),
  ('Cotton Rolls', 'Materials', 'Absorbent cotton rolls for isolation', 300, 'piece', 50, 'DentalPro Supplies', NOW() + INTERVAL '48 months'),
  ('Gauze Pads (2x2)', 'Materials', 'Non-woven sterile gauze', 250, 'piece', 60, 'MedSupply Co.', NOW() + INTERVAL '48 months'),
  ('Suture Material (3-0 Silk)', 'Materials', 'Non-absorbable suture for oral surgery', 15, 'pack', 5, 'Ethicon', NOW() + INTERVAL '24 months'),
  ('Suture Material (4-0 Vicryl)', 'Materials', 'Absorbable suture for soft tissue', 12, 'pack', 5, 'Ethicon', NOW() + INTERVAL '24 months'),
  ('Rubber Dam (Latex)', 'Materials', 'Isolation dams for operative dentistry', 50, 'sheet', 15, 'Hygenic', NOW() + INTERVAL '36 months');

-- Seed data: Instruments (dental clinic instruments)
INSERT INTO inventory_items (name, category, description, quantity, unit, low_stock_threshold) VALUES
  ('Dental Mirror #5', 'Instruments', 'Front-surface mouth mirror for intraoral examination', 12, 'piece', 4),
  ('Dental Explorer (23 Shepherd Hook)', 'Instruments', 'Sharp explorer for caries detection', 10, 'piece', 3),
  ('Cotton Pliers / College Forceps', 'Instruments', 'Serrated-tip locking cotton forceps', 8, 'piece', 3),
  ('Periodontal Probe (UNC-15)', 'Instruments', '15 mm color-coded periodontal probe', 6, 'piece', 2),
  ('Sickle Scaler (H6/H7)', 'Instruments', 'Anterior sickle scaler for supragingival calculus', 8, 'piece', 2),
  ('Gracey Curette 1/2', 'Instruments', 'Universal posterior curette', 6, 'piece', 2),
  ('Gracey Curette 7/8', 'Instruments', 'Posterior curette for premolars/molars', 6, 'piece', 2),
  ('High-Speed Handpiece (Turbine)', 'Instruments', 'Air-driven high-speed turbine handpiece', 4, 'piece', 2),
  ('Low-Speed Handpiece (Straight)', 'Instruments', 'Electric low-speed contra-angle handpiece', 3, 'piece', 1),
  ('Low-Speed Handpiece (Contra-Angle)', 'Instruments', 'Contra-angle attachment for polishing', 3, 'piece', 1),
  ('Rubber Dam Clamp Forceps', 'Instruments', 'Spring-action forceps for rubber dam clamp placement', 4, 'piece', 1),
  ('Dental Extraction Forceps #150 (Upper)', 'Instruments', 'Upper universal extraction forceps', 3, 'piece', 1),
  ('Dental Extraction Forceps #151 (Lower)', 'Instruments', 'Lower universal extraction forceps', 3, 'piece', 1),
  ('Dental Elevator (301)', 'Instruments', 'Straight dental elevator for luxation', 5, 'piece', 2),
  ('Composite Instrument Kit', 'Instruments', 'Plastic composite placement instrument set', 5, 'set', 2),
  ('Amalgam Carrier', 'Instruments', 'Double-ended amalgam carrier', 4, 'piece', 1),
  ('Amalgam Condenser', 'Instruments', 'Double-ended amalgam condenser', 4, 'piece', 1),
  ('Matrix Band Holder (Tofflemire)', 'Instruments', 'Universal matrix band retainer', 6, 'piece', 2),
  ('Saliva Ejector Tips', 'Instruments', 'Disposable flexible suction tips', 100, 'piece', 30),
  ('High-Volume Evacuation Tip', 'Instruments', 'Autoclavable HVE suction tip', 8, 'piece', 3);
