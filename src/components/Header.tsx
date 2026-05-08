import { Bell, Search, Sparkles } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  searchValue?: string;
  searchPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  onRefresh?: () => void;
  onNotificationsClick?: () => void;
  variant?: "default" | "dark";
}

export function Header({
  title,
  subtitle,
  searchValue = "",
  searchPlaceholder = "Buscar por título...",
  onSearchChange,
  onRefresh,
  onNotificationsClick,
  variant = "default",
}: HeaderProps) {
  const isDark = variant === "dark";

  return (
    <header className={`${isDark ? "glass-header-dark" : "glass-header"} px-6 py-4 md:px-8`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${isDark ? "text-slate-300" : "text-[var(--muted)]"}`}>
            MediaVault
          </p>
          <h1 className={`brand-font mt-1 text-2xl font-semibold ${isDark ? "text-slate-100" : "text-[var(--text)]"}`}>{title}</h1>
          {subtitle ? <p className={`mt-1 text-sm ${isDark ? "text-slate-300/90" : "text-[var(--muted)]"}`}>{subtitle}</p> : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {onSearchChange ? (
            <label className="relative block w-full sm:w-72" htmlFor="page-search">
              <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${isDark ? "text-slate-400" : "text-slate-400"}`} />
              <input
                id="page-search"
                type="search"
                value={searchValue}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                className={`input-field ${isDark ? "input-field-dark" : ""}`}
              />
            </label>
          ) : null}

          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className={`btn-primary inline-flex h-11 items-center justify-center gap-2 px-4 text-sm ${isDark ? "btn-primary-dark" : ""}`}
            >
              <Sparkles className="h-4 w-4" />
              Atualizar
            </button>
          ) : null}

          {onNotificationsClick ? (
            <button
              type="button"
              onClick={onNotificationsClick}
              className={`btn-secondary inline-flex h-11 w-11 items-center justify-center ${isDark ? "btn-secondary-dark text-slate-200" : "text-[var(--text)]"}`}
              aria-label="Notificações"
            >
              <Bell className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
