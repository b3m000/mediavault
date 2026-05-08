import { Header } from "../components/Header";

export function Settings() {
  return (
    <>
      <Header title="Configurações" subtitle="Preferências e estado do projeto" searchPlaceholder="Buscar opção" />

      <div className="page-body">
        <section className="panel p-5">
          <h2 className="brand-font text-xl font-semibold text-[var(--text)]">Preferências</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Centralize aqui as configurações de biblioteca local, integração de nuvem e comportamento de reprodução/download.
          </p>
        </section>
      </div>
    </>
  );
}
