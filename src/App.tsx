import { HashRouter, Routes, Route, NavLink, Link } from 'react-router-dom';
import { Library } from './routes/Library';
import { Create } from './routes/Create';
import { Pattern } from './routes/Pattern';
import { Shopping } from './routes/Shopping';
import { Print } from './routes/Print';
import { InstallPrompt } from './components/InstallPrompt';

function Header() {
  return (
    <header className="app-header">
      <div className="app-header-inner">
        <Link to="/" className="brand" aria-label="Cozy Cross Stitch home">
          Cozy Cross Stitch
        </Link>
        <div className="nav-spacer" />
        <nav className="nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
          >
            Library
          </NavLink>
          <NavLink
            to="/create"
            className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
          >
            Create
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      <main className="container">{children}</main>
    </>
  );
}

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Shell><Library /></Shell>} />
        <Route path="/create" element={<Shell><Create /></Shell>} />
        <Route path="/pattern/:id" element={<Pattern />} />
        <Route path="/pattern/:id/shopping" element={<Shell><Shopping /></Shell>} />
        <Route path="/pattern/:id/print" element={<Shell><Print /></Shell>} />
      </Routes>
      <InstallPrompt />
    </HashRouter>
  );
}
