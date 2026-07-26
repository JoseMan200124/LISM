import { GHS_PICTOGRAMS, ghsPictogram, type GhsCode } from "@/lib/ghs";

// Los nueve pictogramas SGA/GHS dibujados como SVG. Se generan en la propia
// aplicación para que la ficha de seguridad se vea igual en pantalla, impresa o
// sin conexión, sin depender de imágenes externas ni de derechos de terceros.
// El rombo rojo sobre fondo blanco y el símbolo negro reproducen el formato
// oficial de la etiqueta.

const SYMBOLS: Record<GhsCode, React.ReactNode> = {
  // Bomba explotando.
  GHS01: (
    <>
      <circle cx="50" cy="60" r="12" />
      <g strokeWidth="5" strokeLinecap="round" stroke="currentColor">
        <line x1="50" y1="44" x2="50" y2="28" />
        <line x1="38" y1="49" x2="29" y2="35" />
        <line x1="62" y1="49" x2="71" y2="35" />
        <line x1="35" y1="57" x2="21" y2="53" />
        <line x1="65" y1="57" x2="79" y2="53" />
      </g>
      <path d="M26 74l-6 9 10-3z" />
      <path d="M74 74l6 9-10-3z" />
    </>
  ),
  // Llama sobre una superficie.
  GHS02: (
    <>
      <path d="M52 24c2 10-2 13 2 18 3 4 8 2 8-4 6 7 8 17 2 25-5 7-12 10-19 10-11 0-19-8-19-18 0-14 16-19 26-31z" />
      <rect x="24" y="78" width="52" height="6" rx="3" />
    </>
  ),
  // Llama sobre un círculo (comburente).
  GHS03: (
    <>
      <path d="M52 22c2 8-2 11 2 15 3 3 7 2 7-4 5 6 7 14 2 21-4 5-10 8-16 8-9 0-16-7-16-15 0-12 13-15 21-25z" />
      <circle cx="50" cy="72" r="12" />
      <rect x="24" y="86" width="52" height="5" rx="2.5" />
    </>
  ),
  // Cilindro de gas a presión.
  GHS04: (
    <>
      <rect x="45" y="22" width="10" height="12" rx="2" />
      <rect x="41" y="30" width="18" height="7" rx="2" />
      <path d="M50 35c-9 0-15 7-15 16v29a4 4 0 004 4h22a4 4 0 004-4V51c0-9-6-16-15-16z" />
      <rect x="26" y="84" width="48" height="5" rx="2.5" />
    </>
  ),
  // Corrosión sobre una superficie y sobre la mano.
  GHS05: (
    <>
      <path d="M12 34l16-9 6 10-16 9z" />
      <rect x="27" y="43" width="4" height="20" rx="2" />
      <path d="M8 68h32l-7 10H15z" />
      <path d="M88 34L72 25l-6 10 16 9z" />
      <rect x="69" y="43" width="4" height="20" rx="2" />
      <path d="M58 70h30v5H62a4 4 0 01-4-5z" />
      <path d="M62 75h22l-3 9H65z" />
    </>
  ),
  // Calavera y tibias cruzadas.
  GHS06: (
    <>
      <path d="M50 24c-12 0-21 9-21 19 0 6 3 11 8 14v6h26v-6c5-3 8-8 8-14 0-10-9-19-21-19z" />
      <circle cx="42" cy="44" r="5" fill="#fff" />
      <circle cx="58" cy="44" r="5" fill="#fff" />
      <path d="M50 52l-4 8h8z" fill="#fff" />
      <g strokeWidth="7" strokeLinecap="round" stroke="currentColor">
        <line x1="28" y1="72" x2="72" y2="86" />
        <line x1="72" y1="72" x2="28" y2="86" />
      </g>
    </>
  ),
  // Signo de exclamación.
  GHS07: (
    <>
      <path d="M44 26h12l-3 36h-6z" />
      <circle cx="50" cy="74" r="6" />
    </>
  ),
  // Silueta con la estrella de daño en el pecho.
  GHS08: (
    <>
      <circle cx="50" cy="32" r="9" />
      <path d="M31 86V62c0-10 8-17 19-17s19 7 19 17v24z" />
      <path
        d="M50 50l4 9 10-3-6 8 6 8-10-3-4 9-4-9-10 3 6-8-6-8 10 3z"
        fill="#fff"
      />
    </>
  ),
  // Peligro para el medio ambiente: árbol seco y pez sobre el agua.
  GHS09: (
    <>
      <path d="M25 24h5v34h-5z" />
      <g strokeWidth="4" strokeLinecap="round" stroke="currentColor">
        <line x1="27" y1="34" x2="16" y2="26" />
        <line x1="27" y1="42" x2="38" y2="32" />
        <line x1="27" y1="50" x2="17" y2="44" />
      </g>
      <path d="M10 62q10-5 20 0t20 0 20 0 20 0v4q-10 5-20 0t-20 0-20 0-20 0z" />
      <path d="M44 74c8-8 22-8 30 0-8 8-22 8-30 0z" />
      <path d="M74 74l12-7v14z" />
      <circle cx="54" cy="72" r="2.6" fill="#fff" />
      <path d="M30 84l6-6M36 84l-6-6" strokeWidth="3" stroke="currentColor" />
    </>
  ),
};

export function GhsPictogramMark({ code, size = 56 }: Readonly<{ code: GhsCode; size?: number }>) {
  const pictogram = ghsPictogram(code);
  if (!pictogram) return null;
  return (
    <svg
      className="ghs-mark"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Pictograma SGA ${code}: ${pictogram.name}`}
    >
      <path d="M50 2.5 97.5 50 50 97.5 2.5 50Z" fill="#fff" stroke="#d5202a" strokeWidth="8" strokeLinejoin="round" />
      <g fill="#111" stroke="none">{SYMBOLS[code]}</g>
    </svg>
  );
}

/** Fila de pictogramas de un reactivo. Devuelve null si no hay ninguno declarado. */
export function GhsPictogramRow({
  codes,
  size = 44,
  showNames = false,
}: Readonly<{ codes: readonly GhsCode[]; size?: number; showNames?: boolean }>) {
  if (!codes.length) return null;
  return (
    <div className="ghs-row">
      {codes.map((code) => {
        const pictogram = ghsPictogram(code);
        return (
          <figure key={code} className="ghs-chip" title={pictogram ? `${pictogram.name} — ${pictogram.meaning}` : code}>
            <GhsPictogramMark code={code} size={size} />
            {showNames ? <figcaption>{pictogram?.name ?? code}</figcaption> : null}
          </figure>
        );
      })}
    </div>
  );
}

/** Selector de pictogramas para el alta y la edición de un reactivo. */
export function GhsPictogramPicker({
  value,
  onChange,
}: Readonly<{ value: readonly GhsCode[]; onChange: (codes: GhsCode[]) => void }>) {
  const selected = new Set(value);
  function toggle(code: GhsCode) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange(GHS_PICTOGRAMS.filter((pictogram) => next.has(pictogram.code)).map((pictogram) => pictogram.code));
  }
  return (
    <div className="ghs-picker">
      {GHS_PICTOGRAMS.map((pictogram) => {
        const active = selected.has(pictogram.code);
        return (
          <button
            type="button"
            key={pictogram.code}
            className={`ghs-picker-option ${active ? "ghs-picker-option-active" : ""}`}
            aria-pressed={active}
            onClick={() => toggle(pictogram.code)}
            title={pictogram.meaning}
          >
            <GhsPictogramMark code={pictogram.code} size={40} />
            <span>{pictogram.name}</span>
          </button>
        );
      })}
    </div>
  );
}
