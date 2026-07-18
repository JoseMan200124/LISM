"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Lock, PackageSearch, ShieldCheck } from "lucide-react";
import { ActionModal, Toast, downloadCsv, useToast } from "@/components/action-kit";
import { formatDate, formatDateTime } from "@/lib/dates";
import { CONTROL_KIND_LABEL } from "@/lib/controlled-reagents";
import { ErrorState, InlineNotice, PageIntro, SimpleTable, SkeletonKpiGrid, SkeletonTable, StatGrid, type TableRow } from "@/components/lims-ui";

const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  RECEIPT: "Entrada", CONSUMPTION: "Consumo", ADJUSTMENT: "Ajuste", DISPOSAL: "Descarte", TRANSFER: "Transferencia", RETURN: "Devolución",
};

type ControlledRow = {
  id: string; sku: string; name: string; item_type: string; control_kind: string | null;
  quantity: number | string; unit: string; category: string; location: string; status: string;
  last_consumption_at: string | null; total_consumed: number | string; consumption_count: number | string;
};

type ControlledMovement = {
  id: string; movement_type: string; quantity_delta: number | string;
  previous_quantity: number | string | null; resulting_quantity: number | string | null;
  reason_code: string | null; note: string | null; usage_area: string | null; usage_purpose: string | null;
  used_by_person: string | null; authorized_by: string | null; performed_at: string; performed_by: string | null;
};

type ControlledDetail = ControlledRow & { movements: ControlledMovement[] };

function kindLabel(kind: string | null): string {
  if (!kind) return "Controlado";
  return CONTROL_KIND_LABEL[kind as keyof typeof CONTROL_KIND_LABEL] ?? "Controlado";
}

export function ControlledReagentsCenter() {
  const [state, setState] = useState<"loading" | "error" | "ready">("loading");
  const [pending, setPending] = useState(false);
  const [rows, setRows] = useState<ControlledRow[]>([]);
  const [detail, setDetail] = useState<ControlledDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const { message, toastType, showError, clearToast } = useToast();

  const load = useCallback(async () => {
    setState("loading");
    try {
      const response = await fetch("/api/inventory/controlled");
      if (!response.ok) { setState("error"); return; }
      const payload = await response.json() as { data?: ControlledRow[]; mode?: string };
      setPending(payload.mode === "pending-migration");
      setRows(payload.data ?? []);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    setDetail(null);
    try {
      const response = await fetch(`/api/inventory/controlled?itemId=${encodeURIComponent(id)}`);
      if (response.ok) {
        const payload = await response.json() as { data?: ControlledDetail };
        setDetail(payload.data ?? null);
      } else {
        showError("No se pudo cargar el historial del reactivo controlado.");
      }
    } catch {
      showError("No se pudo cargar el historial del reactivo controlado.");
    } finally {
      setDetailLoading(false);
    }
  }

  const tableRows = useMemo<TableRow[]>(() => rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    name: row.name,
    kind: kindLabel(row.control_kind),
    category: row.category,
    location: row.location,
    quantity: `${row.quantity ?? 0} ${row.unit ?? ""}`.trim(),
    consumptions: String(row.consumption_count ?? 0),
    last: row.last_consumption_at ? formatDateTime(row.last_consumption_at) : "—",
    status: row.status === "ARCHIVED" ? "Archivado" : "Activo",
  })), [rows]);

  const totalConsumptions = rows.reduce((sum, row) => sum + Number(row.consumption_count ?? 0), 0);
  const activeCount = rows.filter((row) => row.status !== "ARCHIVED").length;

  const intro = (
    <PageIntro
      eyebrow="CONTROL REGULATORIO"
      title="Registro de reactivos controlados"
      description="Reactivos de doble uso o precursores con su historial completo de movimientos y consumos, para controles internos y revisiones del ministerio o entidad reguladora."
    />
  );

  if (state === "loading") {
    return <div className="page-stack">{intro}<SkeletonKpiGrid cols={3} /><SkeletonTable rows={5} cols={9} /><Toast message={message} type={toastType} onClose={clearToast} /></div>;
  }
  if (state === "error") {
    return <div className="page-stack">{intro}<ErrorState description="No se pudo cargar el registro de reactivos controlados. Verifica tu conexión e intenta de nuevo." onRetry={() => void load()} /><Toast message={message} type={toastType} onClose={clearToast} /></div>;
  }

  return (
    <div className="page-stack">
      {intro}
      <StatGrid items={[
        { label: "Reactivos controlados", value: String(rows.length), hint: `${activeCount} activos`, icon: Lock },
        { label: "Consumos registrados", value: String(totalConsumptions), hint: "Con trazabilidad completa", icon: PackageSearch },
        { label: "Doble uso / precursores", value: String(rows.length), hint: "Marcados en inventario", icon: ShieldCheck },
      ]} />
      <InlineNotice title="Trazabilidad obligatoria">
        Todo consumo de un reactivo de doble uso o precursor queda registrado con qué se usó, cuánto, cuándo, quién lo usó y para qué. Estos reactivos no pueden descontarse del inventario sin completar el registro de consumo.
      </InlineNotice>
      {pending ? (
        <InlineNotice title="Actualización de base de datos pendiente">
          El control de reactivos de doble uso o precursores estará disponible en cuanto se aplique la actualización de base de datos (migración 0018).
        </InlineNotice>
      ) : null}
      <article className="panel configuration-panel">
        <div className="configuration-body">
          <section>
            <div className="section-heading">
              <div><h2>Reactivos marcados como controlados</h2><p>Haz clic en un reactivo para ver su historial completo de movimientos y consumos.</p></div>
            </div>
            <SimpleTable
              columns={[
                { key: "sku", label: "Código" },
                { key: "name", label: "Reactivo" },
                { key: "kind", label: "Control" },
                { key: "category", label: "Categoría" },
                { key: "location", label: "Ubicación" },
                { key: "quantity", label: "Existencia" },
                { key: "consumptions", label: "Consumos" },
                { key: "last", label: "Último consumo" },
                { key: "status", label: "Estado" },
              ]}
              rows={tableRows}
              onRowClick={(row) => { if (row.id) void openDetail(String(row.id)); }}
              searchPlaceholder="Buscar reactivo controlado…"
              emptyTitle="Sin reactivos controlados"
              emptyMessage="Marca un reactivo como de doble uso o precursor al registrarlo o editarlo en Inventario para que aparezca aquí."
            />
          </section>
        </div>
      </article>
      <ControlledDetailModal open={detailLoading || Boolean(detail)} loading={detailLoading} detail={detail} onClose={() => setDetail(null)} />
      <Toast message={message} type={toastType} onClose={clearToast} />
    </div>
  );
}

