// Contenido de las páginas públicas por tipo de laboratorio (/soluciones/<slug>).
//
// Son páginas de posicionamiento: cada una responde a una búsqueda concreta
// («software para laboratorio clínico», «LIMS para control de calidad
// farmacéutico»…) con el mismo producto y la misma honestidad que la portada.
// Nada de lo que se afirma aquí puede ir más allá de lo que hace la plataforma
// hoy: los estados de disponibilidad son los mismos que en `audience-tabs.tsx`.

export type SectorStatus = "AVAILABLE" | "EVALUATION";

export type SectorFaq = { question: string; answer: string };

export type Sector = {
  slug: string;
  /** Nombre corto para menús, migas y enlaces relacionados. */
  label: string;
  /** Contexto del público: quién opera este tipo de laboratorio. */
  context: string;
  /** <title> de la página (máximo 60-65 caracteres). */
  title: string;
  /** meta description (máximo ~155 caracteres). */
  description: string;
  h1: string;
  intro: string;
  status: SectorStatus;
  /** Palabras clave por las que se quiere aparecer; se usan en el JSON-LD. */
  keywords: string[];
  problems: { before: string; after: string }[];
  modules: { title: string; text: string }[];
  workflow: { title: string; text: string }[];
  compliance: string;
  faqs: SectorFaq[];
};

