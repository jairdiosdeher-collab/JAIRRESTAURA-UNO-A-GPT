export default async function handler(req, res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return res.status(405).json({error:'Método no permitido.'}); }
  const key=process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({error:'El administrador aún no ha configurado el servicio de IA.'});
  const b=req.body||{}; const fields=['topic','facts','dates','goal','evidence','prior']; const d={};
  for (const k of fields) { d[k]=typeof b[k]==='string'?b[k].trim():''; if(d[k].length>12000) return res.status(413).json({error:'La consulta es demasiado extensa.'}); }
  if(d.facts.length<20) return res.status(400).json({error:'Describa los hechos con más detalle.'});
  const prompt=['Eres un asistente de orientación jurídica general para Colombia. Responde en español claro. No afirmes ser abogado ni sustituyas asesoría profesional. No inventes hechos, leyes, artículos, sentencias, enlaces ni términos. Si no puedes verificar una norma o precedente, dilo y recomienda consultar SUIN-Juriscol, Corte Constitucional o autoridad competente. Separa hechos aportados, datos faltantes, opciones generales, pasos prácticos y fuentes oficiales a consultar. No concluyas que una tutela o recurso es procedente sin verificar requisitos. No repitas datos identificables o sensibles.','Tema: '+d.topic,'Hechos: '+d.facts,'Fechas: '+d.dates,'Objetivo: '+d.goal,'Soportes: '+d.evidence,'Gestiones previas: '+d.prior].join('\n');
  try {
    const u='https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key='+encodeURIComponent(key);
    const r=await fetch(u,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{temperature:0.2,maxOutputTokens:1800}})});
    const j=await r.json().catch(()=>({}));
    if(!r.ok){console.error('Gemini status',r.status);return res.status(r.status===429?429:502).json({error:r.status===429?'Se alcanzó la cuota temporal del servicio. Intente más tarde.':'El proveedor de IA no está disponible.'});}
    const answer=(j.candidates||[]).flatMap(c=>c.content?.parts||[]).map(p=>p.text||'').join('\n').trim();
    if(!answer)return res.status(502).json({error:'El proveedor no devolvió una respuesta utilizable.'});
    return res.status(200).json({answer});
  } catch(e){console.error('AI request failed',e?.message);return res.status(502).json({error:'No fue posible conectar con el servicio de IA.'});}
}