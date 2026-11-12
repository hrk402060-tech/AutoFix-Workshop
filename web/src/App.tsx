import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BarChart3, Bell, CarFront, ClipboardCheck, ClipboardList, FileBarChart, Gauge,
  LayoutDashboard, LogOut, Package, Plus, Search, Settings2, ShieldCheck, Users, Wrench,
} from 'lucide-react';

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

const navItems = [
  { key: 'overview', label: '管理工作台', icon: LayoutDashboard },
  { key: 'orders', label: '工单中心', icon: ClipboardList },
  { key: 'vehicles', label: '车辆档案', icon: CarFront },
  { key: 'staff', label: '员工进度', icon: Users },
  { key: 'inventory', label: '零件与仓库', icon: Package },
  { key: 'reports', label: '统计报表', icon: FileBarChart },
];

export function App() {
  const [user, setUser] = useState<User | null>(() => JSON.parse(localStorage.getItem('autofix_user') || 'null'));
  const [tab, setTab] = useState('overview');
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');

  const loadData = async () => {
    try {
      setError('');
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
  const waiting = orders.filter((order) => order.status === 'WAITING_ACCEPTANCE').length;

  return (
    <div className="workshop-shell">
      <aside className="workshop-sidebar">
        <div className="sidebar-brand"><div className="brand-mark"><Wrench size={18} /></div><div><strong>车匠云修</strong><span>AutoFix Workshop</span></div></div>
        <div className="sidebar-caption">维修厂管理系统</div>
        <nav className="main-nav">{navItems.map((item) => { const Icon = item.icon; return <button key={item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}><Icon size={17} /><span>{item.label}</span>{item.key === 'orders' && pending > 0 && <b>{pending}</b>}</button>; })}</nav>
        <div className="sidebar-footer"><button><Settings2 size={16} />系统设置</button><button className="logout" onClick={() => { localStorage.clear(); setUser(null); }}><LogOut size={16} />退出登录</button></div>
      </aside>
      <div className="workspace">
        <header className="topbar"><div className="topbar-title"><span className="topbar-dot" /><span>车匠云修管理后台</span><small>单店版 · 轻量部署</small></div><div className="topbar-actions"><button className="icon-button" title="通知"><Bell size={17} /><i /></button><div className="account"><span className="avatar">{user.name.slice(0, 1)}</span><div><strong>{user.name}</strong><small>{roleLabel(user.role)}</small></div></div></div></header>
        <main className="main-content">
          <div className="page-heading"><div><span className="breadcrumb">管理端 / {navItems.find((item) => item.key === tab)?.label}</span><h1>{navItems.find((item) => item.key === tab)?.label}</h1></div><div className="page-date">今日 · {new Date().toLocaleDateString('zh-CN')}</div></div>
          {error && <div className="error-banner">{error}</div>}
          {tab === 'overview' && <Dashboard orders={orders} pending={pending} repairing={repairing} waiting={waiting} onGo={setTab} />}
          {tab === 'vehicles' && <VehicleList vehicles={vehicles} onCreated={loadData} />}
          {tab === 'orders' && <OrderList orders={orders} vehicles={vehicles} onCreated={loadData} />}
          {tab === 'staff' && <StaffProgress orders={orders} />}
          {tab === 'inventory' && <ComingSoon icon={<Package />} title="零件与仓库" detail="库存、领料、退料和入库单据将在核心工单闭环稳定后启用。" />}
          {tab === 'reports' && <ComingSoon icon={<FileBarChart />} title="统计报表" detail="工单量、员工进度、车辆回厂和库存报表入口已预留。" />}
        </main>
      </div>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (result: { accessToken: string; user: User }) => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Admin@123');
  const [error, setError] = useState('');
  return <div className="login-screen"><div className="login-visual"><div className="login-visual-copy"><div className="sidebar-brand"><div className="brand-mark"><Wrench size={20} /></div><div><strong>车匠云修</strong><span>AutoFix Workshop</span></div></div><h1>把每一次维修<br /><em>交给流程来管理</em></h1><p>车辆、工单、维修协作集中在一个轻量工作台。</p><div className="visual-stats"><span><strong>15</strong> 人以内协作</span><span><strong>24h</strong> 工单可追踪</span></div></div></div><div className="login-card"><span className="eyebrow">WORKSHOP CONSOLE</span><h2>登录管理后台</h2><p className="login-subtitle">使用车匠云修账号继续工作</p><form onSubmit={async (event) => { event.preventDefault(); try { onLogin(await request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })); } catch (e) { setError(e instanceof Error ? e.message : '登录失败'); } }}><label>用户名<input value={username} onChange={(e) => setUsername(e.target.value)} /></label><label>密码<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>{error && <p className="form-error">{error}</p>}<button className="blue-button full">进入工作台</button></form><small className="login-hint">首次部署默认账号：admin / Admin@123</small></div></div>;
}

function Dashboard({ orders, pending, repairing, waiting, onGo }: { orders: Order[]; pending: number; repairing: number; waiting: number; onGo: (key: string) => void }) {
  const completed = orders.filter((order) => order.status === 'COMPLETED').length;
  return <div className="dashboard-grid"><section className="welcome-banner"><div><span className="banner-kicker">今日维修概览</span><h2>把车间进度，<br /><strong>看得更清楚。</strong></h2><p>从接车建单到主管验收，所有工单状态在这里集中查看。</p><button className="blue-button" onClick={() => onGo('orders')}><ClipboardCheck size={16} />查看工单中心</button></div><div className="welcome-car"><img src="/vehicle-card.svg" alt="维修车辆" /></div></section><section className="metric-row"><Metric icon={<ClipboardList />} label="全部工单" value={orders.length} tone="blue" /><Metric icon={<Gauge />} label="待处理" value={pending} tone="amber" /><Metric icon={<Wrench />} label="维修中" value={repairing} tone="green" /><Metric icon={<ShieldCheck />} label="待验收" value={waiting} tone="violet" /></section><section className="content-panel work-order-panel"><PanelTitle title="工单动态" detail="最近更新" action="查看全部" onAction={() => onGo('orders')} /><OrderRows orders={orders.slice(0, 5)} compact /></section><section className="content-panel status-panel"><PanelTitle title="维修状态" detail="当前工单分布" /><div className="donut-wrap"><div className="donut"><strong>{orders.length}</strong><span>总工单</span></div><div className="status-legend"><Legend color="blue" label="待处理" value={pending} /><Legend color="green" label="维修中" value={repairing} /><Legend color="amber" label="待验收" value={waiting} /><Legend color="gray" label="已完成" value={completed} /></div></div></section><section className="content-panel quick-panel"><PanelTitle title="快捷入口" detail="常用操作" /><div className="quick-grid"><QuickAction icon={<CarFront />} title="车辆档案" detail="搜索车牌 / VIN" onClick={() => onGo('vehicles')} /><QuickAction icon={<ClipboardList />} title="接车建单" detail="创建新的维修工单" onClick={() => onGo('orders')} /><QuickAction icon={<Users />} title="员工进度" detail="查看参与人员状态" onClick={() => onGo('staff')} /><QuickAction icon={<BarChart3 />} title="数据统计" detail="查看车间运行数据" onClick={() => onGo('reports')} /></div></section></div>;
}

function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: string }) {
  return <div className={`metric-card ${tone}`}><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>实时数据</small></div></div>;
}

