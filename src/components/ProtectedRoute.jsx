import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

export default function ProtectedRoute({ rolPermitido }) {
    const [estado, setEstado] = useState({
        cargando: true,
        autorizado: false,
    });

    useEffect(() => {
        const verificarSesion = async () => {
            // 1. Preguntamos a Supabase si hay una sesión activa en el navegador
            const { data: { session } } = await supabase.auth.getSession();

            if (!session) {
                // Si no hay sesión, no lo dejamos pasar
                setEstado({ cargando: false, autorizado: false });
                return;
            }

            // 2. Si queremos proteger por rol, leemos la tabla perfiles
            if (rolPermitido) {
                const { data: perfil } = await supabase
                    .from('perfiles')
                    .select('rol')
                    .eq('id', session.user.id)
                    .single();

                // Si el rol coincide con la ruta (ej. 'admin' intentando entrar a '/admin')
                if (perfil?.rol === rolPermitido) {
                    setEstado({ cargando: false, autorizado: true });
                } else {
                    setEstado({ cargando: false, autorizado: false });
                }
            } else {
                setEstado({ cargando: false, autorizado: true });
            }
        };

        verificarSesion();
    }, [rolPermitido]);

    // Mientras verifica en la base de datos, mostramos un pequeño loader
    if (estado.cargando) {
        return (
            <div className="flex items-center justify-center h-screen bg-gray-50">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#008542]"></div>
            </div>
        );
    }

    // Si está autorizado renderiza la pantalla correspondiente (<Outlet />)
    // Si no, lo manda a la fuerza al /login
    return estado.autorizado ? <Outlet /> : <Navigate to="/login" replace />;
}