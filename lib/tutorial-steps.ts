import type { ModuleKey } from "@/lib/navigation";

export type TutorialStep = {
  id: string;
  selector: string;
  title: string;
  body: string;
  placement?: "bottom" | "top" | "left" | "right";
  // Acción previa: antes de localizar el selector, se hace clic en este otro
  // selector (p. ej. abrir la pestaña donde vive el elemento). Evita que un
  // paso se "salte" solo porque su pestaña no estaba abierta (§2.4).
  preAction?: { click: string };
};

export type TutorialDefinition = {
  version: number;
  steps: TutorialStep[];
};

// Versión de cada tutorial: subir el número hace que se vuelva a ofrecer
// automáticamente a usuarios que ya lo habían completado con una versión
// anterior (ver app/api/users/me/tutorial/route.ts).
export const tutorialsByModule: Partial<Record<ModuleKey, TutorialDefinition>> = {
  dashboard: {
    version: 1,
    steps: [
      { id: "kpis", selector: ".module-stat-grid, .kpi-grid", title: "Indicadores clave", body: "Aquí ves de un vistazo prácticas próximas, reservas pendientes, inventario bajo mínimo y estado de equipos.", placement: "bottom" },
      { id: "search", selector: ".global-search", title: "Búsqueda rápida", body: "Busca un artículo, práctica o equipo directamente desde cualquier pantalla. Atajo: Ctrl/Cmd + K.", placement: "bottom" },
      { id: "notifications", selector: "[data-tutorial='notifications-bell']", title: "Notificaciones", body: "La campana muestra alertas y avisos reales, agrupados por fecha. El punto indica que tienes pendientes sin leer.", placement: "bottom" },
      { id: "export", selector: "[data-tutorial='dashboard-export-pdf']", title: "Exportar PDF", body: "Genera un reporte profesional del resumen del laboratorio, con el logo de tu institución si ya lo configuraste.", placement: "left" },
    ],
  },
  inventory: {
    version: 1,
    steps: [
      { id: "new-item", selector: "[data-tutorial='inventory-new-item']", title: "Registrar un artículo", body: "Crea un nuevo reactivo, material o insumo con su código, ubicación y stock mínimo.", placement: "left" },
      { id: "scan-qr", selector: "[data-tutorial='inventory-scan-qr']", title: "Código QR", body: "Escanea la etiqueta QR de un artículo para consultarlo o registrar un movimiento rápidamente.", placement: "left" },
      { id: "tabs", selector: ".configuration-panel .tabs, .configuration-panel [role='tablist']", title: "Lotes, movimientos y ubicaciones", body: "Cambia entre lotes, historial de movimientos, ubicaciones y tus etiquetas QR.", placement: "top" },
      { id: "search", selector: ".table-toolbar input", title: "Buscar y filtrar", body: "Escribe para filtrar por código, nombre o ubicación al instante.", placement: "bottom" },
    ],
  },
  equipment: {
    version: 1,
    steps: [
      { id: "new-equipment", selector: "[data-tutorial='equipment-new']", title: "Registrar un equipo", body: "Da de alta un equipo con su código, ubicación y próxima fecha de mantenimiento.", placement: "left" },
      { id: "tabs", selector: ".configuration-panel .tabs, .configuration-panel [role='tablist']", title: "Equipos, planes y certificados", body: "Cambia entre el listado de equipos, sus planes de mantenimiento, los certificados y el código QR.", placement: "top" },
      { id: "certificates", selector: "[data-tutorial='equipment-certificates']", title: "Certificados y evidencia", body: "Adjunta certificados de calibración o mantenimiento con proveedor y vigencia. Abrimos la pestaña de Certificados por ti.", placement: "top", preAction: { click: "[data-tutorial='equipment-tab-certificates']" } },
    ],
  },
  education: {
    version: 1,
    steps: [
      { id: "practices", selector: ".configuration-panel .tabs, .configuration-panel [role='tablist']", title: "Cronograma de prácticas", body: "Consulta prácticas programadas, reservas de recursos y avisos publicados.", placement: "top" },
      { id: "new-practice", selector: "[data-tutorial='education-new-practice']", title: "Crear una práctica", body: "Programa una nueva práctica indicando título y curso; luego podrás asociar recursos.", placement: "left" },
      { id: "new-notification", selector: "[data-tutorial='education-new-notification']", title: "Publicar un aviso", body: "Envía un recordatorio o instrucción a estudiantes, profesores o a todo el laboratorio.", placement: "left" },
    ],
  },
  alerts: {
    version: 2,
    steps: [
      { id: "intro", selector: ".page-header, .page-stack > header", title: "Alertas automáticas", body: "El sistema genera estas alertas solo: stock bajo, vencimientos, mantenimientos y calibraciones próximas o vencidas, y reservas sin preparar.", placement: "bottom" },
      { id: "tabs", selector: ".configuration-panel .tabs, .configuration-panel [role='tablist']", title: "Alertas, reglas y escalamientos", body: "En «Alertas» ves cada aviso y abres el registro que lo originó. En «Reglas» defines qué se vigila y a quién se avisa. En «Escalamientos», a quién se informa si nadie atiende a tiempo.", placement: "top" },
      { id: "incidents-vs", selector: ".inline-notice", title: "¿Y las incidencias?", body: "Lo que ocurre en el laboratorio y registras a mano (accidentes, daños, derrames, hallazgos) va en el módulo «Incidencias», no aquí. El Centro de ayuda explica la diferencia.", placement: "bottom" },
    ],
  },
  incidents: {
    version: 1,
    steps: [
      { id: "intro", selector: ".page-header, .page-stack > header", title: "Incidencias y hallazgos", body: "Aquí registras manualmente lo que ocurre en el laboratorio: accidentes, daños, derrames, desviaciones u observaciones. Es distinto de las alertas automáticas.", placement: "bottom" },
      { id: "tabs", selector: ".configuration-panel .tabs, .configuration-panel [role='tablist']", title: "Abiertas y todas", body: "Filtra entre incidencias abiertas y el historial completo. Haz clic en una fila para ver el detalle, asignarla, darle seguimiento y cerrarla.", placement: "top" },
    ],
  },
  administration: {
    version: 1,
    steps: [
      { id: "list", selector: ".page-header, .page-stack > header", title: "Usuarios y roles", body: "Administra quién tiene acceso al laboratorio y qué puede hacer cada rol.", placement: "bottom" },
    ],
  },
  configuration: {
    version: 1,
    steps: [
      { id: "profile-tab", selector: "[data-tutorial='config-tab-profile']", title: "Mi perfil", body: "Actualiza tu foto de perfil y consulta tu correo, rol e institución.", placement: "bottom" },
      { id: "avatar", selector: "[data-tutorial='config-avatar-upload']", title: "Foto de perfil", body: "Sube, reemplaza o elimina tu foto. Si no tienes una, se muestran tus iniciales.", placement: "right" },
      { id: "institution-tab", selector: "[data-tutorial='config-tab-institution']", title: "Institución y marca", body: "Configura el logo institucional que aparecerá en tus reportes PDF.", placement: "bottom" },
      { id: "billing-tab", selector: "[data-tutorial='config-tab-billing']", title: "Plan y facturación", body: "Revisa tu plan actual, estado de la suscripción y accede a la facturación completa.", placement: "bottom" },
      { id: "notifications-tab", selector: "[data-tutorial='config-tab-notifications']", title: "Notificaciones", body: "Ajusta tus preferencias de notificaciones dentro de la plataforma.", placement: "bottom" },
    ],
  },
  billing: {
    version: 1,
    steps: [
      { id: "plan", selector: "[data-tutorial='billing-plan-summary']", title: "Tu plan actual", body: "Consulta el plan contratado, el estado de tu suscripción y las fechas importantes.", placement: "bottom" },
      { id: "history", selector: "[data-tutorial='billing-history']", title: "Historial de pagos", body: "Revisa los pagos anteriores de tu institución.", placement: "top" },
    ],
  },
};

export function pathnameToModuleKey(pathname: string): ModuleKey | null {
  if (pathname === "/app") return "dashboard";
  const match = /^\/app\/([a-z]+)/.exec(pathname);
  if (!match) return null;
  const candidate = match[1] as ModuleKey;
  return candidate in tutorialsByModule ? candidate : null;
}
