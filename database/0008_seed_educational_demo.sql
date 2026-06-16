-- NexaLab Educativo - Semilla demo para laboratorio pequeño
-- Ejecutar después de 0007_educational_small_lab.sql
-- Usa IDs deterministas para poder referenciarlos desde otros seeds y tests

-- ─── IDs de referencia ────────────────────────────────────────────────────────
-- Organización:    00000000-0000-0000-0000-000000000001
-- Laboratorio:     00000000-0000-0000-0000-000000000011
-- Admin:           00000000-0000-0000-0000-000000000101
-- Profesor 1:      00000000-0000-0000-0000-000000000102
-- Profesor 2:      00000000-0000-0000-0000-000000000103
-- Estudiantes:     00000000-0000-0000-0000-0000000001xx (xx = 10-21)
-- ─────────────────────────────────────────────────────────────────────────────

-- Limpiar datos demo anteriores que puedan conflictuar
-- (Solo si el seed anterior no los insertó)
-- DELETE FROM educational_notifications WHERE laboratory_id = '00000000-0000-0000-0000-000000000011';
-- DELETE FROM resource_reservations WHERE laboratory_id = '00000000-0000-0000-0000-000000000011';
-- DELETE FROM educational_practices WHERE laboratory_id = '00000000-0000-0000-0000-000000000011';

-- ─── USUARIOS ─────────────────────────────────────────────────────────────────
-- Contraseña para todos: Demo1234!
-- Se usa crypt() de pgcrypto (igual que 0002_seed_demo.sql) para generar el hash en Postgres.
-- ON CONFLICT DO NOTHING garantiza que no sobreescribe el admin si 0002 ya lo insertó.

