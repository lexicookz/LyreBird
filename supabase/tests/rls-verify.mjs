// BE-06 · RLS verification
// Signs in as two test users and proves neither can reach the other's rows
// or storage objects. Every cross-user check is paired with a positive
// control: "zero rows" only means something if the owner sees the row.

const URL = process.env.SB_URL;
const ANON = process.env.SB_ANON;
const SERVICE = process.env.SB_SERVICE;

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
  return { id: created.json.id, token: signin.json.access_token, email };
}

const TABLES = ['brands', 'recordings', 'clips', 'briefs', 'calendar_entries'];

// Minimal valid row per table, given owner_id and any parent ids.
function rowFor(table, ownerId, parents) {
  switch (table) {
    case 'brands':           return { owner_id: ownerId, name: 'A-brand' };
    case 'recordings':       return { owner_id: ownerId, source: 'camera_roll', storage_path: `${ownerId}/rec.mp4` };
    case 'clips':            return { owner_id: ownerId, recording_id: parents.recording, storage_path: `${ownerId}/clip.mp4`, status: 'ready' };
    case 'briefs':           return { owner_id: ownerId, clip_id: parents.clip, brand_id: parents.brand, hook: 'h', cta: 'c' };
    case 'calendar_entries': return { owner_id: ownerId, brief_id: parents.brief, scheduled_for: new Date().toISOString().slice(0, 10) };
    default: throw new Error(`no shape for ${table}`);
  }
}

