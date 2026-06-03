import {
  Activity,
  AlertTriangle,
  Archive,
  BarChart3,
  BookOpenCheck,
  Boxes,
  ClipboardList,
  FlaskConical,
  Gauge,
  GitBranch,
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
  | "quality"
  | "alerts"
  | "reports"
  | "integrations"
  | "audit"
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
    title: "Gestión del laboratorio",
    items: [
      { key: "patients", label: "Pacientes", icon: UsersRound, href: "/app/patients" },
      { key: "providers", label: "Solicitantes", icon: Stethoscope, href: "/app/providers" },
      { key: "catalog", label: "Catálogo de pruebas", icon: FlaskConical, href: "/app/catalog" },
      { key: "inventory", label: "Inventario", icon: Boxes, href: "/app/inventory" },
      { key: "equipment", label: "Equipos", icon: Microscope, href: "/app/equipment" },
    ],
  },
  {
    title: "Calidad y control",
    items: [
      { key: "quality", label: "Calidad", icon: ShieldCheck, href: "/app/quality" },
      { key: "alerts", label: "Alertas e incidencias", icon: AlertTriangle, href: "/app/alerts" },
      { key: "reports", label: "Reportes", icon: BarChart3, href: "/app/reports" },
    ],
  },
  {
    title: "Plataforma",
    items: [
      { key: "integrations", label: "Integraciones", icon: GitBranch, href: "/app/integrations" },
      { key: "audit", label: "Auditoría", icon: Archive, href: "/app/audit" },
      { key: "administration", label: "Administración", icon: Settings2, href: "/app/administration" },
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
