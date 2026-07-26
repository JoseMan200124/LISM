"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Archive, ClipboardCheck, Plus, Snowflake, ThermometerSnowflake } from "lucide-react";
import { ActionModal, Toast, useToast } from "@/components/action-kit";
import { ErrorState, PageIntro, SimpleTable, SkeletonKpiGrid, SkeletonTable, StatGrid, Tabs, type TableRow } from "@/components/lims-ui";
import {
  BIOBANK_MOVEMENT_LABEL,
  BIOBANK_MOVEMENT_TYPES,
  BIOBANK_STATUSES,
  BIOBANK_STATUS_LABEL,
  QC_RESULT_LABEL,
  STORAGE_KINDS,
  STORAGE_KIND_LABEL,
  type BiobankStatus,
  type StorageKind,
} from "@/lib/research";
import { apiMessage, formatDay, formatMoment, useDirectory, useResearchList } from "@/components/research/research-kit";

// Biobanco: administra ubicación, conservación, movimientos y control de
// calidad del material almacenado. La muestra ya viene registrada.

type BiobankRow = {
  id: string; code: string; status: string; material_type: string | null;
  storage_kind: string | null; temperature_c: string | null;
  building: string | null; laboratory_room: string | null; room: string | null;
  shelf: string | null; rack: string | null; box: string | null; position: string | null;
  stored_on: string | null; expires_on: string | null; aliquot_count: number | null;
  sample_code: string; sample_alias: string | null; sample_type: string;
  project_code: string | null; project_title: string | null;
  equipment_name: string | null; responsible_name: string | null;
  last_check_on: string | null; last_check_result: string | null;
};

type Movement = { id: string; movement_type: string; detail: string | null; quantity: string | null; unit: string | null; destination: string | null; performed_at: string; performed_by_name: string | null };
type QualityCheck = {
  id: string; checked_on: string; integrity: string | null; concentration: string | null; purity: string | null;
  contamination: string | null; cell_viability: string | null; result: string; note: string | null; checked_by_name: string | null;
};

type BiobankDetail = BiobankRow & {
  notes: string | null; shelf_life_months: number | null; volume_amount: string | null; volume_unit: string | null;
  equipment_code: string | null; removed_on: string | null;
  movements: Movement[]; checks: QualityCheck[];
};

function locationText(entry: { building?: string | null; laboratory_room?: string | null; room?: string | null; shelf?: string | null; rack?: string | null; box?: string | null; position?: string | null }): string {
  const parts = [entry.building, entry.laboratory_room, entry.room, entry.shelf ? `Estante ${entry.shelf}` : null, entry.rack ? `Rack ${entry.rack}` : null, entry.box ? `Caja ${entry.box}` : null, entry.position ? `Pos. ${entry.position}` : null];
  return parts.filter(Boolean).join(" · ") || "—";
}