INSERT INTO users (id, full_name, email, password_hash, status)
VALUES
  (
    '00000000-0000-0000-0000-000000000101',
    'Admin Educativo',
    'admin@nexalab.local',
    crypt('Demo1234!', gen_salt('bf', 12)),
    'ACTIVE'
  ),
  (
    '00000000-0000-0000-0000-000000000102',
    'Dra. Ana García',
    'ana.garcia@nexalab.local',
    crypt('Demo1234!', gen_salt('bf', 12)),
    'ACTIVE'
  ),
  (
    '00000000-0000-0000-0000-000000000103',
    'Prof. Luis Torres',
    'luis.torres@nexalab.local',
    crypt('Demo1234!', gen_salt('bf', 12)),
    'ACTIVE'
  ),
  ('00000000-0000-0000-0000-000000000110', 'María Fernanda López', 'mf.lopez@nexalab.local', '$2b$10$YHK3D2qT6mnhA6sC5n2L7.oBxl7jYIcS6X2Y8N4f3P1l9M7A8sGqe', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000111', 'Juan Pablo Gómez', 'jp.gomez@nexalab.local', '$2b$10$YHK3D2qT6mnhA6sC5n2L7.oBxl7jYIcS6X2Y8N4f3P1l9M7A8sGqe', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000112', 'Sofía Ramírez', 'sofia.ramirez@nexalab.local', crypt('Demo1234!', gen_salt('bf', 12)), 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000113', 'Carlos Morales', 'carlos.morales@nexalab.local', crypt('Demo1234!', gen_salt('bf', 12)), 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000114', 'Valentina Cruz', 'valentina.cruz@nexalab.local', crypt('Demo1234!', gen_salt('bf', 12)), 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000115', 'Andrés Castillo', 'andres.castillo@nexalab.local', crypt('Demo1234!', gen_salt('bf', 12)), 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000116', 'Daniela Herrera', 'daniela.herrera@nexalab.local', crypt('Demo1234!', gen_salt('bf', 12)), 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000117', 'Felipe Reyes', 'felipe.reyes@nexalab.local', crypt('Demo1234!', gen_salt('bf', 12)), 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000118', 'Gabriela Soto', 'gabriela.soto@nexalab.local', crypt('Demo1234!', gen_salt('bf', 12)), 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000119', 'Héctor Vega', 'hector.vega@nexalab.local', crypt('Demo1234!', gen_salt('bf', 12)), 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000120', 'Isabela Ortiz', 'isabela.ortiz@nexalab.local', crypt('Demo1234!', gen_salt('bf', 12)), 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000121', 'Jorge Mendoza', 'jorge.mendoza@nexalab.local', crypt('Demo1234!', gen_salt('bf', 12)), 'ACTIVE')
ON CONFLICT (email) DO NOTHING;

-- ─── MEMBRESÍAS ───────────────────────────────────────────────────────────────
INSERT INTO memberships (organization_id, laboratory_id, user_id, role, status)
VALUES
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000101', 'LAB_ADMIN', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000102', 'PROFESSOR', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000103', 'PROFESSOR', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000110', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000111', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000112', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000113', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000114', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000115', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000116', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000117', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000118', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000119', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000120', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000121', 'STUDENT', 'ACTIVE')
ON CONFLICT (laboratory_id, user_id) DO NOTHING;

-- ─── CATEGORÍAS DE INVENTARIO ─────────────────────────────────────────────────
INSERT INTO inventory_categories (id, laboratory_id, code, name, prefix, status)
VALUES
  ('00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000011', 'RQ', 'Reactivos químicos', 'RQ', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000011', 'RM', 'Reactivos microbiológicos', 'RM', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000011', 'MAT', 'Materiales', 'MAT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000011', 'INS', 'Insumos o consumibles', 'INS', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000205', '00000000-0000-0000-0000-000000000011', 'OTR', 'Otros', 'OTR', 'ACTIVE')
ON CONFLICT (laboratory_id, code) DO UPDATE SET name = EXCLUDED.name, prefix = EXCLUDED.prefix;

-- ─── UBICACIONES ──────────────────────────────────────────────────────────────
INSERT INTO storage_locations (id, laboratory_id, code, name, location_type, status)
VALUES
  ('00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000011', 'LAB-A', 'Laboratorio A', 'LABORATORY', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000302', '00000000-0000-0000-0000-000000000011', 'LAB-B', 'Laboratorio B', 'LABORATORY', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000303', '00000000-0000-0000-0000-000000000011', 'ARM-C1', 'Armario C1 · Laboratorio A', 'STORAGE', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000304', '00000000-0000-0000-0000-000000000011', 'REF-A', 'Refrigerador A · 4°C', 'REFRIGERATION', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000305', '00000000-0000-0000-0000-000000000011', 'ALM-GEN', 'Almacén general', 'STORAGE', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000306', '00000000-0000-0000-0000-000000000011', 'CONG-20', 'Congelador -20°C', 'FREEZER', 'ACTIVE')
ON CONFLICT (laboratory_id, code) DO NOTHING;

-- ─── ARTÍCULOS DE INVENTARIO ──────────────────────────────────────────────────
-- Reactivos químicos (RQ)
INSERT INTO inventory_items (id, laboratory_id, category_id, storage_location_id, sku, name, vendor, lot_number, quantity, reorder_point, unit, expires_at, internal_formula, requires_usage_log, status, created_by)
VALUES
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000303', 'RQ-0001', 'Ácido clorhídrico 0.1 N', 'Merck', 'HCL-2604-08', 850, 250, 'mL', '2026-11-18', 'HCl 0.1 N', true, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000303', 'RQ-0002', 'Hidróxido de sodio 0.1 N', 'Sigma-Aldrich', 'NaOH-2603-12', 600, 200, 'mL', '2027-03-12', 'NaOH 0.1 N', true, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000303', 'RQ-0003', 'Ácido sulfúrico concentrado', 'Merck', 'H2SO4-2604-03', 500, 150, 'mL', '2026-06-27', 'H₂SO₄ 98%', true, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000303', 'RQ-0004', 'Etanol al 96%', 'Merck', 'ETOH-2604-07', 2000, 500, 'mL', '2027-01-15', 'C₂H₅OH 96%', true, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000405', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000201', '00000000-0000-0000-0000-000000000303', 'RQ-0005', 'Acetona pura', 'Carlo Erba', 'ACE-2603-11', 1000, 300, 'mL', '2026-12-20', 'CH₃COCH₃ 99%', true, 'ACTIVE', '00000000-0000-0000-0000-000000000101')
ON CONFLICT (laboratory_id, sku, lot_number) DO NOTHING;

-- Reactivos microbiológicos (RM)
INSERT INTO inventory_items (id, laboratory_id, category_id, storage_location_id, sku, name, vendor, lot_number, quantity, reorder_point, unit, expires_at, requires_usage_log, status, created_by)
VALUES
  ('00000000-0000-0000-0000-000000000411', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000304', 'RM-0001', 'Cristal violeta (solución Gram)', 'Bioxon', 'CV-2604-01', 250, 50, 'mL', '2026-09-30', true, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000412', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000304', 'RM-0002', 'Lugol (solución yodo-yoduro)', 'Bioxon', 'LUG-2604-01', 300, 60, 'mL', '2026-10-15', true, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000413', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000304', 'RM-0003', 'Safranina (solución Gram)', 'Bioxon', 'SAF-2604-01', 200, 50, 'mL', '2026-08-20', true, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000414', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000304', 'RM-0004', 'Agar nutritivo deshidratado', 'Merck', 'AN-2603-08', 500, 100, 'g', '2027-04-30', true, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000415', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000202', '00000000-0000-0000-0000-000000000304', 'RM-0005', 'Agar MacConkey', 'Merck', 'AMC-2604-02', 250, 50, 'g', '2027-06-15', true, 'ACTIVE', '00000000-0000-0000-0000-000000000101')
ON CONFLICT (laboratory_id, sku, lot_number) DO NOTHING;

-- Materiales (MAT)
INSERT INTO inventory_items (id, laboratory_id, category_id, storage_location_id, sku, name, vendor, lot_number, quantity, reorder_point, unit, expires_at, requires_usage_log, status, created_by)
VALUES
  ('00000000-0000-0000-0000-000000000421', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000305', 'MAT-0001', 'Portaobjetos 75x26 mm', 'Globe Scientific', 'PORT-2604-10', 200, 50, 'unidades', NULL, false, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000422', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000305', 'MAT-0002', 'Cubreobjetos 22x22 mm', 'Globe Scientific', 'CUB-2604-10', 500, 100, 'unidades', NULL, false, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000423', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000305', 'MAT-0003', 'Placas Petri 90mm desechables', 'Corning', 'PETRI-2604-05', 100, 30, 'unidades', NULL, false, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000424', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000305', 'MAT-0004', 'Erlenmeyer 250 mL', 'Pyrex', 'ERL-2603-01', 12, 4, 'unidades', NULL, false, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000425', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000305', 'MAT-0005', 'Pipetas pasteur desechables', 'Globe Scientific', 'PIPETA-2604-03', 150, 50, 'unidades', NULL, false, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000426', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000305', 'MAT-0006', 'Tubos de ensayo 16x150 mm', 'Pyrex', 'TUBO-2604-04', 80, 20, 'unidades', NULL, false, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000427', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000305', 'MAT-0007', 'Beaker 150 mL', 'Pyrex', 'BEAK-2603-02', 20, 6, 'unidades', NULL, false, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000428', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000203', '00000000-0000-0000-0000-000000000305', 'MAT-0008', 'Bureta 50 mL clase A', 'Pyrex', 'BUR-2602-01', 6, 2, 'unidades', NULL, false, 'ACTIVE', '00000000-0000-0000-0000-000000000101')
ON CONFLICT (laboratory_id, sku, lot_number) DO NOTHING;

-- Insumos/Consumibles (INS)
INSERT INTO inventory_items (id, laboratory_id, category_id, storage_location_id, sku, name, vendor, lot_number, quantity, reorder_point, unit, expires_at, requires_usage_log, status, created_by)
VALUES
  ('00000000-0000-0000-0000-000000000431', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000305', 'INS-0001', 'Guantes nitrilo talla M', 'Kimberly-Clark', 'GLV-2604-06', 200, 50, 'unidades', '2028-06-30', false, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000432', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000305', 'INS-0002', 'Mascarilla quirúrgica tipo IIR', ' 3M', 'MASK-2604-04', 100, 30, 'unidades', '2028-03-15', false, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000433', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000305', 'INS-0003', 'Papel absorbente para laboratorio', 'Kimberly-Clark', 'PAP-2604-01', 30, 10, 'rollos', '2028-12-31', false, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000434', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000305', 'INS-0004', 'Aceite de inmersión para microscopio', 'Nikon', 'OIL-2604-02', 3, 1, 'frascos 50 mL', '2027-08-10', false, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000435', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000305', 'INS-0005', 'Hisopos estériles', 'Copan', 'HIS-2604-03', 50, 15, 'unidades', '2027-12-31', false, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000436', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000305', 'INS-0006', 'Asas calibradas 1 µL desechables', 'Copan', 'ASA-2604-05', 200, 60, 'unidades', '2028-01-15', false, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000437', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000305', 'INS-0007', 'Recipiente para residuos biológicos 10 L', 'Biomedical Waste', 'REC-2604-01', 5, 2, 'unidades', '2029-06-30', false, 'ACTIVE', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000438', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000204', '00000000-0000-0000-0000-000000000305', 'INS-0008', 'Papel indicador pH 0-14', 'Macherey-Nagel', 'PH-2604-02', 4, 1, 'rollos 5 m', '2027-09-30', false, 'ACTIVE', '00000000-0000-0000-0000-000000000101')
ON CONFLICT (laboratory_id, sku, lot_number) DO NOTHING;

-- ─── EQUIPOS ──────────────────────────────────────────────────────────────────
INSERT INTO equipment (id, laboratory_id, storage_location_id, responsible_user_id, code, name, manufacturer, model, serial_number, status, next_maintenance_at, notes)
VALUES
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'EQ-MIC-001', 'Microscopio óptico binocular', 'Nikon', 'Eclipse E200', 'NK-E200-8841', 'OPERATIONAL', '2026-12-01', 'Uso en prácticas de microbiología'),
  ('00000000-0000-0000-0000-000000000502', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'EQ-MIC-002', 'Microscopio óptico binocular', 'Nikon', 'Eclipse E200', 'NK-E200-8842', 'OPERATIONAL', '2026-12-01', 'Uso en prácticas de microbiología'),
  ('00000000-0000-0000-0000-000000000503', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'EQ-MIC-003', 'Microscopio óptico binocular', 'Nikon', 'Eclipse E200', 'NK-E200-8843', 'MAINTENANCE_DUE', '2026-06-10', 'Requiere mantenimiento preventivo'),
  ('00000000-0000-0000-0000-000000000504', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'EQ-BAL-001', 'Balanza analítica 210 g', 'Mettler Toledo', 'ME204E', 'MT-204-0011', 'OPERATIONAL', '2027-01-10', 'Calibración anual'),
  ('00000000-0000-0000-0000-000000000505', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'EQ-INC-001', 'Incubadora de CO₂ 37°C', 'Thermo Fisher', 'Heracell 150i', 'TF-HC150-0022', 'OPERATIONAL', '2026-09-15', 'Control de temperatura diario'),
  ('00000000-0000-0000-0000-000000000506', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'EQ-AUT-001', 'Autoclave de laboratorio 50 L', 'Tuttnauer', '3870M', 'TU-3870-0033', 'OPERATIONAL', '2026-08-20', 'Esterilización de materiales'),
  ('00000000-0000-0000-0000-000000000507', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'EQ-CAB-001', 'Cabina de bioseguridad tipo II', 'Esco', 'Labculture Class II', 'ES-LC-0044', 'OPERATIONAL', '2026-11-30', 'Limpieza y certificación semestral'),
  ('00000000-0000-0000-0000-000000000508', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'EQ-PHM-001', 'pH-metro de laboratorio', 'Mettler Toledo', 'Seven Excellence', 'MT-SE-0055', 'OPERATIONAL', '2027-02-15', 'Calibración con tampones antes de uso'),
  ('00000000-0000-0000-0000-000000000509', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'EQ-VOR-001', 'Vórtex mezclador', 'Velp Scientifica', 'ZX3', 'VS-ZX3-0066', 'OPERATIONAL', '2027-06-01', 'Verificación de velocidad anual'),
  ('00000000-0000-0000-0000-000000000510', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000301', '00000000-0000-0000-0000-000000000101', 'EQ-CEN-001', 'Centrífuga de sobremesa', 'Eppendorf', '5430R', 'EP-5430-0077', 'OUT_OF_SERVICE', NULL, 'En reparación por rotor dañado')
ON CONFLICT (laboratory_id, code) DO NOTHING;

-- ─── ETIQUETAS QR PARA EQUIPOS ────────────────────────────────────────────────
INSERT INTO qr_identifiers (laboratory_id, entity_type, entity_id, opaque_token, label_code)
SELECT '00000000-0000-0000-0000-000000000011', 'EQUIPMENT', id, encode(gen_random_bytes(28), 'hex'), code
FROM equipment
WHERE laboratory_id = '00000000-0000-0000-0000-000000000011'
ON CONFLICT (laboratory_id, entity_type, entity_id) DO NOTHING;

-- ─── ETIQUETAS QR PARA INVENTARIO ────────────────────────────────────────────
INSERT INTO qr_identifiers (laboratory_id, entity_type, entity_id, opaque_token, label_code)
SELECT '00000000-0000-0000-0000-000000000011', 'INVENTORY_ITEM', id, encode(gen_random_bytes(28), 'hex'), sku
FROM inventory_items
WHERE laboratory_id = '00000000-0000-0000-0000-000000000011'
ON CONFLICT (laboratory_id, entity_type, entity_id) DO NOTHING;

-- ─── GRUPOS EDUCATIVOS ────────────────────────────────────────────────────────
INSERT INTO educational_groups (id, laboratory_id, code, name, academic_period, teacher_user_id, status)
VALUES
  ('00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000011', 'MIC-I-2026-A', 'Microbiología I · Sección A', '2026-I', '00000000-0000-0000-0000-000000000102', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000011', 'LAB-BAS-2026-A', 'Laboratorio básico · Sección A', '2026-I', '00000000-0000-0000-0000-000000000103', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000603', '00000000-0000-0000-0000-000000000011', 'MIC-II-2026-B', 'Microbiología II · Sección B', '2026-I', '00000000-0000-0000-0000-000000000102', 'ACTIVE')
ON CONFLICT (laboratory_id, code) DO NOTHING;

-- Miembros del grupo MIC-I-2026-A (estudiantes 110-115)
INSERT INTO educational_group_members (laboratory_id, group_id, user_id, role_in_group, status)
VALUES
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000110', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000111', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000112', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000113', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000114', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000601', '00000000-0000-0000-0000-000000000115', 'STUDENT', 'ACTIVE')
ON CONFLICT (group_id, user_id) DO NOTHING;

-- Miembros del grupo LAB-BAS-2026-A (estudiantes 116-121)
INSERT INTO educational_group_members (laboratory_id, group_id, user_id, role_in_group, status)
VALUES
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000116', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000117', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000118', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000119', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000120', 'STUDENT', 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000602', '00000000-0000-0000-0000-000000000121', 'STUDENT', 'ACTIVE')
ON CONFLICT (group_id, user_id) DO NOTHING;

-- ─── PRÁCTICAS EDUCATIVAS ─────────────────────────────────────────────────────
INSERT INTO educational_practices (id, laboratory_id, practice_code, title, course_name, teacher_user_id, starts_at, ends_at, instructions, status)
VALUES
  ('00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000011', 'PRA-2026-021', 'Tinción de Gram', 'Microbiología I · Sección A', '00000000-0000-0000-0000-000000000102', now() + interval '1 day' + time '10:00:00', now() + interval '1 day' + time '12:00:00', 'Prepara una muestra de la cepa E. coli y S. aureus. Sigue el protocolo de tinción de cuatro pasos. Usa el portaobjetos marcado con tu nombre.', 'READY'),
  ('00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000011', 'PRA-2026-022', 'Verificación y uso del microscopio', 'Laboratorio básico · Sección A', '00000000-0000-0000-0000-000000000103', now() + interval '4 days' + time '14:00:00', now() + interval '4 days' + time '16:00:00', 'Revisión de partes del microscopio, verificación diaria y observación de láminas preparadas.', 'PREPARING'),
  ('00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000011', 'PRA-2026-023', 'Cultivo en placa de agar nutritivo', 'Microbiología II · Sección B', '00000000-0000-0000-0000-000000000102', now() + interval '7 days' + time '09:00:00', now() + interval '7 days' + time '11:00:00', 'Siembra en placa por agotamiento. Usar asa estéril calibrada. Incubar 24 h a 37°C.', 'PLANNED'),
  ('00000000-0000-0000-0000-000000000704', '00000000-0000-0000-0000-000000000011', 'PRA-2026-024', 'Titulación ácido-base', 'Laboratorio básico · Sección A', '00000000-0000-0000-0000-000000000103', now() + interval '9 days' + time '11:00:00', now() + interval '9 days' + time '13:00:00', 'Titulación de HCl con NaOH 0.1 N usando fenolftaleína como indicador. Registrar el volumen de neutralización.', 'PLANNED'),
  ('00000000-0000-0000-0000-000000000705', '00000000-0000-0000-0000-000000000011', 'PRA-2026-025', 'Medición de pH con potenciómetro', 'Laboratorio básico · Sección A', '00000000-0000-0000-0000-000000000103', now() + interval '12 days' + time '10:00:00', now() + interval '12 days' + time '12:00:00', 'Calibración del pH-metro con tampones 4.0, 7.0 y 10.0. Medición de muestras de agua y soluciones preparadas.', 'DRAFT'),
  ('00000000-0000-0000-0000-000000000706', '00000000-0000-0000-0000-000000000011', 'PRA-2026-026', 'Microscopía de fluorescencia básica', 'Microbiología I · Sección A', '00000000-0000-0000-0000-000000000102', now() + interval '14 days' + time '14:00:00', now() + interval '14 days' + time '16:30:00', 'Introducción a la microscopía de fluorescencia. Preparación de láminas con DAPI y FITC. Uso responsable del equipo.', 'DRAFT')
ON CONFLICT (laboratory_id, practice_code) DO NOTHING;

-- ─── RESERVAS DE RECURSOS ─────────────────────────────────────────────────────
INSERT INTO resource_reservations (id, laboratory_id, reservation_code, practice_id, resource_type, resource_id, quantity, unit, needed_at, requested_by, status)
VALUES
  ('00000000-0000-0000-0000-000000000801', '00000000-0000-0000-0000-000000000011', 'RES-2026-001', '00000000-0000-0000-0000-000000000701', 'INVENTORY_ITEM', '00000000-0000-0000-0000-000000000411', 30, 'mL', now() + interval '1 day' + time '09:30:00', '00000000-0000-0000-0000-000000000102', 'APPROVED'),
  ('00000000-0000-0000-0000-000000000802', '00000000-0000-0000-0000-000000000011', 'RES-2026-002', '00000000-0000-0000-0000-000000000701', 'INVENTORY_ITEM', '00000000-0000-0000-0000-000000000412', 30, 'mL', now() + interval '1 day' + time '09:30:00', '00000000-0000-0000-0000-000000000102', 'APPROVED'),
  ('00000000-0000-0000-0000-000000000803', '00000000-0000-0000-0000-000000000011', 'RES-2026-003', '00000000-0000-0000-0000-000000000701', 'INVENTORY_ITEM', '00000000-0000-0000-0000-000000000413', 30, 'mL', now() + interval '1 day' + time '09:30:00', '00000000-0000-0000-0000-000000000102', 'READY'),
  ('00000000-0000-0000-0000-000000000804', '00000000-0000-0000-0000-000000000011', 'RES-2026-004', '00000000-0000-0000-0000-000000000701', 'INVENTORY_ITEM', '00000000-0000-0000-0000-000000000421', 20, 'unidades', now() + interval '1 day' + time '09:30:00', '00000000-0000-0000-0000-000000000102', 'READY'),
  ('00000000-0000-0000-0000-000000000805', '00000000-0000-0000-0000-000000000011', 'RES-2026-005', '00000000-0000-0000-0000-000000000701', 'EQUIPMENT', '00000000-0000-0000-0000-000000000501', 6, 'microscopios', now() + interval '1 day' + time '09:30:00', '00000000-0000-0000-0000-000000000102', 'APPROVED'),
  ('00000000-0000-0000-0000-000000000806', '00000000-0000-0000-0000-000000000011', 'RES-2026-006', '00000000-0000-0000-0000-000000000702', 'EQUIPMENT', '00000000-0000-0000-0000-000000000501', 12, 'microscopios', now() + interval '4 days' + time '13:30:00', '00000000-0000-0000-0000-000000000103', 'PENDING'),
  ('00000000-0000-0000-0000-000000000807', '00000000-0000-0000-0000-000000000011', 'RES-2026-007', '00000000-0000-0000-0000-000000000702', 'INVENTORY_ITEM', '00000000-0000-0000-0000-000000000434', 4, 'frascos', now() + interval '4 days' + time '13:30:00', '00000000-0000-0000-0000-000000000103', 'PENDING'),
  ('00000000-0000-0000-0000-000000000808', '00000000-0000-0000-0000-000000000011', 'RES-2026-008', '00000000-0000-0000-0000-000000000703', 'INVENTORY_ITEM', '00000000-0000-0000-0000-000000000414', 50, 'g', now() + interval '7 days' + time '08:30:00', '00000000-0000-0000-0000-000000000102', 'PENDING'),
  ('00000000-0000-0000-0000-000000000809', '00000000-0000-0000-0000-000000000011', 'RES-2026-009', '00000000-0000-0000-0000-000000000703', 'INVENTORY_ITEM', '00000000-0000-0000-0000-000000000423', 12, 'unidades', now() + interval '7 days' + time '08:30:00', '00000000-0000-0000-0000-000000000102', 'PENDING'),
  ('00000000-0000-0000-0000-000000000810', '00000000-0000-0000-0000-000000000011', 'RES-2026-010', '00000000-0000-0000-0000-000000000703', 'EQUIPMENT', '00000000-0000-0000-0000-000000000505', 1, 'autoclave', now() + interval '7 days' + time '08:00:00', '00000000-0000-0000-0000-000000000102', 'APPROVED'),
  ('00000000-0000-0000-0000-000000000811', '00000000-0000-0000-0000-000000000011', 'RES-2026-011', '00000000-0000-0000-0000-000000000704', 'INVENTORY_ITEM', '00000000-0000-0000-0000-000000000401', 100, 'mL', now() + interval '9 days' + time '10:30:00', '00000000-0000-0000-0000-000000000103', 'PENDING'),
  ('00000000-0000-0000-0000-000000000812', '00000000-0000-0000-0000-000000000011', 'RES-2026-012', '00000000-0000-0000-0000-000000000704', 'INVENTORY_ITEM', '00000000-0000-0000-0000-000000000402', 100, 'mL', now() + interval '9 days' + time '10:30:00', '00000000-0000-0000-0000-000000000103', 'PENDING')
ON CONFLICT (laboratory_id, reservation_code) DO NOTHING;

-- ─── MOVIMIENTOS DE INVENTARIO ────────────────────────────────────────────────
-- (Los movimientos deben respetar la regla de no stock negativo)
-- Stock inicial ya definido en inventory_items.quantity
-- Los movimientos de práctica se registran al momento de ejecutarlas

-- ─── ALERTAS ──────────────────────────────────────────────────────────────────
INSERT INTO alerts (id, organization_id, laboratory_id, severity, status, source_type, source_id, title, details, created_at)
VALUES
  ('00000000-0000-0000-0000-000000000901', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'HIGH', 'OPEN', 'INVENTORY_ITEM', '00000000-0000-0000-0000-000000000403', 'Ácido sulfúrico próximo a vencer', 'RQ-0003 vence en 12 días. Verificar si puede usarse en prácticas pendientes o programar descarte controlado.', now() - interval '2 hours'),
  ('00000000-0000-0000-0000-000000000902', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'WARNING', 'OPEN', 'EQUIPMENT', '00000000-0000-0000-0000-000000000503', 'EQ-MIC-003 requiere mantenimiento', 'Microscopio EQ-MIC-003 tiene mantenimiento preventivo vencido desde ayer. No reservar hasta completar.', now() - interval '1 day'),
  ('00000000-0000-0000-0000-000000000903', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'HIGH', 'OPEN', 'RESOURCE_RESERVATION', '00000000-0000-0000-0000-000000000806', 'Reserva pendiente de preparar', 'Reserva RES-2026-006 para práctica de microscopio (mañana) aún no está preparada.', now() - interval '30 minutes'),
  ('00000000-0000-0000-0000-000000000904', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'CRITICAL', 'OPEN', 'EQUIPMENT', '00000000-0000-0000-0000-000000000510', 'EQ-CEN-001 fuera de servicio', 'Centrífuga EQ-CEN-001 está fuera de servicio por rotor dañado. Revisar si alguna práctica la requiere.', now() - interval '3 days'),
  ('00000000-0000-0000-0000-000000000905', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'INFO', 'OPEN', 'INVENTORY_ITEM', '00000000-0000-0000-0000-000000000413', 'Safranina próxima a vencer', 'RM-0003 vence en 65 días. Verificar consumo en prácticas antes de la fecha.', now() - interval '6 hours'),
  ('00000000-0000-0000-0000-000000000906', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'INFO', 'RESOLVED', 'INVENTORY_ITEM', '00000000-0000-0000-0000-000000000401', 'Reposición de HCl completada', 'Se recibieron 1000 mL de HCl 0.1 N del proveedor Merck. Lote HCL-2604-08.', now() - interval '5 days'),
  ('00000000-0000-0000-0000-000000000907', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'WARNING', 'OPEN', 'EDUCATIONAL_PRACTICE', '00000000-0000-0000-0000-000000000701', 'Práctica de tinción lista para mañana', 'PRA-2026-021 está confirmada para mañana a las 10:00. Notificar a los estudiantes del grupo MIC-I-2026-A.', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000908', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'INFO', 'OPEN', 'INVENTORY_ITEM', '00000000-0000-0000-0000-000000000434', 'Aceite de inmersión stock bajo', 'INS-0004 tiene 3 frascos. Stock mínimo es 1. Verificar consumo en práctica de microscopía.', now() - interval '12 hours')
ON CONFLICT (id) DO NOTHING;

-- ─── AVISOS EDUCATIVOS ────────────────────────────────────────────────────────
INSERT INTO educational_notifications (id, laboratory_id, practice_id, group_id, title, body, audience, publish_at, created_by)
VALUES
  ('00000000-0000-0000-0000-000000000a01', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000601', 'Recordatorio: práctica de tinción de Gram mañana', 'Mañana tienes práctica de tinción de Gram a las 10:00 h en el Laboratorio A. Revisa la guía antes de llegar. El equipo estará disponible desde las 09:45.', 'STUDENTS', now(), '00000000-0000-0000-0000-000000000102'),
  ('00000000-0000-0000-0000-000000000a02', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000701', '00000000-0000-0000-0000-000000000601', 'Instrucción previa: guía de tinción de Gram', 'El docente publicó la guía de tinción de Gram. Descárgala antes de la clase. Asegúrate de traer tu bitácora y seguir el protocolo de seguridad.', 'STUDENTS', now() - interval '6 hours', '00000000-0000-0000-0000-000000000102'),
  ('00000000-0000-0000-0000-000000000a03', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000702', '00000000-0000-0000-0000-000000000602', 'Práctica de microscopio: cambio de hora', 'La práctica PRA-2026-022 (Verificación de microscopio) se realizará a las 14:00 en el Laboratorio B, no en el A, por mantenimiento en progreso.', 'STUDENTS', now() - interval '1 day', '00000000-0000-0000-0000-000000000103'),
  ('00000000-0000-0000-0000-000000000a04', '00000000-0000-0000-0000-000000000011', NULL, NULL, 'Normas de seguridad en el laboratorio', 'Antes de ingresar al laboratorio usa siempre bata, guantes y lentes de seguridad. Está prohibido ingerir alimentos o bebidas. En caso de emergencia, sigue las instrucciones del docente.', 'ALL', now() - interval '7 days', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000000a05', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000703', '00000000-0000-0000-0000-000000000603', 'Práctica de cultivo: materiales requeridos', 'Para la práctica de cultivo PRA-2026-023 necesitas traer tus muestras etiquetadas. El laboratorio proveerá las placas y el agar. Recuerda traer guantes adicionales.', 'STUDENTS', now() - interval '2 days', '00000000-0000-0000-0000-000000000102')
ON CONFLICT (id) DO NOTHING;

-- ─── PLANES DE EQUIPO ─────────────────────────────────────────────────────────
INSERT INTO equipment_plans (laboratory_id, equipment_id, plan_type, name, frequency_value, frequency_unit, next_due_at, blocks_use_when_overdue, status)
VALUES
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000501', 'VERIFICATION', 'Verificación antes de uso', 1, 'DAY', now() + interval '1 day', false, 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000504', 'CALIBRATION', 'Calibración anual de balanza', 12, 'MONTH', now() + interval '7 months', true, 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000506', 'MAINTENANCE', 'Mantenimiento preventivo autoclave', 6, 'MONTH', now() + interval '3 months', false, 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000507', 'MAINTENANCE', 'Certificación semestral cabina bioseg.', 6, 'MONTH', now() + interval '5 months', true, 'ACTIVE'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000503', 'MAINTENANCE', 'Mantenimiento preventivo microscopio', 12, 'MONTH', now() - interval '1 day', false, 'ACTIVE')
ON CONFLICT DO NOTHING;
