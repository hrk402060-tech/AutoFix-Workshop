const { spawn } = require('node:child_process');
const { mkdirSync, mkdtempSync, readFileSync } = require('node:fs');
const { resolve, join } = require('node:path');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');

const root = resolve(__dirname, '../..');
mkdirSync(join(root, 'tmp'), { recursive: true });
const dir = mkdtempSync(join(root, 'tmp', 'void-check-'));
const database = join(dir, 'test.sqlite');
const port = 3119;
let logs = '';
let checks = 0;
const server = spawn(process.execPath, ['dist/main.js'], {
  cwd: resolve(__dirname, '..'),
  env: {
    ...process.env, DATABASE_PATH: database, UPLOAD_DIR: join(dir, 'photos'),
    API_PORT: String(port), JWT_SECRET: 'void-integration-test-secret-32-characters', NODE_ENV: 'test',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (chunk) => { logs += chunk; });
server.stderr.on('data', (chunk) => { logs += chunk; });

async function call(path, token, body, method = body === undefined ? 'GET' : 'POST', expected = 200) {
  const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  checks++;
  return data;
}

async function sql(query, params = []) {
  const db = new sqlite3.Database(database, sqlite3.OPEN_READONLY);
  try {
    return await new Promise((ok, fail) => db.all(query, params, (error, rows) => error ? fail(error) : ok(rows)));
  } finally {
    await new Promise((ok, fail) => db.close((error) => error ? fail(error) : ok()));
  }
}

async function snapshot(id) {
  const result = {};
  for (const table of ['work_order_items', 'work_order_participants', 'photos', 'repair_records', 'material_requests']) {
    result[table] = await sql(`SELECT * FROM ${table} WHERE workOrderId = ? ORDER BY id`, [id]);
  }
  result.logs = await sql('SELECT * FROM audit_logs WHERE resource = ? AND resourceId = ? ORDER BY id', ['work_order', id]);
  return result;
}

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
async function upload(id, token, expected) {
  const response = await fetch(`http://127.0.0.1:${port}/api/work-orders/${id}/photos/BEFORE`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'image/png' }, body: png,
  });
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  checks++;
  return data;
}

