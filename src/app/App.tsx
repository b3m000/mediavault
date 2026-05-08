import { Navigate, Route, Routes } from "react-router-dom";
import { Sidebar } from "../components/Sidebar";
import { ContentDetails } from "../pages/ContentDetails";
import { Courses } from "../pages/Courses";
import { Downloads } from "../pages/Downloads";
import { Files } from "../pages/Files";
import { Home } from "../pages/Home";
import { Movies } from "../pages/Movies";
import { Offline } from "../pages/Offline";
import { Player } from "../pages/Player";
import { Settings } from "../pages/Settings";
import { Storage } from "../pages/Storage";

export function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-column">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/courses" element={<Courses />} />
          <Route path="/movies" element={<Movies />} />
          <Route path="/files" element={<Files />} />
          <Route path="/downloads" element={<Downloads />} />
          <Route path="/offline" element={<Offline />} />
          <Route path="/storage" element={<Storage />} />
          <Route path="/content/:id" element={<ContentDetails />} />
          <Route path="/player/local/:id" element={<Player />} />
          <Route path="/player/:contentId/:id" element={<Player />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
