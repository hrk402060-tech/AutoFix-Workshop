const { spawn } = require('node:child_process');
const { mkdtempSync, mkdirSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const sqlite3 = require('sqlite3');

const root = resolve(__dirname, '../../tmp');
mkdirSync(root, { recursive: true });
const dir = mkdtempSync(join(root, 'parts-check-'));
const port = 3120;
let logs = '';
let checks = 0;
const server = spawn(process.execPath, ['dist/main.js'], {
  cwd: resolve(__dirname, '..'),
  env: {
    ...process.env, DATABASE_PATH: join(dir, 'test.sqlite'), UPLOAD_DIR: join(dir, 'photos'),
    API_PORT: String(port), JWT_SECRET: 'parts-test-secret-32-characters-long', NODE_ENV: 'test',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (chunk) => { logs += chunk; });
server.stderr.on('data', (chunk) => { logs += chunk; });

async function sql(query, params = []) {
  const db = new sqlite3.Database(join(dir, 'test.sqlite'));
  try {
    return await new Promise((ok, fail) => db.all(query, params, (error, rows) => error ? fail(error) : ok(rows)));
  } finally { await new Promise((ok, fail) => db.close((error) => error ? fail(error) : ok())); }
}
async function call(path, token, body, method = body === undefined ? 'GET' : 'POST', expected = 200) {
  const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
    method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  checks++;
  return data;
}

async function run() {
  let started = false;
  for (let i = 0; i < 300; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/auth/me`)).status === 401) { started = true; break; }
    } catch {}
    await new Promise((ok) => setTimeout(ok, 100));
  }
  assert.ok(started, logs);
  const owner = (await call('/auth/login', null, { username: 'admin', password: 'Admin@123' }, 'POST', 201)).accessToken;
  const actors = {};
  for (const [username, role] of [['manager', 'MANAGER'], ['warehouse', 'WAREHOUSE'], ['employee', 'EMPLOYEE']]) {
    const user = await call('/users', owner, { username, name: username, role, password: 'Admin@123' }, 'POST', 201);
    const login = await call('/auth/login', null, { username, password: 'Admin@123' }, 'POST', 201);
    actors[username] = { ...user, token: login.accessToken };
  }
  const manager = actors.manager.token;
  const warehouse = actors.warehouse.token;
  const employee = actors.employee.token;
  let number = 0;
  const part = (token = owner) => call('/inventory/parts', token, { code: `PART-${++number}`, name: `验收零件${number}`, specification: '测试', unit: '件' }, 'POST', 201);
  const incoming = (p, quantity = 10) => call('/inventory/incoming', warehouse, { partId: p.id, quantity, note: '测试采购入库' }, 'POST', 201);
  const activeBody = (isActive) => ({ isActive, note: isActive ? '测试恢复使用' : '测试归档' });
  const active = (p, isActive, token = owner, expected = 200) => call(`/inventory/parts/${p.id}/active`, token, activeBody(isActive), 'PATCH', expected);
  const outgoing = (p, type, quantity, token = warehouse, expected = 201, operationId = randomUUID(), note = '测试库存退出') =>
    call('/inventory/outgoing', token, { partId: p.id, type, quantity, note, operationId }, 'POST', expected);
  const current = async (p) => (await sql('SELECT * FROM parts WHERE id = ?', [p.id]))[0];
  const stock = await part();
  await incoming(stock);
  const empty = await part();
  await call('/inventory/outgoing', null, { partId: stock.id, type: 'SCRAP', quantity: 1, note: '未登录测试', operationId: randomUUID() }, 'POST', 401);

  for (const token of [employee, warehouse]) {
    await active(empty, false, token, 403);
    await active(empty, true, token, 403);
  }
  for (const type of ['PURCHASE_RETURN', 'SCRAP']) {
    await outgoing(stock, type, 1, employee, 403);
    for (const quantity of [0, -1, 1.5, '1', 100001]) await outgoing(stock, type, quantity, warehouse, 400);
    for (const note of ['', ' ', '一', ' 一 ']) await outgoing(stock, type, 1, warehouse, 400, randomUUID(), note);
    await outgoing(stock, type, 11, warehouse, 400);
  }
  await outgoing(stock, 'OUT', 1, warehouse, 400);
  await outgoing(stock, 'SCRAP', 1, warehouse, 400, undefined, '过'.repeat(501));
  await call('/inventory/outgoing', warehouse, { partId: stock.id, type: 'SCRAP', quantity: 1, note: '缺操作编号' }, 'POST', 400);
  assert.equal((await current(stock)).quantity, 10);
  assert.equal((await sql('SELECT count(*) AS n FROM stock_transactions WHERE partId=?', [stock.id]))[0].n, 1);
  assert.match((await active(stock, false, owner, 400)).message, /不可归档.*退货.*报废/);
  assert.equal((await current(stock)).quantity, 10);
  for (const note of ['', ' ', '一']) {
    await call(`/inventory/parts/${empty.id}/active`, owner, { isActive: false, note }, 'PATCH', 400);
  }
  await active(empty, false, manager);
  assert.equal((await current(empty)).quantity, 0);
  assert.match((await active(empty, false, owner, 400)).message, /已归档/);
  // The old physical-delete route must be unavailable even for an unused part.
  for (const token of [owner, manager, warehouse, employee]) {
    await call(`/inventory/parts/${empty.id}`, token, { confirmed: true, confirmCode: empty.code, note: '旧接口不可用验证' }, 'DELETE', 404);
  }
  assert.ok(await current(empty));
  for (const token of [owner, manager, employee, warehouse]) {
    assert.ok(!(await call('/inventory', token)).parts.some((p) => p.id === empty.id));
  }
  for (const token of [owner, manager]) {
    assert.ok((await call('/inventory?parts=inactive', token)).parts.some((p) => p.id === empty.id));
    assert.ok((await call('/inventory?parts=all', token)).parts.some((p) => p.id === empty.id));
  }
  for (const token of [warehouse, employee]) {
    await call('/inventory?parts=inactive', token, undefined, 'GET', 403);
    await call('/inventory?parts=all', token, undefined, 'GET', 403);
  }
  await call('/inventory?parts=invalid', owner, undefined, 'GET', 400);
  assert.match((await call('/inventory/incoming', warehouse, { partId: empty.id, quantity: 1, note: '归档禁止入库' }, 'POST', 400)).message, /已归档/);
  for (const type of ['PURCHASE_RETURN', 'SCRAP']) await outgoing(empty, type, 1, warehouse, 400);
  await active(empty, true, owner);
  assert.equal((await current(empty)).quantity, 0);
  const returnOperation = randomUUID();
  const first = await outgoing(stock, 'PURCHASE_RETURN', 3, warehouse, 201, returnOperation);
  const replay = await outgoing(stock, 'PURCHASE_RETURN', 3, warehouse, 201, returnOperation);
  assert.equal(replay.id, first.id);
  assert.equal((await current(stock)).quantity, 7);
  await outgoing(stock, 'SCRAP', 3, warehouse, 409, returnOperation);
  await outgoing(stock, 'PURCHASE_RETURN', 2, warehouse, 409, returnOperation);
  await outgoing(stock, 'PURCHASE_RETURN', 3, manager, 409, returnOperation);
  await outgoing(stock, 'PURCHASE_RETURN', 3, warehouse, 409, returnOperation, '变更原因');
  const scrapOperation = randomUUID();
  const duplicate = await Promise.all([1, 2, 3].map(() => outgoing(stock, 'SCRAP', 2, manager, 201, scrapOperation)));
  assert.equal(new Set(duplicate.map((t) => t.id)).size, 1);
  assert.equal((await current(stock)).quantity, 5);
  const ownerOut = await outgoing(stock, 'SCRAP', 1, owner);
  assert.equal((await current(stock)).quantity, 4);
  assert.ok(ownerOut.actorId);
  const race = await Promise.all(['SCRAP', 'PURCHASE_RETURN'].map((type) => fetch(`http://127.0.0.1:${port}/api/inventory/outgoing`, {
    method: 'POST', headers: { Authorization: `Bearer ${warehouse}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ partId: stock.id, quantity: 3, type, note: '并发出库测试', operationId: randomUUID() }),
  })));
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 400]); checks++;
  assert.equal((await current(stock)).quantity, 1);
  await outgoing(stock, 'SCRAP', 1);
  const stockHistory = await sql('SELECT * FROM stock_transactions WHERE partId=? ORDER BY id', [stock.id]);
  await active(stock, false, manager);
  const historical = await call('/inventory?parts=inactive', owner);
  const retained = historical.parts.find((p) => p.id === stock.id);
  assert.equal(retained.isActive, false);
  assert.equal(retained.quantity, 0);
  assert.ok(!('canDelete' in retained) && !('deleteBlockedReason' in retained));
  assert.ok(historical.transactions.some((t) => t.partId === stock.id && t.partName === stock.name && t.actorName === 'warehouse' && t.createdAt));
  const stockCount = (await sql('SELECT count(*) AS n FROM stock_transactions WHERE partId=?', [stock.id]))[0].n;
  await outgoing(stock, 'PURCHASE_RETURN', 3, warehouse, 201, returnOperation);
  assert.equal((await sql('SELECT count(*) AS n FROM stock_transactions WHERE partId=?', [stock.id]))[0].n, stockCount);
  await active(stock, true, owner);
  assert.equal((await current(stock)).quantity, 0);
  assert.deepEqual(await sql('SELECT * FROM stock_transactions WHERE partId=? ORDER BY id', [stock.id]), stockHistory);

  const vehicle = await call('/vehicles', owner, { plateNumber: '库存退出验收' }, 'POST', 201);
  const order = await call('/work-orders', owner, { vehicleId: vehicle.id, customerRequest: '用料引用验证', itemTitles: ['用料测试'], participantIds: [actors.employee.id] }, 'POST', 201);
  const requestBody = (p, type = 'OUT', quantity = 1) => ({ partId: p.id, workOrderId: order.id, type, quantity, note: '测试物料申请' });
  await active(empty, false);
  for (const type of ['OUT', 'RETURN']) await call('/inventory/requests', employee, requestBody(empty, type), 'POST', 400);
  for (const type of ['OUT', 'RETURN']) {
    const referenced = await part();
    const request = await call('/inventory/requests', employee, requestBody(referenced, type), 'POST', 201);
    assert.match((await active(referenced, false, owner, 400)).message, /待审批/);
    assert.equal((await current(referenced)).isActive, 1);
    const listed = (await call('/inventory?parts=all', owner)).parts.find((p) => p.id === referenced.id);
    assert.equal(listed.hasPendingRequests, true);
    // Archived legacy requests can be rejected without restoring the part or moving stock.
    await sql('UPDATE parts SET isActive=0 WHERE id=?', [referenced.id]);
    await call(`/inventory/requests/${request.id}/review`, warehouse, { status: 'APPROVED' }, 'POST', 400);
    await call(`/inventory/requests/${request.id}/review`, warehouse, { status: 'REJECTED' }, 'POST', 201);
    assert.equal((await current(referenced)).isActive, 0);
    assert.equal((await current(referenced)).quantity, 0);
    assert.ok((await call('/inventory', employee)).requests.some((r) => r.id === request.id && r.partName === referenced.name && r.partActive === false));
  }
  const mixed = await part();
  await incoming(mixed, 1);
  const pending = await call('/inventory/requests', employee, requestBody(mixed), 'POST', 201);
  const competing = await Promise.all([
    fetch(`http://127.0.0.1:${port}/api/inventory/outgoing`, {
      method: 'POST', headers: { Authorization: `Bearer ${warehouse}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ partId: mixed.id, type: 'SCRAP', quantity: 1, note: '并发混合出库', operationId: randomUUID() }),
    }),
    fetch(`http://127.0.0.1:${port}/api/inventory/requests/${pending.id}/review`, {
      method: 'POST', headers: { Authorization: `Bearer ${warehouse}`, 'Content-Type': 'application/json' }, body: '{"status":"APPROVED"}',
    }),
  ]);
  assert.deepEqual(competing.map((r) => r.status).sort(), [201, 400]); checks++;
  assert.equal((await current(mixed)).quantity, 0);

  const used = await part();
  await incoming(used, 2);
  for (const type of ['OUT', 'RETURN']) {
    const request = await call('/inventory/requests', employee, requestBody(used, type, 2), 'POST', 201);
    await call(`/inventory/requests/${request.id}/review`, warehouse, { status: 'APPROVED' }, 'POST', 201);
  }
  await outgoing(used, 'PURCHASE_RETURN', 2);
  const materialHistory = await sql('SELECT * FROM material_requests WHERE partId=? ORDER BY id', [used.id]);
  const usedStockHistory = await sql('SELECT * FROM stock_transactions WHERE partId=? ORDER BY id', [used.id]);
  // Historical audit entries are retained; no historical parts need to be recreated.
  const legacyAuditId = randomUUID();
  await sql('INSERT INTO audit_logs (id,actorId,action,resource,resourceId,metadata) VALUES (?,?,?,?,?,?)',
    [legacyAuditId, actors.manager.id, 'DELETE_UNUSED_PART', 'part', randomUUID(), JSON.stringify({ code: 'LEGACY-DELETED', note: '历史审计保留' })]);
  const legacyAudit = await sql('SELECT * FROM audit_logs WHERE id=?', [legacyAuditId]);
  await active(used, false, manager);
  const archivedHistory = await call('/inventory?parts=inactive', owner);
  assert.ok(archivedHistory.parts.some((p) => p.id === used.id && !p.isActive));
  assert.equal(archivedHistory.requests.filter((r) => r.partId === used.id && r.partName === used.name && r.partCode === used.code && r.status === 'APPROVED').length, 2);
  assert.equal(archivedHistory.transactions.filter((t) => t.partId === used.id && t.partName === used.name && t.partCode === used.code).length, usedStockHistory.length);
  await active(used, true);
  assert.equal((await current(used)).quantity, 0);
  assert.deepEqual(await sql('SELECT * FROM material_requests WHERE partId=? ORDER BY id', [used.id]), materialHistory);
  assert.deepEqual(await sql('SELECT * FROM stock_transactions WHERE partId=? ORDER BY id', [used.id]), usedStockHistory);
  assert.deepEqual(await sql('SELECT * FROM audit_logs WHERE id=?', [legacyAuditId]), legacyAudit);
  const archiveLogs = await sql("SELECT * FROM audit_logs WHERE resourceId=? AND action='ARCHIVE_PART'", [used.id]);
  assert.equal(archiveLogs.length, 1);
  assert.equal(archiveLogs[0].actorId, actors.manager.id);
  assert.equal(JSON.parse(archiveLogs[0].metadata).note, '测试归档');
  assert.equal((await sql("SELECT count(*) AS n FROM audit_logs WHERE resourceId=? AND action='RESTORE_PART'", [used.id]))[0].n, 1);
  for (const token of [owner, manager, warehouse, employee]) {
    await call(`/inventory/parts/${used.id}`, token, undefined, 'DELETE', 404);
  }
  assert.equal((await sql('SELECT count(*) AS n FROM parts'))[0].n, number);
  const outgoingRows = await sql("SELECT * FROM stock_transactions WHERE type IN ('SCRAP','PURCHASE_RETURN')");
  assert.ok(outgoingRows.every((row) => row.quantity > 0 && row.operationId && row.actorId && row.createdAt && row.note.trim().length >= 2));
  assert.equal((await sql('SELECT count(*) AS n FROM parts WHERE quantity < 0'))[0].n, 0);
  assert.equal((await sql('PRAGMA integrity_check'))[0].integrity_check, 'ok');
  assert.deepEqual(await sql('PRAGMA foreign_key_check'), []);
  console.log(`PASS ${checks} API checks: archive/restore permissions and filtering, pending/stock guards, preserved history, removed DELETE route, idempotent and concurrent stock-out, archived approval denial and rejection cleanup.`);
  console.log('PASS SQLite: all parts retained; unchanged material/stock history; archive/restore audits and legacy deletion audits preserved; no negative stock; integrity/FK checks.');
  console.log(`Test data: ${dir}`);
}
run().catch((error) => { console.error(error); console.error(logs.slice(-6000)); process.exitCode = 1; }).finally(async () => {
  if (server.exitCode === null) { server.kill(); await new Promise((ok) => server.once('exit', ok)); }
});
