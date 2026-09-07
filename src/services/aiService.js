export async function generarAnalisisInteligente(datosAgregados) {
    const apiKey = import.meta.env.VITE_GROQ_API_KEY;

    if (!apiKey) {
        alert("Falta configurar VITE_GROQ_API_KEY en .env.local");
        return "Error: API Key no configurada.";
    }

    // 1. Limpiamos los datos
    const resumenLimpio = {
        periodo: datosAgregados?.periodo || 'general',
        resultados: (datosAgregados?.datosReportes || []).map(item => ({
            segmento: item.nombre,
            total: item.totalReportes
        }))
    };

    // 👇 EL NUEVO PROMPT CON CONTEXTO ESTRICTO DE PREFECTURA
    const promptTexto = `
  CONTEXTO ESTRICTO: Estás analizando datos de "EduControl v.2", un sistema de control de PREFECTURA y DISCIPLINA escolar. 
  Los números que vas a recibir representan la cantidad de INCIDENCIAS DISCIPLINARIAS (reportes por falta de uniforme, retardos, cortes de cabello incorrectos, mala conducta, etc.). Bajo ninguna circunstancia los interpretes como tareas, proyectos o métricas positivas.

  INSTRUCCIONES: 
  Analiza el siguiente JSON de reportes disciplinarios y genera un diagnóstico ejecutivo y serio de máximo 2 párrafos. 
  1. Identifica qué segmentos (carreras, grupos o alumnos) presentan mayor indisciplina.
  2. Ofrece recomendaciones preventivas o logísticas para que la dirección y los prefectos reduzcan estas incidencias (ej. operativos en la entrada, pláticas, recordatorios del reglamento).

  DATOS A ANALIZAR:
  ${JSON.stringify(resumenLimpio)}
  `;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey.trim()}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                // Mantén el modelo que te funcionó en la prueba anterior
                model: "groq/compound",
                messages: [
                    { role: "user", content: promptTexto }
                ]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            const mensajeReal = errorData.error?.message || JSON.stringify(errorData);
            alert(`🚨 GROQ RECHAZÓ LA PETICIÓN 🚨\n\nMotivo exacto:\n${mensajeReal}`);
            throw new Error(`Error 400: ${mensajeReal}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;

    } catch (error) {
        console.error("Error al consultar IA:", error);
        return "No se pudo generar el análisis. Revisa la ventana emergente.";
    }
}