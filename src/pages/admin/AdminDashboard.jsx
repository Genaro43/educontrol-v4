import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { supabase, supabaseAdmin } from '../../services/supabaseClient';

// --- NUEVAS IMPORTACIONES PARA GRÁFICAS Y PDF ---
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function AdminDashboard() {
    const [vistaActiva, setVistaActiva] = useState('personal');

    // --- ESTADOS PARA PERSONAL Y CATÁLOGOS ---
    const [personalDB, setPersonalDB] = useState([]);
    const [carrerasDB, setCarrerasDB] = useState([]);
    const [gruposDB, setGruposDB] = useState([]);
    const [cargandoPersonal, setCargandoPersonal] = useState(false);

    const [mostrarModalUsuario, setMostrarModalUsuario] = useState(false);
    const [nuevoNombre, setNuevoNombre] = useState('');
    const [nuevoUsuario, setNuevoUsuario] = useState('');
    const [nuevaPassword, setNuevaPassword] = useState('');
    const [nuevoRol, setNuevoRol] = useState('prefecto');
    const [nuevaCarreraId, setNuevaCarreraId] = useState('');

    // --- ESTADOS PARA ANALÍTICAS GENERALES ---
    const [metricas, setMetricas] = useState({ reportesHoy: 0, horasCumplidasMes: 0, alumnosActivos: 0, prefectosActivos: 0 });
    const [reportesRecientes, setReportesRecientes] = useState([]);
    const [cargandoMetricas, setCargandoMetricas] = useState(false);

    // --- ESTADOS PARA GENERACIÓN DE INFORMES DETALLADOS ---
    const [filtroTiempo, setFiltroTiempo] = useState('diario');
    const [filtroAgrupacion, setFiltroAgrupacion] = useState('carreras');
    const [filtroEspecifico, setFiltroEspecifico] = useState('todos'); // Nuevo estado para filtro exacto
    const [datosInforme, setDatosInforme] = useState([]);
    const [generandoInforme, setGenerandoInforme] = useState(false);

    // --- ESTADO PARA ÉXITO EN CREDENCIALES ---
    const [credencialesGeneradas, setCredencialesGeneradas] = useState(null);

    // --- ESTADO PARA NOTIFICACIONES FLOTANTES (TOASTS) ---
    const [toast, setToast] = useState({ visible: false, mensaje: '', tipo: '' });

    // --- ESTADOS PARA LA CARGA DE EXCEL ---
    const fileInputRef = useRef(null);
    const [procesando, setProcesando] = useState(false);
    const [mensajeUpload, setMensajeUpload] = useState(null);

    const navigate = useNavigate();

    const handleCerrarSesion = () => {
        navigate('/');
    };

    const mostrarNotificacion = (mensaje, tipo = 'advertencia') => {
        setToast({ visible: true, mensaje, tipo });
        setTimeout(() => setToast({ visible: false, mensaje: '', tipo: '' }), 5000);
    };

    // --------------------------------------------------------
    // LÓGICA BASE Y EFECTOS
    // --------------------------------------------------------
    useEffect(() => {
        if (vistaActiva === 'personal') cargarDatosPersonal();
        if (vistaActiva === 'analiticas') cargarAnaliticas();
    }, [vistaActiva]);

    // Resetea el filtro específico cuando cambias el tipo de agrupación
    useEffect(() => {
        setFiltroEspecifico('todos');
    }, [filtroAgrupacion]);

    const cargarAnaliticas = async () => {
        setCargandoMetricas(true);
        try {
            const { count: countAlumnos } = await supabase.from('alumnos').select('*', { count: 'exact', head: true }).eq('estado', 'activo');
            const { count: countPrefectos } = await supabase.from('perfiles').select('*', { count: 'exact', head: true }).eq('rol', 'prefecto');

            const hoyInicio = new Date(); hoyInicio.setHours(0, 0, 0, 0);
            const hoyFin = new Date(); hoyFin.setHours(23, 59, 59, 999);
            const { count: countReportesHoy } = await supabase.from('reportes').select('*', { count: 'exact', head: true }).gte('fecha_creacion', hoyInicio.toISOString()).lte('fecha_creacion', hoyFin.toISOString());

            const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
            const { data: historialData } = await supabase.from('historial_horas').select('horas_abonadas').gte('fecha_registro', inicioMes);
            const horasMes = historialData ? historialData.reduce((sum, item) => sum + (item.horas_abonadas || 0), 0) : 0;

            const { data: ultimosReportes } = await supabase.from('reportes').select('id, descripcion, fecha_creacion, alumnos(nombre, apellidos)').order('fecha_creacion', { ascending: false }).limit(5);

            // Cargar catálogos para los filtros específicos
            const { data: carreras } = await supabase.from('carreras').select('*');
            const { data: grupos } = await supabase.from('grupos').select('id, semestre, letra, carreras(nombre)');
            if (carreras) setCarrerasDB(carreras);
            if (grupos) setGruposDB(grupos);

            setMetricas({
                alumnosActivos: countAlumnos || 0,
                prefectosActivos: countPrefectos || 0,
                reportesHoy: countReportesHoy || 0,
                horasCumplidasMes: Math.abs(horasMes)
            });

            if (ultimosReportes) setReportesRecientes(ultimosReportes);
        } catch (error) {
            mostrarNotificacion("Hubo un error al cargar las métricas.", "error");
        } finally {
            setCargandoMetricas(false);
        }
    };

    // --------------------------------------------------------
    // LÓGICA DEL GENERADOR DE INFORMES AVANZADO
    // --------------------------------------------------------
    const handleGenerarInforme = async () => {
        setGenerandoInforme(true);
        setDatosInforme([]);

        try {
            let startDate = new Date();
            if (filtroTiempo === 'diario') startDate.setHours(0, 0, 0, 0);
            else if (filtroTiempo === 'semanal') { startDate.setDate(startDate.getDate() - 7); startDate.setHours(0, 0, 0, 0); }
            else if (filtroTiempo === 'mensual') { startDate.setDate(1); startDate.setHours(0, 0, 0, 0); }

            const { data, error } = await supabase
                .from('reportes')
                .select(`
                    id, horas_asignadas, fecha_creacion, alumno_matricula,
                    alumnos (nombre, apellidos, grupos (id, semestre, letra, carrera_id, carreras(nombre)))
                `)
                .gte('fecha_creacion', startDate.toISOString());

            if (error) throw error;

            let reportesProcesar = data || [];

            // Aplicar Filtro Específico Exacto
            if (filtroEspecifico !== 'todos') {
                if (filtroAgrupacion === 'carreras') {
                    reportesProcesar = reportesProcesar.filter(rep => rep.alumnos?.grupos?.carrera_id === filtroEspecifico);
                } else if (filtroAgrupacion === 'grupos') {
                    reportesProcesar = reportesProcesar.filter(rep => rep.alumnos?.grupos?.id === filtroEspecifico);
                }
            }

            const agrupado = {};

            reportesProcesar.forEach(rep => {
                let key = 'Desconocido';
                let subKey = '';

                if (filtroAgrupacion === 'carreras') {
                    key = rep.alumnos?.grupos?.carreras?.nombre || 'Sin Carrera';
                } else if (filtroAgrupacion === 'grupos') {
                    key = rep.alumnos?.grupos ? `Grupo ${rep.alumnos.grupos.semestre}${rep.alumnos.grupos.letra}` : 'Sin Grupo';
                    subKey = rep.alumnos?.grupos?.carreras?.nombre || '';
                } else if (filtroAgrupacion === 'alumnos') {
                    key = `${rep.alumnos?.nombre} ${rep.alumnos?.apellidos}`;
                    subKey = `Matrícula: ${rep.alumno_matricula}`;
                } else if (filtroAgrupacion === 'prefectos') {
                    key = rep.perfiles?.nombre_completo || 'Prefecto general / Sistema';
                }

                if (!agrupado[key]) {
                    agrupado[key] = { clave: key, subClave: subKey, total: 0, faltasMenores: 0, faltasGraves: 0 };
                }

                agrupado[key].total += 1;
                if (rep.horas_asignadas > 0) agrupado[key].faltasGraves += 1;
                else agrupado[key].faltasMenores += 1;
            });

            const resultadoOrdenado = Object.values(agrupado).sort((a, b) => b.total - a.total);
            setDatosInforme(resultadoOrdenado);

        } catch (error) {
            console.error(error);
            mostrarNotificacion("Error al generar el informe.", "error");
        } finally {
            setGenerandoInforme(false);
        }
    };

    // --------------------------------------------------------
    // EXPORTAR A PDF
    // --------------------------------------------------------

    const handleExportarPDF = () => {
        if (datosInforme.length === 0) return mostrarNotificacion("No hay datos para exportar", "advertencia");

        const doc = new jsPDF();

        doc.setFontSize(20);
        doc.setTextColor(0, 133, 66);
        doc.text("EduControl v.2 - Informe Analítico", 14, 20);

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Periodo: ${filtroTiempo.toUpperCase()} | Filtro: ${filtroAgrupacion.toUpperCase()}`, 14, 28);
        doc.text(`Fecha de generación: ${new Date().toLocaleDateString()}`, 14, 34);

        const tableColumn = ["Clasificación", "Detalle", "Faltas Menores", "Faltas Graves", "Total Generado"];
        const tableRows = [];

        datosInforme.forEach(fila => {
            const filaDatos = [
                fila.clave,
                fila.subClave || 'N/A',
                fila.faltasMenores.toString(),
                fila.faltasGraves.toString(),
                fila.total.toString()
            ];
            tableRows.push(filaDatos);
        });

        autoTable(doc, {
            head: [tableColumn],
            body: tableRows,
            startY: 45,
            theme: 'grid',
            headStyles: { fillColor: [0, 133, 66] }
        });

        doc.save(`Informe_${filtroAgrupacion}_${filtroTiempo}.pdf`);
        mostrarNotificacion("PDF descargado correctamente", "exito");
    };

    // --------------------------------------------------------
    // LÓGICA DE PERSONAL Y ROLES
    // --------------------------------------------------------
    const cargarDatosPersonal = async () => {
        setCargandoPersonal(true);
        const { data: perfiles } = await supabase.from('perfiles').select('id, nombre_completo, rol, carreras (nombre)');
        const { data: carreras } = await supabase.from('carreras').select('*');

        if (perfiles) setPersonalDB(perfiles);
        if (carreras) {
            setCarrerasDB(carreras);
            if (carreras.length > 0) setNuevaCarreraId(carreras[0].id);
        }
        setCargandoPersonal(false);
    };

    const handleGuardarUsuario = async () => {
        if (!nuevoUsuario || !nuevoNombre || !nuevaPassword) {
            return mostrarNotificacion("Por favor llena todos los campos.", "advertencia");
        }
        if (nuevaPassword.length < 6) return mostrarNotificacion("La contraseña debe tener al menos 6 caracteres.", "advertencia");

        const correoFantasma = `${nuevoUsuario.trim().toLowerCase()}@cecyteh.local`;

        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email: correoFantasma,
            password: nuevaPassword,
            email_confirm: true
        });

        if (authError) {
            if (authError.message.includes('already been registered')) mostrarNotificacion(`El usuario "${nuevoUsuario}" ya existe. Elige otro nombre.`, "error");
            else mostrarNotificacion("Error de seguridad: " + authError.message, "error");
            return;
        }

        const { error: perfilError } = await supabase.from('perfiles').insert([{
            id: authData.user.id,
            nombre_completo: nuevoNombre,
            rol: nuevoRol,
            carrera_id: nuevoRol === 'coordinador' ? nuevaCarreraId : null
        }]);

        if (perfilError) {
            console.error(perfilError);
            mostrarNotificacion("Error al asignar el rol. Revisa los permisos SQL.", "error");
        } else {
            setCredencialesGeneradas({ usuario: correoFantasma, password: nuevaPassword });
            setNuevoUsuario('');
            setNuevoNombre('');
            setNuevaPassword('');
            cargarDatosPersonal();
        }
    };

    // --- NUEVA FUNCIÓN: ELIMINAR USUARIO ---
    const handleEliminarUsuario = async (usuarioId, nombre) => {
        if (!window.confirm(`⚠️ ADVERTENCIA: ¿Estás completamente seguro de eliminar el acceso y perfil de "${nombre}"?\nEsta acción es irreversible.`)) {
            return;
        }

        try {
            // 1. Borramos del sistema de Autenticación de Supabase (Admin API)
            const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(usuarioId);
            if (authError) throw authError;

            // 2. Si la Base de Datos no tiene Cascade automático, lo borramos manualmente de perfiles
            await supabase.from('perfiles').delete().eq('id', usuarioId);

            mostrarNotificacion(`Usuario ${nombre} eliminado exitosamente.`, "exito");
            cargarDatosPersonal(); // Recargamos la lista
        } catch (error) {
            console.error(error);
            mostrarNotificacion(`Error al eliminar: ${error.message}`, "error");
        }
    };

    // --------------------------------------------------------
    // LÓGICA DE PROCESAMIENTO DEL EXCEL
    // --------------------------------------------------------

    const manejarCargaArchivo = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setProcesando(true);
        setMensajeUpload(null);

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                const filasExcel = XLSX.utils.sheet_to_json(worksheet);

                if (filasExcel.length === 0) throw new Error("El archivo Excel está vacío.");

                const { data: carrerasDB } = await supabase.from('carreras').select('*');
                const { data: gruposDB } = await supabase.from('grupos').select('*');

                let carrerasActuales = [...(carrerasDB || [])];
                let gruposActuales = [...(gruposDB || [])];
                const alumnosAInsertar = [];
                const credencialesAlumnos = [];

                for (const fila of filasExcel) {
                    if (!fila['Matricula']) continue;

                    const matricula = String(fila['Matricula']).trim();
                    const nombre = fila['Nombre'] ? String(fila['Nombre']).trim() : '';
                    const apPaterno = fila['Apellido Paterno'] ? String(fila['Apellido Paterno']).trim() : '';
                    const apMaterno = fila['Apellido Materno'] ? String(fila['Apellido Materno']).trim() : '';
                    const apellidos = `${apPaterno} ${apMaterno}`.trim();

                    const nombreCarrera = fila['Carrera'] ? String(fila['Carrera']).trim() : 'SIN ASIGNAR';
                    const folio = fila['Folio Grupo'] ? String(fila['Folio Grupo']).trim() : '00X0X';
                    const status = fila['Status'] ? String(fila['Status']).trim().toLowerCase() : 'activo';

                    const semestreStr = folio.slice(-2, -1);
                    const letraStr = folio.slice(-1);
                    const semestre = parseInt(semestreStr) || 1;

                    let carreraObj = carrerasActuales.find(c => c.nombre.toUpperCase() === nombreCarrera.toUpperCase());
                    if (!carreraObj) {
                        const { data: nuevaCarrera, error: errCarrera } = await supabase
                            .from('carreras').insert([{ nombre: nombreCarrera }]).select().single();
                        if (errCarrera) throw errCarrera;
                        carreraObj = nuevaCarrera;
                        carrerasActuales.push(nuevaCarrera);
                    }

                    let grupoObj = gruposActuales.find(g => g.carrera_id === carreraObj.id && g.semestre === semestre && g.letra === letraStr);
                    if (!grupoObj) {
                        const { data: nuevoGrupo, error: errGrupo } = await supabase
                            .from('grupos').insert([{ carrera_id: carreraObj.id, semestre, letra: letraStr }]).select().single();
                        if (errGrupo) throw errGrupo;
                        grupoObj = nuevoGrupo;
                        gruposActuales.push(nuevoGrupo);
                    }

                    alumnosAInsertar.push({
                        matricula,
                        nombre,
                        apellidos,
                        grupo_id: grupoObj.id,
                        estado: status === 'activo' ? 'activo' : 'inactivo'
                    });

                    // Preparamos datos para crear su cuenta de acceso automáticamente
                    credencialesAlumnos.push({
                        matricula,
                        nombreCompleto: `${nombre} ${apellidos}`,
                        correo: `${matricula.toLowerCase()}@cecyteh.local`,
                        password: matricula // Su contraseña inicial por defecto es su propia matrícula
                    });
                }

                if (alumnosAInsertar.length === 0) throw new Error("No se encontraron alumnos válidos.");

                // 1. Guardar o actualizar alumnos en la tabla pública
                const { error: errorUpsert } = await supabase.from('alumnos').upsert(alumnosAInsertar, { onConflict: 'matricula' });
                if (errorUpsert) throw errorUpsert;

                // 2. Crear automáticamente las cuentas de acceso y perfiles para cada alumno
                for (const alumno of credencialesAlumnos) {
                    // Intentar crear el usuario Auth con la Llave Maestra
                    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
                        email: alumno.correo,
                        password: alumno.password,
                        email_confirm: true
                    });

                    let userId = null;
                    if (authError && authError.message.includes('already been registered')) {
                        // Si ya existe en auth, buscamos su ID en la tabla perfiles o lo consultamos
                        const { data: existingUser } = await supabase.from('perfiles').select('id').eq('id', alumno.matricula).maybeSingle();
                        // Omitimos si ya cuenta con acceso registrado
                        continue;
                    } else if (authData?.user) {
                        userId = authData.user.id;
                    }

                    if (userId) {
                        // Insertar su rol en la tabla perfiles
                        await supabase.from('perfiles').upsert([{
                            id: userId,
                            nombre_completo: alumno.nombreCompleto,
                            rol: 'alumno'
                        }], { onConflict: 'id' });
                    }
                }

                setMensajeUpload({ texto: `¡Éxito! Se procesaron ${alumnosAInsertar.length} alumnos y sus cuentas de acceso correctamente.`, tipo: 'exito' });

            } catch (error) {
                console.error(error);
                setMensajeUpload({ texto: error.message || "Hubo un error al procesar el archivo.", tipo: 'error' });
            } finally {
                setProcesando(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsArrayBuffer(file);
    };

    return (
        <div className="flex flex-col md:flex-row min-h-screen bg-[#f3f4f6] font-sans relative">

            {/* NOTIFICACIONES TOAST */}
            {toast.visible && (
                <div className={`fixed bottom-24 md:bottom-10 right-4 md:right-10 z-[100] p-4 rounded-2xl shadow-2xl flex items-start gap-3 max-w-sm animate-in slide-in-from-right-8 fade-in duration-300 border-l-4 
          ${toast.tipo === 'error' ? 'bg-white border-red-500 text-red-800' :
                        toast.tipo === 'advertencia' ? 'bg-white border-[#F26522] text-orange-800' :
                            'bg-white border-[#008542] text-green-800'}`}
                >
                    <div><p className="font-bold text-sm">{toast.mensaje}</p></div>
                    <button onClick={() => setToast({ visible: false, mensaje: '', tipo: '' })} className="ml-auto text-gray-400 hover:text-gray-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
            )}

            {/* HEADER MÓVIL Y SIDEBAR (Igual a tu diseño original) */}
            <header className="md:hidden bg-[#008542] text-white p-4 flex justify-between items-center shadow-md sticky top-0 z-30">
                <h1 className="text-2xl font-black tracking-tight">EduControl <span className="text-[#F26522]">v.2</span></h1>
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-white text-[#008542] flex items-center justify-center font-bold shadow-inner text-sm">AD</div>
                    <button onClick={handleCerrarSesion} className="p-2 bg-white/20 hover:bg-white/30 rounded-full transition-colors">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    </button>
                </div>
            </header>

            <aside className="hidden md:flex flex-col w-72 bg-[#008542] text-white shadow-2xl z-20 shrink-0 sticky top-0 h-screen">
                <div className="p-8">
                    <h1 className="text-3xl font-black tracking-tight">EduControl <span className="text-[#F26522]">v.2</span></h1>
                    <p className="text-green-200 text-sm font-medium mt-1">Panel de Administración</p>
                </div>

                <nav className="flex-1 px-4 space-y-3 mt-4">
                    <button onClick={() => setVistaActiva('analiticas')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${vistaActiva === 'analiticas' ? 'bg-white text-[#008542] shadow-lg' : 'text-green-100 hover:bg-white/10'}`}>
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg> Analíticas e Informes
                    </button>
                    <button onClick={() => setVistaActiva('personal')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${vistaActiva === 'personal' ? 'bg-white text-[#008542] shadow-lg' : 'text-green-100 hover:bg-white/10'}`}>
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg> Gestión de Personal
                    </button>
                    <button onClick={() => setVistaActiva('alumnos')} className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl font-bold transition-all ${vistaActiva === 'alumnos' ? 'bg-white text-[#008542] shadow-lg' : 'text-green-100 hover:bg-white/10'}`}>
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg> Carga de Alumnos
                    </button>
                </nav>

                <div className="p-6">
                    <button onClick={handleCerrarSesion} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 hover:bg-red-500/20 text-red-100 font-bold rounded-xl transition-colors border border-red-500/20">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg> Cerrar Sesión
                    </button>
                </div>
            </aside>

            {/* ÁREA PRINCIPAL */}
            <main className="flex-1 flex flex-col min-w-0 relative h-screen overflow-y-auto pb-24 md:pb-0">
                <div className="absolute top-0 left-0 w-full h-72 bg-gradient-to-b from-gray-200/80 to-transparent -z-10"></div>

                <div className="p-4 md:p-8 lg:p-10 max-w-7xl mx-auto w-full space-y-8">

                    {/* VISTA 1: ANALÍTICAS E INFORMES */}
                    {vistaActiva === 'analiticas' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <h2 className="text-2xl md:text-3xl font-black text-gray-800 mb-6">Panorama General</h2>

                            {cargandoMetricas ? (
                                <div className="flex flex-col items-center justify-center py-20 text-[#008542]">
                                    <svg className="animate-spin h-10 w-10 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    <p className="font-bold">Calculando métricas en tiempo real...</p>
                                </div>
                            ) : (
                                <>
                                    {/* Tarjetas de Métricas Dinámicas */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8">
                                        <div className="bg-white p-6 rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 border-b-4 border-b-[#F26522]">
                                            <p className="text-xs md:text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Reportes de Hoy</p>
                                            <p className="text-4xl md:text-5xl font-black text-[#F26522]">{metricas.reportesHoy}</p>
                                        </div>
                                        <div className="bg-white p-6 rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 border-b-4 border-b-[#008542]">
                                            <p className="text-xs md:text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Horas Cumplidas (Mes)</p>
                                            <p className="text-4xl md:text-5xl font-black text-[#008542]">{metricas.horasCumplidasMes}</p>
                                        </div>
                                        <div className="bg-white p-6 rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 border-b-4 border-b-blue-500">
                                            <p className="text-xs md:text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Alumnos Activos</p>
                                            <p className="text-4xl md:text-5xl font-black text-gray-800">{metricas.alumnosActivos}</p>
                                        </div>
                                        <div className="bg-white p-6 rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 border-b-4 border-b-purple-500">
                                            <p className="text-xs md:text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Prefectos Activos</p>
                                            <p className="text-4xl md:text-5xl font-black text-gray-800">{metricas.prefectosActivos}</p>
                                        </div>
                                    </div>

                                    {/* MÓDULO NUEVO: GENERADOR DE INFORMES CON GRÁFICAS Y PDF */}
                                    <div className="bg-white rounded-3xl md:rounded-[2rem] shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden mb-10">
                                        <div className="p-6 md:p-8 border-b border-gray-100">
                                            <div className="flex justify-between items-center mb-1">
                                                <h3 className="text-xl font-black text-gray-800">Generador de Informes Detallados</h3>
                                                {/* Botón Exportar PDF */}
                                                {datosInforme.length > 0 && (
                                                    <button onClick={handleExportarPDF} className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 font-bold rounded-xl transition-colors">
                                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                        Exportar a PDF
                                                    </button>
                                                )}
                                            </div>
                                            <p className="text-sm text-gray-500">Cruza la información en tiempo real para evaluar el desempeño disciplinario.</p>

                                            <div className="flex flex-col md:flex-row gap-4 mt-6">
                                                <div className="flex-1">
                                                    <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Periodo</label>
                                                    <select value={filtroTiempo} onChange={(e) => setFiltroTiempo(e.target.value)} className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-gray-700 focus:bg-white focus:border-[#008542]">
                                                        <option value="diario">Diario (Hoy)</option>
                                                        <option value="semanal">Semanal (Últimos 7 días)</option>
                                                        <option value="mensual">Mensual (Mes en curso)</option>
                                                    </select>
                                                </div>
                                                <div className="flex-1">
                                                    <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Agrupar Por</label>
                                                    <select value={filtroAgrupacion} onChange={(e) => setFiltroAgrupacion(e.target.value)} className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-gray-700 focus:bg-white focus:border-[#008542]">
                                                        <option value="carreras">Carreras</option>
                                                        <option value="grupos">Grupos</option>
                                                        <option value="alumnos">Alumnos Individuales</option>
                                                        <option value="prefectos">Prefectos (Productividad)</option>
                                                    </select>
                                                </div>

                                                {/* Filtro Sub-Específico Automático */}
                                                {(filtroAgrupacion === 'carreras' || filtroAgrupacion === 'grupos') && (
                                                    <div className="flex-1 animate-in fade-in slide-in-from-right-4 duration-300">
                                                        <label className="block text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">
                                                            {filtroAgrupacion === 'carreras' ? 'Carrera Específica' : 'Grupo Específico'}
                                                        </label>
                                                        <select value={filtroEspecifico} onChange={(e) => setFiltroEspecifico(e.target.value)} className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-gray-700 focus:bg-white focus:border-[#008542]">
                                                            <option value="todos">Mostrar {filtroAgrupacion === 'carreras' ? 'todas las carreras' : 'todos los grupos'}</option>
                                                            {filtroAgrupacion === 'carreras' && carrerasDB.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                                                            {filtroAgrupacion === 'grupos' && gruposDB.map(g => <option key={g.id} value={g.id}>Grupo {g.semestre}{g.letra} ({g.carreras?.nombre})</option>)}
                                                        </select>
                                                    </div>
                                                )}

                                                <div className="flex items-end">
                                                    <button onClick={handleGenerarInforme} disabled={generandoInforme} className="w-full md:w-auto px-8 py-3.5 bg-[#008542] hover:bg-[#005a2d] disabled:bg-[#008542]/50 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2">
                                                        {generandoInforme ? "Procesando..." : "Generar Datos"}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* RESULTADOS: GRÁFICAS Y TABLAS */}
                                        {datosInforme.length > 0 && (
                                            <div className="p-4 md:p-8 bg-gray-50/50 border-t border-gray-100">

                                                {/* 1. GRÁFICA DE BARRAS RECHARTS */}
                                                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm mb-8">
                                                    <h4 className="text-center font-black text-gray-600 mb-6 uppercase tracking-widest text-sm">Comparativa Gráfica de Incidencias</h4>
                                                    <div className="w-full h-72 md:h-96">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <BarChart data={datosInforme.slice(0, 10)} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                                                <CartesianGrid strokeDasharray="3 3" opacity={0.5} />
                                                                <XAxis dataKey="clave" tick={{ fontSize: 12 }} />
                                                                <YAxis />
                                                                <Tooltip contentStyle={{ borderRadius: '10px', fontWeight: 'bold' }} />
                                                                <Legend />
                                                                <Bar dataKey="faltasMenores" name="Faltas Menores" fill="#F26522" radius={[5, 5, 0, 0]} />
                                                                <Bar dataKey="faltasGraves" name="Faltas Graves (+1hr)" fill="#E11D48" radius={[5, 5, 0, 0]} />
                                                            </BarChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                </div>

                                                {/* 2. TABLA DE DATOS */}
                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-left border-collapse min-w-[600px] bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                                                        <thead>
                                                            <tr className="bg-gray-100/50 border-b border-gray-100">
                                                                <th className="p-4 font-black text-gray-500 uppercase tracking-wider text-xs">Clasificación</th>
                                                                <th className="p-4 font-black text-gray-500 uppercase tracking-wider text-xs text-center">Faltas Menores</th>
                                                                <th className="p-4 font-black text-gray-500 uppercase tracking-wider text-xs text-center">Faltas Graves</th>
                                                                <th className="p-4 font-black text-gray-800 uppercase tracking-wider text-xs text-center">Total Generado</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-100">
                                                            {datosInforme.map((fila, index) => (
                                                                <tr key={index} className="hover:bg-gray-50 transition-colors">
                                                                    <td className="p-4">
                                                                        <p className="font-bold text-gray-800 text-sm md:text-base">{fila.clave}</p>
                                                                        {fila.subClave && <p className="text-xs text-gray-500 font-medium mt-0.5">{fila.subClave}</p>}
                                                                    </td>
                                                                    <td className="p-4 text-center"><span className="px-3 py-1 bg-orange-50 text-orange-700 font-bold rounded-lg text-sm">{fila.faltasMenores}</span></td>
                                                                    <td className="p-4 text-center"><span className="px-3 py-1 bg-red-50 text-red-700 font-bold rounded-lg text-sm">{fila.faltasGraves}</span></td>
                                                                    <td className="p-4 text-center"><span className="text-lg font-black text-[#008542]">{fila.total}</span></td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                        {datosInforme.length === 0 && !generandoInforme && (
                                            <div className="p-10 text-center flex flex-col items-center text-gray-400">
                                                <svg className="w-16 h-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                <p className="font-bold text-gray-600">Listo para generar</p>
                                                <p className="text-sm">Configura los filtros y obtén gráficas y documentos PDF.</p>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* VISTA 2: GESTIÓN DE PERSONAL */}
                    {vistaActiva === 'personal' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 gap-4">
                                <div>
                                    <h2 className="text-2xl md:text-3xl font-black text-gray-800">Personal del Sistema</h2>
                                    <p className="text-gray-500 mt-1 text-sm md:text-base">Administra los accesos y roles del equipo.</p>
                                </div>
                                <button onClick={() => { setMostrarModalUsuario(true); setCredencialesGeneradas(null); }} className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 bg-[#F26522] hover:bg-[#d9551c] text-white font-bold rounded-2xl shadow-lg transition-all transform active:scale-95">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg> Crear Usuario
                                </button>
                            </div>

                            <div className="bg-white rounded-3xl md:rounded-[2rem] shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden min-h-[300px]">
                                {cargandoPersonal ? (
                                    <div className="flex flex-col items-center justify-center py-20 text-[#008542]">
                                        <p className="font-bold">Cargando personal...</p>
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse min-w-[600px]">
                                            <thead>
                                                <tr className="bg-gray-50 border-b border-gray-100">
                                                    <th className="p-5 font-black text-gray-500 uppercase tracking-wider text-xs md:text-sm">Nombre Completo</th>
                                                    <th className="p-5 font-black text-gray-500 uppercase tracking-wider text-xs md:text-sm">Rol Principal</th>
                                                    <th className="p-5 font-black text-gray-500 uppercase tracking-wider text-xs md:text-sm">Asignación</th>
                                                    <th className="p-5 font-black text-gray-500 uppercase tracking-wider text-xs md:text-sm text-right">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {personalDB.length > 0 ? personalDB.map((usuario) => (
                                                    <tr key={usuario.id} className="hover:bg-gray-50 transition-colors">
                                                        <td className="p-5">
                                                            <p className="font-bold text-gray-800 text-sm md:text-base">{usuario.nombre_completo || 'Usuario sin nombre'}</p>
                                                            <p className="text-xs md:text-sm text-gray-400 font-mono mt-1 truncate max-w-[200px]" title={usuario.id}>{usuario.id}</p>
                                                        </td>
                                                        <td className="p-5">
                                                            <span className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider ${usuario.rol === 'coordinador' ? 'bg-purple-100 text-purple-700' : usuario.rol === 'prefecto' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'}`}>
                                                                {usuario.rol}
                                                            </span>
                                                        </td>
                                                        <td className="p-5 font-bold text-gray-600 text-sm">
                                                            {usuario.rol === 'coordinador' ? (usuario.carreras?.nombre || 'Carrera no asignada') : 'Acceso Global'}
                                                        </td>
                                                        <td className="p-5 text-right">
                                                            <button
                                                                onClick={() => handleEliminarUsuario(usuario.id, usuario.nombre_completo)}
                                                                className="text-red-500 hover:text-red-700 font-bold text-sm transition-colors bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100"
                                                            >
                                                                Eliminar
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )) : (
                                                    <tr><td colSpan="4" className="text-center py-10 text-gray-500">No hay personal registrado.</td></tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* VISTA 3: CARGA MASIVA DE ALUMNOS */}
                    {vistaActiva === 'alumnos' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-3xl mx-auto">
                            <div className="text-center mb-8">
                                <h2 className="text-2xl md:text-3xl font-black text-gray-800">Carga Masiva de Estudiantes</h2>
                                <p className="text-gray-500 mt-2 text-sm md:text-base">Sube tu lista en formato Excel (.xlsx) para registrar o actualizar alumnos al inicio del semestre.</p>
                            </div>

                            <div className="bg-white rounded-3xl md:rounded-[2rem] p-6 md:p-10 shadow-xl shadow-gray-200/50 border border-gray-100 text-center relative overflow-hidden">
                                {procesando && (
                                    <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                                        <svg className="animate-spin h-12 w-12 text-[#008542] mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                        <p className="text-lg font-bold text-gray-800">Procesando archivo...</p>
                                    </div>
                                )}

                                <input type="file" accept=".xlsx, .xls, .csv" ref={fileInputRef} onChange={manejarCargaArchivo} className="hidden" />

                                <div onClick={() => fileInputRef.current.click()} className="border-4 border-dashed border-gray-200 rounded-3xl p-10 flex flex-col items-center justify-center bg-gray-50 hover:bg-[#008542]/5 transition-all cursor-pointer group">
                                    <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center shadow-lg shadow-green-100 mb-6 group-hover:scale-110 transition-transform">
                                        <svg className="w-10 h-10 text-[#008542]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                    </div>
                                    <p className="text-xl font-black text-gray-700">Selecciona tu archivo Excel aquí</p>
                                </div>

                                {mensajeUpload && (
                                    <div className={`mt-6 p-4 rounded-xl flex items-start gap-3 text-left ${mensajeUpload.tipo === 'exito' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                                        <p className="font-bold">{mensajeUpload.texto}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* NAVEGACIÓN INFERIOR MÓVIL */}
            <nav className="md:hidden fixed bottom-0 left-0 w-full bg-white border-t flex justify-between items-center z-40 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.08)] px-2">
                <button onClick={() => setVistaActiva('analiticas')} className={`flex-1 flex flex-col items-center py-3.5 ${vistaActiva === 'analiticas' ? 'text-[#008542]' : 'text-gray-400'}`}>
                    <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={vistaActiva === 'analiticas' ? "2.5" : "2"} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    <span className="text-[11px] font-bold">Analíticas</span>
                </button>
                <button onClick={() => setVistaActiva('personal')} className={`flex-1 flex flex-col items-center py-3.5 ${vistaActiva === 'personal' ? 'text-[#008542]' : 'text-gray-400'}`}>
                    <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={vistaActiva === 'personal' ? "2.5" : "2"} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                    <span className="text-[11px] font-bold">Personal</span>
                </button>
                <button onClick={() => setVistaActiva('alumnos')} className={`flex-1 flex flex-col items-center py-3.5 ${vistaActiva === 'alumnos' ? 'text-[#008542]' : 'text-gray-400'}`}>
                    <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={vistaActiva === 'alumnos' ? "2.5" : "2"} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    <span className="text-[11px] font-bold">Alumnos</span>
                </button>
            </nav>

            {/* MODAL: CREAR USUARIO Y PANTALLA DE ÉXITO */}
            {mostrarModalUsuario && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-[2rem] p-8 w-full max-w-md shadow-2xl m-auto relative overflow-hidden">
                        {credencialesGeneradas ? (
                            <div className="text-center animate-in zoom-in duration-300">
                                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <svg className="w-10 h-10 text-[#008542]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <h3 className="text-2xl font-black text-gray-800 mb-2">¡Usuario Creado!</h3>
                                <p className="text-sm text-gray-500 mb-6">Copia o toma foto de estas credenciales antes de cerrar la ventana y entrégalas al nuevo miembro del equipo.</p>
                                <div className="bg-gray-50 p-5 rounded-2xl text-left border border-gray-200 space-y-4">
                                    <div><p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Correo de Acceso</p><p className="font-mono text-gray-800 font-bold">{credencialesGeneradas.usuario}</p></div>
                                    <div><p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Contraseña</p><p className="font-mono text-[#F26522] font-bold">{credencialesGeneradas.password}</p></div>
                                </div>
                                <button onClick={() => { setMostrarModalUsuario(false); setCredencialesGeneradas(null); }} className="w-full mt-8 py-4 bg-[#008542] text-white font-bold rounded-xl hover:bg-[#005a2d] shadow-lg transition-all active:scale-95">
                                    Cerrar y Entendido
                                </button>
                            </div>
                        ) : (
                            <div className="animate-in fade-in">
                                <h3 className="text-2xl font-black text-gray-800 mb-6">Nuevo Usuario</h3>
                                <div className="space-y-4">
                                    <div><label className="block text-sm font-bold text-gray-700 mb-1.5">Nombre Completo</label><input value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)} type="text" className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-[#008542]" placeholder="Ej. Roberto Sánchez" /></div>
                                    <div><label className="block text-sm font-bold text-gray-700 mb-1.5">Usuario (Acceso)</label><input value={nuevoUsuario} onChange={e => setNuevoUsuario(e.target.value)} type="text" className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none lowercase focus:bg-white focus:border-[#008542]" placeholder="ej. roberto.sanchez" /><p className="text-xs text-gray-400 mt-1">Se creará como: <strong className="text-[#008542]">{nuevoUsuario ? `${nuevoUsuario.trim().toLowerCase()}@cecyteh.local` : '...'}</strong></p></div>
                                    <div><label className="block text-sm font-bold text-gray-700 mb-1.5">Contraseña Temporal</label><input value={nuevaPassword} onChange={e => setNuevaPassword(e.target.value)} type="text" className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-[#008542]" placeholder="Mínimo 6 caracteres" /></div>
                                    <div><label className="block text-sm font-bold text-gray-700 mb-1.5">Rol en el Sistema</label><select value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value)} className="w-full p-3.5 bg-gray-50 border border-gray-200 rounded-xl outline-none font-bold text-gray-700"><option value="prefecto">Prefecto</option><option value="coordinador">Coordinador de Carrera</option><option value="admin">Administrador</option></select></div>
                                    {nuevoRol === 'coordinador' && (
                                        <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100 animate-in zoom-in duration-200">
                                            <label className="block text-sm font-black text-purple-900 mb-1.5">Carrera a supervisar</label>
                                            <select value={nuevaCarreraId} onChange={e => setNuevaCarreraId(e.target.value)} className="w-full p-3 bg-white border border-purple-200 rounded-xl outline-none font-bold text-gray-700">
                                                {carrerasDB.length > 0 ? carrerasDB.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>) : <option value="">No hay carreras registradas</option>}
                                            </select>
                                        </div>
                                    )}
                                </div>
                                <div className="flex gap-3 mt-8">
                                    <button onClick={() => setMostrarModalUsuario(false)} className="flex-1 px-4 py-3.5 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors">Cancelar</button>
                                    <button onClick={handleGuardarUsuario} className="flex-1 px-4 py-3.5 bg-[#008542] text-white font-bold rounded-xl hover:bg-[#005a2d] shadow-lg transition-transform active:scale-95">Asignar Rol</button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}