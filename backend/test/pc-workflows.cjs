const { spawn } = require('node:child_process');
const { mkdirSync, mkdtempSync } = require('node:fs');
const { resolve, join } = require('node:path');
const assert = require('node:assert/strict');

const root = resolve(__dirname, '../..');
mkdirSync(join(root, 'tmp'), { recursive: true });
const dir = mkdtempSync(join(root, 'tmp', 'pc-check-'));
const port = 3118;
let logs = '';
const server = spawn(process.execPath, ['dist/main.js'], {
  cwd: resolve(__dirname, '..'),
  env: { ...process.env, DATABASE_PATH: join(dir, 'test.sqlite'), UPLOAD_DIR: join(dir, 'photos'), API_PORT: String(port), JWT_SECRET: 'integration-test-secret-32-characters', NODE_ENV: 'test' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stdout.on('data', (chunk) => { logs += chunk; });
server.stderr.on('data', (chunk) => { logs += chunk; });
let checks = 0;
async function call(path, token, body, method = body === undefined ? 'GET' : 'POST', expected = 200) {
  const r = await fetch(`http://127.0.0.1:${port}/api${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  assert.equal(r.status, expected, `${method} ${path}: ${JSON.stringify(data)}`);
  checks++;
  return data;
}
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function ready() {
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try { const r = await fetch(`http://127.0.0.1:${port}/api/auth/me`); if (r.status === 401) return; } catch {}
    await pause(100);
  }
  throw new Error(`Server did not start:\n${logs}`);
}
async function login(username) {
  return call('/auth/login', null, { username, password: 'Admin@123' }, 'POST', 201);
}
async function run() {
  await ready();
  const admin = await login('admin');
  const owner = admin.accessToken;
  const a = await call('/users', owner, { username: 'mechanic_a', name: '张师傅', role: 'EMPLOYEE', password: 'Admin@123' }, 'POST', 201);
  const b = await call('/users', owner, { username: 'mechanic_b', name: '李师傅', role: 'EMPLOYEE', password: 'Admin@123' }, 'POST', 201);
  await call('/users', owner, { username: 'storekeeper', name: '仓库管理员', role: 'WAREHOUSE', password: 'Admin@123' }, 'POST', 201);
  const employee = (await login('mechanic_a')).accessToken;
  const outsider = (await login('mechanic_b')).accessToken;
  const warehouse = (await login('storekeeper')).accessToken;
  await call('/work-orders', null, undefined, 'GET', 401);
  await call('/users', employee, { username: 'illegal', name: 'illegal', role: 'OWNER', password: 'Admin@123' }, 'POST', 403);
  const vehicle = await call('/vehicles', owner, { plateNumber: '沪A·验收01', brand: '丰田', model: '凯美瑞', vin: 'TESTVIN20260001', customerName: '测试客户', customerPhone: '测试数据' }, 'POST', 201);
  const order = await call('/work-orders', owner, { vehicleId: vehicle.id, customerRequest: '制动异响检查与保养', itemTitles: ['检查制动片', '制动液检查'], participantIds: [a.id] }, 'POST', 201);
  assert.ok(!JSON.stringify(order).includes('passwordHash'));
  await call(`/work-orders/${order.id}`, outsider, undefined, 'GET', 403);
  assert.equal((await call('/work-orders', outsider)).length, 0);
  assert.equal((await call('/vehicles', outsider)).length, 0);
  await call('/work-orders', outsider, { vehicleId: vehicle.id, customerRequest: '越权创建工单', itemTitles: ['检查'] }, 'POST', 403);
  const ownVehicle = await call('/vehicles', employee, { plateNumber: '沪A·员工接车' }, 'POST', 201);
  assert.ok((await call('/vehicles', employee)).some((v) => v.id === ownVehicle.id));
  await call(`/work-orders/${order.id}/status`, warehouse, { status: 'REPAIRING' }, 'PATCH', 403);
  await call(`/work-orders/${order.id}/participants`, employee, { participantIds: [a.id, b.id] }, 'PATCH', 403);
  await call(`/work-orders/${order.id}/participants`, owner, { participantIds: [a.id, b.id] }, 'PATCH');
  await call(`/work-orders/${order.id}/participants`, owner, { participantIds: [a.id] }, 'PATCH');
  await call(`/work-orders/${order.id}`, outsider, undefined, 'GET', 403);
  await call(`/work-orders/${order.id}/status`, employee, { status: 'COMPLETED' }, 'PATCH', 400);
  await call(`/work-orders/${order.id}/status`, employee, { status: 'REPAIRING' }, 'PATCH');
  await call(`/work-orders/${order.id}/status`, employee, { status: 'WAITING_ACCEPTANCE' }, 'PATCH', 400);
  await call(`/work-orders/${order.id}/records`, employee, { note: '检查确认前制动片磨损，建议更换。' }, 'POST', 201);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const upload = await fetch(`http://127.0.0.1:${port}/api/work-orders/${order.id}/photos/BEFORE`, { method: 'POST', headers: { Authorization: `Bearer ${employee}`, 'Content-Type': 'image/png' }, body: png });
  assert.equal(upload.status, 201, await upload.clone().text()); checks++;
  const photo = await upload.json();
  const deniedPhoto = await fetch(`http://127.0.0.1:${port}/api/photos/${photo.id}`, { headers: { Authorization: `Bearer ${outsider}` } });
  assert.equal(deniedPhoto.status, 403); checks++;
  const validPhoto = await fetch(`http://127.0.0.1:${port}/api/photos/${photo.id}`, { headers: { Authorization: `Bearer ${employee}` } });
  assert.equal(validPhoto.status, 200); assert.deepEqual(Buffer.from(await validPhoto.arrayBuffer()), png); checks++;
  const tooLarge = await fetch(`http://127.0.0.1:${port}/api/work-orders/${order.id}/photos/BEFORE`, { method: 'POST', headers: { Authorization: `Bearer ${employee}`, 'Content-Type': 'image/png' }, body: Buffer.alloc(2 * 1024 ** 2 + 1) });
  assert.equal(tooLarge.status, 413); checks++;
  const part = await call('/inventory/parts', warehouse, { code: 'BP-001', name: '前制动片', specification: '标准型', unit: '套' }, 'POST', 201);
  await call('/inventory/incoming', employee, { partId: part.id, quantity: 10, note: '违规入库' }, 'POST', 403);
  await call('/inventory/incoming', warehouse, { partId: part.id, quantity: -1, note: '负数测试' }, 'POST', 400);
  await call('/inventory/incoming', warehouse, { partId: part.id, quantity: 10, note: '采购入库测试单' }, 'POST', 201);
  const request = await call('/inventory/requests', employee, { partId: part.id, workOrderId: order.id, quantity: 2, type: 'OUT', note: '更换前制动片' }, 'POST', 201);
  await call(`/inventory/requests/${request.id}/review`, employee, { status: 'APPROVED' }, 'POST', 403);
  const results = await Promise.all([1, 2].map(() => fetch(`http://127.0.0.1:${port}/api/inventory/requests/${request.id}/review`, { method: 'POST', headers: { Authorization: `Bearer ${warehouse}`, 'Content-Type': 'application/json' }, body: '{"status":"APPROVED"}' })));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 400]); checks++;
  assert.equal((await call('/inventory', owner)).parts[0].quantity, 8);
  const excessive = await call('/inventory/requests', employee, { partId: part.id, workOrderId: order.id, quantity: 20, type: 'OUT', note: '库存不足测试' }, 'POST', 201);
  await call(`/inventory/requests/${excessive.id}/review`, warehouse, { status: 'APPROVED' }, 'POST', 400);
  await call(`/inventory/requests/${excessive.id}/review`, warehouse, { status: 'REJECTED' }, 'POST', 201);
  const tooMany = await call('/inventory/requests', employee, { partId: part.id, workOrderId: order.id, quantity: 3, type: 'RETURN', note: '超额退料测试' }, 'POST', 201);
  await call(`/inventory/requests/${tooMany.id}/review`, warehouse, { status: 'APPROVED' }, 'POST', 400);
  await call(`/inventory/requests/${tooMany.id}/review`, warehouse, { status: 'REJECTED' }, 'POST', 201);
  const returned = await call('/inventory/requests', employee, { partId: part.id, workOrderId: order.id, quantity: 1, type: 'RETURN', note: '未使用的备件退回' }, 'POST', 201);
  await call(`/inventory/requests/${returned.id}/review`, warehouse, { status: 'APPROVED' }, 'POST', 201);
  assert.equal((await call('/inventory', owner)).parts[0].quantity, 9);
  await call(`/work-orders/${order.id}/status`, employee, { status: 'WAITING_ACCEPTANCE' }, 'PATCH');
  await call(`/work-orders/${order.id}/status`, employee, { status: 'COMPLETED' }, 'PATCH', 403);
  await call(`/work-orders/${order.id}/status`, owner, { status: 'REWORKING' }, 'PATCH', 400);
  await call(`/work-orders/${order.id}/status`, owner, { status: 'REWORKING', note: '请复核制动液液位' }, 'PATCH');
  await call(`/work-orders/${order.id}/records`, employee, { note: '已复核制动液液位并完成路试。' }, 'POST', 201);
  await call(`/work-orders/${order.id}/status`, employee, { status: 'WAITING_ACCEPTANCE' }, 'PATCH');
  await call(`/work-orders/${order.id}/status`, owner, { status: 'COMPLETED' }, 'PATCH');
  await call(`/work-orders/${order.id}/records`, employee, { note: '关闭后违规写入' }, 'POST', 400);
  await call(`/users/${a.id}/active`, owner, { isActive: false }, 'PATCH');
  await call('/work-orders', employee, undefined, 'GET', 401);
  await call(`/users/${a.id}/active`, owner, { isActive: true }, 'PATCH');
  const detail = await call(`/work-orders/${order.id}`, owner);
  assert.equal(detail.records.length, 2);
  assert.equal(detail.records[0].authorName, '张师傅');
  assert.ok(detail.logs.some((l) => l.actorName === '仓库管理员'));
  assert.equal(detail.photos.length, 1);
  assert.ok(detail.logs.length >= 15);
  const sqlite3 = require('sqlite3');
  await new Promise((ok, fail) => { const db = new sqlite3.Database(join(dir, 'test.sqlite')); db.get('PRAGMA journal_mode', (err, row) => { if (err) return fail(err); try { assert.equal(row.journal_mode, 'wal'); checks++; db.close(ok); } catch (e) { db.close(); fail(e); } }); });
  console.log(`PASS ${checks} checks: role boundaries, order workflow, photos, stock transactions, concurrent approval, WAL.`);
  console.log(`Test data: ${dir}`);
}
run().catch((e) => { console.error(e); console.error(logs.slice(-6000)); process.exitCode = 1; }).finally(() => server.kill());