async function run() {
  let started = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/auth/me`)).status === 401) { started = true; break; }
    } catch {}
    await new Promise((ok) => setTimeout(ok, 100));
  }
  assert.ok(started, `Server did not start:\n${logs}`);
  const owner = (await call('/auth/login', null, { username: 'admin', password: 'Admin@123' }, 'POST', 201)).accessToken;
  const actors = {};
  for (const [username, role] of [['manager', 'MANAGER'], ['employee', 'EMPLOYEE'], ['outsider', 'EMPLOYEE'], ['warehouse', 'WAREHOUSE']]) {
    const user = await call('/users', owner, { username, role, name: username, password: 'Admin@123' }, 'POST', 201);
    const login = await call('/auth/login', null, { username, password: 'Admin@123' }, 'POST', 201);
    actors[username] = { id: user.id, token: login.accessToken };
  }
  const manager = actors.manager.token;
  const employee = actors.employee.token;
  const warehouse = actors.warehouse.token;
  const vehicle = await call('/vehicles', owner, { plateNumber: '作废验收车辆' }, 'POST', 201);
  const create = () => call('/work-orders', owner, {
    vehicleId: vehicle.id, customerRequest: '作废功能集成测试',
    itemTitles: ['保留维修项目一', '保留维修项目二'], participantIds: [actors.employee.id],
  }, 'POST', 201);
  const order = await create();
  await call(`/work-orders/${order.id}/records`, employee, { note: '作废前的维修记录必须保留' }, 'POST', 201);
  const photo = await upload(order.id, employee, 201);
  const part = await call('/inventory/parts', warehouse, { code: 'VOID-PART', name: '验收零件', specification: '', unit: '件' }, 'POST', 201);
  await call('/inventory/incoming', warehouse, { partId: part.id, quantity: 5, note: '验收测试入库' }, 'POST', 201);
  const material = { workOrderId: order.id, partId: part.id, quantity: 1, type: 'OUT', note: '作废前待审批申请' };
  const request = await call('/inventory/requests', employee, material, 'POST', 201);
  const before = await snapshot(order.id);

  for (const token of [employee, warehouse, actors.outsider.token]) {
    await call(`/work-orders/${order.id}/status`, token, { status: 'CANCELLED', note: '无权作废' }, 'PATCH', 403);
  }
  for (const note of [undefined, '', ' ', '一', ' 一 ', '😀']) {
    await call(`/work-orders/${order.id}/status`, owner, { status: 'CANCELLED', note }, 'PATCH', 400);
  }
  await call(`/work-orders/${order.id}/status`, owner, { status: 'CANCELLED', note: '长'.repeat(2001) }, 'PATCH', 400);
  assert.deepEqual(await snapshot(order.id), before, 'Rejected requests must not write anything');
  const cancelled = await call(`/work-orders/${order.id}/status`, owner, { status: 'CANCELLED', note: '  重复建单  ' }, 'PATCH');
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.acceptanceNote, '重复建单');
  assert.ok(cancelled.records.some((r) => r.authorId === (cancelled.logs.find((l) => l.action === 'STATUS_CANCELLED')).actorId && r.note === '工单作废：重复建单'));
  assert.equal(cancelled.logs.find((l) => l.action === 'STATUS_CANCELLED').metadata.note, '重复建单');

  for (const token of [owner, manager, employee, warehouse]) {
    assert.ok(!(await call('/work-orders', token)).some((o) => o.id === order.id), 'Default list must hide voided orders');
  }
  for (const token of [owner, manager]) {
    assert.ok((await call('/work-orders?status=CANCELLED', token)).some((o) => o.id === order.id));
  }
  for (const token of [employee, warehouse, actors.outsider.token]) {
    await call('/work-orders?status=CANCELLED', token, undefined, 'GET', 403);
  }
  await call('/work-orders?status=DELETED', owner, undefined, 'GET', 400);
  await call(`/work-orders/${order.id}`, actors.outsider.token, undefined, 'GET', 403);
  assert.equal((await call(`/work-orders/${order.id}`, employee)).status, 'CANCELLED');
  await call(`/work-orders/${order.id}/status`, owner, { status: 'CANCELLED', note: '重复作废' }, 'PATCH', 400);

  for (const token of [owner, manager, employee]) {
    await call(`/work-orders/${order.id}/records`, token, { note: '作废后不可写入' }, 'POST', 400);
    await upload(order.id, token, 400);
    await call('/inventory/requests', token, material, 'POST', 400);
    for (const status of ['PENDING', 'REPAIRING', 'WAITING_ACCEPTANCE', 'REWORKING', 'COMPLETED']) {
      await call(`/work-orders/${order.id}/status`, token, { status, note: '尝试恢复工单' }, 'PATCH', 400);
    }
  }
  for (const token of [owner, manager]) {
    await call(`/work-orders/${order.id}/participants`, token, { participantIds: [actors.manager.id] }, 'PATCH', 400);
  }
  await call(`/work-orders/${order.id}/participants`, employee, { participantIds: [actors.employee.id] }, 'PATCH', 403);
  await call(`/work-orders/${order.id}/records`, warehouse, { note: '仓管不能写维修记录' }, 'POST', 403);
  for (const status of ['APPROVED', 'REJECTED']) {
    await call(`/inventory/requests/${request.id}/review`, warehouse, { status }, 'POST', 400);
  }
  const after = await snapshot(order.id);
  for (const table of ['work_order_items', 'work_order_participants', 'photos', 'material_requests']) {
    assert.deepEqual(after[table], before[table], `${table} must be retained unchanged`);
  }
  assert.equal(after.repair_records.length, before.repair_records.length + 1);
  assert.equal(after.logs.length, before.logs.length + 1);
  for (const record of before.repair_records) assert.ok(after.repair_records.some((r) => JSON.stringify(r) === JSON.stringify(record)));
  for (const log of before.logs) assert.ok(after.logs.some((l) => JSON.stringify(l) === JSON.stringify(log)));
  const retainedPhoto = await fetch(`http://127.0.0.1:${port}/api/photos/${photo.id}`, { headers: { Authorization: `Bearer ${owner}` } });
  assert.equal(retainedPhoto.status, 200);
  assert.deepEqual(Buffer.from(await retainedPhoto.arrayBuffer()), png);
  assert.deepEqual(readFileSync(join(dir, 'photos', before.photos[0].path)), png);
  const inventory = await call('/inventory', owner);
  assert.equal(inventory.parts[0].quantity, 5);
  assert.equal(inventory.requests.find((r) => r.id === request.id).workOrderStatus, 'CANCELLED');
  assert.equal(inventory.requests.find((r) => r.id === request.id).status, 'PENDING');
  assert.equal((await sql('SELECT status FROM work_orders WHERE id = ?', [order.id]))[0].status, 'CANCELLED');

  // Voiding is an administrative archive action, including for completed orders.
  for (const state of ['PENDING', 'REPAIRING', 'WAITING_ACCEPTANCE', 'REWORKING', 'COMPLETED']) {
    const next = await create();
    if (state !== 'PENDING') {
      await call(`/work-orders/${next.id}/status`, employee, { status: 'REPAIRING' }, 'PATCH');
    }
    if (['WAITING_ACCEPTANCE', 'REWORKING', 'COMPLETED'].includes(state)) {
      await call(`/work-orders/${next.id}/records`, employee, { note: '状态准备记录' }, 'POST', 201);
      await call(`/work-orders/${next.id}/status`, employee, { status: 'WAITING_ACCEPTANCE' }, 'PATCH');
    }
    if (state === 'REWORKING') await call(`/work-orders/${next.id}/status`, owner, { status: 'REWORKING', note: '返工测试' }, 'PATCH');
    if (state === 'COMPLETED') await call(`/work-orders/${next.id}/status`, owner, { status: 'COMPLETED' }, 'PATCH');
    const archived = await call(`/work-orders/${next.id}/status`, manager, { status: 'CANCELLED', note: '主管作废' }, 'PATCH');
    assert.equal(archived.status, 'CANCELLED');
    assert.equal(archived.logs.find((l) => l.action === 'STATUS_CANCELLED').metadata.from, state);
  }
  const visible = await create();
  assert.ok((await call('/work-orders', owner)).some((o) => o.id === visible.id));
  const pending = await call('/work-orders?status=PENDING', owner);
  assert.deepEqual(pending.map((o) => o.id), [visible.id]);
  const concurrent = await Promise.all([owner, manager].map((token) => fetch(`http://127.0.0.1:${port}/api/work-orders/${visible.id}/status`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status: 'CANCELLED', note: '并发作废测试' }),
  })));
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 400]);
  assert.equal((await snapshot(visible.id)).repair_records.length, 1);
  assert.equal((await sql('PRAGMA integrity_check'))[0].integrity_check, 'ok');
  console.log(`PASS ${checks} API checks: owner/manager void, 403 roles, reason validation, hidden defaults, filtered archive, immutable records, all source states, concurrent void.`);
  console.log('PASS SQLite preservation: order, items, participants, photos/files, repair records, material requests, audit history, unchanged stock, integrity=ok.');
  console.log(`Test data: ${dir}`);
}

run().catch((error) => {
  console.error(error);
  console.error(logs.slice(-6000));
  process.exitCode = 1;
}).finally(async () => {
  if (server.exitCode === null) {
    server.kill();
    await new Promise((ok) => server.once('exit', ok));
  }
});
