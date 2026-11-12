import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { CarFront, ClipboardList, LogOut, Plus, Search, ShieldCheck, Wrench } from 'lucide-react';

const API = import.meta.env.VITE_API_BASE_URL || '/api';
type User = { id: string; name: string; username: string; role: string };
type Vehicle = { id: string; plateNumber: string; vin?: string; brand?: string; model?: string; customerName?: string };
type Order = { id: string; orderNo: string; vehicleId: string; status: string; customerRequest: string; vehicle?: Vehicle; items: { title: string }[] };

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('autofix_token');
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || '请求失败');
  return response.json();
}

export function App() {
  const [user, setUser] = useState<User | null>(() => JSON.parse(localStorage.getItem('autofix_user') || 'null'));
  const [tab, setTab] = useState<'overview' | 'vehicles' | 'orders'>('overview');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      const [vehicleData, orderData] = await Promise.all([request<Vehicle[]>('/vehicles'), request<Order[]>('/work-orders')]);
      setVehicles(vehicleData);
      setOrders(orderData);
    } catch (e) {
      setError(e instanceof Error ? e.message : '数据加载失败');
    }
  };

  useEffect(() => { if (user) void loadData(); }, [user]);

  if (!user) return <Login onLogin={(result) => { setUser(result.user); localStorage.setItem('autofix_token', result.accessToken); localStorage.setItem('autofix_user', JSON.stringify(result.user)); }} />;

  const pending = orders.filter((order) => order.status === 'PENDING').length;
  const repairing = orders.filter((order) => order.status === 'REPAIRING').length;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Wrench size={19} /></div><div><strong>车匠云修</strong><span>AutoFix Workshop</span></div></div>
        <nav>
          <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}><ShieldCheck size={17} />工作台</button>
          <button className={tab === 'vehicles' ? 'active' : ''} onClick={() => setTab('vehicles')}><CarFront size={17} />车辆档案</button>
          <button className={tab === 'orders' ? 'active' : ''} onClick={() => setTab('orders')}><ClipboardList size={17} />工单管理</button>
        </nav>
        <button className="logout" onClick={() => { localStorage.clear(); setUser(null); }}><LogOut size={16} />退出登录</button>
      </aside>
      <main className="content">
        <header><div><p className="eyebrow">维修厂管理后台</p><h1>{tab === 'overview' ? '工作台' : tab === 'vehicles' ? '车辆档案' : '工单管理'}</h1></div><div className="user-chip"><span>{user.name}</span><small>{user.role}</small></div></header>
        {error && <div className="error-banner">{error}</div>}
        {tab === 'overview' && <Overview orders={orders} pending={pending} repairing={repairing} />}
        {tab === 'vehicles' && <VehicleList vehicles={vehicles} onCreated={loadData} />}
        {tab === 'orders' && <OrderList orders={orders} vehicles={vehicles} onCreated={loadData} />}
      </main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (result: { accessToken: string; user: User }) => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState('');
  return <div className="login-page"><div className="login-panel"><div className="brand large"><div className="brand-mark"><Wrench size={22} /></div><div><strong>车匠云修</strong><span>AutoFix Workshop</span></div></div><h1>登录管理后台</h1><p className="muted">管理车辆、工单和维修协作</p><form onSubmit={async (event) => { event.preventDefault(); try { onLogin(await request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })); } catch (e) { setError(e instanceof Error ? e.message : '登录失败'); } }}><label>用户名<input value={username} onChange={(e) => setUsername(e.target.value)} /></label><label>密码<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>{error && <p className="form-error">{error}</p>}<button className="primary full">登录</button></form><small className="login-hint">首次部署默认账号：admin / Admin@123</small></div></div>;
}

function Overview({ orders, pending, repairing }: { orders: Order[]; pending: number; repairing: number }) {
  return <><section className="metric-grid"><Metric label="全部工单" value={orders.length} icon={<ClipboardList />} /><Metric label="待处理" value={pending} icon={<ShieldCheck />} /><Metric label="维修中" value={repairing} icon={<Wrench />} /></section><section className="panel"><div className="panel-heading"><div><h2>最近工单</h2><p>按最新接车顺序显示</p></div></div><OrderRows orders={orders.slice(0, 8)} /></section></>;
}

