"use client";

import { useState } from "react";
import { Boxes, FileCheck2, MapPin, PackageCheck, Plus, QrCode, ScanBarcode, ShieldCheck, Wrench } from "lucide-react";
import { equipmentPlans, inventoryMovements, locationRows } from "@/lib/compliance-data";
import { equipmentRows, inventoryRows } from "@/lib/demo-data";
import { InlineNotice, PageIntro, SimpleTable, StatGrid, Tabs } from "@/components/lims-ui";

export function InventoryCenter() {
  const [tab, setTab] = useState("lots");
  return (
    <div className="page-stack">
      <PageIntro eyebrow="RECURSOS Y TRAZABILIDAD" title="Inventario por lote" description="Controla reactivos, materiales, consumibles, ubicaciones, movimientos y etiquetas QR.">
        <button className="secondary-button"><ScanBarcode size={15} /> Escanear QR</button>
        <button className="primary-button"><Plus size={15} /> Nuevo artículo</button>
      </PageIntro>
      <StatGrid items={[
        { label: "Lotes activos", value: "438", hint: "12 ubicaciones", icon: Boxes },
        { label: "Por reponer", value: "3", hint: "Una alerta crítica", icon: PackageCheck },
        { label: "Próximos a vencer", value: "8", hint: "Sugerencia FEFO activa", icon: ShieldCheck },
      ]} />
      <InlineNotice title="Stock calculado por movimientos">Las existencias no se editan manualmente. Cada entrada, salida, ajuste, transferencia o descarte genera una bitácora con responsable y motivo.</InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={[{ key: "lots", label: "Lotes" }, { key: "movements", label: "Movimientos" }, { key: "locations", label: "Ubicaciones" }, { key: "qr", label: "QR y etiquetas" }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "lots" ? <ResourceSection title="Existencias por lote" copy="Cada lote conserva proveedor, vencimiento, ubicación, ficha de seguridad y trazabilidad de uso." action="Registrar consumo"><SimpleTable columns={[{ key: "sku", label: "Código" }, { key: "name", label: "Artículo" }, { key: "category", label: "Categoría" }, { key: "lot", label: "Lote" }, { key: "location", label: "Ubicación" }, { key: "quantity", label: "Existencia" }, { key: "minimum", label: "Mínimo" }, { key: "expires", label: "Vence" }, { key: "status", label: "Estado" }]} rows={inventoryRows} searchPlaceholder="Buscar reactivo, lote o ubicación…" /></ResourceSection> : null}
          {tab === "movements" ? <ResourceSection title="Bitácora de movimientos" copy="El sistema propone FEFO y exige justificación cuando se utiliza un lote distinto al recomendado." action="Nuevo movimiento"><SimpleTable columns={[{ key: "code", label: "Movimiento" }, { key: "item", label: "Artículo" }, { key: "lot", label: "Lote" }, { key: "type", label: "Tipo" }, { key: "quantity", label: "Cantidad" }, { key: "reason", label: "Motivo" }, { key: "performedBy", label: "Responsable" }, { key: "when", label: "Momento" }]} rows={inventoryMovements} /></ResourceSection> : null}
          {tab === "locations" ? <ResourceSection title="Ubicaciones jerárquicas" copy="Organiza sedes, laboratorios, armarios, refrigeradores, estantes y cajas para encontrar cada recurso." action="Nueva ubicación"><SimpleTable columns={[{ key: "code", label: "Código" }, { key: "hierarchy", label: "Ruta" }, { key: "type", label: "Tipo" }, { key: "responsible", label: "Responsable" }, { key: "status", label: "Estado" }]} rows={locationRows} /></ResourceSection> : null}
          {tab === "qr" ? <QrSection /> : null}
        </div>
      </article>
    </div>
  );
}

export function EquipmentCenter() {
  const [tab, setTab] = useState("master");
  return (
    <div className="page-stack">
      <PageIntro eyebrow="EQUIPOS Y TRAZABILIDAD METROLÓGICA" title="Equipos, planes y certificados" description="Programa verificaciones, calibraciones y mantenimientos con bloqueos configurables.">
        <button className="secondary-button"><ScanBarcode size={15} /> Escanear equipo</button>
        <button className="primary-button"><Plus size={15} /> Nuevo equipo</button>
      </PageIntro>
      <StatGrid items={[
        { label: "Equipos registrados", value: "24", hint: "21 operativos", icon: Wrench },
        { label: "Planes próximos", value: "3", hint: "Incluye calibración vencida", icon: ShieldCheck },
        { label: "Certificados vigentes", value: "92%", hint: "Archivos versionados", icon: FileCheck2 },
      ]} />
      <InlineNotice title="Bloqueo preventivo configurable">Un equipo puede quedar inhabilitado para nuevos análisis cuando su calibración, verificación o mantenimiento crítico esté vencido.</InlineNotice>
      <article className="panel configuration-panel">
        <Tabs items={[{ key: "master", label: "Registro maestro" }, { key: "plans", label: "Planes" }, { key: "certificates", label: "Certificados" }, { key: "qr", label: "QR" }]} active={tab} onChange={setTab} />
        <div className="configuration-body">
          {tab === "master" ? <ResourceSection title="Registro maestro de equipos" copy="Consulta estado, área, calibración y próximo mantenimiento." action="Registrar evento"><SimpleTable columns={[{ key: "code", label: "Código" }, { key: "name", label: "Equipo" }, { key: "area", label: "Área" }, { key: "status", label: "Estado" }, { key: "calibration", label: "Última calibración" }, { key: "maintenance", label: "Próximo mantenimiento" }, { key: "utilization", label: "Uso" }]} rows={equipmentRows} /></ResourceSection> : null}
          {tab === "plans" ? <ResourceSection title="Planes periódicos" copy="Define frecuencia, anticipación de alertas y si el incumplimiento bloquea el uso." action="Nuevo plan"><SimpleTable columns={[{ key: "code", label: "Equipo" }, { key: "equipment", label: "Nombre" }, { key: "plan", label: "Plan" }, { key: "frequency", label: "Frecuencia" }, { key: "next", label: "Próximo" }, { key: "blocking", label: "Bloquea uso" }, { key: "status", label: "Estado" }]} rows={equipmentPlans} /></ResourceSection> : null}
          {tab === "certificates" ? <CertificateSection /> : null}
          {tab === "qr" ? <QrSection equipment /> : null}
        </div>
      </article>
    </div>
  );
}

function ResourceSection({ title, copy, action, children }: Readonly<{ title: string; copy: string; action: string; children: React.ReactNode }>) {
  return <section><div className="section-heading"><div><h2>{title}</h2><p>{copy}</p></div><button className="secondary-button"><Plus size={15} /> {action}</button></div>{children}</section>;
}

function QrSection({ equipment = false }: Readonly<{ equipment?: boolean }>) {
  return (
    <section>
      <div className="section-heading"><div><h2>Etiquetas QR seguras</h2><p>El QR contiene un identificador opaco. La información se muestra únicamente después de aplicar autenticación y permisos.</p></div><button className="secondary-button"><QrCode size={15} /> Imprimir etiquetas</button></div>
      <div className="qr-demo-grid">
        <article className="qr-demo-card"><div className="qr-placeholder"><QrCode size={72} /></div><div><small>VISTA DE ETIQUETA</small><h3>{equipment ? "EQ-BAL-004" : "REA-MIC-018"}</h3><p>{equipment ? "Balanza analítica" : "Ácido clorhídrico 0.1 N"}</p><span>{equipment ? "Laboratorio fisicoquímico" : "Armario C1 · Laboratorio de Micro"}</span></div></article>
        <article className="qr-permission-card"><MapPin size={17} /><div><h3>Acciones según permiso</h3><p>Consultar ubicación, registrar consumo, transferir, abrir incidencia, registrar verificación o imprimir una nueva etiqueta.</p></div></article>
      </div>
    </section>
  );
}

function CertificateSection() {
  const rows = [
    { code: "CERT-2026-071", equipment: "Balanza analítica", type: "Calibración", provider: "Metrología GT", issued: "10/01/2026", expires: "10/01/2027", status: "Vigente" },
    { code: "CERT-2026-052", equipment: "Incubadora microbiológica", type: "Calificación", provider: "Servicios Lab", issued: "22/12/2025", expires: "22/12/2026", status: "Vigente" },
  ];
  return <ResourceSection title="Certificados y evidencia" copy="Adjunta PDF, fotografías, proveedor, alcance, incertidumbre y fecha de vigencia." action="Adjuntar certificado"><SimpleTable columns={[{ key: "code", label: "Código" }, { key: "equipment", label: "Equipo" }, { key: "type", label: "Tipo" }, { key: "provider", label: "Proveedor" }, { key: "issued", label: "Emitido" }, { key: "expires", label: "Vence" }, { key: "status", label: "Estado" }]} rows={rows} /></ResourceSection>;
}