function PanelTitle({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) {
  return <div className="panel-title"><div><h2>{title}</h2><span>{detail}</span></div>{action && <button className="text-button" onClick={onAction}>{action} →</button>}</div>;
}

function OrderRows({ orders, compact = false }: { orders: Order[]; compact?: boolean }) {
  return <div className={`order-list ${compact ? 'compact' : ''}`}>{orders.length === 0 && <div className="empty-state">暂时没有工单</div>}{orders.map((order) => <div className="order-row" key={order.id}><div className="order-car"><CarFront size={17} /></div><div className="order-main"><strong>{order.orderNo}</strong><span>{order.vehicle?.plateNumber || order.vehicleId || '车辆未关联'} · {order.customerRequest}</span></div><div className="order-items">{order.items?.slice(0, 2).map((item) => item.title).join('、') || '待补充项目'}</div><span className={`status-tag ${order.status.toLowerCase()}`}>{statusLabel(order.status)}</span></div>)}</div>;
}

function Legend({ color, label, value }: { color: string; label: string; value: number }) {
  return <div className="legend-item"><i className={color} /><span>{label}</span><strong>{value}</strong></div>;
}

function QuickAction({ icon, title, detail, onClick }: { icon: ReactNode; title: string; detail: string; onClick: () => void }) {
  return <button className="quick-action" onClick={onClick}><span>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div><b>→</b></button>;
}

function VehicleList({ vehicles, onCreated }: { vehicles: Vehicle[]; onCreated: () => void }) {
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const filtered = useMemo(() => vehicles.filter((vehicle) => `${vehicle.plateNumber}${vehicle.vin || ''}${vehicle.customerName || ''}`.toLowerCase().includes(query.toLowerCase())), [vehicles, query]);
  return <div className="section-stack"><div className="toolbar"><div className="search-box"><Search size={17} /><input placeholder="搜索车牌、VIN 或客户" value={query} onChange={(e) => setQuery(e.target.value)} /></div><button className="blue-button" onClick={() => setShowForm(true)}><Plus size={16} />新建车辆</button></div>{showForm && <VehicleForm onDone={() => { setShowForm(false); onCreated(); }} />}<section className="content-panel table-panel"><PanelTitle title="车辆档案" detail={`${filtered.length} 辆车辆`} /><table><thead><tr><th>车牌号</th><th>VIN</th><th>车型</th><th>客户</th><th>状态</th></tr></thead><tbody>{filtered.map((vehicle) => <tr key={vehicle.id}><td><strong>{vehicle.plateNumber}</strong></td><td>{vehicle.vin || '-'}</td><td>{[vehicle.brand, vehicle.model].filter(Boolean).join(' ') || '-'}</td><td>{vehicle.customerName || '-'}</td><td><span className="status-tag repairing">在档</span></td></tr>)}</tbody></table></section></div>;
}

function VehicleForm({ onDone }: { onDone: () => void }) {
  const [plateNumber, setPlateNumber] = useState('');
  const [vin, setVin] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  return <section className="content-panel form-panel"><PanelTitle title="新建车辆" detail="先建立车辆档案，再接车建单" /><form className="form-grid" onSubmit={async (event) => { event.preventDefault(); await request('/vehicles', { method: 'POST', body: JSON.stringify({ plateNumber, vin, brand, model }) }); onDone(); }}><label>车牌号<input required value={plateNumber} onChange={(e) => setPlateNumber(e.target.value)} /></label><label>VIN<input value={vin} onChange={(e) => setVin(e.target.value)} /></label><label>品牌<input value={brand} onChange={(e) => setBrand(e.target.value)} /></label><label>车型<input value={model} onChange={(e) => setModel(e.target.value)} /></label><div className="form-actions"><button type="button" className="ghost-button" onClick={onDone}>取消</button><button className="blue-button">保存车辆</button></div></form></section>;
}

function OrderList({ orders, vehicles, onCreated }: { orders: Order[]; vehicles: Vehicle[]; onCreated: () => void }) {
  const [showForm, setShowForm] = useState(false);
  return <div className="section-stack"><div className="toolbar"><div><span className="section-kicker">WORK ORDERS</span><h2>维修工单</h2><p>每次进厂建立独立工单，状态全程可追踪</p></div><button className="blue-button" onClick={() => setShowForm(true)}><Plus size={16} />接车建单</button></div>{showForm && <OrderForm vehicles={vehicles} onDone={() => { setShowForm(false); onCreated(); }} />}<section className="content-panel table-panel"><OrderRows orders={orders} /></section></div>;
}

function OrderForm({ vehicles, onDone }: { vehicles: Vehicle[]; onDone: () => void }) {
  const [vehicleId, setVehicleId] = useState(vehicles[0]?.id || '');
  const [customerRequest, setCustomerRequest] = useState('');
  const [itemTitles, setItemTitles] = useState('发动机检查');
  return <section className="content-panel form-panel"><PanelTitle title="接车建单" detail="为本次进厂创建独立维修工单" /><form onSubmit={async (event) => { event.preventDefault(); await request('/work-orders', { method: 'POST', body: JSON.stringify({ vehicleId, customerRequest, itemTitles: itemTitles.split(/[,，]/).map((item) => item.trim()).filter(Boolean) }) }); onDone(); }}><div className="form-grid"><label>车辆<select required value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.plateNumber} {vehicle.brand || ''} {vehicle.model || ''}</option>)}</select></label><label>维修项目<input required value={itemTitles} onChange={(e) => setItemTitles(e.target.value)} /></label></div><label>客户维修需求<textarea required value={customerRequest} onChange={(e) => setCustomerRequest(e.target.value)} /></label><div className="form-actions"><button type="button" className="ghost-button" onClick={onDone}>取消</button><button className="blue-button">创建工单</button></div></form></section>;
}