export const SECTORS: Sector[] = [
  {
    slug: "laboratorio-educativo",
    label: "Laboratorio educativo",
    context: "Colegios y universidades",
    title: "Software para laboratorios educativos y universitarios",
    description:
      "NexaLab organiza las prácticas de laboratorio de colegios y universidades: cronograma, reservas de materiales y equipos, inventario de reactivos y avisos a estudiantes. Primer mes gratis.",
    h1: "Software de gestión para laboratorios educativos",
    intro:
      "Cada práctica preparada a tiempo. NexaLab programa las sesiones, reserva materiales y equipos, avisa a los estudiantes y registra el consumo real de cada práctica, para que el docente deje de perseguir faltantes y el inventario se actualice solo.",
    status: "AVAILABLE",
    keywords: [
      "software para laboratorio educativo",
      "sistema para laboratorio universitario",
      "gestión de prácticas de laboratorio",
      "inventario de reactivos para colegios",
    ],
    problems: [
      {
        before: "Las prácticas se planifican en un calendario compartido y el material se descubre que falta el mismo día.",
        after: "Cronograma de prácticas con reserva de materiales y equipos por sesión, y alerta si algo no alcanza.",
      },
      {
        before: "El consumo de reactivos se anota en una hoja y el inventario se descuadra cada semestre.",
        after: "Cada práctica descuenta lo que se usó; el saldo se calcula por movimientos y no por conteos.",
      },
      {
        before: "Los estudiantes se enteran de cambios por el chat del grupo, y no todos.",
        after: "Avisos a los estudiantes inscritos en la práctica cuando cambia el horario, el aula o el material.",
      },
      {
        before: "Nadie sabe qué equipo se usó, quién lo usó ni si estaba calibrado.",
        after: "Reservas por equipo con historial de uso, estado y próximo mantenimiento.",
      },
    ],
    modules: [
      { title: "Cronograma de prácticas", text: "Sesiones por curso, sección y docente, con los materiales y equipos que necesita cada una." },
      { title: "Reservas", text: "Materiales y equipos se apartan para la práctica y quedan bloqueados para el resto en ese horario." },
      { title: "Inventario", text: "Reactivos, materiales e insumos por lote y ubicación, con vencimientos y stock mínimo." },
      { title: "Avisos a estudiantes", text: "Notificaciones a los inscritos cuando una práctica cambia o se cancela." },
      { title: "Código QR en cada recurso", text: "Escanear el frasco o el equipo abre su ficha con los permisos de quien escanea." },
      { title: "Historial de auditoría", text: "Quién sacó qué, cuándo y para qué práctica, sin posibilidad de sobrescribirlo." },
    ],
    workflow: [
      { title: "Se carga el semestre", text: "Cursos, secciones, docentes y el catálogo de prácticas con su lista de materiales." },
      { title: "Se programan las sesiones", text: "Cada práctica reserva lo que necesita; si un reactivo no alcanza, el sistema lo avisa antes." },
      { title: "Se ejecuta la práctica", text: "El docente confirma el consumo real desde el navegador o la app móvil, y el inventario se ajusta." },
      { title: "Se revisa el cierre", text: "Consumo por curso, faltantes recurrentes y equipos más usados, listos para planear compras." },
    ],
    compliance:
      "Para laboratorios educativos, NexaLab aporta el registro de consumo y el control de reactivos controlados que suelen pedir las auditorías internas y las entidades reguladoras de precursores químicos. La institución define sus propios procedimientos.",
    faqs: [
      {
        question: "¿Sirve para un colegio con un solo laboratorio?",
        answer:
          "Sí. Se crea la organización, se cargan usuarios e inventario y se configuran las alertas; un laboratorio pequeño puede estar operando en días. Los planes crecen después hacia varias sedes.",
      },
      {
        question: "¿Los estudiantes necesitan usuario?",
        answer:
          "No es obligatorio. Los avisos pueden llegar a los estudiantes inscritos sin que operen el sistema; quienes sí necesitan usuario son docentes, encargados de laboratorio y administración.",
      },
      {
        question: "¿Controla reactivos regulados?",
        answer:
          "Sí. Los reactivos controlados tienen su propio módulo con registro de entradas, consumos y saldo por lote, que es lo que suele pedirse en una inspección.",
      },
      {
        question: "¿Cuánto cuesta para una universidad?",
        answer:
          "Los planes son mensuales, con el primer mes gratis en cualquiera de ellos. Los precios públicos están en la portada; para varias sedes se cotiza en la evaluación inicial.",
      },
    ],
  },
  {
    slug: "laboratorio-de-investigacion",
    label: "Laboratorio de investigación",
    context: "Universidades e institutos",
    title: "Software para laboratorios de investigación: muestras y bitácoras",
    description:
      "NexaLab da trazabilidad a la investigación: proyectos, muestras con cadena de custodia, bitácoras electrónicas y documentos versionados. Cada dato conserva quién, cuándo y con qué método.",
    h1: "Software de gestión para laboratorios de investigación",
    intro:
      "Resultados que se pueden reconstruir. NexaLab organiza proyectos, muestras, cadena de custodia, bitácoras electrónicas y documentos versionados, para que cada dato conserve quién lo generó, cuándo y con qué método, listo para publicar o auditar.",
    status: "AVAILABLE",
    keywords: [
      "software para laboratorio de investigación",
      "bitácora electrónica de laboratorio",
      "cadena de custodia de muestras",
      "LIMS para universidades",
    ],
    problems: [
      {
        before: "Las bitácoras están en cuadernos y la evidencia de un experimento depende de encontrar la página.",
        after: "Bitácoras electrónicas con firma, fecha y consulta inmediata desde cualquier proyecto.",
      },
      {
        before: "Una muestra pasa por varias manos y nadie puede decir dónde estuvo ni en qué condiciones.",
        after: "Cadena de custodia por muestra: cada traslado, cada responsable y cada cambio de estado quedan registrados.",
      },
      {
        before: "Los protocolos circulan por correo en varias versiones y no se sabe cuál es la vigente.",
        after: "Documentos controlados con versión vigente, historial y quién aprobó cada cambio.",
      },
      {
        before: "Al publicar o auditar, reconstruir el método y el equipo usado toma semanas.",
        after: "Cada resultado enlaza el método, el equipo, el lote de reactivo y la persona, sin trabajo extra.",
      },
    ],
    modules: [
      { title: "Proyectos", text: "Cada línea de investigación agrupa sus muestras, bitácoras, documentos y miembros." },
      { title: "Cadena de custodia", text: "Identificación de la muestra, traslados, responsables y estado en cada momento." },
      { title: "Bitácoras electrónicas", text: "Registro firmado por sesión, con adjuntos y sin posibilidad de sobrescribir entradas." },
      { title: "Documentos controlados", text: "Protocolos y procedimientos versionados, con aprobación y vigencia." },
      { title: "Equipos y calibración", text: "Planes periódicos por equipo, certificados y bloqueo de uso si vence la calibración." },
      { title: "API abierta", text: "Exportación y conexión con repositorios institucionales u otras herramientas del grupo." },
    ],
    workflow: [
      { title: "Se abre el proyecto", text: "Objetivo, responsables, muestras esperadas y los documentos que rigen el trabajo." },
      { title: "Se registran las muestras", text: "Con código QR, ubicación y custodia desde el ingreso." },
      { title: "Se trabaja con bitácora", text: "Cada sesión queda firmada, con el método y el equipo que se usó." },
      { title: "Se reconstruye cuando hace falta", text: "Para el artículo, la tesis o la auditoría, el historial completo está a un clic." },
    ],
    compliance:
      "NexaLab aporta estructuras alineadas a las buenas prácticas de laboratorio (BPL) y a ISO/IEC 17025 en trazabilidad, control de documentos y equipos. La acreditación depende además de los procedimientos, la validación y las auditorías de cada institución.",
    faqs: [
      {
        question: "¿Se pueden exportar los datos para publicar?",
        answer:
          "Sí. Los datos son del laboratorio y se pueden exportar, y la API documentada permite conectarlos con repositorios o herramientas de análisis.",
      },
      {
        question: "¿Cómo se maneja un grupo con varios proyectos y personas rotando?",
        answer:
          "Cada proyecto define sus miembros y permisos. Cuando alguien deja el grupo, su historial se conserva y deja de tener acceso sin borrar nada.",
      },
      {
        question: "¿La bitácora electrónica reemplaza al cuaderno?",
        answer:
          "Sí, con ventaja: cada entrada queda con fecha, autor y firma, admite adjuntos y no se puede modificar después, que es justo lo que exige una revisión.",
      },
    ],
  },
  {
    slug: "laboratorio-clinico",
    label: "Laboratorio clínico",
    context: "Clínicos y diagnósticos",
    title: "Software para laboratorio clínico: órdenes, muestras y resultados",
    description:
      "NexaLab lleva la orden clínica desde el ingreso hasta la liberación del resultado, con recepción, identificación de muestra, revisión y liberación como pasos firmados, alineados a ISO 15189.",
    h1: "Software de gestión para laboratorios clínicos",
    intro:
      "Del ingreso de la orden a la liberación del resultado. NexaLab separa recepción, identificación de muestra, resultados, revisión y liberación en pasos firmados, con bases alineadas a ISO 15189. Antes de operar con datos clínicos reales, revisamos contigo alcance, validación y procedimientos.",
    status: "EVALUATION",
    keywords: [
      "software para laboratorio clínico",
      "LIS laboratorio clínico",
      "sistema de gestión de laboratorio clínico",
      "ISO 15189 software",
    ],
    problems: [
      {
        before: "La orden llega en papel y la muestra se etiqueta a mano; un error de identificación se descubre tarde.",
        after: "Orden registrada al ingreso, muestra identificada con código y trazabilidad desde la recepción.",
      },
      {
        before: "Resultado, revisión y liberación los hace la misma persona en la misma pantalla.",
        after: "Pasos separados y firmados: quien libera no es quien ingresó el resultado.",
      },
      {
        before: "Los reactivos vencidos se descubren al usarlos.",
        after: "Alertas de vencimiento y stock mínimo por lote antes de que afecten una corrida.",
      },
      {
        before: "Ante una auditoría, reconstruir quién hizo qué sobre una muestra toma días.",
        after: "Historial inalterable por muestra, por usuario y por equipo.",
      },
    ],
    modules: [
      { title: "Órdenes", text: "Registro de la solicitud con paciente, pruebas y prioridad." },
      { title: "Muestras", text: "Recepción, identificación, estado y ubicación con código QR." },
      { title: "Resultados", text: "Captura contra la prueba solicitada, con el equipo y el lote de reactivo usados." },
      { title: "Revisión y liberación", text: "Pasos separados, con firma electrónica y reautenticación." },
      { title: "Equipos y calibración", text: "Planes de mantenimiento y calibración con bloqueo si vencen." },
      { title: "Inventario y reactivos controlados", text: "Lotes, vencimientos, stock mínimo y registro de reactivos regulados." },
    ],
    workflow: [
      { title: "Evaluación previa", text: "Revisamos con el laboratorio alcance, pruebas, validación y procedimientos antes de operar con datos reales." },
      { title: "Ingreso de la orden", text: "Se registra la solicitud y se identifica la muestra al recibirla." },
      { title: "Análisis y resultado", text: "El resultado queda ligado a la prueba, al equipo y al reactivo." },
      { title: "Revisión y liberación", text: "Un usuario distinto revisa y libera con firma; el reporte sale de un dato ya validado." },
    ],
    compliance:
      "El perfil clínico requiere evaluación previa: NexaLab aporta controles alineados a ISO 15189 y a 21 CFR Part 11 en firmas y auditoría, pero operar con datos de pacientes exige validar el alcance, los procedimientos y la capacitación del laboratorio. Eso se acuerda antes de empezar, nunca después.",
    faqs: [
      {
        question: "¿Por qué el laboratorio clínico requiere evaluación previa?",
        answer:
          "Porque se trabaja con datos de pacientes y resultados que orientan decisiones médicas. Antes de operar con datos reales revisamos juntos alcance, validación y procedimientos, y se documenta lo acordado.",
      },
      {
        question: "¿Emite reportes de resultados al paciente?",
        answer:
          "El flujo cubre desde la orden hasta la liberación del resultado validado. La forma del reporte y su entrega se definen en la evaluación técnica según cómo trabaje el laboratorio.",
      },
      {
        question: "¿Se puede conectar con el sistema de la clínica?",
        answer:
          "Sí. NexaLab publica una API con credenciales por alcance y webhooks, que permite integrarlo con el sistema de gestión clínica o el ERP de la institución.",
      },
    ],
  },
  {
    slug: "control-de-calidad-farmaceutico",
    label: "Control de calidad",
    context: "Farmacéutico e industrial",
    title: "Software de control de calidad farmacéutico: OOS, CAPA y firmas",
    description:
      "NexaLab compara cada resultado con la especificación vigente, abre OOS automáticamente cuando un valor sale de límites, gestiona OOT y CAPA, y firma electrónicamente con reautenticación.",
    h1: "Software para control de calidad farmacéutico e industrial",
    intro:
      "Métodos, especificaciones y desvíos bajo control. NexaLab registra resultados contra la especificación vigente, abre un OOS automáticamente cuando un valor queda fuera de límites, sigue OOT y CAPA, controla documentos y firma electrónicamente con reautenticación.",
    status: "AVAILABLE",
    keywords: [
      "software control de calidad farmacéutico",
      "gestión de OOS y CAPA",
      "LIMS farmacéutico",
      "firma electrónica 21 CFR Part 11",
    ],
    problems: [
      {
        before: "El analista compara el resultado con una especificación impresa que puede no ser la vigente.",
        after: "El resultado se valida contra la versión vigente de la especificación en el momento de capturarlo.",
      },
      {
        before: "Un valor fuera de límites se detecta en la revisión, días después.",
        after: "Apertura automática de OOS al capturar el valor, con su investigación y cierre trazados.",
      },
      {
        before: "Las CAPA viven en una hoja de cálculo y se cierran sin evidencia.",
        after: "CAPA con responsable, fecha, evidencia adjunta y verificación de eficacia.",
      },
      {
        before: "La firma es un usuario compartido que cualquiera puede usar.",
        after: "Firma electrónica con reautenticación, significado de la firma y registro inalterable.",
      },
    ],
    modules: [
      { title: "Métodos y especificaciones", text: "Versionados, con vigencia y límites por parámetro." },
      { title: "OOS y OOT", text: "Apertura automática, fases de investigación y cierre documentado." },
      { title: "CAPA", text: "Acciones correctivas y preventivas con seguimiento y verificación." },
      { title: "Documentos controlados", text: "Procedimientos y registros con versión vigente y aprobación." },
      { title: "Firmas electrónicas", text: "Reautenticación en cada firma y significado explícito (revisó, aprobó, liberó)." },
      { title: "Equipos", text: "Calibración y mantenimiento con certificados y bloqueo si vencen." },
    ],
    workflow: [
      { title: "Se cargan métodos y especificaciones", text: "Con sus límites y su versión vigente." },
      { title: "Se registra el lote", text: "Muestras del lote, pruebas requeridas y reactivos usados." },
      { title: "Se capturan resultados", text: "El sistema compara con la especificación; si algo sale de límites, abre el OOS." },
      { title: "Se revisa y se libera", text: "Con firmas electrónicas separadas y el expediente del lote completo." },
    ],
    compliance:
      "NexaLab aporta controles técnicos alineados a BPM, BPL, ISO/IEC 17025 y 21 CFR Part 11 en firmas, auditoría y control de documentos. La certificación del laboratorio depende además de sus procedimientos, validación y auditorías, y es responsabilidad de cada organización.",
    faqs: [
      {
        question: "¿Qué pasa cuando un resultado sale fuera de especificación?",
        answer:
          "Se abre un OOS automáticamente en el momento de la captura, ligado a la muestra, el método y el analista, y sigue sus fases de investigación hasta el cierre documentado.",
      },
      {
        question: "¿Las firmas electrónicas cumplen 21 CFR Part 11?",
        answer:
          "El sistema aporta los controles técnicos: reautenticación en cada firma, significado de la firma, vínculo con el registro y auditoría inalterable. El cumplimiento completo incluye además la validación y los procedimientos del laboratorio.",
      },
      {
        question: "¿Se integra con SAP o el ERP de planta?",
        answer:
          "Sí. La API documentada y los webhooks permiten conectar inventario, compras, equipos y resultados con SAP, Power Apps u otros sistemas.",
      },
    ],
  },
  {
    slug: "laboratorio-industrial",
    label: "Laboratorio industrial",
    context: "Alimentos y manufactura",
    title: "Software para laboratorio industrial y de alimentos",
    description:
      "NexaLab controla la calidad de lote sin hojas sueltas: monitoreo ambiental por punto, bitácoras por turno, reactivos e insumos con vencimiento y stock mínimo, y alertas antes de que falte algo en línea.",
    h1: "Software de gestión para laboratorios industriales y de alimentos",
    intro:
      "Calidad de lote sin hojas sueltas. NexaLab registra el monitoreo ambiental por punto, las bitácoras por turno, el control de reactivos e insumos con vencimiento y stock mínimo, y avisa antes de que falte algo en la línea de producción.",
    status: "AVAILABLE",
    keywords: [
      "software para laboratorio industrial",
      "laboratorio de alimentos software",
      "monitoreo ambiental laboratorio",
      "bitácoras por turno",
    ],
    problems: [
      {
        before: "El monitoreo ambiental se anota en formatos impresos por punto y turno, y se archiva en cajas.",
        after: "Cada punto de muestreo tiene su historial, con tendencia y alerta cuando se sale del rango.",
      },
      {
        before: "El turno de noche no sabe qué dejó pendiente el de la tarde.",
        after: "Bitácoras por turno con entregas, incidencias y firma de quien recibe.",
      },
      {
        before: "Un insumo crítico se agota y la línea espera.",
        after: "Stock mínimo y vencimiento por lote con alerta anticipada al responsable de compras.",
      },
      {
        before: "Ante una queja de cliente, reconstruir el lote toma días.",
        after: "Resultados, equipos, reactivos y personas ligados al lote desde el primer análisis.",
      },
    ],
    modules: [
      { title: "Monitoreo ambiental", text: "Puntos de muestreo, frecuencia, rangos y alertas por desviación." },
      { title: "Bitácoras por turno", text: "Registro electrónico con entrega de turno y firma." },
      { title: "Inventario por lote", text: "Reactivos e insumos con vencimiento, stock mínimo y ubicación." },
      { title: "Alertas", text: "A la persona correcta, antes de que el faltante llegue a producción." },
      { title: "Equipos", text: "Calibración, mantenimiento y certificados con bloqueo si vencen." },
      { title: "App móvil", text: "Captura en planta con código QR, sin volver al escritorio." },
    ],
    workflow: [
      { title: "Se definen los puntos y los turnos", text: "Qué se muestrea, dónde, con qué frecuencia y en qué rango." },
      { title: "Se registra en planta", text: "Desde el teléfono, escaneando el punto o el equipo." },
      { title: "Se vigilan las tendencias", text: "El sistema avisa cuando un punto se acerca al límite o un insumo al mínimo." },
      { title: "Se libera el lote", text: "Con todos los análisis, equipos y reactivos ligados, listo para cualquier reclamo." },
    ],
    compliance:
      "NexaLab aporta estructuras alineadas a BPM e ISO/IEC 17025 en trazabilidad, control de equipos y registros. La certificación del laboratorio depende además de sus procedimientos, capacitación y auditorías, y es responsabilidad de cada organización.",
    faqs: [
      {
        question: "¿Funciona sin conexión en planta?",
        answer:
          "La plataforma es web y la app móvil complementa el trabajo en planta. Para zonas sin cobertura conviene revisarlo en la evaluación inicial junto con la red de la instalación.",
      },
      {
        question: "¿Se puede tener varias plantas en una misma cuenta?",
        answer:
          "Sí. Los planes van desde un laboratorio hasta la coordinación de varias sedes, con datos separados por laboratorio y consolidados para la organización.",
      },
      {
        question: "¿Cómo se conecta con el ERP de la planta?",
        answer:
          "Con la API documentada y los webhooks: inventario, compras, equipos y resultados pueden sincronizarse con SAP, Power Apps u otros sistemas.",
      },
    ],
  },
];

export function getSector(slug: string): Sector | undefined {
  return SECTORS.find((sector) => sector.slug === slug);
}
