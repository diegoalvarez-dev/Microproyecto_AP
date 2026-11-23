import { useMemo, useState } from "react";
import Legend from "./Legend.jsx";

const PH = {
  init: "Fase 1 · declarar",
  lectura: "Fase 1 · lectura",
  verificacion: "Fase 2 · verificación",
  vaciado: "Fase 3 · vaciado",
};

export function TablePanel({ result, hand = false }) {
  const { table, automaton } = result;
  const [phase, setPhase] = useState("todas");
  const [q, setQ] = useState("");
  const stacks = Object.fromEntries(
    automaton.stacks.map((s) => [s.name, s.show_counter]),
  );
  const rows = useMemo(
    () =>
      table.filter(
        (r) =>
          (phase === "todas" || r.phase === phase) &&
          (!q || r.from === q || r.to === q),
      ),
    [table, phase, q],
  );
  return (
    <div className="glass space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-2 text-lg font-bold">Tabla de transición</h2>
        {!hand &&
          ["todas", "init", "lectura", "verificacion", "vaciado"].map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={phase === p}
              onClick={() => setPhase(p)}
              className={`btn-ghost px-3 py-1.5 text-xs ${phase === p ? "!bg-white/22" : ""}`}
            >
              {p === "todas" ? "Todas" : PH[p]}
            </button>
          ))}
        <select
          aria-label="Filtrar por estado"
          className="field ml-auto text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        >
          <option value="">Todos los estados</option>
          {automaton.states.map((s) => (
            <option key={s.id} value={s.id}>
              {s.id}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-white/45">
        Cada fila es δ(estado, leído, tope de cada pila) = (destino, lo que se
        apila). Formato por pila:{" "}
        <span className="sym">tope, leído, apila</span> · ϕ = vacío · ε =
        desapilar · λ = no lee · ∅ = pila sin crear.
      </p>
      <Legend />
      <div className="max-h-[34rem] overflow-auto rounded-xl border border-white/10 scroll-thin">
        <table
          className="w-full min-w-[48rem] text-left text-sm"
          data-testid="trans-table"
        >
          <thead className="sticky top-0 bg-[#140d22] text-xs uppercase text-white/50">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Origen</th>
              <th className="px-3 py-2">Leído</th>
              <th className="px-3 py-2">Operación por pila</th>
              <th className="px-3 py-2">Destino</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="border-t border-white/8 align-top hover:bg-white/5"
                title={r.note}
              >
                <td className="px-3 py-1.5 text-white/40">{r.id}</td>
                <td className="sym px-3 py-1.5">{r.from}</td>
                <td
                  className="sym px-3 py-1.5 text-amber-200"
                  title={
                    r.read === "ϕ"
                      ? "ϕ = vacío: se terminó la entrada"
                      : undefined
                  }
                >
                  {r.read}
                </td>
                <td className="px-3 py-1.5">
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                    {r.init && (
                      <span
                        className="sym text-xs text-amber-200"
                        title="Declara las pilas"
                      >
                        {r.label}{" "}
                        <span className="text-white/45">
                          (declara las pilas)
                        </span>
                      </span>
                    )}
                    {!r.init &&
                      r.parts.map((p) => (
                        <span key={p.stack} className="sym text-xs">
                          <span className="text-white/45">
                            {stacks[p.stack]}:
                          </span>{" "}
                          {p.top}, {p.read}, {p.push}
                        </span>
                      ))}
                  </div>
                </td>
                <td className="sym px-3 py-1.5">{r.to}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-white/40">
        {rows.length} de {table.length} transiciones
      </div>
    </div>
  );
}

export function FormalPanel({ result, hand = false }) {
  const { formal, automaton, steps } = result;
  const explain = steps.filter((s) => s.kind === "phase");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="glass space-y-2 p-4">
        <h2 className="text-lg font-bold">Definición formal</h2>
        <p className="text-sm text-white/60">
          AP = (Q, Σ, Γ₁…Γₙ, δ, q₀, Z₀₁…Z₀ₙ, F)
        </p>
        <ul className="space-y-1.5">
          {formal.text.map((t, i) => (
            <li
              key={i}
              className="sym rounded-lg bg-black/20 px-3 py-1.5 text-[13px] leading-snug"
            >
              {t}
            </li>
          ))}
        </ul>
      </div>
      <div className="space-y-4">
        <div className="glass space-y-2 p-4">
          <h2 className="text-lg font-bold">
            Pilas utilizadas ({automaton.stacks.length})
          </h2>
          <ul className="space-y-1 text-sm">
            {automaton.stacks.map((s) => (
              <li key={s.name} className="flex items-center gap-2">
                <span className="sym w-12 text-cyan-200">{s.show_counter}</span>
                <span className="text-white/65">
                  {s.role === "aux"
                    ? `auxiliar de ${s.owner}: guarda temporalmente lo desapilado`
                    : `cuenta la variable ${s.var}`}{" "}
                  · fondo <span className="sym">{s.show_bottom}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="glass space-y-2 p-4">
          <h2 className="text-lg font-bold">
            {hand ? "Resumen" : "Cómo funciona"}
          </h2>
          {hand && (
            <p className="text-sm leading-relaxed text-white/75">
              Esta es la definición formal del autómata que dibujaste. Se acepta
              una cadena cuando se lee completa (ϕ), se termina en un estado
              final y todas las pilas quedan vacías.
            </p>
          )}
          {explain.map((p, i) => (
            <p key={i} className="text-sm leading-relaxed text-white/75">
              <b className="text-white">{p.title}.</b> {p.text}
            </p>
          ))}
          <p className="text-sm text-white/60">
            Autómata{" "}
            {automaton.deterministic ? "determinista" : "no determinista"} ·{" "}
            {automaton.counts.states} estados · {automaton.counts.transitions}{" "}
            transiciones.
          </p>
        </div>
      </div>
    </div>
  );
}