function Metric({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return <div className="metric"><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong></div></div>;
}

function VehicleList({ vehicles, onCreated }: { vehicles: Vehicle[]; onCreated: () => void }) {
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const filtered = useMemo(() => vehicles.filter((vehicle) => `${vehicle.plateNumber}${vehicle.vin || ''}${vehicle.customerName || ''}`.includes(query)), [vehicles, query]);
  return <><div className="toolbar"><div className="search"><Search size={17} /><input placeholder="搜索车牌、VIN 或客户" value={query} onChange={(e) => setQuery(e.target.value)} /></div><button className="primary" onClick={() => setShowForm(true)}><Plus size={16} />新建车辆</button></div>{showForm && <VehicleForm onDone={() => { setShowForm(false); onCreated(); }} />}<section className="panel table-panel"><table><thead><tr><th>车牌号</th><th>VIN</th><th>车型</th><th>客户</th></tr></thead><tbody>{filtered.map((vehicle) => <tr key={vehicle.id}><td><strong>{vehicle.plateNumber}</strong></td><td>{vehicle.vin || '-'}</td><td>{[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '-'}</td><td>{vehicle.customerName || '-'}</td></tr>)}</tbody></table></section></>;
}

function VehicleForm({ onDone }: { onDone: () => void }) {
  const [plateNumber, setPlateNumber] = useState('');
  const [vin, setVin] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  return <section className="panel form-panel"><div className="panel-heading"><h2>新建车辆</h2></div><form className="form-grid" onSubmit={async (event) => { event.preventDefault(); await request('/vehicles', { method: 'POST', body: JSON.stringify({ plateNumber, vin, brand, model }) }); onDone(); }}><label>车牌号<input required value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} /></label><label>VIN<input value={vin} onChange={(e) => setVin(e.target.value)} /></label><label>品牌<input value={brand} onChange={(e) => setBrand(e.target.value)} /></label><label>车型<input value={model} onChange={(e) => setModel(e.target.value)} /></label><div className="form-actions"><button type="button" onClick={onDone}>取消</button><button className="primary">保存车辆</button></div></form></section>;
}

function OrderList({ orders, vehicles, onCreated }: { orders: Order[]; vehicles: Vehicle[]; onCreated: () => void }) {
  const [showForm, setShowForm] = useState(false);
  return <><div className="toolbar"><div><h2 className="section-title">维修工单</h2><p className="muted">每次进厂建立独立工单</p></div><button className="primary" onClick={() => setShowForm(true)}><Plus size={16} />接车建单</button></div>{showForm && <OrderForm vehicles={vehicles} onDone={() => { setShowForm(false); onCreated(); }} />}<section className="panel table-panel"><OrderRows orders={orders} /></section></>;
}

function OrderRows({ orders }: { orders: Order[] }) {
  return <table><thead><tr><th>工单号</th><th>车辆</th><th>维修需求</th><th>项目</th><th>状态</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.orderNo}</strong></td><td>{order.vehicle?.plateNumber || order.vehicleId || '-'}</td><td>{order.customerRequest}</td><td>{order.items?.map((item) => item.title).join('、') || '-'}</td><td><span className={`status ${order.status.toLowerCase()}`}>{statusLabel(order.status)}</span></td></tr>)}</tbody></table>;
}

function OrderForm({ vehicles, onDone }: { vehicles: Vehicle[]; onDone: () => void }) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || '');
  const [customerRequest, setCustomerRequest] = useState('');
  const [itemTitles, setItemTitles] = useState('发动机检查');
  return <section className="panel form-panel"><div className="panel-heading"><h2>接车建单</h2></div><form onSubmit={async (event) => { event.preventDefault(); await request('/work-orders', { method: 'POST', body: JSON.stringify({ vehicleId, customerRequest, itemTitles: itemTitles.split(/[,，]/).map((item) => item.trim()).filter(Boolean) }) }); onDone(); }}><div className="form-grid"><label>车辆<select required value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNumber} {vehicle.brand || ''} {vehicle.model || ''}</option>)}</select></label><label>维修项目（逗号分隔）<input required value={itemTitles} onChange={(e) => setItemTitles(e.target.value)} /></label></div><label>客户维修需求<textarea required value={customerRequest} onChange={(e) => setCustomerRequest(e.target.value)} /></label><div className="form-actions"><button type="button" onClick={onDone}>取消</button><button className="primary">创建工单</button></div></form></section>;
}

function statusLabel(status: string) {
  return ({ PENDING: '待处理', REPAIRING: '维修中', WAITING_ACCEPTANCE: '待验收', COMPLETED: '已完成', REWORKING: '返工中', CANCELLED: '已取消' } as Record<string, string>)[status] || status;
}

