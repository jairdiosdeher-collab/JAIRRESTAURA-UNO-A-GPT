export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return res.status(503).json({ error: 'El servicio de orientación automática aún no está configurado.' });
  }

  const body = req.body || {};
  const fields = ['topic', 'facts', 'dates', 'goal', 'evidence', 'prior'];
  const data = {};

  for (const field of fields) {
    data[field] = typeof body[field] === 'string' ? body[field].trim() : '';
    if (data[field].length > 12000) {
      return res.status(413).json({ error: 'Uno de los campos supera la longitud permitida.' });
    }
  }

  const totalLength = fields.reduce((sum, field) => sum + data[field].length, 0);
  if (totalLength > 24000) {
    return res.status(413).json({ error: 'La consulta completa es demasiado extensa.' });
  }
  if (data.facts.length < 20) {
    return res.status(400).json({ error: 'Describa los hechos con más detalle.' });
  }

  const instructions = [
    'Eres un asistente de orientación jurídica general para Colombia. Responde siempre en español claro, respetuoso y comprensible.',
    'No afirmes ser abogado ni sustituyas asesoría profesional. No inventes hechos, leyes, artículos, sentencias, enlaces, autoridades ni términos procesales.',
    'No afirmes que consultaste fuentes oficiales o que verificaste normas en tiempo real: no tienes búsqueda jurídica oficial habilitada en esta aplicación.',
    'Distingue expresamente: hechos aportados, información faltante, orientación general, pasos prudentes y fuentes oficiales que la persona debe consultar.',
    'No concluyas que una tutela, recurso o acción es procedente sin contar con información suficiente y sin advertir qué requisitos deben verificarse.',
    'Si no conoces con seguridad una norma o precedente, dilo claramente. Recomienda verificar en SUIN-Juriscol, Corte Constitucional, Rama Judicial o la entidad competente.',
    'No solicites contraseñas, números completos de identificación ni datos sensibles innecesarios. No repitas datos personales identificables que aparezcan en la consulta.',
    'Prioriza pasos seguros, gratuitos cuando existan, y rutas institucionales colombianas. No prometas resultados ni representación legal.',
    'Finaliza recordando que la orientación es informativa y que los vencimientos o situaciones urgentes requieren atención profesional o institucional oportuna.'
  ].join(' ');

  const input = [
    'Tema: ' + data.topic,
    'Hechos relatados por la persona: ' + data.facts,
    'Fechas y plazos conocidos: ' + data.dates,
    'Objetivo que busca: ' + data.goal,
    'Documentos o soportes disponibles: ' + data.evidence,
    'Gestiones previas y respuestas: ' + data.prior
  ].join('\n');

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-5.5',
        instructions,
        input,
        max_output_tokens: 1800
      }),
      signal: AbortSignal.timeout(45000)
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('OpenAI API status:', response.status);
      if (response.status === 429) {
        return res.status(429).json({ error: 'El servicio alcanzó temporalmente su límite de uso. Intente más tarde.' });
      }
      if (response.status === 401 || response.status === 403) {
        return res.status(503).json({ error: 'La configuración de acceso al servicio de IA requiere revisión por el administrador.' });
      }
      return res.status(502).json({ error: 'El proveedor de IA no está disponible en este momento.' });
    }

    const answer = typeof result.output_text === 'string' ? result.output_text.trim() : '';
    if (!answer) {
      return res.status(502).json({ error: 'El proveedor no devolvió una respuesta de texto utilizable.' });
    }

    return res.status(200).json({ answer });
  } catch (error) {
    console.error('OpenAI request failed:', error?.name || 'Error de conexión');
    return res.status(502).json({
      error: error?.name === 'TimeoutError'
        ? 'La respuesta tardó demasiado. Intente nuevamente.'
        : 'No fue posible conectar con el servicio de orientación automática.'
    });
  }
}
