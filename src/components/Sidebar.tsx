import {
  Clapperboard,
  CloudDownload,
  FolderArchive,
  HardDrive,
  Home,
  Settings,
  SignalHigh,
  Video,
} from "lucide-react";
import { NavLink } from "react-router-dom";

const menuItems = [
  { to: "/", label: "Início", icon: Home },
  { to: "/courses", label: "Cursos", icon: Video },
  { to: "/movies", label: "Filmes", icon: Clapperboard },
  { to: "/files", label: "Arquivos", icon: FolderArchive },
  { to: "/downloads", label: "Downloads", icon: CloudDownload },
  { to: "/offline", label: "Offline", icon: SignalHigh },
  { to: "/storage", label: "Armazenamento", icon: HardDrive },
  { to: "/settings", label: "Configurações", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="sidebar-surface">
      <div className="p-5">
        <div className="brand-hero p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-white/80">Biblioteca Offline</p>
          <h2 className="brand-font mt-1 text-2xl font-bold">MediaVault</h2>
          <p className="mt-1 text-xs text-white/85">Organize. Assista. Leve com você.</p>
        </div>

        <nav className="mt-6 space-y-1" aria-label="Menu lateral">
          {menuItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  [isActive ? "nav-link nav-link-active" : "nav-link"].join(" ")
                }
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
