import {
  Activity,
  AlertTriangle,
  Archive,
  BarChart3,
  BookOpenCheck,
  Boxes,
  ClipboardList,
  FileCheck2,
  FlaskConical,
  Gauge,
  GitBranch,
  GraduationCap,
  Microscope,
  PackageSearch,
  ScanBarcode,
  Settings2,
  ShieldCheck,
  Stethoscope,
  TestTube2,
  UsersRound,
  Wrench,
} from "lucide-react";

export type ModuleKey =
  | "dashboard"
  | "workbench"
  | "accessioning"
  | "orders"
  | "results"
  | "patients"
  | "providers"
  | "catalog"
  | "inventory"
  | "equipment"
  | "education"
  | "quality"
  | "documents"
  | "logbooks"
  | "training"
  | "alerts"
  | "reports"
  | "integrations"
  | "audit"
  | "compliance"
  | "configuration"
  | "administration";

export const navigation = [
  {
    title: "Operación diaria",
    items: [
      { key: "dashboard", label: "Resumen", icon: Gauge, href: "/app" },
      { key: "workbench", label: "Mesa de trabajo", icon: Activity, href: "/app/workbench" },
      { key: "accessioning", label: "Recepción de muestras", icon: ScanBarcode, href: "/app/accessioning" },
      { key: "orders", label: "Órdenes", icon: ClipboardList, href: "/app/orders" },
      { key: "results", label: "Resultados", icon: TestTube2, href: "/app/results" },
    ],
  },
  {
    title: "Recursos",
    items: [
      { key: "inventory", label: "Inventario y reactivos", icon: Boxes, href: "/app/inventory" },
      { key: "equipment", label: "Equipos y calibración", icon: Microscope, href: "/app/equipment" },
      { key: "education", label: "Prácticas educativas", icon: GraduationCap, href: "/app/education" },
    ],
  },
  {
    title: "Datos maestros",
    items: [
      { key: "patients", label: "Pacientes", icon: UsersRound, href: "/app/patients" },
      { key: "providers", label: "Solicitantes", icon: Stethoscope, href: "/app/providers" },
      { key: "catalog", label: "Catálogo de pruebas", icon: FlaskConical, href: "/app/catalog" },
    ],
  },
  {
    title: "Calidad y control",
    items: [
      { key: "quality", label: "OOS, OOT y CAPA", icon: ShieldCheck, href: "/app/quality" },
      { key: "documents", label: "Documentos", icon: FileCheck2, href: "/app/documents" },
      { key: "logbooks", label: "Bitácoras", icon: BookOpenCheck, href: "/app/logbooks" },
      { key: "training", label: "Competencia", icon: GraduationCap, href: "/app/training" },
      { key: "alerts", label: "Alertas e incidencias", icon: AlertTriangle, href: "/app/alerts" },
      { key: "reports", label: "Reportes", icon: BarChart3, href: "/app/reports" },
    ],
  },
  {
    title: "Gobernanza",
    items: [
      { key: "compliance", label: "Cumplimiento", icon: ShieldCheck, href: "/app/compliance" },
      { key: "audit", label: "Auditoría", icon: Archive, href: "/app/audit" },
      { key: "configuration", label: "Configuración", icon: Settings2, href: "/app/configuration" },
      { key: "administration", label: "Usuarios y roles", icon: UsersRound, href: "/app/administration" },
      { key: "integrations", label: "Integraciones", icon: GitBranch, href: "/app/integrations" },
    ],
  },
] as const;

export const quickActions = [
  { label: "Registrar muestra", icon: ScanBarcode },
  { label: "Crear orden", icon: ClipboardList },
  { label: "Registrar consumo", icon: PackageSearch },
  { label: "Abrir bitácora", icon: BookOpenCheck },
  { label: "Reportar mantenimiento", icon: Wrench },
];
