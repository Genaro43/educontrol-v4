import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

const obtenerColorAvatar = (nombre) => {
    if (!nombre) return 'bg-[#008542]';
    const colores = ['bg-blue-500', 'bg-purple-500', 'bg-pink-500', 'bg-[#008542]', 'bg-teal-500', 'bg-indigo-500'];
    let hash = 0;
    for (let i = 0; i < nombre.length; i++) {
        hash = nombre.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colores[Math.abs(hash) % colores.length];
};

export default function PrefectoDashboard() {
    const [vistaActiva, setVistaActiva] = useState('busqueda');

    const [busqueda, setBusqueda] = useState('');
    const [inputFocus, setInputFocus] = useState(false);
    const [busquedasRecientes, setBusquedasRecientes] = useState([]);
    const [filtroRapido, setFiltroRapido] = useState('Todos');

    const [alumnoSeleccionado, setAlumnoSeleccionado] = useState(null);
    const [resultadosBusqueda, setResultadosBusqueda] = useState([]);
    const [buscando, setBuscando] = useState(false);

    const [gruposDB, setGruposDB] = useState([]);
    const [filtroGrupo, setFiltroGrupo] = useState('Todos');

    const [fechaReporte, setFechaReporte] = useState(new Date().toISOString().split('T')[0]);
    const [usuarioActualId, setUsuarioActualId] = useState(null);

    const [mostrarModalIncidencia, setMostrarModalIncidencia] = useState(false);
    const [tipoReporte, setTipoReporte] = useState('uniforme');
    const [gravedad, setGravedad] = useState('menor');
    const [descripcionPersonalizada, setDescripcionPersonalizada] = useState('');
    const [guardandoReporte, setGuardandoReporte] = useState(false);

    // --- NUEVO ESTADO PARA LA FECHA DEL ABONO ---
    const [fechaAbono, setFechaAbono] = useState(new Date().toISOString().split('T')[0]);
    const [horasAbonar, setHorasAbonar] = useState(1);
    const [actividadAbono, setActividadAbono] = useState('');

    const [pestañaHistorial, setPestañaHistorial] = useState('incidencias');
    const [historialAbonos, setHistorialAbonos] = useState([]);

    const navigate = useNavigate();

    const handleCerrarSesion = () => navigate('/');

    useEffect(() => {
        const obtenerUsuario = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                setUsuarioActualId(session.user.id);
            }
        };
        obtenerUsuario();
    }, []);

    useEffect(() => {
        const guardadas = JSON.parse(localStorage.getItem('busquedasRecientes')) || [];
        setBusquedasRecientes(guardadas);
    }, []);

    useEffect(() => {
        const fetchGrupos = async () => {
            const { data } = await supabase
                .from('grupos')
                .select('id, semestre, letra')
                .order('semestre', { ascending: true })
                .order('letra', { ascending: true });

            if (data) {
                const gruposActivos = data.filter(g => [1, 3, 5].includes(parseInt(g.semestre)));
                setGruposDB(gruposActivos);
            }
        };
        fetchGrupos();
    }, []);

    useEffect(() => {
        const buscarEnBD = async () => {
            if (busqueda.length < 3 && filtroGrupo === 'Todos' && filtroRapido === 'Todos') {
                setResultadosBusqueda([]);
                return;
            }

            setBuscando(true);
            let matriculasConAdeudo = [];

            if (filtroRapido === 'Con Adeudo') {
                const { data: reportesPendientes } = await supabase
                    .from('reportes')
                    .select('alumno_matricula')
                    .eq('estado_reporte', 'pendiente');

                matriculasConAdeudo = reportesPendientes ? [...new Set(reportesPendientes.map(r => r.alumno_matricula))] : [];

                if (matriculasConAdeudo.length === 0) {
                    setResultadosBusqueda([]);
                    setBuscando(false);
                    return;
                }
            }

            let query = supabase
                .from('alumnos')
                .select(`matricula, nombre, apellidos, grupo_id, grupos (semestre, letra, carreras (nombre))`)
                .neq('estado', 'egresado');

            if (busqueda.length >= 3) {
                const busquedaNormalizada = busqueda
                    .replace(/[aeiouáéíóúüAEIOUÁÉÍÓÚÜ]/g, '_')
                    .replace(/\s+/g, '%');

                query = query.or(`nombre.ilike.%${busquedaNormalizada}%,apellidos.ilike.%${busquedaNormalizada}%,matricula.ilike.%${busquedaNormalizada}%`);
            }

            if (filtroGrupo !== 'Todos') {
                query = query.eq('grupo_id', filtroGrupo);
            }

            if (filtroRapido === 'Con Adeudo') {
                query = query.in('matricula', matriculasConAdeudo);
            }

            const { data, error } = await query.limit(50);

            if (!error && data) {
                let alumnosFormateados = data.map(a => ({
                    matricula: a.matricula,
                    nombre: `${a.nombre} ${a.apellidos}`,
                    carrera: a.grupos?.carreras?.nombre || 'Sin carrera asignada',
                    grupo: `${a.grupos?.semestre || ''}${a.grupos?.letra || ''}`
                }));

                if (filtroRapido === 'Historial Limpio' && alumnosFormateados.length > 0) {
                    const matriculasObtenidas = alumnosFormateados.map(a => a.matricula);
                    const { data: reportesPendientes } = await supabase
                        .from('reportes')
                        .select('alumno_matricula')
                        .eq('estado_reporte', 'pendiente')
                        .in('alumno_matricula', matriculasObtenidas);

                    const setAdeudo = new Set((reportesPendientes || []).map(r => r.alumno_matricula));
                    alumnosFormateados = alumnosFormateados.filter(a => !setAdeudo.has(a.matricula));
                }

                setResultadosBusqueda(alumnosFormateados);
            }
            setBuscando(false);
        };

        const temporizador = setTimeout(() => buscarEnBD(), 300);
        return () => clearTimeout(temporizador);
    }, [busqueda, filtroGrupo, filtroRapido]);

    const seleccionarAlumno = async (alumnoBase) => {
        setBusqueda('');
        setFiltroGrupo('Todos');
        setFiltroRapido('Todos');
        setResultadosBusqueda([]);
        setInputFocus(false);

        const nuevasRecientes = [alumnoBase, ...busquedasRecientes.filter(a => a.matricula !== alumnoBase.matricula)].slice(0, 5);
        setBusquedasRecientes(nuevasRecientes);
        localStorage.setItem('busquedasRecientes', JSON.stringify(nuevasRecientes));

        const { data: reportes } = await supabase
            .from('reportes')
            .select('*')
            .eq('alumno_matricula', alumnoBase.matricula)
            .order('fecha_creacion', { ascending: false });

        const reportesData = reportes || [];

        const { data: abonos } = await supabase
            .from('historial_horas')
            .select('*, reportes(descripcion)')
            .in('reporte_id', reportesData.length > 0 ? reportesData.map(r => r.id) : [''])
            .order('fecha_registro', { ascending: false });

        setHistorialAbonos(abonos || []);

        let horasGravesPendientes = 0;

        const faltasMenoresActivas = reportesData.filter(rep =>
            (rep.horas_asignadas === 0 || rep.horas_asignadas === null) &&
            rep.estado_reporte === 'pendiente'
        );

        reportesData.forEach(rep => {
            if (rep.horas_asignadas > 0 && rep.estado_reporte === 'pendiente') {
                horasGravesPendientes += (rep.horas_asignadas - rep.horas_cumplidas);
            }
        });

        const reportesAcumulados = faltasMenoresActivas.length % 3;
        const horasPorAcumulacion = Math.floor(faltasMenoresActivas.length / 3);
        const horasPendientes = horasGravesPendientes + horasPorAcumulacion;

        const historialFormateado = reportesData.map(rep => ({
            id: rep.id,
            esGrave: rep.horas_asignadas > 0,
            descripcion: rep.descripcion,
            fecha: new Date(rep.fecha_creacion).toLocaleDateString(),
            horas: rep.horas_asignadas,
            horasPagadas: rep.horas_cumplidas
        }));

        setAlumnoSeleccionado({
            ...alumnoBase,
            reportesRaw: reportesData,
            horasPendientes,
            reportesAcumulados,
            faltasMenoresActivas,
            historial: historialFormateado
        });
    };

    const handleBusqueda = (e) => {
        setBusqueda(e.target.value);
        if (alumnoSeleccionado && e.target.value.length > 0) setAlumnoSeleccionado(null);
    };

    const handleLimpiarBusqueda = () => {
        setBusqueda('');
        if (alumnoSeleccionado) setAlumnoSeleccionado(null);
    };

    const handleFiltroGrupo = (e) => {
        setFiltroGrupo(e.target.value);
        if (alumnoSeleccionado) setAlumnoSeleccionado(null);
    };

    const guardarReporte = async () => {
        if (guardandoReporte) return;
        setGuardandoReporte(true);

        const desc = tipoReporte === 'personalizado' ? descripcionPersonalizada : tipoReporte.toUpperCase();
        const horasAplicar = gravedad === 'grave' ? 1 : 0;
        const fechaFormateada = new Date(`${fechaReporte}T12:00:00`).toISOString();

        const { error } = await supabase.from('reportes').insert([{
            alumno_matricula: alumnoSeleccionado.matricula,
            descripcion: desc,
            horas_asignadas: horasAplicar,
            estado_reporte: 'pendiente',
            fecha_creacion: fechaFormateada,
            prefecto_id: usuarioActualId || null
        }]);

        if (!error) {
            setMostrarModalIncidencia(false);
            setTipoReporte('uniforme');
            setGravedad('menor');
            setDescripcionPersonalizada('');
            setFechaReporte(new Date().toISOString().split('T')[0]);
            await seleccionarAlumno(alumnoSeleccionado);
        } else {
            alert(`Error de BD: ${error.message}`);
            console.error("Detalle del error:", error);
        }
        setGuardandoReporte(false);
    };

    const registrarAbono = async () => {
        if (horasAbonar <= 0 || horasAbonar > alumnoSeleccionado.horasPendientes) return;

        const actividadTexto = actividadAbono.trim() === '' ? 'Servicio General' : actividadAbono;
        let horasRestantes = parseInt(horasAbonar);

        // Centramos la hora a mediodía para evitar saltos de fecha por la zona horaria UTC
        const fechaAbonoFormateada = new Date(`${fechaAbono}T12:00:00`).toISOString();

        const gravesPendientes = alumnoSeleccionado.reportesRaw
            .filter(r => r.horas_asignadas > 0 && r.estado_reporte === 'pendiente')
            .sort((a, b) => new Date(a.fecha_creacion) - new Date(b.fecha_creacion));

        for (let reporte of gravesPendientes) {
            if (horasRestantes <= 0) break;
            const deuda = reporte.horas_asignadas - reporte.horas_cumplidas;
            const pago = Math.min(deuda, horasRestantes);
            const nuevoCumplidas = reporte.horas_cumplidas + pago;
            const nuevoEstado = nuevoCumplidas >= reporte.horas_asignadas ? 'pagado' : 'pendiente';

            await supabase.from('reportes').update({ horas_cumplidas: nuevoCumplidas, estado_reporte: nuevoEstado }).eq('id', reporte.id);
            // Insertamos el historial con la fecha manual
            await supabase.from('historial_horas').insert([{
                reporte_id: reporte.id,
                horas_abonadas: pago,
                actividad: actividadTexto,
                fecha_registro: fechaAbonoFormateada
            }]);
            horasRestantes -= pago;
        }

        if (horasRestantes > 0) {
            const menoresPendientes = [...alumnoSeleccionado.faltasMenoresActivas]
                .sort((a, b) => new Date(a.fecha_creacion) - new Date(b.fecha_creacion));

            let i = 0;
            while (horasRestantes > 0 && (i + 2) < menoresPendientes.length) {
                const f1 = menoresPendientes[i];
                const f2 = menoresPendientes[i + 1];
                const f3 = menoresPendientes[i + 2];

                await supabase.from('reportes').update({ estado_reporte: 'pagado' }).eq('id', f1.id);
                await supabase.from('reportes').update({ estado_reporte: 'pagado' }).eq('id', f2.id);
                await supabase.from('reportes').update({ estado_reporte: 'pagado' }).eq('id', f3.id);

                // Insertamos el historial con la fecha manual
                await supabase.from('historial_horas').insert([{
                    reporte_id: f3.id,
                    horas_abonadas: 1,
                    actividad: actividadTexto,
                    fecha_registro: fechaAbonoFormateada
                }]);

                horasRestantes -= 1;
                i += 3;
            }
        }

        setHorasAbonar(1);
        setActividadAbono('');
        setFechaAbono(new Date().toISOString().split('T')[0]); // Reiniciar fecha a hoy
        await seleccionarAlumno(alumnoSeleccionado);
    };

    return (
        <div className="flex flex-col md:flex-row min-h-screen bg-[#f3f4f6] font-sans">
            <header className="md:hidden bg-[#008542] text-white p-4 flex justify-between items-center shadow-md sticky top-0 z-30">
                <h1 className="text-xl font-black tracking-tight">EduControl <span className="text-[#F26522]">v.2</span></h1>
                <button onClick={handleCerrarSesion} className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors flex items-center gap-2 text-sm font-bold">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    Salir
                </button>
            </header>

            <aside className="hidden md:flex flex-col w-64 bg-[#008542] text-white justify-between shrink-0 h-screen shadow-2xl sticky top-0 z-20">
                <div>
                    <div className="p-8">
                        <h1 className="text-3xl font-black tracking-tight">EduControl <span className="text-[#F26522]">v.2</span></h1>
                        <p className="text-green-200 text-sm font-medium mt-1">Módulo de Prefectura</p>
                    </div>

                    <nav className="px-4 mt-2 space-y-3">
                        <button onClick={() => setVistaActiva('busqueda')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-[2rem] font-black transition-all shadow-lg ${vistaActiva === 'busqueda' ? 'bg-white text-[#008542]' : 'text-green-100 hover:bg-white/10 shadow-none'}`}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            Buscador de Alumnos
                        </button>

                        <button onClick={() => setVistaActiva('mapa')} className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-[2rem] font-bold transition-all ${vistaActiva === 'mapa' ? 'bg-white text-[#008542] shadow-lg' : 'text-green-100 hover:bg-white/10 opacity-80'}`}>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                            Mapa de Aulas (Beta)
                        </button>
                    </nav>
                </div>

                <div className="p-4 mb-4">
                    <button onClick={handleCerrarSesion} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-white/80 hover:text-white font-bold rounded-xl transition-colors hover:bg-white/10">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                        Cerrar Sesión
                    </button>
                </div>
            </aside>

            <main className="flex-1 flex flex-col relative h-full min-h-[calc(100vh-64px)] md:min-h-screen overflow-y-auto pb-24 md:pb-0">
                <div className="p-4 md:p-8 lg:p-10 max-w-6xl mx-auto w-full space-y-6 md:space-y-8">

                    {vistaActiva === 'busqueda' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">

                            <div className="flex flex-col md:flex-row gap-4 w-full max-w-3xl mx-auto z-30">
                                <div className="relative flex-1">
                                    <div className="absolute inset-y-0 left-0 pl-4 md:pl-6 flex items-center pointer-events-none">
                                        <svg className="h-5 w-5 md:h-6 md:w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Buscar matrícula o nombre..."
                                        className="block w-full pl-12 pr-12 py-3 md:pl-16 md:pr-14 md:py-4 bg-white rounded-full text-base md:text-lg shadow-sm border border-gray-100 outline-none text-gray-700 font-medium focus:ring-2 focus:ring-[#008542]/20 transition-all"
                                        value={busqueda}
                                        onChange={handleBusqueda}
                                        onFocus={() => setInputFocus(true)}
                                        onBlur={() => setTimeout(() => setInputFocus(false), 200)}
                                    />

                                    {busqueda.length > 0 && (
                                        <button
                                            onClick={handleLimpiarBusqueda}
                                            className="absolute inset-y-0 right-4 flex items-center text-gray-300 hover:text-gray-500 transition-colors"
                                        >
                                            <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                    )}

                                    {(busqueda.length >= 3 || (inputFocus && busqueda.length === 0 && busquedasRecientes.length > 0)) && !alumnoSeleccionado && (
                                        <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden z-50 max-h-80 overflow-y-auto">
                                            {buscando ? (
                                                <div className="p-5 space-y-4">
                                                    {[1, 2, 3].map(i => (
                                                        <div key={i} className="flex items-center gap-4 animate-pulse">
                                                            <div className="w-10 h-10 md:w-12 md:h-12 bg-gray-100 rounded-xl shrink-0"></div>
                                                            <div className="flex-1 space-y-2">
                                                                <div className="h-4 bg-gray-200 rounded-md w-3/4"></div>
                                                                <div className="h-3 bg-gray-100 rounded-md w-1/2"></div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : resultadosBusqueda.length > 0 && busqueda.length > 0 ? (
                                                resultadosBusqueda.map((alumno) => (
                                                    <button key={alumno.matricula} onMouseDown={() => seleccionarAlumno(alumno)} className="w-full text-left p-4 hover:bg-green-50 border-b border-gray-50 flex items-center gap-4 transition-colors">
                                                        <div className={`w-10 h-10 md:w-12 md:h-12 ${obtenerColorAvatar(alumno.nombre)} rounded-xl flex items-center justify-center text-white font-bold shrink-0`}>{alumno.nombre.charAt(0)}</div>
                                                        <div>
                                                            <p className="font-bold text-gray-800 text-base md:text-lg">{alumno.nombre}</p>
                                                            <p className="text-xs md:text-sm text-gray-500 font-medium mt-0.5">Mat: {alumno.matricula} • {alumno.carrera} • Grupo {alumno.grupo}</p>
                                                        </div>
                                                    </button>
                                                ))
                                            ) : busqueda.length === 0 && busquedasRecientes.length > 0 ? (
                                                <div>
                                                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                                                        <span className="text-[11px] font-black text-gray-500 uppercase tracking-wider">Búsquedas Recientes</span>
                                                        <button onMouseDown={() => { setBusquedasRecientes([]); localStorage.removeItem('busquedasRecientes'); }} className="text-xs text-gray-400 hover:text-red-600 font-bold transition-colors">Limpiar</button>
                                                    </div>
                                                    {busquedasRecientes.map((alumno) => (
                                                        <button key={alumno.matricula} onMouseDown={() => seleccionarAlumno(alumno)} className="w-full text-left p-4 hover:bg-gray-50 border-b border-gray-50 flex items-center gap-4 transition-colors">
                                                            <div className={`w-10 h-10 md:w-12 md:h-12 ${obtenerColorAvatar(alumno.nombre)} rounded-xl flex items-center justify-center text-white font-bold shrink-0 opacity-80`}>{alumno.nombre.charAt(0)}</div>
                                                            <div>
                                                                <p className="font-bold text-gray-700 text-base md:text-lg">{alumno.nombre}</p>
                                                                <p className="text-xs md:text-sm text-gray-400 font-medium mt-0.5">Mat: {alumno.matricula} • {alumno.carrera} • Grupo {alumno.grupo}</p>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="p-8 text-center text-gray-500 font-bold">
                                                    No se encontraron alumnos coincidentes
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="relative w-full md:w-48 shrink-0">
                                    <select
                                        value={filtroGrupo}
                                        onChange={handleFiltroGrupo}
                                        className="block w-full pl-4 pr-10 py-3 md:py-4 bg-white rounded-full text-base md:text-lg shadow-sm border border-gray-100 outline-none text-gray-700 font-medium focus:ring-2 focus:ring-[#008542]/20 transition-all cursor-pointer appearance-none"
                                    >
                                        <option value="Todos">Todos los grupos</option>
                                        {gruposDB.map(g => (
                                            <option key={g.id} value={g.id}>
                                                Grupo {g.semestre}{g.letra}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none text-gray-400">
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                </div>
                            </div>

                            {!alumnoSeleccionado && (
                                <div className="flex gap-2 max-w-3xl mx-auto mt-4 overflow-x-auto pb-2 scrollbar-hide items-center">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mr-2 shrink-0">Filtros:</span>
                                    <button
                                        onClick={() => setFiltroRapido('Todos')}
                                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors shrink-0 ${filtroRapido === 'Todos' ? 'bg-[#008542] text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        Todos
                                    </button>
                                    <button
                                        onClick={() => setFiltroRapido('Con Adeudo')}
                                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors shrink-0 ${filtroRapido === 'Con Adeudo' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        Con Adeudo
                                    </button>
                                    <button
                                        onClick={() => setFiltroRapido('Historial Limpio')}
                                        className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors shrink-0 ${filtroRapido === 'Historial Limpio' ? 'bg-blue-500 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'}`}
                                    >
                                        Historial Limpio
                                    </button>
                                </div>
                            )}

                            {!alumnoSeleccionado && busqueda.length < 3 && filtroGrupo === 'Todos' && filtroRapido === 'Todos' && (
                                <div className="flex flex-col items-center justify-center py-20 text-center text-gray-400">
                                    <svg className="w-16 h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    <p className="font-bold text-lg text-gray-600">Buscador Activo</p>
                                    <p className="text-sm">Busca un alumno o utiliza el filtro de grupos para registrar incidencias.</p>
                                </div>
                            )}

                            {!alumnoSeleccionado && busqueda.length === 0 && (filtroGrupo !== 'Todos' || filtroRapido !== 'Todos') && (
                                <div className="max-w-4xl mx-auto w-full mt-8 animate-in fade-in duration-500 pb-10">
                                    <h3 className="font-bold text-gray-700 text-lg mb-4 flex items-center gap-2">
                                        <svg className="w-5 h-5 text-[#008542]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                        Resultados del filtro ({resultadosBusqueda.length})
                                    </h3>

                                    {buscando ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {[1, 2, 3, 4].map(i => (
                                                <div key={i} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 animate-pulse">
                                                    <div className="w-12 h-12 bg-gray-100 rounded-xl shrink-0"></div>
                                                    <div className="flex-1 space-y-2">
                                                        <div className="h-4 bg-gray-200 rounded-md w-3/4"></div>
                                                        <div className="h-3 bg-gray-100 rounded-md w-1/2"></div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : resultadosBusqueda.length > 0 ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {resultadosBusqueda.map(a => (
                                                <button key={a.matricula} onMouseDown={() => seleccionarAlumno(a)} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 hover:border-[#008542] hover:shadow-md transition-all flex items-center gap-4 text-left">
                                                    <div className={`w-12 h-12 ${obtenerColorAvatar(a.nombre)} rounded-xl flex items-center justify-center text-white font-bold shrink-0`}>{a.nombre.charAt(0)}</div>
                                                    <div>
                                                        <p className="font-bold text-gray-800">{a.nombre}</p>
                                                        <p className="text-xs text-gray-500 mt-0.5">Mat: {a.matricula} • {a.carrera}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 text-center">
                                            <p className="text-gray-500 font-bold">No hay alumnos que coincidan con estos filtros.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {alumnoSeleccionado && (
                                <div className="space-y-6 animate-in slide-in-from-bottom-8 fade-in duration-500 pb-10">
                                    <div className="bg-white rounded-3xl p-5 md:p-6 shadow-sm border border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                                        <div className="flex items-center gap-4 md:gap-5 w-full sm:w-auto">
                                            <div className={`w-16 h-16 md:w-20 md:h-20 shrink-0 ${obtenerColorAvatar(alumnoSeleccionado.nombre)} rounded-2xl flex items-center justify-center text-white text-2xl md:text-3xl font-black shadow-inner`}>
                                                {alumnoSeleccionado.nombre.charAt(0)}
                                            </div>
                                            <div>
                                                <h2 className="text-xl md:text-2xl font-black text-gray-900 tracking-tight leading-tight">{alumnoSeleccionado.nombre}</h2>
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-md font-bold text-[10px] md:text-xs">Mat: {alumnoSeleccionado.matricula}</span>
                                                    <span className="bg-orange-50 text-[#F26522] px-3 py-1 rounded-md font-bold text-[10px] md:text-xs">Grupo {alumnoSeleccionado.grupo}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <button onClick={() => setMostrarModalIncidencia(true)} className="w-full sm:w-auto px-6 py-3.5 bg-[#F26522] hover:bg-[#d9551c] text-white font-bold text-sm md:text-base rounded-xl shadow-md transition-all active:scale-95">
                                            Reportar Incidencia
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                                        <div className="lg:col-span-7 bg-white rounded-3xl p-5 md:p-8 shadow-sm border border-gray-100 h-full w-full">
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
                                                        alumnoSeleccionado.historial.map((item) => (
                                                            <div key={item.id} className="bg-white p-4 md:p-5 rounded-2xl border border-gray-200 flex justify-between items-center gap-3">
                                                                <div>
                                                                    <span className={`inline-block text-[10px] font-black uppercase px-2 py-1 rounded mb-2 tracking-wider ${item.esGrave ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-700'}`}>
                                                                        {item.esGrave ? 'FALTA GRAVE' : 'FALTA MENOR'}
                                                                    </span>
                                                                    <p className="font-bold text-gray-800 text-sm md:text-lg uppercase">{item.descripcion}</p>
                                                                    <p className="text-xs md:text-sm text-gray-400 font-medium">{item.fecha}</p>
                                                                </div>
                                                                <div className="text-right shrink-0">
                                                                    <p className="text-lg md:text-xl font-black text-gray-700">{item.horas} <span className="text-[10px] md:text-xs font-bold text-gray-400 block -mt-1">hr asignadas</span></p>
                                                                    {item.esGrave && <p className="text-[10px] md:text-xs font-bold text-[#008542] mt-1">{item.horasPagadas} pagadas</p>}
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

                                        <div className="lg:col-span-5 space-y-6 w-full">
                                            <div className="bg-[#0f172a] rounded-3xl p-5 md:p-6 text-white shadow-md flex justify-between items-center relative overflow-hidden">
                                                <div className="relative z-10">
                                                    <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest mb-1">Acumulación</p>
                                                    <h4 className="text-base md:text-lg font-bold">Faltas menores</h4>
                                                </div>
                                                <div className="text-4xl md:text-5xl font-black text-white relative z-10">
                                                    {alumnoSeleccionado.reportesAcumulados}<span className="text-xl md:text-2xl text-gray-500 font-bold">/3</span>
                                                </div>
                                                <div className="absolute bottom-0 left-0 h-1.5 bg-[#F26522] transition-all duration-500" style={{ width: `${(alumnoSeleccionado.reportesAcumulados / 3) * 100}%` }}></div>
                                            </div>

                                            <div className="bg-white rounded-3xl shadow-sm border border-gray-100 border-t-8 border-t-[#008542]">
                                                <div className="p-6 text-center border-b border-gray-100">
                                                    <p className="text-[10px] font-black text-[#008542] uppercase tracking-widest mb-2">Adeudo Total Actual</p>
                                                    <p className="text-6xl md:text-7xl font-black text-[#F26522] leading-none">{alumnoSeleccionado.horasPendientes}</p>
                                                    <p className="text-xs md:text-sm font-bold text-gray-500 mt-2">Horas pendientes</p>
                                                </div>

                                                <div className="p-5 md:p-6 bg-gray-50/50 rounded-b-3xl">
                                                    {/* NUEVO: CAMPO DE FECHA MANUAL PARA ABONOS */}
                                                    <label className="block text-xs font-bold text-gray-700 mb-2">Fecha del Abono</label>
                                                    <input
                                                        type="date"
                                                        value={fechaAbono}
                                                        onChange={e => setFechaAbono(e.target.value)}
                                                        className="w-full p-3.5 bg-white border border-gray-200 rounded-xl outline-none font-bold text-sm md:text-base mb-4 focus:border-[#008542] transition-colors"
                                                        required
                                                    />

                                                    <label className="block text-xs font-bold text-gray-700 mb-2">Abonar Horas</label>
                                                    <input type="number" value={horasAbonar} onChange={e => setHorasAbonar(e.target.value)} min="1" max={alumnoSeleccionado.horasPendientes} className="w-full p-3.5 bg-white border border-gray-200 rounded-xl outline-none font-black text-lg mb-4 focus:border-[#008542] transition-colors" />

                                                    <label className="block text-xs font-bold text-gray-700 mb-2">Actividad Realizada</label>
                                                    <input type="text" value={actividadAbono} onChange={e => setActividadAbono(e.target.value)} placeholder="Ej. Limpieza del aula" className="w-full p-3.5 bg-white border border-gray-200 rounded-xl outline-none font-medium text-sm md:text-base mb-5 focus:border-[#008542] transition-colors" />

                                                    <button onClick={registrarAbono} disabled={alumnoSeleccionado.horasPendientes === 0} className="w-full py-4 bg-[#008542] disabled:bg-gray-300 text-white font-bold rounded-xl shadow-md transition-all active:scale-95">
                                                        Registrar Abono
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {vistaActiva === 'mapa' && (
                        <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in zoom-in duration-500 px-4 h-full">
                            <div className="w-24 h-24 md:w-32 md:h-32 bg-gray-200 rounded-full flex items-center justify-center mb-6 relative overflow-hidden shadow-inner">
                                <svg className="w-12 h-12 md:w-16 md:h-16 text-gray-400 z-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                            </div>
                            <h2 className="text-xl md:text-2xl font-bold text-gray-700">Mapa de Aulas</h2>
                            <p className="text-sm md:text-base text-gray-500 mt-2 max-w-md">Esta función se encuentra actualmente en fase <span className="font-bold text-[#F26522]">Beta</span> y estará disponible en próximas actualizaciones.</p>
                        </div>
                    )}
                </div>
            </main>

            <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 flex justify-between items-center z-40 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-2">
                <button onClick={() => setVistaActiva('busqueda')} className={`flex-1 flex flex-col items-center justify-center py-3.5 px-1 transition-colors ${vistaActiva === 'busqueda' ? 'text-[#008542]' : 'text-gray-400 hover:text-gray-600'}`}>
                    <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={vistaActiva === 'busqueda' ? "2.5" : "2"} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span className="text-[11px] font-bold">Buscador</span>
                </button>
                <button onClick={() => setVistaActiva('mapa')} className={`flex-1 flex flex-col items-center justify-center py-3.5 px-1 transition-colors ${vistaActiva === 'mapa' ? 'text-[#008542]' : 'text-gray-400 hover:text-gray-600'}`}>
                    <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={vistaActiva === 'mapa' ? "2.5" : "2"} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    <span className="text-[11px] font-bold">Mapa (Beta)</span>
                </button>
            </nav>

            {mostrarModalIncidencia && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[2rem] p-6 md:p-8 w-full max-w-md shadow-2xl">
                        <h3 className="text-2xl md:text-3xl font-black text-gray-900 mb-6">Nueva Incidencia</h3>
                        <div className="space-y-5 md:space-y-6">

                            <div>
                                <label className="block text-xs md:text-sm font-bold mb-2 text-gray-700">Fecha de la incidencia (Registro de libreta)</label>
                                <input
                                    type="date"
                                    value={fechaReporte}
                                    onChange={(e) => setFechaReporte(e.target.value)}
                                    className="w-full p-3.5 md:p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-gray-800 focus:border-[#F26522] text-sm md:text-base"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-xs md:text-sm font-bold mb-2 text-gray-700">Motivo de la falta</label>
                                <select value={tipoReporte} onChange={(e) => setTipoReporte(e.target.value)} className="w-full p-3.5 md:p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-gray-800 focus:border-[#F26522] text-sm md:text-base">
                                    <option value="uniforme">Uniforme incorrecto</option>
                                    <option value="corte">Corte de cabello</option>
                                    <option value="retardo">Retardo</option>
                                    <option value="peinado">Peinado</option>
                                    <option value="personalizado">Otro (Personalizado)</option>
                                </select>
                            </div>

                            {tipoReporte === 'personalizado' && (
                                <textarea value={descripcionPersonalizada} onChange={e => setDescripcionPersonalizada(e.target.value)} className="w-full p-3.5 md:p-4 bg-gray-50 border border-gray-200 rounded-xl outline-none text-sm" rows="3" placeholder="Describe la incidencia..."></textarea>
                            )}

                            <div>
                                <label className="block text-xs md:text-sm font-bold mb-2 text-gray-700">Gravedad (Asignación de horas)</label>
                                <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" name="gravedad" value="menor" checked={gravedad === 'menor'} onChange={(e) => setGravedad(e.target.value)} className="text-[#F26522] focus:ring-[#F26522]" />
                                        <span className="font-bold text-gray-700 text-sm">Falta Menor</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="radio" name="gravedad" value="grave" checked={gravedad === 'grave'} onChange={(e) => setGravedad(e.target.value)} className="text-red-600 focus:ring-red-600" />
                                        <span className="font-bold text-gray-700 text-sm">Grave (+1 Hr)</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3 mt-8">
                            <button onClick={() => setMostrarModalIncidencia(false)} className="w-full sm:flex-1 py-3.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors">Cancelar</button>
                            <button onClick={guardarReporte} disabled={guardandoReporte} className="w-full sm:flex-1 py-3.5 bg-[#F26522] disabled:bg-orange-300 text-white font-bold rounded-xl shadow-lg hover:bg-[#d9551c]">
                                {guardandoReporte ? 'Guardando...' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}