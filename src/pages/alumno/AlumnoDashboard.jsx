import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function AlumnoDashboard() {
    const [alumno, setAlumno] = useState(null);
    const [reportes, setReportes] = useState([]);
    const [abonos, setAbonos] = useState([]);
    const [cargando, setCargando] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const cargarDatosAlumno = async () => {
            const matriculaGuardada = localStorage.getItem('matriculaAlumno');

            if (!matriculaGuardada) {
                navigate('/');
                return;
            }

            const matriculaUpper = matriculaGuardada.trim().toUpperCase();

            // 1. Obtener datos del alumno, grupo y carrera
            const { data: alumnoData, error: alumnoError } = await supabase
                .from('alumnos')
                .select(`
          matricula,
          nombre,
          apellidos,
          grupos (
            semestre,
            letra,
            carreras (nombre)
          )
        `)
                .eq('matricula', matriculaUpper)
                .maybeSingle();

            if (alumnoError || !alumnoData) {
                localStorage.removeItem('matriculaAlumno');
                navigate('/');
                return;
            }

            setAlumno({
                matricula: alumnoData.matricula,
                nombre: `${alumnoData.nombre} ${alumnoData.apellidos}`,
                carrera: alumnoData.grupos?.carreras?.nombre || 'Sin carrera asignada',
                grupo: `${alumnoData.grupos?.semestre || ''}${alumnoData.grupos?.letra || ''}`
            });

            // 2. Obtener reportes del alumno
            const { data: reportesData } = await supabase
                .from('reportes')
                .select('*')
                .eq('alumno_matricula', matriculaUpper)
                .order('fecha_creacion', { ascending: false });

            const listaReportes = reportesData || [];
            setReportes(listaReportes);

            // 3. Obtener abonos vinculados a sus reportes
            if (listaReportes.length > 0) {
                const idsReportes = listaReportes.map(r => r.id);
                const { data: abonosData } = await supabase
                    .from('historial_horas')
                    .select('*, reportes(descripcion)')
                    .in('reporte_id', idsReportes)
                    .order('fecha_registro', { ascending: false });

                setAbonos(abonosData || []);
            }

            setCargando(false);
        };

        cargarDatosAlumno();
    }, [navigate]);

    const handleCerrarSesion = () => {
        localStorage.removeItem('matriculaAlumno');
        navigate('/');
    };

    if (cargando) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-[#f3f4f6] font-bold text-[#008542]">
                Cargando tu portal escolar...
            </div>
        );
    }

    // Cálculos automáticos de adeudo y acumulación
    const faltasMenoresActivas = reportes.filter(r => r.horas_asignadas === 0 && r.estado_reporte === 'pendiente');
    const remanente = faltasMenoresActivas.length % 3;
    const reportesAcumulados = (remanente === 0 && faltasMenoresActivas.length > 0) ? 3 : remanente;

    const horasGraves = reportes
        .filter(r => r.horas_asignadas > 0 && r.estado_reporte === 'pendiente')
        .reduce((sum, r) => sum + (r.horas_asignadas - (r.horas_cumplidas || 0)), 0);

    const horasPorFaltasMenores = Math.floor(faltasMenoresActivas.length / 3);
    const horasPendientesCalculadas = horasGraves + horasPorFaltasMenores;

    const totalAbonado = abonos.reduce((sum, a) => sum + (a.horas_abonadas || 0), 0);
    const adeudoFinal = Math.max(0, horasPendientesCalculadas - totalAbonado);

    return (
        <div className="min-h-screen bg-[#f3f4f6] font-sans">

            {/* Header Institucional */}
            <header className="bg-[#008542] text-white shadow-md sticky top-0 z-30">
                <div className="max-w-6xl mx-auto px-6 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight">EduControl <span className="text-[#F26522]">v.2</span></h1>
                        <p className="text-green-200 text-xs font-medium">Portal del Alumno</p>
                    </div>
                    <button
                        onClick={handleCerrarSesion}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl font-bold text-sm transition-colors"
                    >
                        Cerrar Sesión
                    </button>
                </div>
            </header>

            {/* Contenido Principal */}
            <main className="max-w-6xl mx-auto p-6 md:p-10 space-y-8">

                {/* Tarjeta de Perfil */}
                <div className="bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-gray-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="flex items-center gap-6">
                        <div className="w-20 h-20 bg-gradient-to-br from-[#008542] to-[#005a2d] rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-lg">
                            {alumno.nombre.charAt(0)}
                        </div>
                        <div>
                            <h2 className="text-2xl md:text-3xl font-black text-gray-800">{alumno.nombre}</h2>
                            <div className="flex flex-wrap gap-2 mt-3">
                                <span className="bg-gray-100 text-gray-700 px-3.5 py-1.5 rounded-lg font-bold text-xs md:text-sm border border-gray-200">Matrícula: {alumno.matricula}</span>
                                <span className="bg-green-50 text-[#008542] px-3.5 py-1.5 rounded-lg font-bold text-xs md:text-sm border border-green-200">{alumno.carrera}</span>
                                <span className="bg-gray-100 text-gray-700 px-3.5 py-1.5 rounded-lg font-bold text-xs md:text-sm border border-gray-200">Grupo {alumno.grupo}</span>
                            </div>
                        </div>
                    </div>

                    <div className="text-right bg-gray-50 md:bg-transparent p-4 md:p-0 rounded-2xl w-full md:w-auto">
                        <p className="text-xs font-black text-gray-400 uppercase tracking-widest mb-1">Adeudo Total</p>
                        <p className="text-5xl font-black text-[#F26522]">
                            {adeudoFinal} <span className="text-xl text-gray-400">hrs</span>
                        </p>
                    </div>
                </div>

                {/* Grid de Reportes y Acumulación */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

                    {/* Historial de Reportes e Incidencias (7 Columnas) */}
                    <div className="lg:col-span-7 bg-white rounded-3xl p-6 md:p-8 shadow-xl border border-gray-100 min-h-[400px] flex flex-col">
                        <h3 className="text-xl md:text-2xl font-black text-gray-800 mb-6 flex items-center gap-3">
                            <div className="p-2 bg-green-50 rounded-xl text-[#008542]">
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            Mis Reportes e Incidencias
                        </h3>

                        <div className="space-y-4 overflow-y-auto flex-1 pr-1 max-h-[400px]">
                            {reportes.length > 0 ? (
                                reportes.map((rep) => (
                                    <div key={rep.id} className="bg-gray-50 p-5 rounded-2xl border border-gray-100 flex justify-between items-center gap-4">
                                        <div>
                                            <div className="flex items-center gap-2 mb-2">
                                                <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg ${rep.horas_asignadas > 0 ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>
                                                    {rep.horas_asignadas > 0 ? 'Falta Grave' : 'Falta Menor'}
                                                </span>
                                                <span className="text-xs font-bold text-gray-400">
                                                    {rep.fecha_creacion ? new Date(rep.fecha_creacion).toLocaleDateString() : 'Reciente'}
                                                </span>
                                            </div>
                                            <p className="font-bold text-gray-800 text-base uppercase">{rep.descripcion}</p>
                                            <p className="text-xs font-medium text-gray-500 mt-1">
                                                Estado: <span className="uppercase font-bold text-gray-700">{rep.estado_reporte}</span>
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0 bg-white p-3 rounded-xl border border-gray-100">
                                            <p className="text-xl font-black text-gray-700">{rep.horas_asignadas} <span className="text-xs text-gray-400 block">hrs</span></p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-16 text-gray-400">
                                    <p className="font-bold text-lg">¡Excelente trabajo!</p>
                                    <p className="text-sm mt-1">No cuentas con ningún reporte registrado en el sistema.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Panel de Acumulación y Abonos (5 Columnas) */}
                    <div className="lg:col-span-5 space-y-6">

                        {/* Tarjeta de Faltas Menores */}
                        <div className="bg-[#0f172a] rounded-3xl p-6 text-white shadow-xl flex justify-between items-center">
                            <div>
                                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs mb-1">Acumulación</p>
                                <h4 className="text-lg font-bold">Faltas menores</h4>
                                <p className="text-xs text-gray-400 mt-1">Cada 3 faltas menores generan 1 hora</p>
                            </div>
                            <div className="text-4xl font-black text-white">
                                {reportesAcumulados}<span className="text-xl text-gray-500">/3</span>
                            </div>
                        </div>

                        {/* Historial de Abonos Realizados */}
                        <div className="bg-white rounded-3xl p-6 shadow-xl border border-gray-100">
                            <h4 className="font-black text-gray-800 text-lg mb-4">Servicios y Abonos Registrados</h4>
                            <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
                                {abonos.length > 0 ? (
                                    abonos.map((ab) => (
                                        <div key={ab.id} className="bg-green-50/50 p-4 rounded-2xl border border-green-100 flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-gray-800 text-sm uppercase">{ab.actividad || 'Servicio General'}</p>
                                                <p className="text-xs text-gray-500 mt-0.5">Abono a: {ab.reportes?.descripcion || 'Incidencia'}</p>
                                            </div>
                                            <div className="text-[#008542] font-black text-lg">
                                                -{ab.horas_abonadas} hr
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-center text-gray-400 text-sm py-6">No hay abonos registrados todavía.</p>
                                )}
                            </div>
                        </div>

                    </div>
                </div>

            </main>
        </div>
    );
}