async function main() {
  const stamp = Date.now();
  const alice = await createUser(`alice+${stamp}@example.test`, 'test-password-alice-123');
  const bob   = await createUser(`bob+${stamp}@example.test`,   'test-password-bob-123');
  console.log(`\nalice = ${alice.id}\nbob   = ${bob.id}\n`);

  // --- profiles: auto-created by the handle_new_user trigger ---
  const aliceSeesOwnProfile = await api(`/rest/v1/profiles?select=id`, { token: alice.token });
  record('profiles: alice sees own profile (control)',
    aliceSeesOwnProfile.status === 200 && aliceSeesOwnProfile.json?.length === 1,
    `status ${aliceSeesOwnProfile.status}, ${aliceSeesOwnProfile.json?.length ?? '?'} row(s)`);

  const bobSeesAliceProfile = await api(`/rest/v1/profiles?select=id&id=eq.${alice.id}`, { token: bob.token });
  record('profiles: bob cannot see alice\'s profile',
    bobSeesAliceProfile.status === 200 && bobSeesAliceProfile.json?.length === 0,
    `status ${bobSeesAliceProfile.status}, ${bobSeesAliceProfile.json?.length ?? '?'} row(s)`);

  // --- tables: alice inserts, bob must see zero ---
  const parents = {};
  for (const table of TABLES) {
    const ins = await api(`/rest/v1/${table}`, {
      token: alice.token, method: 'POST',
      body: rowFor(table, alice.id, parents),
      headers: { Prefer: 'return=representation' },
    });
    if (!ins.ok || !ins.json?.[0]?.id) {
      record(`${table}: alice can insert own row (control)`, false, `status ${ins.status} ${ins.text.slice(0, 120)}`);
      continue;
    }
    const rowId = ins.json[0].id;
    if (table === 'brands') parents.brand = rowId;
    if (table === 'recordings') parents.recording = rowId;
    if (table === 'clips') parents.clip = rowId;
    if (table === 'briefs') parents.brief = rowId;
    record(`${table}: alice can insert own row (control)`, true, `id ${rowId.slice(0, 8)}…`);

    const aliceReads = await api(`/rest/v1/${table}?select=id&id=eq.${rowId}`, { token: alice.token });
    record(`${table}: alice reads own row (control)`,
      aliceReads.status === 200 && aliceReads.json?.length === 1,
      `status ${aliceReads.status}, ${aliceReads.json?.length ?? '?'} row(s)`);

    const bobReads = await api(`/rest/v1/${table}?select=id&id=eq.${rowId}`, { token: bob.token });
    record(`${table}: bob gets ZERO ROWS, not an error`,
      bobReads.status === 200 && bobReads.json?.length === 0,
      `status ${bobReads.status}, ${bobReads.json?.length ?? '?'} row(s)`);

    const bobWrites = await api(`/rest/v1/${table}`, {
      token: bob.token, method: 'POST',
      body: { ...rowFor(table, alice.id, parents) },
      headers: { Prefer: 'return=representation' },
    });
    record(`${table}: bob cannot insert a row owned by alice`,
      !bobWrites.ok,
      `status ${bobWrites.status}`);
  }

  // --- analyses: worker-written, app has SELECT only ---
  const svcInsert = await api('/rest/v1/analyses', {
    key: SERVICE, token: SERVICE, method: 'POST',
    body: { owner_id: alice.id, clip_id: parents.clip, payload: { ok: true }, model_version: 'test', prompt_version: 'v1' },
    headers: { Prefer: 'return=representation' },
  });
  if (svcInsert.ok && svcInsert.json?.[0]?.id) {
    const id = svcInsert.json[0].id;
    const aliceReads = await api(`/rest/v1/analyses?select=id&id=eq.${id}`, { token: alice.token });
    record('analyses: alice reads own analysis (control)',
      aliceReads.status === 200 && aliceReads.json?.length === 1,
      `status ${aliceReads.status}, ${aliceReads.json?.length ?? '?'} row(s)`);
    const bobReads = await api(`/rest/v1/analyses?select=id&id=eq.${id}`, { token: bob.token });
    record('analyses: bob gets ZERO ROWS, not an error',
      bobReads.status === 200 && bobReads.json?.length === 0,
      `status ${bobReads.status}, ${bobReads.json?.length ?? '?'} row(s)`);
    const aliceWrites = await api(`/rest/v1/analyses`, {
      token: alice.token, method: 'POST',
      body: { owner_id: alice.id, clip_id: parents.clip, payload: {}, model_version: 'x', prompt_version: 'v1' },
    });
    record('analyses: app cannot INSERT (select-only policy)', !aliceWrites.ok, `status ${aliceWrites.status}`);
  } else {
    record('analyses: seed via service role', false, `status ${svcInsert.status} ${svcInsert.text.slice(0, 120)}`);
  }

  // --- storage: <user_id>/<filename> convention ---
  const file = new TextEncoder().encode('lyrebird rls test');
  const alicePath = `${alice.id}/secret.txt`;

  const up = await api(`/storage/v1/object/recordings/${alicePath}`, {
    token: alice.token, method: 'POST', body: file,
    headers: { 'Content-Type': 'text/plain' },
  });
  record('storage: alice uploads to her own folder (control)', up.ok, `status ${up.status}`);

  const aliceGet = await api(`/storage/v1/object/recordings/${alicePath}`, { token: alice.token });
  record('storage: alice reads her own file (control)', aliceGet.ok, `status ${aliceGet.status}`);

  const bobGet = await api(`/storage/v1/object/recordings/${alicePath}`, { token: bob.token });
  record('storage: bob CANNOT read alice\'s file', !bobGet.ok, `status ${bobGet.status}`);

  const bobList = await api(`/storage/v1/object/list/recordings`, {
    token: bob.token, method: 'POST', body: { prefix: `${alice.id}/`, limit: 100 },
  });
  const listed = Array.isArray(bobList.json) ? bobList.json.length : null;
  record('storage: bob lists alice\'s folder and sees nothing',
    bobList.status === 200 && listed === 0,
    `status ${bobList.status}, ${listed ?? '?'} object(s)`);

  const bobWrite = await api(`/storage/v1/object/recordings/${alice.id}/planted.txt`, {
    token: bob.token, method: 'POST', body: file,
    headers: { 'Content-Type': 'text/plain' },
  });
  record('storage: bob CANNOT write into alice\'s folder', !bobWrite.ok, `status ${bobWrite.status}`);

  const bobDelete = await api(`/storage/v1/object/recordings/${alicePath}`, {
    token: bob.token, method: 'DELETE',
  });
  record('storage: bob CANNOT delete alice\'s file', !bobDelete.ok, `status ${bobDelete.status}`);

  const stillThere = await api(`/storage/v1/object/recordings/${alicePath}`, { token: alice.token });
  record('storage: alice\'s file survived bob\'s delete attempt', stillThere.ok, `status ${stillThere.status}`);

  // --- summary ---
  const failed = results.filter(r => !r.pass);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`BE-06 RLS verification: ${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('\nFAILED:');
    for (const f of failed) console.log(`  - ${f.name} (${f.detail})`);
  }
  console.log('='.repeat(60));
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(2); });
