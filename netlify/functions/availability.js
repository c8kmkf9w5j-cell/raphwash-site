exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const token = process.env.CALENDLY_TOKEN;
  if (!token) return { statusCode: 500, headers, body: JSON.stringify({ error: 'CALENDLY_TOKEN manquant côté serveur.' }) };

  const formule = (event.queryStringParameters && event.queryStringParameters.formule || 'riviera').toLowerCase();
  const weekOffset = parseInt((event.queryStringParameters && event.queryStringParameters.weekOffset) || '0', 10);
  const authHeaders = { Authorization: 'Bearer ' + token };

  try {
    const meRes = await fetch('https://api.calendly.com/users/me', { headers: authHeaders });
    if (!meRes.ok) throw new Error('Impossible de récupérer le compte Calendly (' + meRes.status + ')');
    const me = await meRes.json();
    const userUri = me.resource.uri;

    const typesRes = await fetch('https://api.calendly.com/event_types?user=' + encodeURIComponent(userUri) + '&active=true&count=50', { headers: authHeaders });
    if (!typesRes.ok) throw new Error('Impossible de récupérer les types d\'événements (' + typesRes.status + ')');
    const typesData = await typesRes.json();
    const match = (typesData.collection || []).find(function (t) {
      return t.scheduling_url && t.scheduling_url.toLowerCase().endsWith('/' + formule);
    });
    if (!match) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Aucun événement Calendly trouvé pour "' + formule + '".' }) };

    const now = new Date();
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() + weekOffset * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 7);
    const effectiveStart = start < now ? now : start;

    const availUrl = 'https://api.calendly.com/event_type_available_times'
      + '?event_type=' + encodeURIComponent(match.uri)
      + '&start_time=' + encodeURIComponent(effectiveStart.toISOString())
      + '&end_time=' + encodeURIComponent(end.toISOString());

    const availRes = await fetch(availUrl, { headers: authHeaders });
    if (!availRes.ok) throw new Error('Impossible de récupérer les disponibilités (' + availRes.status + ')');
    const availData = await availRes.json();

    const days = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      days[d.toISOString().slice(0, 10)] = [];
    }
    (availData.collection || []).forEach(function (slot) {
      const dt = new Date(slot.start_time);
      const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
      const timeLabel = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(dt);
      if (!days[dayKey]) days[dayKey] = [];
      days[dayKey].push(timeLabel);
    });

    const result = Object.keys(days).sort().map(function (iso) { return { date: iso, slots: days[iso] }; });
    return { statusCode: 200, headers, body: JSON.stringify({ formule: formule, days: result }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