function ControlledDetailModal({ open, loading, detail, onClose }: Readonly<{ open: boolean; loading: boolean; detail: ControlledDetail | null; onClose: () => void }>) {
  if (!open) return null;
  const movements = detail?.movements ?? [];
  const consumptions = movements.filter((m) => Number(m.quantity_delta) < 0);

  function exportLog() {
    if (!detail) return;
    downloadCsv(
      `reactivo-controlado-${detail.sku}.csv`,
      movements.map((m) => ({
        fecha: formatDateTime(m.performed_at),
        tipo: MOVEMENT_TYPE_LABEL[m.movement_type] ?? m.movement_type,
        cantidad: String(m.quantity_delta),
        saldo_antes: m.previous_quantity ?? "",
        saldo_despues: m.resulting_quantity ?? "",
        uso_persona: m.used_by_person ?? "",
        area_proyecto: m.usage_area ?? "",
        finalidad: m.usage_purpose ?? "",
        autoriza: m.authorized_by ?? "",
        registro: m.performed_by ?? "",
        observaciones: m.note ?? "",
      })),
      [
        { key: "fecha", label: "Fecha y hora" },
        { key: "tipo", label: "Tipo" },
        { key: "cantidad", label: "Cantidad" },
        { key: "saldo_antes", label: "Saldo antes" },
        { key: "saldo_despues", label: "Saldo después" },
        { key: "uso_persona", label: "Usó" },
        { key: "area_proyecto", label: "Área / proyecto" },
        { key: "finalidad", label: "Finalidad" },
        { key: "autoriza", label: "Autoriza" },
        { key: "registro", label: "Registró" },
        { key: "observaciones", label: "Observaciones" },
      ],
    );
  }

  return (
    <ActionModal
      open={open}
      title={detail ? `${detail.sku} · ${detail.name}` : "Reactivo controlado"}
      description="Historial completo de movimientos y consumos con trazabilidad regulatoria."
      onClose={onClose}
      wide
    >
      <div className="modal-form">
        {loading || !detail ? <p aria-live="polite">Cargando historial…</p> : (
          <>
            <div className="details-grid">
              <div><small>Tipo de control</small><strong className="controlled-badge"><Lock size={13} /> {kindLabel(detail.control_kind)}</strong></div>
              <div><small>Existencia actual</small><strong>{String(detail.quantity ?? 0)} {detail.unit}</strong></div>
              <div><small>Categoría</small><strong>{detail.category}</strong></div>
              <div><small>Ubicación</small><strong>{detail.location}</strong></div>
              <div><small>Estado</small><strong>{detail.status === "ARCHIVED" ? "Archivado" : "Activo"}</strong></div>
              <div><small>Consumos registrados</small><strong>{consumptions.length}</strong></div>
            </div>
            <div className="section-heading" style={{ marginTop: 14 }}>
              <div><p className="form-section-title" style={{ margin: 0 }}>Historial de movimientos y consumos</p></div>
              {movements.length > 0 ? <button type="button" className="secondary-button" onClick={exportLog}><Download size={15} /> Exportar CSV</button> : null}
            </div>
            {movements.length === 0 ? (
              <p className="modal-note">Este reactivo aún no tiene movimientos registrados.</p>
            ) : (
              <div className="definition-list">
                {movements.map((m) => {
                  const isConsumption = Number(m.quantity_delta) < 0;
                  return (
                    <article key={m.id} className={`definition-row${isConsumption ? " controlled-consumption-row" : ""}`}>
                      <div>
                        <strong>{MOVEMENT_TYPE_LABEL[m.movement_type] ?? m.movement_type}</strong>
                        {isConsumption && (m.used_by_person || m.usage_area || m.usage_purpose) ? (
                          <p className="usage-trace">
                            {[
                              m.used_by_person && `Usó: ${m.used_by_person}`,
                              m.usage_area && `Área/proyecto: ${m.usage_area}`,
                              m.usage_purpose && `Finalidad: ${m.usage_purpose}`,
                              m.authorized_by && `Autoriza: ${m.authorized_by}`,
                            ].filter(Boolean).join(" · ")}
                          </p>
                        ) : null}
                        {m.note ? <p>{m.note}</p> : null}
                      </div>
                      <small>
                        {String(m.quantity_delta)}
                        <br />
                        {String(m.previous_quantity ?? "?")} → {String(m.resulting_quantity ?? "?")}
                      </small>
                      <em>{formatDateTime(m.performed_at)}<br />{m.performed_by ?? ""}</em>
                    </article>
                  );
                })}
              </div>
            )}
            <footer className="modal-actions">
              <button type="button" className="secondary-button" onClick={onClose}>Cerrar</button>
            </footer>
          </>
        )}
      </div>
    </ActionModal>
  );
}
