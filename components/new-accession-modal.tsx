"use client";

import { useState, type FormEvent } from "react";
import { CheckCircle2, ScanBarcode, X } from "lucide-react";

export function NewAccessionModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<"form" | "done">("form");

  if (!open) return null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStep("done");
  }

  function close() {
    setStep("form");
    onClose();
  }

  return (
    <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Registrar nueva muestra">
      <button className="modal-backdrop" aria-label="Cerrar" onClick={close} />
      <section className="modal-card">
        <header className="modal-header">
          <div className="modal-icon"><ScanBarcode size={19} /></div>
          <div><p className="eyebrow">PRE-ANALÍTICA</p><h2>Registrar nueva muestra</h2></div>
          <button className="icon-button" aria-label="Cerrar" onClick={close}><X size={18} /></button>
        </header>
        {step === "form" ? (
          <form className="modal-form" onSubmit={submit}>
            <div className="form-grid form-grid-two">
              <label><span>Paciente</span><input required placeholder="Buscar por nombre o identificador" /></label>
              <label><span>Prioridad</span><select defaultValue="Rutina"><option>Rutina</option><option>Prioritario</option><option>Urgente</option></select></label>
              <label><span>Tipo de muestra</span><select defaultValue="Sangre total"><option>Sangre total</option><option>Suero</option><option>Plasma</option><option>Orina</option><option>Hisopado</option></select></label>
              <label><span>Código de etiqueta</span><input required placeholder="Escanear o escribir código" /></label>
              <label className="field-span-two"><span>Pruebas solicitadas</span><input required placeholder="Seleccionar pruebas del catálogo" /></label>
              <label className="field-span-two"><span>Observaciones de recepción</span><textarea rows={3} placeholder="Opcional" /></label>
            </div>
            <div className="modal-note">La muestra recibirá un número único de acceso y quedará disponible en la mesa de trabajo.</div>
            <footer className="modal-actions">
              <button className="secondary-button" type="button" onClick={close}>Cancelar</button>
              <button className="primary-button" type="submit">Registrar muestra</button>
            </footer>
          </form>
        ) : (
          <div className="modal-success">
            <CheckCircle2 size={48} />
            <h3>Muestra registrada</h3>
            <p>Se generó el acceso <strong>GT-260603-0185</strong> y la muestra ya aparece en la cola de recepción.</p>
            <button className="primary-button" onClick={close}>Continuar</button>
          </div>
        )}
      </section>
    </div>
  );
}
