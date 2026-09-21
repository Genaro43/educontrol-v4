import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function CoordinadorDashboard() {
    const [vistaActiva, setVistaActiva] = useState('panorama');
    const [cargando, setCargando] = useState(true);
    const navigate = useNavigate();

    // --- DATOS DEL PERFIL ---
    const [perfilCoor, setPerfilCoor] = useState(null);

    // --- ESTADOS: PANORAMA Y MÉTRICAS ---
    const [metricas, setMetricas] = useState({ totalAlumnos: 0, reportesSemana: 0, horasPendientes: 0, enRiesgo: 0 });
    const [alumnosPrioridad, setAlumnosPrioridad] = useState([]);
    const [datosGrafica, setDatosGrafica] = useState([]);

    // --- ESTADOS: REVISIÓN DE ALUMNOS ---
    const [busqueda, setBusqueda] = useState('');
    const [filtroGrupo, setFiltroGrupo] = useState('Todos');
    const [listaGrupos, setListaGrupos] = useState([]);
    const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
    const [alumnoSeleccionado, setAlumnoSeleccionado] = useState(null);
    const [buscando, setBuscando] = useState(false);

    // --- ESTADOS: HISTORIAL Y ABONOS ---
    const [pestañaHistorial, setPestañaHistorial] = useState('incidencias');
    const [historialAbonos, setHistorialAbonos] = useState([]);

    // --- ESTADOS: IA ---
    const [analisisIA, setAnalisisIA] = useState(null);
    const [generandoIA, setGenerandoIA] = useState(false);

    const handleCerrarSesion = async () => {
        await supabase.auth.signOut();
        navigate('/');
    };

    // 1. CARGAR DATOS REALES (SESIÓN, GRUPOS Y MÉTRICAS)
    useEffect(() => {
        const inicializarDashboard = async () => {
            setCargando(true);
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    navigate('/');
                    return;
                }

                const { data: perfil } = await supabase
                    .from('perfiles')
                    .select('nombre_completo, carrera_id, carreras(nombre)')
                    .eq('id', session.user.id)
                    .single();

                if (!perfil || !perfil.carrera_id) throw new Error("Perfil inválido o sin carrera asignada.");

                setPerfilCoor({
                    nombre: perfil.nombre_completo,
                    carreraId: perfil.carrera_id,
                    carreraNombre: perfil.carreras.nombre
                });

                // Cargar grupos de SU carrera
                const { data: gruposData } = await supabase
                    .from('grupos')
                    .select('id, semestre, letra')
                    .eq('carrera_id', perfil.carrera_id)
                    .order('semestre', { ascending: true });

                if (gruposData) {
                    const gruposUnicos = gruposData.reduce((acc, current) => {
                        const duplicado = acc.find(item => item.semestre === current.semestre && item.letra === current.letra);
                        if (!duplicado) return acc.concat([current]);
                        return acc;
                    }, []);
                    setListaGrupos(gruposUnicos);
                }

                const { data: alumnosData } = await supabase
                    .from('alumnos')
                    .select('matricula, nombre, apellidos, grupos!inner(id, semestre, letra)')
                    .eq('grupos.carrera_id', perfil.carrera_id)
                    .eq('estado', 'activo');

                const totalAlumnos = alumnosData ? alumnosData.length : 0;
                const matriculas = alumnosData ? alumnosData.map(a => a.matricula) : [];

                let reportesData = [];
                if (matriculas.length > 0) {
                    const { data } = await supabase
                        .from('reportes')
                        .select('*')
                        .in('alumno_matricula', matriculas);
                    reportesData = data || [];
                }

                const hoy = new Date();
                let reportesSemana = 0;
                let horasGlobales = 0;
                const mapaRiesgo = {};
                const mapaGrafica = {};

                reportesData.forEach(rep => {
                    const fechaRep = new Date(rep.fecha_creacion);
                    const diasDiferencia = (hoy - fechaRep) / (1000 * 60 * 60 * 24);
                    if (diasDiferencia <= 7) reportesSemana++;

                    const deuda = rep.horas_asignadas - rep.horas_cumplidas;
                    if (deuda > 0) horasGlobales += deuda;

                    if (rep.estado_reporte === 'pendiente') {
                        if (!mapaRiesgo[rep.alumno_matricula]) mapaRiesgo[rep.alumno_matricula] = { horas: 0, faltas: 0 };
                        if (rep.horas_asignadas > 0) {
                            mapaRiesgo[rep.alumno_matricula].horas += deuda;
                        } else {
                            mapaRiesgo[rep.alumno_matricula].faltas += 1;
                        }
                    }
                });

                const alumnosEnRiesgoTemp = [];
                Object.keys(mapaRiesgo).forEach(mat => {
                    const riesgo = mapaRiesgo[mat];
                    if (riesgo.horas >= 10 || riesgo.faltas >= 3) {
                        const infoAlumno = alumnosData.find(a => a.matricula === mat);
                        if (infoAlumno) {
                            alumnosEnRiesgoTemp.push({
                                matricula: mat,
                                nombre: `${infoAlumno.nombre} ${infoAlumno.apellidos}`,
                                grupo: `${infoAlumno.grupos.semestre}${infoAlumno.grupos.letra}`,
                                horasPendientes: riesgo.horas,
                                faltasActivas: riesgo.faltas
                            });
                        }
                    }
                });

                alumnosEnRiesgoTemp.sort((a, b) => b.horasPendientes - a.horasPendientes);
                setAlumnosPrioridad(alumnosEnRiesgoTemp.slice(0, 5));

                setMetricas({ totalAlumnos, reportesSemana, horasPendientes: horasGlobales, enRiesgo: alumnosEnRiesgoTemp.length });

                if (alumnosData) {
                    alumnosData.forEach(al => {
                        const nombreGrupo = `${al.grupos.semestre}${al.grupos.letra}`;
                        if (!mapaGrafica[nombreGrupo]) mapaGrafica[nombreGrupo] = 0;
                        const reportesDelAlumno = reportesData.filter(r => r.alumno_matricula === al.matricula).length;
                        mapaGrafica[nombreGrupo] += reportesDelAlumno;
                    });
                }

                const dataGraf = Object.keys(mapaGrafica).map(grupo => ({
                    grupo, reportes: mapaGrafica[grupo]
                })).sort((a, b) => a.grupo.localeCompare(b.grupo));

                setDatosGrafica(dataGraf);

            } catch (error) {
                console.error("Error inicializando dashboard:", error);
            } finally {
                setCargando(false);
            }
        };
        inicializarDashboard();
    }, [navigate]);

    // 2. BÚSQUEDA Y FILTRADO
    useEffect(() => {
        const buscarEnBD = async () => {
            if (!perfilCoor || (busqueda.length < 3 && filtroGrupo === 'Todos')) {
                setResultadosBusqueda([]);
                return;
            }
            setBuscando(true);

            let query = supabase
                .from('alumnos')
                .select(`matricula, nombre, apellidos, grupo_id, grupos!inner(semestre, letra, carrera_id)`)
                .neq('estado', 'egresado')
                .eq('grupos.carrera_id', perfilCoor.carreraId);

            if (busqueda.length >= 3) {
                const busquedaNormalizada = busqueda.replace(/[áéíóúÁÉÍÓÚ]/g, '_');
                query = query.or(`nombre.ilike.%${busquedaNormalizada}%,apellidos.ilike.%${busquedaNormalizada}%,matricula.ilike.%${busquedaNormalizada}%`);
            }

            if (filtroGrupo !== 'Todos') {
                query = query.eq('grupo_id', filtroGrupo);
            }

            const { data, error } = await query.limit(50);

            if (!error && data) {
                const alumnosFormateados = data.map(a => ({
                    matricula: a.matricula,
                    nombre: `${a.nombre} ${a.apellidos}`,
                    grupo: `${a.grupos?.semestre || ''}${a.grupos?.letra || ''}`
                }));
                setResultadosBusqueda(alumnosFormateados);
            }
            setBuscando(false);
        };

        const temporizador = setTimeout(() => buscarEnBD(), 300);
        return () => clearTimeout(temporizador);
    }, [busqueda, filtroGrupo, perfilCoor]);

    const manejarBusqueda = (e) => {
        setBusqueda(e.target.value);
        if (alumnoSeleccionado && e.target.value.length > 0) setAlumnoSeleccionado(null);
    };

    const manejarFiltro = (e) => {
        setFiltroGrupo(e.target.value);
        if (alumnoSeleccionado) setAlumnoSeleccionado(null);
    };

    const seleccionarAlumno = async (alumno) => {
        setBusqueda('');
        setFiltroGrupo('Todos');
        setResultadosBusqueda([]);

        const { data: reportes } = await supabase
            .from('reportes')
            .select('*')
            .eq('alumno_matricula', alumno.matricula)
            .order('fecha_creacion', { ascending: false });

        const reportesData = reportes || [];

        const { data: abonos } = await supabase
            .from('historial_horas')
            .select('*, reportes(descripcion)')
            .in('reporte_id', reportesData.length > 0 ? reportesData.map(r => r.id) : [''])
            .order('fecha_registro', { ascending: false });

        setHistorialAbonos(abonos || []);

        const horasGraves = reportesData
            .filter(rep => rep.horas_asignadas > 0)
            .reduce((sum, rep) => sum + (rep.horas_asignadas - rep.horas_cumplidas), 0);

        const faltasMenoresActivas = reportesData.filter(rep => rep.horas_asignadas === 0 && rep.estado_reporte === 'pendiente').length;
        const horasPendientes = horasGraves + Math.floor(faltasMenoresActivas / 3);

        setAlumnoSeleccionado({
            ...alumno,
            horasPendientes,
            historial: reportesData
        });
        setPestañaHistorial('incidencias');
    };

    const solicitarAnalisisIA = () => {
        setGenerandoIA(true);
        setTimeout(() => {
            setAnalisisIA(`El análisis indica una concentración de incidencias en grupos de primer y tercer semestre. Se recomienda revisar los horarios de laboratorio para evitar retardos recurrentes.`);
            setGenerandoIA(false);
        }, 2000);
    };

    if (cargando || !perfilCoor) {
        return (
            <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
                <svg className="animate-spin h-12 w-12 text-[#008542] mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <p className="text-gray-500 font-bold text-lg">Cargando métricas de coordinación...</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col md:flex-row min-h-screen bg-gray-50 font-sans relative">

            {/* --- HEADER MÓVIL --- */}
            <header className="md:hidden bg-[#008542] text-white p-4 flex justify-between items-center shadow-md sticky top-0 z-30">
                <h1 className="text-2xl font-black tracking-tight">EduControl <span className="text-[#F26522]">v.2</span></h1>
                <div className="flex items-center gap-2">
                    <button onClick={handleCerrarSesion} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors flex items-center gap-2 text-sm font-bold">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </button>
                </div>
            </header>

            {/* --- SIDEBAR ESCRITORIO --- */}
            <aside className="hidden md:flex flex-col w-72 bg-[#008542] text-white shadow-2xl z-20 shrink-0 sticky top-0 h-screen justify-between">
                <div>
                    <div className="p-8">
                        <h1 className="text-3xl font-black tracking-tight">EduControl <span className="text-[#F26522]">v.2</span></h1>
                        <p className="text-green-200 text-sm font-medium mt-1">Coordinación de Carrera</p>
                    </div>

                    <nav className="flex-1 px-4 space-y-3 mt-4">
                        <button onClick={() => setVistaActiva('panorama')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${vistaActiva === 'panorama' ? 'bg-white text-[#008542] shadow-lg' : 'text-green-100 hover:bg-white/10'}`}>
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                            Panorama General
                        </button>
                        <button onClick={() => setVistaActiva('alumnos')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${vistaActiva === 'alumnos' ? 'bg-white text-[#008542] shadow-lg' : 'text-green-100 hover:bg-white/10'}`}>
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                            Revisión de Alumnos
                        </button>
                    </nav>
                </div>

                <div className="p-4 mb-4">
                    <div className="bg-green-800/50 rounded-2xl p-4 flex items-center gap-3 border border-green-700 mb-4 mx-2">
                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center font-black text-lg text-[#008542] uppercase shrink-0">{perfilCoor.nombre.substring(0, 2)}</div>
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate">{perfilCoor.nombre}</p>
                            <p className="text-xs text-green-300 truncate">{perfilCoor.carreraNombre}</p>
                        </div>
                    </div>
                    <button onClick={handleCerrarSesion} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white/80 hover:text-white font-bold rounded-xl transition-colors hover:bg-white/10">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        Cerrar Sesión
                    </button>
                </div>
            </aside>

            {/* --- ÁREA PRINCIPAL --- */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-10 pb-24 md:pb-10 relative h-screen">
                <div className="absolute top-0 left-0 w-full h-72 bg-gradient-to-b from-gray-200/80 to-transparent -z-10"></div>
                <div className="max-w-7xl mx-auto space-y-8">

                    {/* --- VISTA 1: PANORAMA --- */}
                    {vistaActiva === 'panorama' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4">
                            <h2 className="text-2xl md:text-3xl font-black text-gray-800 mb-6">Estadísticas de {perfilCoor.carreraNombre}</h2>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 border-b-4 border-b-blue-500">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Tus Alumnos (Activos)</p>
                                    <p className="text-4xl md:text-5xl font-black text-gray-800">{metricas.totalAlumnos}</p>
                                </div>
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 border-b-4 border-b-[#F26522]">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Reportes (Últimos 7 días)</p>
                                    <p className="text-4xl md:text-5xl font-black text-[#F26522]">{metricas.reportesSemana}</p>
                                </div>
                                <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 border-b-4 border-b-[#008542]">
                                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Horas Pendientes</p>
                                    <p className="text-4xl md:text-5xl font-black text-[#008542]">{metricas.horasPendientes}</p>
                                </div>
                                <div className="bg-gradient-to-br from-red-500 to-red-700 p-6 rounded-3xl shadow-md border-b-4 border-b-red-900 text-white">
                                    <p className="text-xs font-bold text-red-200 uppercase tracking-wider mb-2">Alumnos en Riesgo</p>
                                    <p className="text-4xl md:text-5xl font-black">{metricas.enRiesgo}</p>
                                    <p className="text-[10px] mt-1 text-red-100">&gt;10 hrs o &ge;3 faltas activas</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                                <div className="lg:col-span-2 bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
                                    <h3 className="font-bold text-gray-700 mb-6">Incidencias Generadas por Grupo</h3>
                                    <div className="h-64">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={datosGrafica}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                                <XAxis dataKey="grupo" tick={{ fill: '#6B7280', fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                                                <YAxis tick={{ fill: '#6B7280' }} axisLine={false} tickLine={false} />
                                                <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                                <Bar dataKey="reportes" fill="#F26522" radius={[6, 6, 0, 0]} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="bg-gradient-to-br from-[#008542] to-[#005a2d] p-6 rounded-[2rem] shadow-sm text-white flex flex-col relative overflow-hidden">
                                    <div className="absolute top-[-10%] right-[-10%] w-32 h-32 bg-white opacity-10 rounded-full blur-2xl"></div>
                                    <h3 className="text-xl font-black mb-2 flex items-center gap-2">
                                        <svg className="w-6 h-6 text-[#F26522]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                        Análisis Inteligente
                                    </h3>
                                    <p className="text-sm text-green-100 mb-6">Genera un diagnóstico estratégico basado en los reportes recientes de tu carrera.</p>

                                    {analisisIA ? (
                                        <div className="bg-white/10 p-4 rounded-xl border border-white/20 text-sm font-medium leading-relaxed backdrop-blur-sm">
                                            {analisisIA}
                                        </div>
                                    ) : (
                                        <button onClick={solicitarAnalisisIA} disabled={generandoIA} className="mt-auto w-full py-4 bg-white text-[#008542] hover:bg-gray-50 font-black rounded-xl transition-all shadow-lg flex justify-center items-center gap-2">
                                            {generandoIA ? (
                                                <svg className="animate-spin h-5 w-5 text-[#008542]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                            ) : 'Generar Diagnóstico'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="bg-white rounded-[2rem] shadow-sm border border-gray-100 overflow-hidden">
                                <div className="p-6 border-b border-gray-100 bg-red-50/50 flex justify-between items-center">
                                    <h3 className="text-lg font-black text-red-700">Atención Prioritaria (Alumnos en Riesgo)</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-white border-b border-gray-100">
                                                <th className="p-5 font-black text-gray-500 uppercase text-xs">Alumno</th>
                                                <th className="p-5 font-black text-gray-500 uppercase text-xs">Grupo</th>
                                                <th className="p-5 font-black text-gray-500 uppercase text-xs">Adeudo Actual</th>
                                                <th className="p-5 font-black text-gray-500 uppercase text-xs">Faltas Menores</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {alumnosPrioridad.length > 0 ? alumnosPrioridad.map((alumno, index) => (
                                                <tr key={index} className="hover:bg-red-50/30 transition-colors">
                                                    <td className="p-5">
                                                        <p className="font-bold text-gray-800">{alumno.nombre}</p>
                                                        <p className="text-xs text-gray-500">Mat: {alumno.matricula}</p>
                                                    </td>
                                                    <td className="p-5 font-bold text-gray-600">{alumno.grupo}</td>
                                                    <td className="p-5 font-black text-red-600 text-lg">{alumno.horasPendientes} hrs</td>
                                                    <td className="p-5 font-bold text-orange-600">{alumno.faltasActivas} activas</td>
                                                </tr>
                                            )) : (
                                                <tr><td colSpan="4" className="text-center py-8 text-gray-500 font-bold">Sin alumnos en riesgo actualmente.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- VISTA 2: REVISIÓN DE ALUMNOS (Estilo Prefectura Avanzado) --- */}
                    {vistaActiva === 'alumnos' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4">

                            <div className="flex flex-col sm:flex-row gap-4 max-w-4xl mx-auto w-full relative z-20 mb-8">

                                {/* BUSCADOR (Y SU VENTANA FLOTANTE) */}
                                <div className="relative flex-1">
                                    <div className="absolute inset-y-0 left-0 pl-4 md:pl-6 flex items-center pointer-events-none">
                                        <svg className="h-5 w-5 md:h-6 md:w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder={`Buscar alumno de ${perfilCoor.carreraNombre}...`}
                                        className="block w-full pl-12 pr-4 py-3 md:pl-16 md:pr-6 md:py-4 bg-white rounded-full text-base md:text-lg shadow-sm border border-gray-100 outline-none text-gray-700 font-medium focus:ring-2 focus:ring-[#008542]/20 transition-all"
                                        value={busqueda}
                                        onChange={manejarBusqueda}
                                    />

                                    {/* LISTA FLOTANTE SOLO PARA LA BÚSQUEDA POR TEXTO */}
                                    {busqueda.length >= 3 && !alumnoSeleccionado && (
                                        <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden z-50 max-h-80 overflow-y-auto">
                                            {buscando ? (
                                                <div className="p-6 text-center text-gray-500 font-bold">Buscando...</div>
                                            ) : resultadosBusqueda.length > 0 ? (
                                                resultadosBusqueda.map((alumno) => (
                                                    <button key={alumno.matricula} onClick={() => seleccionarAlumno(alumno)} className="w-full text-left p-4 hover:bg-green-50 border-b border-gray-50 flex items-center gap-4 transition-colors group">
                                                        <div className="w-10 h-10 md:w-12 md:h-12 bg-[#008542] rounded-xl flex items-center justify-center text-white font-bold shrink-0">{alumno.nombre.charAt(0)}</div>
                                                        <div>
                                                            <p className="font-bold text-gray-800 text-base md:text-lg group-hover:text-[#008542] transition-colors">{alumno.nombre}</p>
                                                            <p className="text-xs md:text-sm text-gray-500 font-medium mt-0.5">Mat: {alumno.matricula} • Grupo {alumno.grupo}</p>
                                                        </div>
                                                        <div className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <svg className="w-5 h-5 text-[#008542]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                                                        </div>
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="p-6 text-center text-gray-500 font-bold">No se encontraron alumnos</div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* COMBOBOX PARA FILTRAR POR GRUPO */}
                                <div className="relative w-full sm:w-56 shrink-0">
                                    <select
                                        value={filtroGrupo}
                                        onChange={manejarFiltro}
                                        className="w-full h-full min-h-[56px] pl-4 pr-10 py-3 md:py-4 bg-white rounded-full text-base md:text-lg shadow-sm border border-gray-100 outline-none text-gray-700 font-bold focus:ring-2 focus:ring-[#008542]/20 transition-all cursor-pointer appearance-none"
                                    >
                                        <option value="Todos">Todos los grupos</option>
                                        {listaGrupos.map(g => (
                                            <option key={g.id} value={g.id}>
                                                Grupo {g.semestre}° {g.letra}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-400">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                </div>
                            </div>

                            {/* ESTADO VACÍO */}
                            {!alumnoSeleccionado && filtroGrupo === 'Todos' && busqueda.length < 3 && (
                                <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400 animate-in fade-in zoom-in duration-500 px-4">
                                    <svg className="w-16 h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    <p className="font-bold text-lg text-gray-600">Revisión de Alumnos</p>
                                    <p className="text-sm">Busca un alumno o utiliza el filtro de grupos para ver su expediente.</p>
                                </div>
                            )}

                            {/* RESULTADOS EN LA ZONA LIMPIA (AL FILTRAR POR GRUPO) */}
                            {!alumnoSeleccionado && filtroGrupo !== 'Todos' && busqueda.length < 3 && (
                                <div className="max-w-4xl mx-auto space-y-4 animate-in fade-in duration-300">
                                    <h3 className="font-bold text-gray-700 text-lg mb-2 px-2">Directorio del Grupo Seleccionado:</h3>
                                    {buscando ? (
                                        <div className="text-center py-10 text-gray-500 font-bold bg-white rounded-3xl border border-gray-100">Cargando alumnos...</div>
                                    ) : resultadosBusqueda.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {resultadosBusqueda.map((alumno) => (
                                                <button key={alumno.matricula} onClick={() => seleccionarAlumno(alumno)} className="bg-white p-5 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4 hover:bg-green-50 transition-colors text-left group">
                                                    <div className="w-12 h-12 bg-[#008542] rounded-xl flex items-center justify-center text-white font-bold shrink-0">{alumno.nombre.charAt(0)}</div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-bold text-gray-800 text-base truncate group-hover:text-[#008542] transition-colors">{alumno.nombre}</p>
                                                        <p className="text-xs text-gray-500 mt-0.5">Mat: {alumno.matricula}</p>
                                                    </div>
                                                    <div className="bg-green-100 text-[#008542] px-3 py-1.5 rounded-lg text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                                                        Ver
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-10 text-gray-500 font-bold bg-white rounded-3xl border border-gray-100">
                                            No hay alumnos registrados en este grupo.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* VISTA DEL EXPEDIENTE DEL ALUMNO */}
                            {alumnoSeleccionado && (
                                <div className="max-w-4xl mx-auto space-y-6">
                                    <button onClick={() => setAlumnoSeleccionado(null)} className="text-[#008542] font-bold text-sm flex items-center gap-2 hover:underline mb-2">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg> Volver al directorio
                                    </button>

                                    <div className="bg-white rounded-[2rem] p-8 shadow-sm border-t-8 border-[#008542] text-center md:text-left flex flex-col md:flex-row justify-between items-center gap-6">
                                        <div>
                                            <h2 className="text-2xl md:text-3xl font-black text-gray-800">{alumnoSeleccionado.nombre}</h2>
                                            <p className="text-gray-500 mt-2 font-medium">Mat: {alumnoSeleccionado.matricula} • Grupo {alumnoSeleccionado.grupo}</p>
                                        </div>
                                        <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100 text-center min-w-[200px]">
                                            <p className="text-xs font-black text-[#F26522] uppercase tracking-wider mb-2">Adeudo Pendiente</p>
                                            <p className="text-5xl font-black text-[#F26522]">{alumnoSeleccionado.horasPendientes}</p>
                                            <p className="text-xs text-orange-800 font-bold mt-2">Horas de servicio social</p>
                                        </div>
                                    </div>

                                    <div className="bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-gray-100">
                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b border-gray-100 pb-4 gap-4">
                                            <h3 className="text-xl md:text-2xl font-black text-gray-900">
                                                {pestañaHistorial === 'incidencias' ? 'Historial de Reportes' : 'Historial de Abonos'}
                                            </h3>
                                            <div className="flex bg-gray-100 p-1 rounded-lg w-full sm:w-auto">
                                                <button onClick={() => setPestañaHistorial('incidencias')} className={`flex-1 sm:flex-none px-4 py-1.5 text-xs md:text-sm font-bold rounded-md transition-colors ${pestañaHistorial === 'incidencias' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}>Reportes</button>
                                                <button onClick={() => setPestañaHistorial('abonos')} className={`flex-1 sm:flex-none px-4 py-1.5 text-xs md:text-sm font-bold rounded-md transition-colors ${pestañaHistorial === 'abonos' ? 'bg-white text-[#008542] shadow-sm' : 'text-gray-500'}`}>Abonos</button>
                                            </div>
                                        </div>

                                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                                            {pestañaHistorial === 'incidencias' && (
                                                alumnoSeleccionado.historial.length > 0 ? (
                                                    alumnoSeleccionado.historial.map(rep => (
                                                        <div key={rep.id} className="bg-white p-4 md:p-5 rounded-2xl border border-gray-200 flex justify-between items-center gap-3">
                                                            <div>
                                                                <span className={`inline-block text-[10px] font-black uppercase px-2 py-1 rounded mb-2 tracking-wider ${rep.horas_asignadas > 0 ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-700'}`}>
                                                                    {rep.horas_asignadas > 0 ? 'FALTA GRAVE' : 'FALTA MENOR'}
                                                                </span>
                                                                <p className="font-bold text-gray-800 text-sm md:text-lg uppercase">{rep.descripcion}</p>
                                                                <p className="text-xs md:text-sm text-gray-400 font-medium">{new Date(rep.fecha_creacion).toLocaleDateString()}</p>
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <p className="text-lg md:text-xl font-black text-gray-700">{rep.horas_asignadas} <span className="text-[10px] md:text-xs font-bold text-gray-400 block -mt-1">hr asignadas</span></p>
                                                                {rep.horas_asignadas > 0 && <p className="text-[10px] md:text-xs font-bold text-[#008542] mt-1">{rep.horas_cumplidas} pagadas</p>}
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : <p className="text-center text-gray-400 py-10 font-bold">Sin reportes registrados.</p>
                                            )}

                                            {pestañaHistorial === 'abonos' && (
                                                historialAbonos.length > 0 ? (
                                                    historialAbonos.map((abono) => (
                                                        <div key={abono.id} className="bg-green-50/50 p-4 md:p-5 rounded-2xl border border-green-100 flex justify-between items-center gap-3">
                                                            <div>
                                                                <span className="inline-block text-[10px] font-black uppercase px-2 py-1 rounded mb-2 tracking-wider bg-green-100 text-green-800">ABONO REALIZADO</span>
                                                                <p className="font-bold text-gray-800 text-sm md:text-base uppercase">{abono.actividad || 'Actividad no especificada'}</p>
                                                                <p className="text-xs md:text-sm text-gray-500 font-medium mt-0.5">Abono a: {abono.reportes?.descripcion}</p>
                                                                <p className="text-xs text-gray-400 font-medium mt-1">{new Date(abono.fecha_registro).toLocaleDateString()}</p>
                                                            </div>
                                                            <div className="text-right shrink-0">
                                                                <p className="text-xl md:text-2xl font-black text-[#008542]">+{abono.horas_abonadas} <span className="text-[10px] md:text-xs font-bold text-gray-500 block -mt-1">hr pagadas</span></p>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : <p className="text-center text-gray-400 py-10 font-bold">Aún no hay abonos registrados.</p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* --- NAVEGACIÓN INFERIOR (MÓVIL) --- */}
            <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 flex justify-between items-center z-40 pb-safe px-2">
                <button onClick={() => setVistaActiva('panorama')} className={`flex-1 flex flex-col items-center justify-center py-3.5 px-1 ${vistaActiva === 'panorama' ? 'text-[#008542]' : 'text-gray-400'}`}>
                    <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={vistaActiva === 'panorama' ? "2.5" : "2"} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    <span className="text-[11px] font-bold">Panorama</span>
                </button>
                <button onClick={() => { setVistaActiva('alumnos'); setAlumnoSeleccionado(null); }} className={`flex-1 flex flex-col items-center justify-center py-3.5 px-1 ${vistaActiva === 'alumnos' ? 'text-[#008542]' : 'text-gray-400'}`}>
                    <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={vistaActiva === 'alumnos' ? "2.5" : "2"} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                    <span className="text-[11px] font-bold">Revisión</span>
                </button>
            </nav>

        </div>
    );
}