import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function Login() {
    // Cambiamos el estado de 'email' a 'usuario'
    const [usuario, setUsuario] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // TRUCO DE USABILIDAD: Transformamos el usuario en el correo fantasma que pide Supabase
        const correoFantasma = `${usuario.trim().toLowerCase()}@cecyteh.local`;

        try {
            // 1. Iniciar sesión con Supabase Auth usando el correo transformado
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: correoFantasma,
                password,
            });

            if (authError) throw new Error('Usuario o contraseña incorrectos.');

            // 2. Buscar el rol del usuario en la tabla 'perfiles'
            const { data: perfil, error: perfilError } = await supabase
                .from('perfiles')
                .select('rol')
                .eq('id', authData.user.id)
                .single();

            if (perfilError) throw new Error('No se encontró el perfil del usuario.');

            // 3. Redirigir al panel correspondiente según su rol
            switch (perfil.rol) {
                case 'admin':
                    navigate('/admin');
                    break;
                case 'coordinador':
                    navigate('/coordinador');
                    break;
                case 'prefecto':
                    navigate('/prefecto');
                    break;
                case 'alumno':
                    navigate('/alumno');
                    break;
                default:
                    throw new Error('Rol no válido.');
            }

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen bg-gray-50 font-sans">
            {/* Sección Izquierda - Branding Institucional */}
            <div className="hidden lg:flex flex-col justify-center items-center w-1/2 bg-gradient-to-br from-[#008542] to-[#005a2d] text-white p-12 relative overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-72 h-72 bg-white opacity-10 rounded-full blur-3xl pointer-events-none"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-80 h-80 bg-[#F26522] opacity-20 rounded-full blur-3xl pointer-events-none"></div>

                <div className="z-10 text-center">
                    <h1 className="text-5xl font-extrabold mb-6 tracking-tight">
                        EduControl <span className="text-[#F26522]">v.2</span>
                    </h1>
                    <p className="text-lg font-light text-green-100 max-w-md mx-auto leading-relaxed">
                        Sistema Integral de Control Escolar y Gestión de Incidencias.
                    </p>
                </div>

                <div className="absolute bottom-8 text-sm text-green-200/70 z-10 font-medium">
                    © {new Date().getFullYear()} CECyTEH - Gestión Innovadora
                </div>
            </div>

            {/* Sección Derecha - Contenedor del Formulario */}
            <div className="flex flex-col justify-center items-center w-full lg:w-1/2 p-6 sm:p-12">
                <div className="w-full max-w-md bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.08)] p-8 sm:p-10 transition-all border border-gray-100">

                    <div className="text-center mb-10">
                        <h2 className="text-3xl font-extrabold text-gray-800 mb-2">Iniciar Sesión</h2>
                        <p className="text-gray-500 text-sm">Bienvenido de nuevo. Ingresa tus credenciales para acceder al sistema.</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-6">

                        {/* Mensaje de Error Dinámico */}
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-600 text-sm font-bold px-4 py-3 rounded-xl animate-in fade-in zoom-in duration-300">
                                {error}
                            </div>
                        )}

                        {/* Input Usuario (Antes Correo) */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Usuario</label>
                            <input
                                type="text"
                                value={usuario}
                                onChange={(e) => setUsuario(e.target.value)}
                                required
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-[#008542] focus:border-transparent outline-none transition-all duration-200 lowercase"
                                placeholder="ej. juan.perez"
                            />
                        </div>

                        {/* Input Contraseña */}
                        <div>
                            <label className="block text-sm font-bold text-gray-700 mb-2">Contraseña</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                className="block w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 placeholder-gray-400 focus:bg-white focus:ring-2 focus:ring-[#008542] focus:border-transparent outline-none transition-all duration-200"
                                placeholder="••••••••"
                            />
                        </div>

                        <div className="flex items-center mt-4">
                            <label className="flex items-center text-sm text-gray-600 cursor-pointer hover:text-gray-800 transition-colors">
                                <input type="checkbox" className="mr-2 w-4 h-4 text-[#008542] bg-gray-100 border-gray-300 rounded focus:ring-[#008542]" />
                                Recordarme
                            </label>
                        </div>

                        {/* Botón Principal */}
                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full py-3.5 px-4 mt-6 text-white font-bold text-lg rounded-xl shadow-lg transition-all duration-200 flex justify-center items-center gap-2 
                ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#F26522] hover:bg-[#d9551c] shadow-orange-500/30 transform active:scale-[0.98]'}`}
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Validando...
                                </>
                            ) : 'Entrar al Sistema'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}