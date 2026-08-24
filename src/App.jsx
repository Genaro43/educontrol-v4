import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Pantallas
import Login from './pages/auth/Login';
import AdminDashboard from './pages/admin/AdminDashboard';
import CoordinadorDashboard from './pages/coordinador/CoordinadorDashboard';
import PrefectoDashboard from './pages/prefecto/PrefectoDashboard';
import AlumnoDashboard from './pages/alumno/AlumnoDashboard';

// Guardián
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Ruta pública */}
        <Route path="/login" element={<Login />} />

        {/* --- RUTAS PROTEGIDAS POR ROL --- */}

        {/* Solo administradores pueden entrar aquí */}
        <Route element={<ProtectedRoute rolPermitido="admin" />}>
          <Route path="/admin" element={<AdminDashboard />} />
        </Route>

        {/* Solo coordinadores pueden entrar aquí */}
        <Route element={<ProtectedRoute rolPermitido="coordinador" />}>
          <Route path="/coordinador" element={<CoordinadorDashboard />} />
        </Route>

        {/* Solo prefectos pueden entrar aquí */}
        <Route element={<ProtectedRoute rolPermitido="prefecto" />}>
          <Route path="/prefecto" element={<PrefectoDashboard />} />
        </Route>

        {/* Solo alumnos pueden entrar aquí */}
        <Route element={<ProtectedRoute rolPermitido="alumno" />}>
          <Route path="/alumno" element={<AlumnoDashboard />} />
        </Route>

        {/* Redirección por defecto */}
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;