// BE-07 · Storage buckets and path convention
//
// Confirms the three buckets exist and are private, then proves the
// <user_id>/<filename> convention is actually enforced — not merely
// documented — by attempting uploads to paths that violate it.

const URL = process.env.SB_URL;
const ANON = process.env.SB_ANON;
const SERVICE = process.env.SB_SERVICE;

const EXPECTED_BUCKETS = ['recordings', 'clips', 'thumbnails'];

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function api(path, { token, key, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${URL}${path}`, {
    method,
    headers: {
      apikey: key ?? ANON,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !(body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, ok: res.ok, json, text };
}

async function createUser(email, password) {
  const created = await api('/auth/v1/admin/users', {
    key: SERVICE, token: SERVICE, method: 'POST',
    body: { email, password, email_confirm: true },
  });
  if (!created.json?.id) throw new Error(`could not create ${email}: ${created.text.slice(0, 200)}`);
  const signin = await api('/auth/v1/token?grant_type=password', {
    method: 'POST', body: { email, password },
  });
  if (!signin.json?.access_token) throw new Error(`could not sign in ${email}: ${signin.text.slice(0, 200)}`);
  return { id: created.json.id, token: signin.json.access_token };
}

const FILE = new TextEncoder().encode('lyrebird storage path test');

async function upload(bucket, path, token) {
  return api(`/storage/v1/object/${bucket}/${path}`, {
    token, method: 'POST', body: FILE,
    headers: { 'Content-Type': 'video/mp4', 'x-upsert': 'true' },
  });
}

async function main() {
  const stamp = Date.now();
  const alice = await createUser(`storage-alice+${stamp}@example.test`, 'test-password-alice-123');
  const bob   = await createUser(`storage-bob+${stamp}@example.test`,   'test-password-bob-123');
  console.log(`\nalice = ${alice.id}\nbob   = ${bob.id}\n`);

  // ---------- 1. the three buckets exist, and are private ----------
  const buckets = await api('/storage/v1/bucket', { key: SERVICE, token: SERVICE });
  const found = Array.isArray(buckets.json) ? buckets.json : [];
  const names = found.map(b => b.id);
  for (const want of EXPECTED_BUCKETS) {
    const b = found.find(x => x.id === want);
    record(`bucket "${want}" exists`, Boolean(b), b ? `id=${b.id}` : `not found (saw: ${names.join(', ') || 'none'})`);
    if (b) {
      record(`bucket "${want}" is private`, b.public === false, `public=${b.public}`);
    }
  }

  console.log('');

  // ---------- 2. the done-when, per bucket ----------
  for (const bucket of EXPECTED_BUCKETS) {
    const bad = await upload(bucket, 'wrongfolder/test.mp4', alice.token);
    record(`${bucket}: upload to "wrongfolder/test.mp4" is REFUSED`,
      !bad.ok, `status ${bad.status}`);

    const good = await upload(bucket, `${alice.id}/test.mp4`, alice.token);
    record(`${bucket}: upload to "<uid>/test.mp4" SUCCEEDS`,
      good.ok, `status ${good.status}`);
  }

  console.log('');

  // ---------- 3. the ways the convention could leak ----------
  const edge = [
    {
      name: 'bare filename at bucket root is refused',
      path: 'test.mp4',
      expectOk: false,
    },
    {
      name: 'another user\'s folder is refused',
      path: `${bob.id}/test.mp4`,
      expectOk: false,
    },
    {
      // The policy compares (storage.foldername(name))[1] to auth.uid().
      // A prefix match would wrongly allow this; an equality check refuses it.
      name: 'folder merely STARTING with the uid is refused',
      path: `${alice.id}-evil/test.mp4`,
      expectOk: false,
    },
    {
      name: 'uid as a deeper segment is refused',
      path: `other/${alice.id}/test.mp4`,
      expectOk: false,
    },
    {
      // Legitimate: first segment is still the uid.
      name: 'nested path under own uid is allowed',
      path: `${alice.id}/2026/09/test.mp4`,
      expectOk: true,
    },
    {
      name: 'uppercased uid is refused (comparison is exact)',
      path: `${alice.id.toUpperCase()}/test.mp4`,
      expectOk: false,
    },
  ];

  for (const c of edge) {
    const res = await upload('recordings', c.path, alice.token);
    record(`recordings: ${c.name}`,
      c.expectOk ? res.ok : !res.ok,
      `status ${res.status}`);
  }

  console.log('');

  // ---------- 4. an unauthenticated client gets nothing ----------
  const anonUpload = await api(`/storage/v1/object/recordings/${alice.id}/anon.mp4`, {
    method: 'POST', body: FILE, headers: { 'Content-Type': 'video/mp4' },
  });
  record('anonymous upload is refused', !anonUpload.ok, `status ${anonUpload.status}`);

  const anonRead = await api(`/storage/v1/object/recordings/${alice.id}/test.mp4`, {});
  record('anonymous read is refused', !anonRead.ok, `status ${anonRead.status}`);

  // ---------- summary ----------
  const failed = results.filter(r => !r.pass);
  console.log(`\n${'='.repeat(62)}`);
  console.log(`BE-07 storage verification: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('\nFAILED:');
    for (const f of failed) console.log(`  - ${f.name} (${f.detail})`);
  }
  console.log('='.repeat(62));
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
