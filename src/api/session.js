async function postJSON(path, body, token) {
  const r = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

export async function startSession(token) {
  return postJSON('/api/session/start', {}, token);
}

export async function sendAudio(token, sessionId, blob) {
  const r = await fetch('/api/session/exchange', {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || 'audio/webm',
      Authorization: `Bearer ${token}`,
      'x-session-id': String(sessionId),
    },
    body: blob,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

export async function endSession(token, sessionId) {
  return postJSON('/api/session/end', { sessionId }, token);
}

export async function sendChoice(token, sessionId, choice) {
  const r = await fetch('/api/session/exchange', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'x-session-id': String(sessionId),
    },
    body: JSON.stringify({ choice }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}
