-- NexaLab LIMS - optional configurable compliance demo seed
-- Apply after 0002_seed_demo.sql and 0004_configurable_compliance_core.sql.

INSERT INTO laboratory_settings (
  laboratory_id, profile_code, strict_mode, allow_custom_fields,
  require_reason_for_corrections, require_reauthentication_for_signatures,
  active_configuration_version
) VALUES (
  '00000000-0000-0000-0000-000000000011', 'PHARMA_QC', TRUE, TRUE, TRUE, TRUE, 3
)
ON CONFLICT (laboratory_id) DO UPDATE SET
  profile_code = EXCLUDED.profile_code,
  strict_mode = EXCLUDED.strict_mode,
  active_configuration_version = EXCLUDED.active_configuration_version;

INSERT INTO configuration_versions (
  id, laboratory_id, version_number, status, summary, created_by, approved_by, approved_at, effective_from
) VALUES
  ('00000000-0000-0000-0000-000000010001', '00000000-0000-0000-0000-000000000011', 1, 'SUPERSEDED', 'Configuración inicial', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', now() - interval '180 day', now() - interval '180 day'),
  ('00000000-0000-0000-0000-000000010002', '00000000-0000-0000-0000-000000000011', 2, 'SUPERSEDED', 'Campos de reactivos y trazabilidad', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', now() - interval '90 day', now() - interval '90 day'),
  ('00000000-0000-0000-0000-000000010003', '00000000-0000-0000-0000-000000000011', 3, 'ACTIVE', 'Alertas configurables, flujos y calidad', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', now() - interval '10 day', now() - interval '10 day')
ON CONFLICT (laboratory_id, version_number) DO NOTHING;

INSERT INTO custom_field_definitions (
  id, laboratory_id, configuration_version_id, module_key, field_key, label, field_type,
  required_mode, visibility_rule, include_in_report, include_in_qr, sort_order, created_by
) VALUES
  ('00000000-0000-0000-0000-000000010101', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000010003', 'REAGENTS', 'formula', 'Fórmula', 'TEXT', 'OPTIONAL', '{"roles":["LAB_ADMIN","ANALYST","ASSISTANT"]}', TRUE, FALSE, 10, '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000010102', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000010003', 'REAGENTS', 'opened_at', 'Fecha de apertura', 'DATE', 'CONDITIONAL', '{"roles":["LAB_ADMIN","ANALYST","ASSISTANT"]}', TRUE, FALSE, 20, '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000010103', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000010003', 'SPECIMENS', 'receipt_temperature', 'Temperatura de recepción', 'NUMBER_WITH_UNIT', 'CONDITIONAL', '{"roles":["LAB_ADMIN","ANALYST","ASSISTANT"]}', TRUE, FALSE, 30, '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000010104', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000010003', 'EQUIPMENT', 'criticality', 'Criticidad', 'SELECT', 'REQUIRED', '{"roles":["LAB_ADMIN","HEAD_OF_LAB"]}', TRUE, TRUE, 10, '00000000-0000-0000-0000-000000000101')
ON CONFLICT (laboratory_id, module_key, field_key, configuration_version_id) DO NOTHING;

INSERT INTO workflow_definitions (id, laboratory_id, workflow_key, name, entity_type) VALUES
  ('00000000-0000-0000-0000-000000010201', '00000000-0000-0000-0000-000000000011', 'SPECIMEN_LIFECYCLE', 'Ciclo completo de muestra', 'SPECIMEN'),
  ('00000000-0000-0000-0000-000000010202', '00000000-0000-0000-0000-000000000011', 'OOS_INVESTIGATION', 'Investigación OOS / OOT', 'QUALITY_INVESTIGATION'),
  ('00000000-0000-0000-0000-000000010203', '00000000-0000-0000-0000-000000000011', 'DOCUMENT_CONTROL', 'Control documental', 'CONTROLLED_DOCUMENT')
ON CONFLICT (laboratory_id, workflow_key) DO NOTHING;

INSERT INTO workflow_versions (id, workflow_id, version_number, status, effective_from, created_by, approved_by, approved_at) VALUES
  ('00000000-0000-0000-0000-000000010211', '00000000-0000-0000-0000-000000010201', 3, 'ACTIVE', now() - interval '10 day', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', now() - interval '10 day'),
  ('00000000-0000-0000-0000-000000010212', '00000000-0000-0000-0000-000000010202', 2, 'ACTIVE', now() - interval '10 day', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', now() - interval '10 day'),
  ('00000000-0000-0000-0000-000000010213', '00000000-0000-0000-0000-000000010203', 1, 'ACTIVE', now() - interval '10 day', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', now() - interval '10 day')
ON CONFLICT (workflow_id, version_number) DO NOTHING;

INSERT INTO workflow_states (workflow_version_id, state_key, label, description, sort_order, is_initial, is_terminal, required_fields) VALUES
  ('00000000-0000-0000-0000-000000010211', 'REGISTERED', 'Registrada', 'Se genera número único y QR.', 10, TRUE, FALSE, '["accession_number","barcode"]'),
  ('00000000-0000-0000-0000-000000010211', 'RECEIVED', 'Recibida', 'Se verifican identificación y condiciones.', 20, FALSE, FALSE, '["received_at","received_by"]'),
  ('00000000-0000-0000-0000-000000010211', 'ANALYZING', 'En análisis', 'Se registran método, equipo y reactivos.', 30, FALSE, FALSE, '[]'),
  ('00000000-0000-0000-0000-000000010211', 'IN_REVIEW', 'En revisión', 'Un responsable verifica resultados y evidencia.', 40, FALSE, FALSE, '[]'),
  ('00000000-0000-0000-0000-000000010211', 'APPROVED', 'Aprobada', 'Requiere firma para liberar.', 50, FALSE, FALSE, '[]'),
  ('00000000-0000-0000-0000-000000010211', 'CLOSED', 'Cerrada', 'Registro protegido y consultable.', 60, FALSE, TRUE, '[]')
ON CONFLICT (workflow_version_id, state_key) DO NOTHING;

INSERT INTO workflow_transitions (
  workflow_version_id, from_state_key, to_state_key, label, allowed_roles, required_fields,
  requires_signature, requires_reason
) VALUES
  ('00000000-0000-0000-0000-000000010211', 'REGISTERED', 'RECEIVED', 'Confirmar recepción', '["LAB_ADMIN","ASSISTANT","ANALYST"]', '["condition_on_receipt"]', FALSE, FALSE),
  ('00000000-0000-0000-0000-000000010211', 'RECEIVED', 'ANALYZING', 'Iniciar análisis', '["LAB_ADMIN","ANALYST"]', '[]', FALSE, FALSE),
  ('00000000-0000-0000-0000-000000010211', 'ANALYZING', 'IN_REVIEW', 'Enviar a revisión', '["LAB_ADMIN","ANALYST"]', '["result_records"]', FALSE, FALSE),
  ('00000000-0000-0000-0000-000000010211', 'IN_REVIEW', 'APPROVED', 'Aprobar', '["LAB_ADMIN","HEAD_OF_LAB","REVIEWER"]', '[]', TRUE, FALSE),
  ('00000000-0000-0000-0000-000000010211', 'APPROVED', 'CLOSED', 'Cerrar', '["LAB_ADMIN","HEAD_OF_LAB"]', '[]', TRUE, FALSE)
ON CONFLICT (workflow_version_id, from_state_key, to_state_key) DO NOTHING;


UPDATE specimens
SET workflow_version_id = '00000000-0000-0000-0000-000000010211', workflow_state_key = 'IN_REVIEW'
WHERE id = '00000000-0000-0000-0000-000000000801';

INSERT INTO permission_definitions (permission_key, module_key, action_key, label, description) VALUES
  ('inventory.view', 'INVENTORY', 'VIEW', 'Consultar inventario', 'Permite consultar disponibilidad y ubicación.'),
  ('inventory.manage', 'INVENTORY', 'MANAGE', 'Administrar lotes', 'Permite crear y configurar lotes de inventario.'),
  ('inventory.move', 'INVENTORY', 'MOVE', 'Registrar movimientos', 'Permite entradas, salidas, ajustes y transferencias.'),
  ('specimens.receive', 'SPECIMENS', 'RECEIVE', 'Recibir muestras', 'Permite aceptar o rechazar muestras.'),
  ('results.enter', 'RESULTS', 'ENTER', 'Registrar resultados', 'Permite ingresar resultados técnicos.'),
  ('results.approve', 'RESULTS', 'APPROVE', 'Aprobar resultados', 'Permite validar y liberar resultados.'),
  ('quality.manage', 'QUALITY', 'MANAGE', 'Gestionar calidad', 'Permite OOS, OOT, CAPA y documentos.'),
  ('audit.view', 'AUDIT', 'VIEW', 'Consultar auditoría', 'Permite revisar el audit trail.'),
  ('configuration.manage', 'CONFIGURATION', 'MANAGE', 'Gestionar configuración', 'Permite crear versiones de configuración.'),
  ('education.manage', 'EDUCATION', 'MANAGE', 'Gestionar prácticas', 'Permite programar prácticas y reservas.'),
  ('education.view', 'EDUCATION', 'VIEW', 'Consultar prácticas', 'Permite visualizar prácticas y disponibilidad.')
ON CONFLICT (permission_key) DO NOTHING;

INSERT INTO custom_roles (id, laboratory_id, role_key, name, description, scope_rule) VALUES
  ('00000000-0000-0000-0000-000000010301', '00000000-0000-0000-0000-000000000011', 'ADMIN', 'Administrador', 'Configura la plataforma y administra accesos.', '{"scope":"ORGANIZATION"}'),
  ('00000000-0000-0000-0000-000000010302', '00000000-0000-0000-0000-000000000011', 'HEAD', 'Jefe de laboratorio', 'Supervisa operación, calidad y liberaciones.', '{"scope":"LABORATORY"}'),
  ('00000000-0000-0000-0000-000000010303', '00000000-0000-0000-0000-000000000011', 'ANALYST', 'Analista', 'Ejecuta ensayos y registra evidencia.', '{"scope":"AUTHORIZED_AREAS"}'),
  ('00000000-0000-0000-0000-000000010304', '00000000-0000-0000-0000-000000000011', 'ASSISTANT', 'Auxiliar', 'Apoya recepción, inventario y bitácoras.', '{"scope":"AUTHORIZED_AREAS"}'),
  ('00000000-0000-0000-0000-000000010305', '00000000-0000-0000-0000-000000000011', 'AUDITOR', 'Inspector / auditor', 'Consulta evidencia sin modificar registros.', '{"scope":"READ_ONLY"}'),
  ('00000000-0000-0000-0000-000000010306', '00000000-0000-0000-0000-000000000011', 'CONSULT', 'Consulta', 'Visualización limitada.', '{"scope":"READ_ONLY_LIMITED"}'),
  ('00000000-0000-0000-0000-000000010307', '00000000-0000-0000-0000-000000000011', 'PROFESSOR', 'Profesor', 'Programa prácticas y reservas.', '{"scope":"ASSIGNED_COURSES"}'),
  ('00000000-0000-0000-0000-000000010308', '00000000-0000-0000-0000-000000000011', 'STUDENT', 'Estudiante', 'Consulta prácticas y disponibilidad.', '{"scope":"EDUCATIONAL_READ_ONLY"}')
ON CONFLICT (laboratory_id, role_key) DO NOTHING;

INSERT INTO custom_role_permissions (role_id, permission_key) VALUES
  ('00000000-0000-0000-0000-000000010301', 'configuration.manage'),
  ('00000000-0000-0000-0000-000000010301', 'inventory.manage'),
  ('00000000-0000-0000-0000-000000010301', 'audit.view'),
  ('00000000-0000-0000-0000-000000010301', 'quality.manage'),
  ('00000000-0000-0000-0000-000000010302', 'inventory.manage'),
  ('00000000-0000-0000-0000-000000010302', 'results.approve'),
  ('00000000-0000-0000-0000-000000010302', 'quality.manage'),
  ('00000000-0000-0000-0000-000000010303', 'results.enter'),
  ('00000000-0000-0000-0000-000000010303', 'inventory.move'),
  ('00000000-0000-0000-0000-000000010304', 'specimens.receive'),
  ('00000000-0000-0000-0000-000000010304', 'inventory.move'),
  ('00000000-0000-0000-0000-000000010305', 'audit.view'),
  ('00000000-0000-0000-0000-000000010306', 'inventory.view'),
  ('00000000-0000-0000-0000-000000010307', 'education.manage'),
  ('00000000-0000-0000-0000-000000010307', 'inventory.view'),
  ('00000000-0000-0000-0000-000000010308', 'education.view')
ON CONFLICT DO NOTHING;

INSERT INTO alert_rules (
  id, laboratory_id, rule_key, name, source_type, trigger_type, condition_config,
  severity, recipient_config, channel_config, escalation_config, requires_acknowledgement,
  created_by
) VALUES
  ('00000000-0000-0000-0000-000000010401', '00000000-0000-0000-0000-000000000011', 'STOCK_MIN', 'Stock crítico', 'INVENTORY', 'THRESHOLD', '{"field":"quantity","operator":"LTE","reference":"reorder_point"}', 'HIGH', '{"roles":["LAB_ADMIN","ASSISTANT"]}', '["IN_APP","EMAIL"]', '{"after_minutes":240,"roles":["HEAD_OF_LAB"]}', TRUE, '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000010402', '00000000-0000-0000-0000-000000000011', 'REAGENT_EXPIRY', 'Reactivo próximo a vencer', 'INVENTORY', 'DATE_WINDOW', '{"days":[90,60,30,0]}', 'WARNING', '{"roles":["LAB_ADMIN","ASSISTANT"]}', '["IN_APP","EMAIL"]', '{}', TRUE, '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000010403', '00000000-0000-0000-0000-000000000011', 'CALIBRATION_OVERDUE', 'Calibración vencida', 'EQUIPMENT', 'DATE_OVERDUE', '{"blocks_use":true}', 'CRITICAL', '{"roles":["HEAD_OF_LAB","LAB_ADMIN"]}', '["IN_APP","EMAIL"]', '{"after_minutes":120,"roles":["LAB_ADMIN"]}', TRUE, '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000010404', '00000000-0000-0000-0000-000000000011', 'RESULT_OOS', 'Resultado fuera de especificación', 'RESULT', 'OUT_OF_SPECIFICATION', '{"open_oos":true}', 'CRITICAL', '{"roles":["ANALYST","HEAD_OF_LAB","REVIEWER"]}', '["IN_APP","EMAIL"]', '{"after_minutes":30,"roles":["HEAD_OF_LAB"]}', TRUE, '00000000-0000-0000-0000-000000000101')
ON CONFLICT (laboratory_id, rule_key) DO NOTHING;

UPDATE inventory_items
SET requires_usage_log = TRUE, internal_formula = 'Control biológico', received_at = '2026-05-18'
WHERE id = '00000000-0000-0000-0000-000000001101';

INSERT INTO equipment_plans (
  id, laboratory_id, equipment_id, plan_type, name, frequency_value, frequency_unit,
  next_due_at, reminder_days, blocks_use_when_overdue
) VALUES
  ('00000000-0000-0000-0000-000000010501', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000001201', 'VERIFICATION', 'Verificación antes de uso', 1, 'USE', now() + interval '1 day', '[0]', TRUE),
  ('00000000-0000-0000-0000-000000010502', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000001202', 'CALIBRATION', 'Calibración anual', 12, 'MONTH', now() - interval '5 day', '[90,60,30,0]', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO qr_identifiers (id, laboratory_id, entity_type, entity_id, opaque_token, label_code) VALUES
  ('00000000-0000-0000-0000-000000010601', '00000000-0000-0000-0000-000000000011', 'INVENTORY_ITEM', '00000000-0000-0000-0000-000000001101', 'qr_demo_rea_hem_029_7f6c', 'REA-HEM-029'),
  ('00000000-0000-0000-0000-000000010602', '00000000-0000-0000-0000-000000000011', 'EQUIPMENT', '00000000-0000-0000-0000-000000001201', 'qr_demo_eq_hem_004_38a1', 'EQ-HEM-004'),
  ('00000000-0000-0000-0000-000000010603', '00000000-0000-0000-0000-000000000011', 'SPECIMEN', '00000000-0000-0000-0000-000000000801', 'qr_demo_gt_260603_0183_bac0', 'GT-260603-0183')
ON CONFLICT (laboratory_id, entity_type, entity_id) DO NOTHING;

INSERT INTO logbook_templates (
  id, laboratory_id, template_key, title, entity_type, fields, frequency_rule, alert_rule, requires_signature
) VALUES
  ('00000000-0000-0000-0000-000000010701', '00000000-0000-0000-0000-000000000011', 'REFRIGERATOR_TEMP', 'Temperatura de refrigerador', 'STORAGE_LOCATION', '[{"key":"temperature","type":"NUMBER","unit":"C","required":true}]', '{"frequency":"SHIFT"}', '{"min":2,"max":8}', TRUE),
  ('00000000-0000-0000-0000-000000010702', '00000000-0000-0000-0000-000000000011', 'CABINET_CLEANING', 'Limpieza de cabina', 'EQUIPMENT', '[{"key":"completed","type":"BOOLEAN","required":true},{"key":"observation","type":"TEXT"}]', '{"frequency":"DAILY"}', '{"missing_entry_alert":true}', TRUE)
ON CONFLICT (laboratory_id, template_key) DO NOTHING;


INSERT INTO educational_practices (
  id, laboratory_id, practice_code, title, course_name, teacher_user_id, starts_at, ends_at, instructions, status
) VALUES
  ('00000000-0000-0000-0000-000000010751', '00000000-0000-0000-0000-000000000011', 'PRA-2026-021', 'Tinción de Gram', 'Microbiología I', '00000000-0000-0000-0000-000000000101', now() + interval '1 day', now() + interval '1 day 2 hour', 'Verificar colorantes, portaobjetos y reactivos reservados.', 'PLANNED'),
  ('00000000-0000-0000-0000-000000010752', '00000000-0000-0000-0000-000000000011', 'PRA-2026-022', 'Uso y verificación de microscopio', 'Laboratorio básico', '00000000-0000-0000-0000-000000000101', now() + interval '3 day', now() + interval '3 day 2 hour', 'Preparar microscopios y aceite de inmersión.', 'PLANNED')
ON CONFLICT (laboratory_id, practice_code) DO NOTHING;

INSERT INTO resource_reservations (
  id, laboratory_id, reservation_code, practice_id, resource_type, resource_id, quantity, unit, needed_at, requested_by, status
) VALUES
  ('00000000-0000-0000-0000-000000010761', '00000000-0000-0000-0000-000000000011', 'RES-2026-088', '00000000-0000-0000-0000-000000010751', 'INVENTORY_ITEM', '00000000-0000-0000-0000-000000001101', 25, 'mL', now() + interval '23 hour', '00000000-0000-0000-0000-000000000101', 'PENDING'),
  ('00000000-0000-0000-0000-000000010762', '00000000-0000-0000-0000-000000000011', 'RES-2026-087', '00000000-0000-0000-0000-000000010752', 'EQUIPMENT', '00000000-0000-0000-0000-000000001201', 12, 'equipos', now() + interval '3 day', '00000000-0000-0000-0000-000000000101', 'APPROVED')
ON CONFLICT (laboratory_id, reservation_code) DO NOTHING;

INSERT INTO controlled_documents (id, laboratory_id, document_code, document_type, title, owner_user_id) VALUES
  ('00000000-0000-0000-0000-000000010801', '00000000-0000-0000-0000-000000000011', 'POE-MIC-004', 'POE', 'Limpieza de cabina microbiológica', '00000000-0000-0000-0000-000000000101'),
  ('00000000-0000-0000-0000-000000010802', '00000000-0000-0000-0000-000000000011', 'SOP-INV-002', 'SOP', 'Recepción y almacenamiento de reactivos', '00000000-0000-0000-0000-000000000101')
ON CONFLICT (laboratory_id, document_code) DO NOTHING;

INSERT INTO document_versions (document_id, version_code, status, effective_from, review_due_at, created_by, approved_by, approved_at) VALUES
  ('00000000-0000-0000-0000-000000010801', 'v5', 'ACTIVE', '2026-05-01', '2027-05-01', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', now() - interval '39 day'),
  ('00000000-0000-0000-0000-000000010802', 'v3', 'ACTIVE', '2026-03-12', '2027-03-12', '00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000101', now() - interval '89 day')
ON CONFLICT (document_id, version_code) DO NOTHING;

INSERT INTO regulatory_packages (id, laboratory_id, package_key, name, version_label, jurisdiction, effective_from) VALUES
  ('00000000-0000-0000-0000-000000010901', '00000000-0000-0000-0000-000000000011', 'ISO17025', 'ISO/IEC 17025', '2017', 'Internacional', '2017-11-01'),
  ('00000000-0000-0000-0000-000000010902', '00000000-0000-0000-0000-000000000011', 'ISO15189', 'ISO 15189', '2022', 'Internacional', '2022-12-01'),
  ('00000000-0000-0000-0000-000000010903', '00000000-0000-0000-0000-000000000011', 'GXP', 'BPM / BPL', 'Configuración inicial', 'Guatemala', '2026-01-01')
ON CONFLICT (laboratory_id, package_key) DO NOTHING;

INSERT INTO regulatory_controls (
  package_id, control_key, area, requirement, implementation_note, evidence_expected, owner_role, control_state
) VALUES
  ('00000000-0000-0000-0000-000000010901', 'PERSONNEL_COMPETENCE', 'Personal', 'Competencia y autorización del personal', 'Expediente de competencia, capacitación y métodos autorizados.', 'Registros de competencia y vencimientos', 'HEAD_OF_LAB', 'IMPLEMENTED'),
  ('00000000-0000-0000-0000-000000010901', 'EQUIPMENT_CONTROL', 'Equipos', 'Control y trazabilidad metrológica', 'Planes, verificaciones, certificados y bloqueos configurables.', 'Historial y certificados', 'HEAD_OF_LAB', 'IMPLEMENTED'),
  ('00000000-0000-0000-0000-000000010901', 'NONCONFORMING_WORK', 'Trabajo no conforme', 'Investigación de desviaciones', 'OOS, OOT y CAPA con cierre aprobado.', 'Expediente de investigación', 'HEAD_OF_LAB', 'IMPLEMENTED'),
  ('00000000-0000-0000-0000-000000010902', 'SPECIMEN_CHAIN', 'Preanalítica', 'Identificación y cadena de custodia', 'Recepción guiada y transferencias trazables.', 'Historial de muestra', 'ASSISTANT', 'IMPLEMENTED'),
  ('00000000-0000-0000-0000-000000010903', 'DATA_INTEGRITY', 'Integridad de datos', 'Conservación de datos y cambios', 'Audit trail append-only y firmas vinculadas.', 'Exportación de auditoría', 'LAB_ADMIN', 'IMPLEMENTED')
ON CONFLICT (package_id, control_key) DO NOTHING;
