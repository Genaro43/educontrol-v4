import { Navigate, Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

export default function ProtectedRoute({ rolPermitido }) {
    const [autorizado, setAutorizado] = useState(null);

    useEffect(() => {
        const verificarPermisos = async () => {
            // 1. Si la ruta es para alumnos, validamos el acceso mediante localStorage
            if (rolPermitido === 'alumno') {
                const matriculaAlumno = localStorage.getItem('matriculaAlumno');
                if (matriculaAlumno) {
                    setAutorizado(true);
                    return;
                } else {
                    setAutorizado(false);
                    return;
                }
            }

            // 2. Para el resto del personal (admin, coordinador, prefecto), validamos con Supabase Auth y perfiles
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                setAutorizado(false);
                return;
            }

            const { data: perfil, error } = await supabase
                .from('perfiles')
                .select('rol')
                .eq('id', session.user.id)
                .single();

            if (error || !perfil || perfil.rol !== rolPermitido) {
                setAutorizado(false);
            } else {
                setAutorizado(true);
            }
        };

        verificarPermisos();
    }, [rolPermitido]);

    if (autorizado === null) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 font-bold text-[#008542]">
                Verificando acceso...
            </div>
        );
    }

    return autorizado ? <Outlet /> : <Navigate to="/login" replace />;
}