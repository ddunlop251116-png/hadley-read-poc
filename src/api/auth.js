async function postJSON(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
}

export async function login(phone, pin) {
  return postJSON('/api/auth/login', { phone, pin });
}

export async function register(name, phone, pin) {
  return postJSON('/api/auth/register', { name, phone, pin });
}