function StaffProgress({ orders }: { orders: Order[] }) {
  return <section className="content-panel staff-page"><PanelTitle title="员工进度" detail="按工单查看参与人员和维修状态" /><div className="staff-grid">{orders.slice(0, 6).map((order) => <div className="staff-card" key={order.id}><div className="staff-card-head"><span className="avatar small">工</span><div><strong>{order.vehicle?.plateNumber || '待关联车辆'}</strong><small>{order.orderNo}</small></div><span className={`status-tag ${order.status.toLowerCase()}`}>{statusLabel(order.status)}</span></div><p>{order.customerRequest}</p><div className="progress-track"><i style={{ width: order.status === 'COMPLETED' ? '100%' : order.status === 'REPAIRING' ? '62%' : '24%' }} /></div><small>维修协作记录 · {order.items?.length || 0} 个项目</small></div>)}</div></section>;
}

function ComingSoon({ icon, title, detail }: { icon: ReactNode; title: string; detail: string }) {
  return <section className="content-panel coming-panel"><div className="coming-icon">{icon}</div><span className="section-kicker">MODULE RESERVED</span><h2>{title}</h2><p>{detail}</p><span className="coming-note">保持轻量架构，按核心工单闭环逐步启用</span></section>;
}

function statusLabel(status: string) {
  return ({ PENDING: '待处理', REPAIRING: '维修中', WAITING_ACCEPTANCE: '待验收', COMPLETED: '已完成', REWORKING: '返工中', CANCELLED: '已取消' } as Record<string, string>)[status] || status;
}

function roleLabel(role: string) {
  return ({ OWNER: '老板', MANAGER: '主管', EMPLOYEE: '员工', WAREHOUSE: '仓管' } as Record<string, string>)[role] || role;
}