export function BiobankCenter() {
  const { items, loading, error, reload } = useResearchList<BiobankRow>("/api/research/biobank");
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const { message, toastType, showToast, showError, clearToast } = useToast();

  const active = items.filter((entry) => entry.status === "ACTIVE");
  const expiringSoon = items.filter((entry) => {
    if (!entry.expires_on) return false;
    const days = (new Date(entry.expires_on).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    return days >= 0 && days <= 60;
  });

  const rows: TableRow[] = items.map((entry) => ({
    id: entry.id,
    code: entry.code,
    sample: `${entry.sample_code}${entry.sample_alias ? ` · ${entry.sample_alias}` : ""}`,
    material: entry.material_type ?? "—",
    project: entry.project_code ?? "Sin proyecto",
    storage: entry.storage_kind ? STORAGE_KIND_LABEL[entry.storage_kind as StorageKind] ?? entry.storage_kind : "—",
    location: locationText(entry),
    stored: formatDay(entry.stored_on),
    expires: formatDay(entry.expires_on),
    quality: entry.last_check_result ? `${QC_RESULT_LABEL[entry.last_check_result] ?? entry.last_check_result} · ${formatDay(entry.last_check_on)}` : "Sin control",
    status: BIOBANK_STATUS_LABEL[entry.status as BiobankStatus] ?? entry.status,
  }));

  if (loading) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="INVESTIGACIÓN" title="Biobancos" description="Conservación del material: ubicación exacta, condiciones, movimientos y control de calidad." />
        <SkeletonKpiGrid cols={3} /><SkeletonTable rows={5} cols={9} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="page-stack">
        <PageIntro eyebrow="INVESTIGACIÓN" title="Biobancos" description="Conservación del material: ubicación exacta, condiciones, movimientos y control de calidad." />
        <ErrorState description={error} onRetry={() => void reload()} />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <PageIntro eyebrow="INVESTIGACIÓN" title="Biobancos" description="Conservación del material: ubicación exacta, condiciones, movimientos y control de calidad.">
        <button className="primary-button" onClick={() => setCreateOpen(true)}><Plus size={15} /> Ingresar al biobanco</button>
      </PageIntro>

      <StatGrid items={[
        { label: "Material activo", value: String(active.length), hint: `${items.length} registros en total`, icon: Snowflake },
        { label: "Por vencer", value: String(expiringSoon.length), hint: "En los próximos 60 días", icon: ThermometerSnowflake },
        { label: "Con control de calidad", value: String(items.filter((entry) => entry.last_check_on).length), hint: "Al menos un control", icon: ClipboardCheck },
      ]} />

      <article className="panel table-panel module-table-panel">
        <div className="configuration-body">
          <SimpleTable
            columns={[
              { key: "code", label: "ID biobanco" }, { key: "sample", label: "Muestra" }, { key: "material", label: "Material" },
              { key: "project", label: "Proyecto" }, { key: "storage", label: "Conservación" }, { key: "location", label: "Ubicación" },
              { key: "stored", label: "Ingreso" }, { key: "expires", label: "Expira" }, { key: "quality", label: "Último control" },
              { key: "status", label: "Estado" },
            ]}
            rows={rows}
            onRowClick={(row) => setDetailId(String(row.id))}
            searchPlaceholder="Buscar por código, muestra o ubicación…"
            emptyTitle="Biobanco vacío"
            emptyMessage="Ingresa material seleccionando una muestra ya registrada."
          />
        </div>
      </article>

      {createOpen ? (
        <BiobankFormModal onClose={() => setCreateOpen(false)} onSaved={async (code) => { setCreateOpen(false); showToast(`Material ingresado con el código ${code}.`); await reload(); }} onError={showError} />
      ) : null}
      {detailId ? (
        <BiobankDetailModal entryId={detailId} onClose={() => setDetailId(null)} onChanged={reload} onToast={showToast} onError={showError} />
      ) : null}
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function BiobankFormModal({ onClose, onSaved, onError }: Readonly<{
  onClose: () => void; onSaved: (code: string) => void | Promise<void>; onError: (message: string) => void;
}>) {
  const directory = useDirectory();
  const [saving, setSaving] = useState(false);
  const [samples, setSamples] = useState<Array<{ id: string; code: string; alias: string | null; project_code: string | null }>>([]);
  const [equipment, setEquipment] = useState<Array<{ id: string; code: string; name: string }>>([]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch("/api/research/samples").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
      fetch("/api/equipment").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] })),
    ]).then(([samplePayload, equipmentPayload]) => {
      if (!active) return;
      setSamples((samplePayload as { data?: Array<{ id: string; code: string; alias: string | null; project_code: string | null }> }).data ?? []);
      setEquipment(((equipmentPayload as { data?: Array<Record<string, unknown>> }).data ?? []).map((row) => ({
        id: String(row.id ?? ""), code: String(row.code ?? ""), name: String(row.name ?? ""),
      })).filter((row) => row.id));
    });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    try {
      const response = await fetch("/api/research/biobank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampleId: String(data.get("sampleId") ?? ""),
          materialType: String(data.get("materialType") ?? "").trim() || undefined,
          responsibleUserId: String(data.get("responsibleUserId") ?? "") || null,
          building: String(data.get("building") ?? "").trim() || undefined,
          laboratoryRoom: String(data.get("laboratoryRoom") ?? "").trim() || undefined,
          room: String(data.get("room") ?? "").trim() || undefined,
          equipmentId: String(data.get("equipmentId") ?? "") || null,
          shelf: String(data.get("shelf") ?? "").trim() || undefined,
          rack: String(data.get("rack") ?? "").trim() || undefined,
          box: String(data.get("box") ?? "").trim() || undefined,
          position: String(data.get("position") ?? "").trim() || undefined,
          storageKind: String(data.get("storageKind") ?? "") || undefined,
          temperatureC: String(data.get("temperatureC") ?? "") ? Number(data.get("temperatureC")) : null,
          storedOn: String(data.get("storedOn") ?? "") || null,
          shelfLifeMonths: String(data.get("shelfLifeMonths") ?? "") ? Number(data.get("shelfLifeMonths")) : null,
          expiresOn: String(data.get("expiresOn") ?? "") || null,
          aliquotCount: String(data.get("aliquotCount") ?? "") ? Number(data.get("aliquotCount")) : null,
          volumeAmount: String(data.get("volumeAmount") ?? "") ? Number(data.get("volumeAmount")) : null,
          volumeUnit: String(data.get("volumeUnit") ?? "").trim() || undefined,
          notes: String(data.get("notes") ?? "").trim() || undefined,
        }),
      });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo ingresar el material.")); return; }
      const payload = await response.json() as { data?: { code?: string } };
      await onSaved(String(payload.data?.code ?? ""));
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ActionModal open wide eyebrow="BIOBANCO" title="Ingresar material al biobanco" description="Selecciona una muestra ya registrada. El proyecto y sus datos se heredan de ella." onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div className="form-grid form-grid-two">
          <label className="field-span-two"><span>Muestra *</span>
            <select name="sampleId" required defaultValue="">
              <option value="" disabled>Selecciona la muestra…</option>
              {samples.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  {sample.code}{sample.alias ? ` · ${sample.alias}` : ""}{sample.project_code ? ` (${sample.project_code})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label><span>Tipo de material</span><input name="materialType" placeholder="ADN, suero, tejido, cepa…" /></label>
          <label><span>Responsable</span>
            <select name="responsibleUserId" defaultValue="">
              <option value="">Yo mismo</option>
              {directory.map((user) => <option key={user.id} value={user.id}>{user.full_name}</option>)}
            </select>
          </label>

          <span className="form-section-title field-span-two">Ubicación</span>
          <label><span>Edificio</span><input name="building" /></label>
          <label><span>Laboratorio</span><input name="laboratoryRoom" /></label>
          <label><span>Sala</span><input name="room" /></label>
          <label><span>Equipo</span>
            <select name="equipmentId" defaultValue="">
              <option value="">Sin equipo asignado</option>
              {equipment.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
            </select>
          </label>
          <label><span>Estante</span><input name="shelf" /></label>
          <label><span>Rack</span><input name="rack" /></label>
          <label><span>Caja</span><input name="box" /></label>
          <label><span>Posición</span><input name="position" placeholder="A1, B4…" /></label>

          <span className="form-section-title field-span-two">Condiciones y vigencia</span>
          <label><span>Tipo de almacenamiento</span>
            <select name="storageKind" defaultValue="">
              <option value="">Sin especificar</option>
              {STORAGE_KINDS.map((kind) => <option key={kind} value={kind}>{STORAGE_KIND_LABEL[kind]}</option>)}
            </select>
          </label>
          <label><span>Temperatura (°C)</span><input name="temperatureC" type="number" step="any" placeholder="-80" /></label>
          <label><span>Fecha de ingreso</span><input name="storedOn" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
          <label><span>Vida útil (meses)</span><input name="shelfLifeMonths" type="number" min={1} max={1200} placeholder="24" /></label>
          <label><span>Fecha de expiración</span><input name="expiresOn" type="date" /><small className="field-hint">Si la dejas vacía se calcula con la vida útil.</small></label>
          <label><span>Número de alícuotas</span><input name="aliquotCount" type="number" min={0} /></label>
          <label><span>Volumen o cantidad</span><input name="volumeAmount" type="number" step="any" /></label>
          <label><span>Unidad</span><input name="volumeUnit" placeholder="mL, µL, mg" /></label>
          <label className="field-span-two"><span>Observaciones</span><textarea name="notes" rows={2} /></label>
        </div>
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="primary-button" disabled={saving}>{saving ? "Guardando…" : "Ingresar al biobanco"}</button>
        </footer>
      </form>
    </ActionModal>
  );
}

function BiobankDetailModal({ entryId, onClose, onChanged, onToast, onError }: Readonly<{
  entryId: string; onClose: () => void; onChanged: () => Promise<void>;
  onToast: (message: string) => void; onError: (message: string) => void;
}>) {
  const [detail, setDetail] = useState<BiobankDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("data");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/research/biobank/${entryId}`);
      if (!response.ok) { onError(await apiMessage(response, "No se pudo abrir el registro.")); return; }
      const payload = await response.json() as { data?: BiobankDetail };
      setDetail(payload.data ?? null);
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  }, [entryId, onError]);

  useEffect(() => { void load(); }, [load]);

  async function act(body: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/research/biobank/${entryId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!response.ok) { onError(await apiMessage(response, "No se pudo completar la acción.")); return; }
      onToast(successMessage);
      await load();
      await onChanged();
    } catch {
      onError("No se pudo conectar con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ActionModal
      open wide eyebrow="BIOBANCO"
      title={detail ? `${detail.code} · ${detail.sample_code}` : "Biobanco"}
      description="Ubicación, condiciones, movimientos y controles de calidad del material conservado."
      onClose={onClose}
    >
      <div className="modal-form">
        {loading || !detail ? <p aria-live="polite">Cargando registro…</p> : (
          <>
            <div className="details-grid">
              <div><small>Muestra</small><strong>{detail.sample_code}{detail.sample_alias ? ` · ${detail.sample_alias}` : ""}</strong></div>
              <div><small>Proyecto</small><strong>{detail.project_code ?? "Sin proyecto"}</strong></div>
              <div><small>Material</small><strong>{detail.material_type ?? "—"}</strong></div>
              <div><small>Conservación</small><strong>{detail.storage_kind ? STORAGE_KIND_LABEL[detail.storage_kind as StorageKind] : "—"}{detail.temperature_c ? ` · ${detail.temperature_c} °C` : ""}</strong></div>
              <div><small>Ubicación</small><strong>{locationText(detail)}</strong></div>
              <div><small>Equipo</small><strong>{detail.equipment_name ?? "—"}</strong></div>
              <div><small>Ingreso</small><strong>{formatDay(detail.stored_on)}</strong></div>
              <div><small>Expira</small><strong>{formatDay(detail.expires_on)}</strong></div>
              <div><small>Alícuotas</small><strong>{detail.aliquot_count ?? "—"}</strong></div>
              <div><small>Responsable</small><strong>{detail.responsible_name ?? "—"}</strong></div>
            </div>

            <div className="research-status-bar">
              <span className="field-label">Estado</span>
              <div className="filter-chip-row">
                {BIOBANK_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={`filter-chip${detail.status === status ? " filter-chip-active" : ""}`}
                    disabled={busy || detail.status === status}
                    onClick={() => void act({ action: "UPDATE", status }, `Estado actualizado a ${BIOBANK_STATUS_LABEL[status].toLowerCase()}.`)}
                  >
                    {BIOBANK_STATUS_LABEL[status]}
                  </button>
                ))}
              </div>
            </div>

            <Tabs
              items={[{ key: "data", label: "Movimientos" }, { key: "quality", label: "Control de calidad" }]}
              active={tab}
              onChange={setTab}
            />

            {tab === "data" ? (
              <div className="research-panel">
                <form
                  className="form-grid form-grid-two"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void act({
                      action: "MOVEMENT",
                      movementType: String(data.get("movementType") ?? "RETRIEVED"),
                      detail: String(data.get("detail") ?? "").trim() || undefined,
                      quantity: String(data.get("quantity") ?? "") ? Number(data.get("quantity")) : null,
                      unit: String(data.get("unit") ?? "").trim() || undefined,
                      destination: String(data.get("destination") ?? "").trim() || undefined,
                    }, "Movimiento registrado.");
                    event.currentTarget.reset();
                  }}
                >
                  <label><span>Movimiento</span>
                    <select name="movementType" defaultValue="RETRIEVED">
                      {BIOBANK_MOVEMENT_TYPES.map((type) => <option key={type} value={type}>{BIOBANK_MOVEMENT_LABEL[type]}</option>)}
                    </select>
                  </label>
                  <label><span>Destino o solicitante</span><input name="destination" /></label>
                  <label><span>Cantidad</span><input name="quantity" type="number" step="any" min={0} /></label>
                  <label><span>Unidad</span><input name="unit" placeholder="mL, alícuotas" /></label>
                  <label className="field-span-two"><span>Detalle</span><input name="detail" placeholder="Para qué se retiró o a quién se prestó" /></label>
                  <div className="modal-actions field-span-two">
                    <button type="submit" className="secondary-button" disabled={busy}><Archive size={15} /> Registrar movimiento</button>
                  </div>
                </form>

                <div className="definition-list">
                  {detail.movements.map((movement) => (
                    <article className="definition-row" key={movement.id}>
                      <div>
                        <strong>{BIOBANK_MOVEMENT_LABEL[movement.movement_type] ?? movement.movement_type}</strong>
                        <p>
                          {movement.detail ?? "—"}
                          {movement.quantity ? ` · ${movement.quantity} ${movement.unit ?? ""}` : ""}
                          {movement.destination ? ` · ${movement.destination}` : ""}
                        </p>
                      </div>
                      <small>{movement.performed_by_name ?? "—"}</small>
                      <em>{formatMoment(movement.performed_at)}</em>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}

            {tab === "quality" ? (
              <div className="research-panel">
                <form
                  className="form-grid form-grid-two"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void act({
                      action: "QUALITY_CHECK",
                      checkedOn: String(data.get("checkedOn") ?? "") || undefined,
                      integrity: String(data.get("integrity") ?? "").trim() || undefined,
                      concentration: String(data.get("concentration") ?? "").trim() || undefined,
                      purity: String(data.get("purity") ?? "").trim() || undefined,
                      contamination: String(data.get("contamination") ?? "").trim() || undefined,
                      cellViability: String(data.get("cellViability") ?? "").trim() || undefined,
                      result: String(data.get("result") ?? "PASS"),
                      note: String(data.get("note") ?? "").trim() || undefined,
                    }, "Control de calidad registrado.");
                    event.currentTarget.reset();
                  }}
                >
                  <label><span>Fecha del control</span><input name="checkedOn" type="date" defaultValue={new Date().toISOString().slice(0, 10)} /></label>
                  <label><span>Resultado</span>
                    <select name="result" defaultValue="PASS">
                      <option value="PASS">Conforme</option>
                      <option value="WARNING">Con observación</option>
                      <option value="FAIL">No conforme</option>
                    </select>
                  </label>
                  <label><span>Integridad</span><input name="integrity" /></label>
                  <label><span>Concentración</span><input name="concentration" /></label>
                  <label><span>Pureza</span><input name="purity" /></label>
                  <label><span>Contaminación</span><input name="contamination" /></label>
                  <label><span>Viabilidad celular</span><input name="cellViability" /></label>
                  <label><span>Nota</span><input name="note" /></label>
                  <div className="modal-actions field-span-two">
                    <button type="submit" className="secondary-button" disabled={busy}><ClipboardCheck size={15} /> Registrar control</button>
                  </div>
                </form>

                <div className="definition-list">
                  {detail.checks.map((check) => (
                    <article className="definition-row" key={check.id}>
                      <div>
                        <strong>{QC_RESULT_LABEL[check.result] ?? check.result}</strong>
                        <p>
                          {[check.integrity && `Integridad: ${check.integrity}`, check.concentration && `Concentración: ${check.concentration}`,
                            check.purity && `Pureza: ${check.purity}`, check.contamination && `Contaminación: ${check.contamination}`,
                            check.cell_viability && `Viabilidad: ${check.cell_viability}`, check.note].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                      <small>{check.checked_by_name ?? "—"}</small>
                      <em>{formatDay(check.checked_on)}</em>
                    </article>
                  ))}
                  {detail.checks.length === 0 ? <p className="modal-note">Todavía no se ha registrado ningún control de calidad.</p> : null}
                </div>
              </div>
            ) : null}
          </>
        )}
        <footer className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>Cerrar</button>
        </footer>
      </div>
    </ActionModal>
  );
}
