import {
  Activity,
  AlertTriangle,
  Archive,
  BarChart3,
  Bell,
  BookOpenCheck,
  Boxes,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileCheck2,
  FlaskConical,
  Gauge,
  GitBranch,
  GraduationCap,
  Lock,
  Microscope,
  PackageSearch,
  ScanBarcode,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  TestTube2,
  UsersRound,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
  | "controlled"
  | "equipment"
  | "education"
  | "quality"
  | "documents"
  | "logbooks"
  | "training"
  | "alerts"
  | "incidents"
  | "reports"
  | "integrations"
  | "audit"
  | "compliance"
  | "configuration"
  | "administration"
  | "billing";

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
      { key: "controlled", label: "Reactivos controlados", icon: Lock, href: "/app/controlled" },
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
      { key: "audit", label: "Bitácora", icon: Archive, href: "/app/audit" },
      { key: "configuration", label: "Configuración", icon: Settings2, href: "/app/configuration" },
      { key: "administration", label: "Usuarios y roles", icon: UsersRound, href: "/app/administration" },
      { key: "integrations", label: "Integraciones", icon: GitBranch, href: "/app/integrations" },
    ],
  },
  {
    title: "Cuenta",
    items: [
      { key: "billing", label: "Suscripción y facturación", icon: CreditCard, href: "/app/billing" },
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

export type EducationalNavItem = {
  key: ModuleKey;
  label: string;
  icon: LucideIcon;
  href: string;
};

export type EducationalNavGroup = {
  title: string;
  items: EducationalNavItem[];
};

export const educationalNavigationByRole: Partial<Record<string, EducationalNavGroup[]>> = {
  LAB_ADMIN: [
    {
      title: "Laboratorio educativo",
      items: [
        { key: "dashboard", label: "Inicio", icon: Gauge, href: "/app" },
        { key: "inventory", label: "Inventario", icon: Boxes, href: "/app/inventory" },
        { key: "controlled", label: "Reactivos controlados", icon: Lock, href: "/app/controlled" },
        { key: "equipment", label: "Equipos", icon: Microscope, href: "/app/equipment" },
        { key: "education", label: "Programa", icon: CalendarDays, href: "/app/education" },
        { key: "alerts", label: "Alertas", icon: AlertTriangle, href: "/app/alerts" },
        { key: "incidents", label: "Incidencias", icon: ShieldAlert, href: "/app/incidents" },
      ],
    },
    {
      title: "Administración",
      items: [
        { key: "administration", label: "Usuarios", icon: UsersRound, href: "/app/administration" },
        { key: "audit", label: "Bitácora", icon: Archive, href: "/app/audit" },
        { key: "configuration", label: "Configuración", icon: Settings2, href: "/app/configuration" },
      ],
    },
  ],
  OWNER: [
    {
      title: "Laboratorio educativo",
      items: [
        { key: "dashboard", label: "Inicio", icon: Gauge, href: "/app" },
        { key: "inventory", label: "Inventario", icon: Boxes, href: "/app/inventory" },
        { key: "controlled", label: "Reactivos controlados", icon: Lock, href: "/app/controlled" },
        { key: "equipment", label: "Equipos", icon: Microscope, href: "/app/equipment" },
        { key: "education", label: "Programa", icon: CalendarDays, href: "/app/education" },
        { key: "alerts", label: "Alertas", icon: AlertTriangle, href: "/app/alerts" },
        { key: "incidents", label: "Incidencias", icon: ShieldAlert, href: "/app/incidents" },
      ],
    },
    {
      title: "Administración",
      items: [
        { key: "administration", label: "Usuarios", icon: UsersRound, href: "/app/administration" },
        { key: "audit", label: "Bitácora", icon: Archive, href: "/app/audit" },
        { key: "configuration", label: "Configuración", icon: Settings2, href: "/app/configuration" },
      ],
    },
  ],
  HEAD_OF_LAB: [
    {
      title: "Laboratorio educativo",
      items: [
        { key: "dashboard", label: "Inicio", icon: Gauge, href: "/app" },
        { key: "inventory", label: "Inventario", icon: Boxes, href: "/app/inventory" },
        { key: "controlled", label: "Reactivos controlados", icon: Lock, href: "/app/controlled" },
        { key: "equipment", label: "Equipos", icon: Microscope, href: "/app/equipment" },
        { key: "education", label: "Programa", icon: CalendarDays, href: "/app/education" },
        { key: "alerts", label: "Alertas", icon: AlertTriangle, href: "/app/alerts" },
        { key: "incidents", label: "Incidencias", icon: ShieldAlert, href: "/app/incidents" },
      ],
    },
    {
      title: "Administración",
      items: [
        { key: "administration", label: "Usuarios", icon: UsersRound, href: "/app/administration" },
        { key: "audit", label: "Bitácora", icon: Archive, href: "/app/audit" },
        { key: "configuration", label: "Configuración", icon: Settings2, href: "/app/configuration" },
      ],
    },
  ],
  PROFESSOR: [
    {
      title: "Docente",
      items: [
        { key: "dashboard", label: "Inicio", icon: Gauge, href: "/app" },
        { key: "education", label: "Programa", icon: CalendarDays, href: "/app/education" },
        { key: "inventory", label: "Inventario", icon: Boxes, href: "/app/inventory" },
        { key: "controlled", label: "Reactivos controlados", icon: Lock, href: "/app/controlled" },
        { key: "equipment", label: "Equipos", icon: Microscope, href: "/app/equipment" },
        { key: "alerts", label: "Alertas", icon: AlertTriangle, href: "/app/alerts" },
        { key: "incidents", label: "Incidencias", icon: ShieldAlert, href: "/app/incidents" },
      ],
    },
  ],
  STUDENT: [
    {
      title: "Estudiante",
      items: [
        { key: "dashboard", label: "Inicio", icon: Gauge, href: "/app" },
        { key: "education", label: "Mis prácticas", icon: GraduationCap, href: "/app/education?tab=schedule" },
        { key: "education", label: "Avisos", icon: Bell, href: "/app/education?tab=notices" },
      ],
    },
  ],
  AUDITOR: [
    {
      title: "Auditoría",
      items: [
        { key: "dashboard", label: "Inicio", icon: Gauge, href: "/app" },
        { key: "inventory", label: "Inventario", icon: Boxes, href: "/app/inventory" },
        { key: "controlled", label: "Reactivos controlados", icon: Lock, href: "/app/controlled" },
        { key: "equipment", label: "Equipos", icon: Microscope, href: "/app/equipment" },
        { key: "education", label: "Programa", icon: CalendarDays, href: "/app/education" },
        { key: "audit", label: "Bitácora", icon: Archive, href: "/app/audit" },
      ],
    },
  ],
};

export const educationalNavigationFallback: EducationalNavGroup[] = [
  {
    title: "Laboratorio educativo",
    items: [
      { key: "dashboard", label: "Inicio", icon: Gauge, href: "/app" },
      { key: "education", label: "Programa", icon: CalendarDays, href: "/app/education" },
      { key: "education", label: "Avisos", icon: Bell, href: "/app/education?tab=notices" },
    ],
  },
];
