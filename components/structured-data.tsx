export function JsonLd({ data }: Readonly<{ data: Record<string, unknown> }>) {
  // Escapar "<" evita que un valor con "</script><script>..." dentro del
  // JSON rompa fuera de este bloque de datos si en el futuro se le pasa
  // contenido dinámico (hallazgo #7 de la auditoría de seguridad) — hoy los
  // tres usos actuales son contenido estático, pero el componente no debe
  // depender de eso para ser seguro.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
