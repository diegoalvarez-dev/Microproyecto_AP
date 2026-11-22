import { useState } from "react";

// Las fotos están en public/autores/ (jpg, png, jpeg o webp). Si falta una, se muestran las iniciales.
const TEAM = [
  { name: "Diego Álvarez", photo: "diego-alvarez" },
  { name: "Diego Márquez", photo: "diego-marquez" },
  { name: "Juan Quintero", photo: "juan-quintero" },
];
const EXTENSIONS = ["jpg", "png", "jpeg", "webp"];

function Avatar({ name, photo }) {
  const [attempt, setAttempt] = useState(0);
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("");
  return (
    <span className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 text-sm font-bold text-[#060919] ring-2 ring-white/15">
      {attempt < EXTENSIONS.length ? (
        <img
          src={`/autores/${photo}.${EXTENSIONS[attempt]}`}
          alt={name}
          onError={() => setAttempt((a) => a + 1)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  );
}

export default function Header() {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <img
          src="/favicon.svg"
          width="46"
          height="46"
          alt=""
          aria-hidden="true"
        />
        <div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
            Autómatas de <span className="grad-text">Pila</span>
          </h1>
          <p className="text-sm text-white/55">
            Microproyecto AP · Teoría de la computación
          </p>
        </div>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Equipo de trabajo">
        {TEAM.map(({ name, photo }) => (
          <li
            key={name}
            className="glass flex items-center gap-2.5 !rounded-full py-1.5 pl-1.5 pr-4 text-sm"
          >
            <Avatar name={name} photo={photo} />
            <span className="grad-text font-semibold">{name}</span>
          </li>
        ))}
      </ul>
    </header>
  );
}
