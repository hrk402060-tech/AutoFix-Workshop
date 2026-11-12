import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Camera,
  CarFront,
  Check,
  CheckCheck,
  ClipboardList,
  Clock3,
  Download,
  FileBarChart,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import {
  API,
  api,
  authHeaders,
  compressPhoto,
  date,
  patch,
  post,
  roleNames,
  stageNames,
  statusNames,
} from "./api";
import type { Detail, Inventory, Order, Part, User, Vehicle } from "./api";

const vehicleName = (vehicle?: Vehicle) =>
  vehicle?.plateNumber || vehicle?.vin || "车辆";

type Tab =
  | "overview"
  | "orders"
  | "vehicles"
  | "staff"
  | "inventory"
  | "reports"
  | "settings";
const tabs = [
  { key: "overview", title: "管理工作台", icon: LayoutDashboard },
  { key: "orders", title: "维修工单", icon: ClipboardList },
  { key: "vehicles", title: "车辆档案", icon: CarFront },
  { key: "staff", title: "员工与进度", icon: Users },
  { key: "inventory", title: "零件与仓库", icon: Package },
  { key: "reports", title: "统计报表", icon: FileBarChart },
  { key: "settings", title: "账号设置", icon: Settings },
] as const;
const manage = (u: User) => ["OWNER", "MANAGER"].includes(u.role);
const stockManage = (u: User) => manage(u) || u.role === "WAREHOUSE";
const editable = (o: Order, u: User) =>
  !["COMPLETED", "CANCELLED"].includes(o.status) && u.role !== "WAREHOUSE";
const values = (event: FormEvent<HTMLFormElement>) =>
  Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<
    string,
    string
  >;

function Brand() {
  return (
    <div className="brand">
      <CarFront size={31} />
      <div>
        <strong>车匠云修</strong>
        <small>汽车维修厂管理系统</small>
      </div>
    </div>
  );
}
function Badge({ status }: { status: string }) {
  return (
    <span className={`badge ${status.toLowerCase()}`}>
      {statusNames[status] ||
        { APPROVED: "已批准", REJECTED: "已拒绝" }[status] ||
        status}
    </span>
  );
}
function Empty({ children = "暂无记录", action }: { children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <ClipboardList size={26} />
      <span>{children}</span>
      {action}
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" className="icon" title="关闭" onClick={close}>
            <X size={19} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function Submit({
  busy,
  children = "保存",
}: {
  busy: boolean;
  children?: ReactNode;
}) {
  return (
    <button disabled={busy} className="primary" type="submit">
      {busy && <LoaderCircle className="spin" size={15} />}
      {busy ? "正在保存" : children}
    </button>
  );
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [boot, setBoot] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [orders, setOrders] = useState<Order[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [inventory, setInventory] = useState<Inventory>({
    parts: [],
    requests: [],
    transactions: [],
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<string | null>(null);

  const logout = useCallback(() => {
    localStorage.removeItem("autofix_token");
    setUser(null);
    setSelected(null);
    setTab("overview");
    setModal(null);
    setOrders([]);
    setVehicles([]);
    setUsers([]);
    setInventory({ parts: [], requests: [], transactions: [] });
    setError("");
    setToast("");
    setLoading(false);
  }, []);
  useEffect(() => {
    window.addEventListener("autofix-logout", logout);
    if (localStorage.getItem("autofix_token"))
      api<User>("/auth/me")
        .then(setUser)
        .catch(() => logout())
        .finally(() => setBoot(false));
    else setBoot(false);
    return () => window.removeEventListener("autofix-logout", logout);
  }, [logout]);

  const load = useCallback(async () => {
    if (!user) return;
    const token = localStorage.getItem("autofix_token");
    setLoading(true);
    try {
      const [o, v, u, i] = await Promise.all([
        api<Order[]>("/work-orders"),
        api<Vehicle[]>("/vehicles"),
        api<User[]>("/users"),
        api<Inventory>("/inventory"),
      ]);
      if (localStorage.getItem("autofix_token") !== token) return;
      setOrders(o);
      setVehicles(v);
      setUsers(u);
      setInventory(i);
      setError("");
    } catch (e) {
      if (localStorage.getItem("autofix_token") === token)
        setError((e as Error).message);
    } finally {
      if (localStorage.getItem("autofix_token") === token) setLoading(false);
    }
  }, [user]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function mutate(work: () => Promise<unknown>, message = "操作已保存") {
    setBusy(true);
    setError("");
    try {
      await work();
      await load();
      setToast(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function go(next: Tab) {
    setTab(next);
    setSelected(null);
    setError("");
  }
  function openOrder(id: string) {
    setSelected(id);
    setTab("orders");
  }
  if (boot)
    return (
      <div className="boot">
        <LoaderCircle className="spin" />
        正在连接车匠云修
      </div>
    );
  if (!user) return <Login onLogin={setUser} />;
  const visibleTabs = tabs.filter((t) => t.key !== "staff" || manage(user));
  const pending = inventory.requests.filter(
    (r) => r.status === "PENDING",
  ).length;
  return (
    <div className="shell">
      <aside className="sidebar">
        <Brand />
        <div className="shop-label">
          <span className="live-dot" />
          维修业务管理
        </div>
        <nav aria-label="业务导航">
          {visibleTabs.map(({ key, title, icon: Icon }) => (
            <button
              key={key}
              title={title}
              onClick={() => go(key)}
              className={tab === key ? "active" : ""}
            >
              <Icon size={17} />
              <span>{title}</span>
              {key === "inventory" && pending > 0 && <b>{pending}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span>AutoFix Workshop</span>
          <small>单门店工作空间</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="topbar-brand">
            汽车维修厂管理系统 <small>PC 管理端</small>
          </span>
          <div className="top-actions">
            <button
              className="icon"
              title="刷新数据"
              disabled={loading}
              onClick={load}
            >
              <RefreshCw size={17} className={loading ? "spin" : ""} />
            </button>
            <button className="account" onClick={() => go("settings")}>
              <span className="avatar">{user.name.slice(0, 1)}</span>
              <span>
                {user.name}
                <small>{roleNames[user.role]}</small>
              </span>
            </button>
            <button className="icon" title="退出登录" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <p>工作空间 / {tabs.find((t) => t.key === tab)?.title}</p>
              <h1>
                {selected ? "工单详情" : tabs.find((t) => t.key === tab)?.title}
              </h1>
            </div>
            <div className="heading-side">
              <span>
                {new Date().toLocaleDateString("zh-CN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                })}
              </span>
              {user.role !== "WAREHOUSE" && (
                <button className="primary" onClick={() => setModal("order")}>
                  <Plus size={15} />
                  接车建单
                </button>
              )}
            </div>
          </div>
          {error && (
            <div role="alert" className="error">
              {error}
              <button
                className="icon"
                title="关闭提示"
                onClick={() => setError("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {loading && !orders.length && (
            <p className="loading">正在加载业务数据...</p>
          )}
          {tab === "overview" && (
            <Dashboard
              orders={orders}
              inventory={inventory}
              open={openOrder}
              go={go}
              create={user.role !== "WAREHOUSE" ? () => setModal("order") : undefined}
            />
          )}
          {tab === "orders" &&
            (selected ? (
              <OrderDetail
                id={selected}
                user={user}
                users={users}
                parts={inventory.parts}
                mutate={mutate}
                busy={busy}
                operationError={error}
                back={() => setSelected(null)}
              />
            ) : (
              <Orders orders={orders} open={openOrder} />
            ))}
          {tab === "vehicles" && (
            <Vehicles
              vehicles={vehicles}
              orders={orders}
              user={user}
              open={openOrder}
              create={() => setModal("vehicle")}
              edit={(v) => setModal(`vehicle:${v.id}`)}
            />
          )}
          {tab === "staff" && (
            <Staff
              users={users}
              orders={orders}
              open={openOrder}
              add={() => setModal("user")}
              toggle={(u) =>
                mutate(() =>
                  patch(`/users/${u.id}/active`, { isActive: !u.isActive }),
                )
              }
              busy={busy}
              current={user}
            />
          )}
          {tab === "inventory" && (
            <Warehouse
              inventory={inventory}
              orders={orders}
              user={user}
              users={users}
              busy={busy}
              modal={setModal}
              mutate={mutate}
            />
          )}
          {tab === "reports" && (
            <Reports orders={orders} parts={inventory.parts} />
          )}
          {tab === "settings" && (
            <SettingsPage user={user} busy={busy} mutate={mutate} />
          )}
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <CheckCheck size={17} />
          {toast}
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal.startsWith("vehicle")
              ? modal.includes(":")
                ? "编辑车辆档案"
                : "新建车辆档案"
              : {
                  order: "接车建单",
                  user: "创建员工账号",
                  part: "新建零件",
                  incoming: "采购入库",
                }[modal] || "操作"
          }
          close={() => !busy && setModal(null)}
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {modal.startsWith("vehicle") && (
            <VehicleForm
              initial={vehicles.find((v) => modal === `vehicle:${v.id}`)}
              busy={busy}
              save={async (body, id) => {
                if (
                  await mutate(() =>
                    id
                      ? api(`/vehicles/${id}`, body, "PUT")
                      : post("/vehicles", body),
                  )
                )
                  setModal(null);
              }}
            />
          )}
          {modal === "order" && (
            <CreateOrder
              vehicles={vehicles}
              users={users}
              user={user}
              busy={busy}
              newVehicle={() => setModal("vehicle")}
              save={async (body) => {
                let created: Detail | undefined;
                if (
                  await mutate(async () => {
                    created = await post<Detail>("/work-orders", body);
                  })
                ) {
                  setModal(null);
                  openOrder(created!.id);
                }
              }}
            />
          )}
          {modal === "user" && (
            <UserForm
              current={user}
              busy={busy}
              save={async (body) => {
                if (await mutate(() => post("/users", body))) setModal(null);
              }}
            />
          )}
          {modal === "part" && (
            <PartForm
              busy={busy}
              save={async (body) => {
                if (await mutate(() => post("/inventory/parts", body)))
                  setModal(null);
              }}
            />
          )}
          {modal === "incoming" && (
            <IncomingForm
              parts={inventory.parts}
              busy={busy}
              save={async (body) => {
                if (await mutate(() => post("/inventory/incoming", body)))
                  setModal(null);
              }}
            />
          )}
        </Modal>
      )}
    </div>
  );
}

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="login-page">
      <header>
        <Brand />
      </header>
      <div className="login-form">
        <span className="overline">AUTOFIX WORKSHOP</span>
        <h1>登录管理系统</h1>
        <p>维修业务工作空间</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const body = values(e);
            setBusy(true);
            setError("");
            try {
              const result = await post<{ accessToken: string; user: User }>(
                "/auth/login",
                body,
              );
              localStorage.setItem("autofix_token", result.accessToken);
              onLogin(result.user);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label="用户名">
            <input name="username" autoComplete="username" required autoFocus />
          </Field>
          <Field label="密码">
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </Field>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Submit busy={busy}>
            登录 <ArrowRight size={16} />
          </Submit>
        </form>
      </div>
      <footer>车匠云修 · 汽车维修厂管理系统</footer>
    </div>
  );
}

function Metrics({ orders }: { orders: Order[] }) {
  const items = [
    {
      title: "全部工单",
      count: orders.length,
      icon: ClipboardList,
      color: "blue",
    },
    {
      title: "待处理",
      count: orders.filter((o) => o.status === "PENDING").length,
      icon: Clock3,
      color: "amber",
    },
    {
      title: "维修中 / 返工",
      count: orders.filter((o) => ["REPAIRING", "REWORKING"].includes(o.status))
        .length,
      icon: Wrench,
      color: "cyan",
    },
    {
      title: "待验收",
      count: orders.filter((o) => o.status === "WAITING_ACCEPTANCE").length,
      icon: ShieldCheck,
      color: "purple",
    },
    {
      title: "已完成",
      count: orders.filter((o) => o.status === "COMPLETED").length,
      icon: CheckCheck,
      color: "green",
    },
  ];
  return (
    <div className="metrics">
      {items.map(({ title, count, icon: Icon, color }) => (
        <div className="metric" key={title}>
          <span className={`metric-icon ${color}`}>
            <Icon size={20} />
          </span>
          <div>
            <span>{title}</span>
            <strong>
              {count}
              <small>单</small>
            </strong>
          </div>
        </div>
      ))}
    </div>
  );
}
function Dashboard({
  orders,
  inventory,
  open,
  go,
  create,
}: {
  orders: Order[];
  inventory: Inventory;
  open: (id: string) => void;
  go: (t: Tab) => void;
  create?: () => void;
}) {
  return (
    <>
      <div className="workspace-banner">
        <div>
          <h2>维修业务概览</h2>
          <p>
            {
              orders.filter(
                (o) => !["COMPLETED", "CANCELLED"].includes(o.status),
              ).length
            }{" "}
            个工单进行中 ·{" "}
            {inventory.requests.filter((r) => r.status === "PENDING").length}{" "}
            项物料申请待处理
          </p>
        </div>
        <button onClick={() => go("orders")}>
          进入工单中心 <ArrowRight size={16} />
        </button>
      </div>
      <Metrics orders={orders} />
      <div className="dashboard-columns">
        <section>
          <div className="section-head">
            <h2>工单处理</h2>
            <button className="text-button" onClick={() => go("orders")}>
              全部工单 <ArrowRight size={14} />
            </button>
          </div>
          <OrderTable orders={orders.slice(0, 6)} open={open} emptyAction={create && <button onClick={create}><Plus size={15} />接车建单</button>} />
        </section>
        <section>
          <div className="section-head">
            <h2>维修状态分布</h2>
            <Activity size={17} />
          </div>
          <Distribution orders={orders} />
        </section>
      </div>
      <div className="section-head">
        <h2>常用业务</h2>
      </div>
      <div className="shortcuts">
        {[
          { key: "vehicles", title: "车辆档案", icon: CarFront },
          { key: "orders", title: "维修工单", icon: ClipboardList },
          { key: "inventory", title: "零件与仓库", icon: Package },
          { key: "reports", title: "统计报表", icon: FileBarChart },
        ].map(({ key, title, icon: Icon }) => (
          <button key={key} onClick={() => go(key as Tab)}>
            <Icon size={23} />
            <strong>{title}</strong>
            <ArrowRight size={16} />
          </button>
        ))}
      </div>
    </>
  );
}
function Distribution({ orders }: { orders: Order[] }) {
  if (!orders.length) return <Empty>暂无工单统计</Empty>;
  return (
    <div className="distribution">
      {Object.entries(statusNames).map(([key, name]) => {
        const count = orders.filter((o) => o.status === key).length;
        return (
          <div key={key}>
            <div>
              <span>{name}</span>
              <b>
                {count} <small>单</small>
              </b>
            </div>
            <div className="bar">
              <i
                className={key.toLowerCase()}
                style={{ width: `${(count / orders.length) * 100}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
function OrderTable({
  orders,
  open,
  emptyAction,
}: {
  orders: Order[];
  open: (id: string) => void;
  emptyAction?: ReactNode;
}) {
  return orders.length ? (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>工单 / 车辆</th>
            <th>维修需求</th>
            <th>参与人员</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>
                <strong>{vehicleName(o.vehicle)}</strong>
                <small>{o.orderNo}</small>
              </td>
              <td className="request-cell">{o.customerRequest}</td>
              <td>
                {o.participants
                  .map((p) => p.user?.name || "停用人员")
                  .join("、") || "待分配"}
              </td>
              <td>
                <Badge status={o.status} />
              </td>
              <td>
                <button className="text-button" onClick={() => open(o.id)}>
                  查看详情
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty action={emptyAction}>暂无维修工单</Empty>
  );
}
function Orders({
  orders,
  open,
}: {
  orders: Order[];
  open: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const filtered = orders.filter(
    (o) =>
      (!status || o.status === status) &&
      `${o.orderNo} ${o.vehicle?.plateNumber} ${o.vehicle?.vin} ${o.customerRequest}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  return (
    <>
      <Metrics orders={orders} />
      <div className="toolbar">
        <div className="search">
          <Search size={16} />
          <input
            aria-label="搜索工单"
            placeholder="工单号、车牌、维修需求"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          aria-label="工单状态筛选"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">全部状态</option>
          {Object.entries(statusNames).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <span>共 {filtered.length} 单</span>
      </div>
      <OrderTable orders={filtered} open={open} />
    </>
  );
}

function Vehicles({
  vehicles,
  orders,
  user,
  open,
  create,
  edit,
}: {
  vehicles: Vehicle[];
  orders: Order[];
  user: User;
  open: (id: string) => void;
  create: () => void;
  edit: (v: Vehicle) => void;
}) {
  const [q, setQ] = useState("");
  const [history, setHistory] = useState<string | null>(null);
  const filtered = vehicles.filter((v) =>
    `${v.plateNumber} ${v.vin} ${v.customerName} ${v.brand} ${v.model}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  return (
    <>
      <div className="toolbar">
        <div className="search">
          <Search size={16} />
          <input
            aria-label="搜索车辆"
            placeholder="车牌 / VIN / 客户 / 车型"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <span>共 {filtered.length} 辆</span>
        {user.role !== "WAREHOUSE" && (
          <button className="primary" onClick={create}>
            <Plus size={16} />
            新建车辆
          </button>
        )}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>车辆</th>
              <th>VIN</th>
              <th>客户</th>
              <th>联系电话</th>
              <th>工单数</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.id}>
                <td>
                  <strong>{vehicleName(v)}</strong>
                  <small>
                    {[v.brand, v.model].filter(Boolean).join(" ") ||
                      "未填写车型"}
                  </small>
                </td>
                <td>{v.vin || "—"}</td>
                <td>{v.customerName || "—"}</td>
                <td>{v.customerPhone || "—"}</td>
                <td>{orders.filter((o) => o.vehicleId === v.id).length}</td>
                <td>
                  <div className="row-actions">
                    <button
                      className="text-button"
                      onClick={() => setHistory(v.id)}
                    >
                      进厂历史
                    </button>
                    {manage(user) && (
                      <button className="text-button" onClick={() => edit(v)}>
                        编辑
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!filtered.length && <Empty>暂无车辆档案</Empty>}
      </div>
      {history && (
        <Modal
          title={`${vehicleName(vehicles.find((v) => v.id === history))} · 进厂历史`}
          close={() => setHistory(null)}
        >
          <OrderTable
            orders={orders.filter((o) => o.vehicleId === history)}
            open={(id) => {
              setHistory(null);
              open(id);
            }}
          />
        </Modal>
      )}
    </>
  );
}
function VehicleForm({
  initial,
  busy,
  save,
}: {
  initial?: Vehicle;
  busy: boolean;
  save: (body: unknown, id?: string) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(values(e), initial?.id);
      }}
    >
      <div className="form-grid">
        {[
          { name: "plateNumber", label: "车牌号", max: 20 },
          { name: "vin", label: "VIN", max: 40 },
          { name: "brand", label: "品牌", max: 80 },
          { name: "model", label: "车型", max: 80 },
          { name: "customerName", label: "客户姓名", max: 100 },
          { name: "customerPhone", label: "联系电话", max: 30 },
        ].map((f) => (
          <Field key={f.name} label={f.label}>
            <input
              name={f.name}
              minLength={f.name === "plateNumber" ? 2 : undefined}
              maxLength={f.max}
              defaultValue={initial?.[f.name as keyof Vehicle] || ""}
            />
          </Field>
        ))}
      </div>
      <div className="form-footer">
        <Submit busy={busy}>保存车辆</Submit>
      </div>
    </form>
  );
}
function CreateOrder({
  vehicles,
  users,
  user,
  busy,
  save,
  newVehicle,
}: {
  vehicles: Vehicle[];
  users: User[];
  user: User;
  busy: boolean;
  save: (body: unknown) => void;
  newVehicle: () => void;
}) {
  if (!vehicles.length)
    return (
      <div className="empty">
        <CarFront />
        <span>请先创建车辆档案</span>
        <button className="primary" onClick={newVehicle}>
          <Plus size={15} />
          新建车辆
        </button>
      </div>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const body = values(e);
        const fd = new FormData(e.currentTarget);
        save({
          vehicleId: body.vehicleId,
          customerRequest: body.customerRequest.trim(),
          itemTitles: body.items
            .split("\n")
            .map((v) => v.trim())
            .filter(Boolean),
          participantIds: manage(user) ? fd.getAll("members") : [user.id],
        });
      }}
    >
      <Field label="车辆">
        <select name="vehicleId" required>
          {vehicles.map((v) => (
            <option key={v.id} value={v.id}>
              {vehicleName(v)} · {v.brand} {v.model}
            </option>
          ))}
        </select>
      </Field>
      <Field label="客户维修需求">
        <textarea
          name="customerRequest"
          required
          minLength={2}
          maxLength={2000}
          rows={3}
        />
      </Field>
      <Field label="维修项目（每行一项）">
        <textarea name="items" required maxLength={3600} rows={4} />
      </Field>
      {manage(user) && (
        <fieldset>
          <legend>参与人员</legend>
          <div className="checkboxes">
            {users
              .filter((u) => u.isActive && u.role !== "WAREHOUSE")
              .map((u) => (
                <label key={u.id}>
                  <input
                    type="checkbox"
                    name="members"
                    value={u.id}
                    defaultChecked={u.id === user.id}
                  />
                  {u.name}
                </label>
              ))}
          </div>
        </fieldset>
      )}
      <div className="form-footer">
        <Submit busy={busy}>创建工单</Submit>
      </div>
    </form>
  );
}

type Mutate = (
  work: () => Promise<unknown>,
  message?: string,
) => Promise<boolean>;
function OrderDetail({
  id,
  user,
  users,
  parts,
  mutate,
  busy,
  operationError,
  back,
}: {
  id: string;
  user: User;
  users: User[];
  parts: Part[];
  mutate: Mutate;
  busy: boolean;
  operationError: string;
  back: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [stage, setStage] = useState("VEHICLE");
  const load = useCallback(async () => {
    try {
      setDetail(await api<Detail>(`/work-orders/${id}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);
  async function change(work: () => Promise<unknown>) {
    if (await mutate(work)) {
      await load();
      setAction("");
    }
  }
  if (!detail)
    return (
      <>
        <button className="text-button" onClick={back}>
          <ArrowLeft size={16} />
          返回工单列表
        </button>
        {error ? (
          <p className="error">{error}</p>
        ) : (
          <p className="loading">正在加载工单详情...</p>
        )}
      </>
    );
  const allowed = editable(detail, user);
  const names = (authorId: string) =>
    detail.records.find((r) => r.authorId === authorId)?.authorName ||
    detail.logs.find((l) => l.actorId === authorId)?.actorName ||
    users.find((u) => u.id === authorId)?.name ||
    "历史账号";
  const photoSet = detail.photos.filter((p) => p.stage === stage);
  const logs: Record<string, string> = {
    CREATE: "接车建单",
    ASSIGN: "分配人员",
    REPAIR_RECORD: "填写维修记录",
    UPLOAD_PHOTO: "上传照片",
    REQUEST_OUT: "申请领料",
    REQUEST_RETURN: "申请退料",
    MATERIAL_APPROVED: "批准物料申请",
    MATERIAL_REJECTED: "拒绝物料申请",
  };
  return (
    <div className="detail">
      <button className="text-button" onClick={back}>
        <ArrowLeft size={16} />
        返回工单列表
      </button>
      {error && <p className="error">{error}</p>}
      <section className="order-summary">
        <div>
          <span className="overline">{detail.orderNo}</span>
          <h2>
            {vehicleName(detail.vehicle)} <Badge status={detail.status} />
          </h2>
          <p>
            {[detail.vehicle?.brand, detail.vehicle?.model]
              .filter(Boolean)
              .join(" ")}{" "}
            · VIN {detail.vehicle?.vin || "未填写"}
          </p>
          <p>创建时间 {date(detail.createdAt)}</p>
        </div>
        <div className="detail-actions">
          {allowed && detail.status === "PENDING" && (
            <button
              disabled={busy}
              className="primary"
              onClick={() =>
                change(() =>
                  patch(`/work-orders/${id}/status`, { status: "REPAIRING" }),
                )
              }
            >
              <Wrench size={15} />
              开始维修
            </button>
          )}
          {allowed && ["REPAIRING", "REWORKING"].includes(detail.status) && (
            <button
              disabled={busy}
              className="primary"
              onClick={() =>
                change(() =>
                  patch(`/work-orders/${id}/status`, {
                    status: "WAITING_ACCEPTANCE",
                  }),
                )
              }
            >
              <Check size={15} />
              提交验收
            </button>
          )}
          {manage(user) && detail.status === "WAITING_ACCEPTANCE" && (
            <>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  change(() =>
                    patch(`/work-orders/${id}/status`, { status: "COMPLETED" }),
                  )
                }
              >
                <CheckCheck size={15} />
                验收通过
              </button>
              <button onClick={() => setAction("REWORKING")}>退回返工</button>
            </>
          )}
          {allowed && manage(user) && (
            <button onClick={() => setAction("CANCELLED")}>取消工单</button>
          )}
        </div>
      </section>
      <div className="detail-columns">
        <section>
          <div className="section-head">
            <h2>维修需求与项目</h2>
          </div>
          <p className="request-note">{detail.customerRequest}</p>
          <ul className="item-list">
            {detail.items.map((i) => (
              <li key={i.id}>
                <Wrench size={14} />
                {i.title}
              </li>
            ))}
          </ul>
          <div className="section-head">
            <h2>参与人员</h2>
            {allowed &&
              manage(user) &&
              detail.status !== "WAITING_ACCEPTANCE" && (
                <button
                  className="text-button"
                  onClick={() => setAction("assign")}
                >
                  重新分配
                </button>
              )}
          </div>
          <div className="members">
            {detail.participants.map((p) => (
              <span key={p.userId}>
                <i className="avatar">{p.user?.name?.slice(0, 1)}</i>
                {p.user?.name}
                <small>{roleNames[p.user?.role]}</small>
              </span>
            ))}
          </div>
        </section>
        <section>
          <div className="section-head">
            <h2>维修记录</h2>
          </div>
          {detail.records.length ? (
            <div className="record-list">
              {detail.records.map((r) => (
                <article key={r.id}>
                  <strong>
                    {names(r.authorId)}
                    <small>{date(r.createdAt)}</small>
                  </strong>
                  <p>{r.note}</p>
                </article>
              ))}
            </div>
          ) : (
            <Empty>尚未填写维修记录</Empty>
          )}
          {allowed && (
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                const note = values(e).note;
                const form = e.currentTarget;
                void change(async () => {
                  await post(`/work-orders/${id}/records`, {
                    note: note.trim(),
                  });
                  form.reset();
                });
              }}
            >
              <textarea
                aria-label="新增维修记录"
                name="note"
                required
                minLength={2}
                maxLength={4000}
                rows={3}
                placeholder="填写检查结果、维修内容和备注"
              />
              <Submit busy={busy}>保存维修记录</Submit>
            </form>
          )}
        </section>
      </div>
      <section>
        <div className="section-head">
          <h2>车辆与维修照片</h2>
          <span>{detail.photos.length} / 120 张</span>
        </div>
        <div className="toolbar photo-toolbar">
          <div className="segmented">
            {Object.entries(stageNames).map(([key, title]) => (
              <button
                className={stage === key ? "active" : ""}
                key={key}
                onClick={() => setStage(key)}
              >
                {title}{" "}
                <small>
                  {detail.photos.filter((p) => p.stage === key).length}
                </small>
              </button>
            ))}
          </div>
          {allowed && (
            <label className={`upload-button ${busy ? "disabled" : ""}`}>
              <Camera size={16} />
              上传照片
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  await change(async () => {
                    const blob = await compressPhoto(file);
                    const response = await fetch(
                      `${API}/work-orders/${id}/photos/${stage}`,
                      {
                        method: "POST",
                        headers: {
                          ...authHeaders(),
                          "Content-Type": "image/jpeg",
                        },
                        body: blob,
                      },
                    );
                    if (!response.ok) {
                      const body = await response.json();
                      throw new Error(body.message || "上传失败");
                    }
                  });
                }}
              />
            </label>
          )}
        </div>
        <div className="photos">
          {photoSet.map((photo) => (
            <PhotoTile key={photo.id} photo={photo} />
          ))}
        </div>
        {!photoSet.length && <Empty>暂无{stageNames[stage]}</Empty>}
      </section>
      <section>
        <div className="section-head">
          <h2>零件领用</h2>
          {allowed && (
            <button
              className="text-button"
              onClick={() => setAction("material")}
            >
              领料 / 退料申请 <ArrowRight size={14} />
            </button>
          )}
        </div>
        <p className="muted">物料申请提交后，由仓管、主管或老板审批出入库。</p>
      </section>
      <section>
        <div className="section-head">
          <h2>操作轨迹</h2>
        </div>
        <div className="timeline">
          {detail.logs.map((l) => (
            <div key={l.id}>
              <i />
              <span>
                {l.action.startsWith("STATUS_")
                  ? `状态变更：${statusNames[l.action.slice(7)]}`
                  : logs[l.action] || l.action}
                {l.metadata?.note && <p>{l.metadata.note}</p>}
              </span>
              <small>
                {names(l.actorId)} · {date(l.createdAt)}
              </small>
            </div>
          ))}
        </div>
      </section>
      {action && (
        <Modal
          title={
            action === "assign"
              ? "分配维修人员"
              : action === "material"
                ? "物料申请"
                : action === "REWORKING"
                  ? "退回返工"
                  : "取消工单"
          }
          close={() => !busy && setAction("")}
        >
          {operationError && (
            <p className="error" role="alert">
              {operationError}
            </p>
          )}
          {action === "assign" ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const participantIds = new FormData(e.currentTarget).getAll(
                  "members",
                );
                void change(() =>
                  patch(`/work-orders/${id}/participants`, { participantIds }),
                );
              }}
            >
              <div className="checkboxes">
                {users
                  .filter((u) => u.isActive && u.role !== "WAREHOUSE")
                  .map((u) => (
                    <label key={u.id}>
                      <input
                        name="members"
                        type="checkbox"
                        value={u.id}
                        defaultChecked={detail.participants.some(
                          (p) => p.userId === u.id,
                        )}
                      />
                      {u.name} · {roleNames[u.role]}
                    </label>
                  ))}
              </div>
              <div className="form-footer">
                <Submit busy={busy}>保存分配</Submit>
              </div>
            </form>
          ) : action === "material" ? (
            <MaterialForm
              parts={parts}
              busy={busy}
              save={(body) =>
                change(() =>
                  post("/inventory/requests", { ...body, workOrderId: id }),
                )
              }
            />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void change(() =>
                  patch(`/work-orders/${id}/status`, {
                    status: action,
                    note: values(e).note.trim(),
                  }),
                );
              }}
            >
              <Field label={action === "REWORKING" ? "返工原因" : "取消原因"}>
                <textarea name="note" required minLength={2} maxLength={2000} />
              </Field>
              <div className="form-footer">
                <Submit busy={busy}>
                  确认{action === "REWORKING" ? "返工" : "取消"}
                </Submit>
              </div>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}
function PhotoTile({ photo }: { photo: Detail["photos"][number] }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState(false);
  const [large, setLarge] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    fetch(`${API}/photos/${photo.id}`, { headers: authHeaders() })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        objectUrl = URL.createObjectURL(await r.blob());
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => active && setError(true));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photo.id]);
  return (
    <figure>
      <button title="查看大图" disabled={!url} onClick={() => setLarge(true)}>
        {url ? (
          <img
            src={url}
            alt={`${stageNames[photo.stage]} · ${date(photo.createdAt)}`}
          />
        ) : (
          <span>{error ? "文件无法读取" : "加载照片..."}</span>
        )}
      </button>
      <figcaption>
        {date(photo.createdAt)}
        <small>{Math.round(photo.size / 1024)} KB</small>
      </figcaption>
      {large && (
        <Modal title={stageNames[photo.stage]} close={() => setLarge(false)}>
          <img
            className="large-photo"
            src={url}
            alt={stageNames[photo.stage]}
          />
        </Modal>
      )}
    </figure>
  );
}

function Staff({
  users,
  orders,
  open,
  add,
  toggle,
  busy,
  current,
}: {
  users: User[];
  orders: Order[];
  open: (id: string) => void;
  add: () => void;
  toggle: (u: User) => void;
  busy: boolean;
  current: User;
}) {
  return (
    <>
      <div className="toolbar">
        <p>账号权限与参与工单</p>
        <button className="primary" onClick={add}>
          <Plus size={15} />
          新建账号
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>员工</th>
              <th>角色</th>
              <th>进行中</th>
              <th>已完成</th>
              <th>状态</th>
              <th>账号操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const related = orders.filter((o) =>
                o.participants.some((p) => p.userId === u.id),
              );
              return (
                <tr key={u.id}>
                  <td>
                    <strong>{u.name}</strong>
                    <small>{u.username}</small>
                  </td>
                  <td>{roleNames[u.role]}</td>
                  <td>
                    {
                      related.filter(
                        (o) => !["COMPLETED", "CANCELLED"].includes(o.status),
                      ).length
                    }
                  </td>
                  <td>
                    {related.filter((o) => o.status === "COMPLETED").length}
                  </td>
                  <td>{u.isActive ? "启用" : "停用"}</td>
                  <td>
                    {u.id !== current.id &&
                      u.role !== "OWNER" &&
                      (current.role === "OWNER" || u.role === "EMPLOYEE") && (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => toggle(u)}
                        >
                          {u.isActive ? "停用" : "启用"}
                        </button>
                      )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="section-head">
        <h2>维修协作工单</h2>
      </div>
      <OrderTable
        orders={orders.filter(
          (o) => !["COMPLETED", "CANCELLED"].includes(o.status),
        )}
        open={open}
      />
    </>
  );
}
function UserForm({
  current,
  busy,
  save,
}: {
  current: User;
  busy: boolean;
  save: (body: unknown) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(values(e));
      }}
    >
      <div className="form-grid">
        <Field label="用户名">
          <input
            name="username"
            required
            minLength={3}
            maxLength={50}
            pattern="[a-zA-Z0-9_-]+"
          />
        </Field>
        <Field label="员工姓名">
          <input name="name" required maxLength={100} />
        </Field>
        <Field label="初始密码">
          <input
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
          />
        </Field>
        <Field label="角色">
          <select name="role">
            {Object.entries(roleNames)
              .filter(([key]) => current.role === "OWNER" || key === "EMPLOYEE")
              .map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <div className="form-footer">
        <Submit busy={busy}>创建账号</Submit>
      </div>
    </form>
  );
}
function Warehouse({
  inventory,
  orders,
  users,
  user,
  busy,
  modal,
  mutate,
}: {
  inventory: Inventory;
  orders: Order[];
  users: User[];
  user: User;
  busy: boolean;
  modal: (m: string) => void;
  mutate: Mutate;
}) {
  const [q, setQ] = useState("");
  const [view, setView] = useState("parts");
  const partName = (id: string) =>
    inventory.parts.find((p) => p.id === id)?.name || id;
  const types: Record<string, string> = {
    IN: "采购入库",
    OUT: "领料出库",
    RETURN: "退料入库",
  };
  return (
    <>
      <div className="toolbar">
        <div className="segmented">
          {[
            ["parts", "零件库存"],
            [
              "requests",
              `物料申请 (${inventory.requests.filter((r) => r.status === "PENDING").length})`,
            ],
            ...(stockManage(user) ? [["transactions", "出入库流水"]] : []),
          ].map(([k, v]) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={view === k ? "active" : ""}
            >
              {v}
            </button>
          ))}
        </div>
        {stockManage(user) && (
          <div className="row-actions">
            <button onClick={() => modal("part")}>
              <Plus size={15} />
              新建零件
            </button>
            <button className="primary" onClick={() => modal("incoming")}>
              <ArrowDownToLine size={15} />
              采购入库
            </button>
          </div>
        )}
      </div>
      {view === "parts" && (
        <>
          <div className="search">
            <Search size={16} />
            <input
              aria-label="搜索零件"
              placeholder="零件编号 / 名称 / 规格"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>零件编号</th>
                  <th>名称</th>
                  <th>规格</th>
                  <th>库存数量</th>
                  <th>单位</th>
                </tr>
              </thead>
              <tbody>
                {inventory.parts
                  .filter((p) =>
                    `${p.code} ${p.name} ${p.specification}`.includes(q),
                  )
                  .map((p) => (
                    <tr key={p.id}>
                      <td>{p.code}</td>
                      <td>
                        <strong>{p.name}</strong>
                      </td>
                      <td>{p.specification || "—"}</td>
                      <td>
                        <strong
                          className={p.quantity === 0 ? "danger-text" : ""}
                        >
                          {p.quantity}
                        </strong>
                      </td>
                      <td>{p.unit}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {!inventory.parts.length && <Empty>暂无零件档案</Empty>}
          </div>
        </>
      )}
      {view === "requests" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>申请时间</th>
                <th>工单 / 申请人</th>
                <th>零件</th>
                <th>类型 / 数量</th>
                <th>备注</th>
                <th>状态</th>
                <th>审批</th>
              </tr>
            </thead>
            <tbody>
              {inventory.requests.map((r) => (
                <tr key={r.id}>
                  <td>{date(r.createdAt)}</td>
                  <td>
                    <strong>
                      {orders.find((o) => o.id === r.workOrderId)?.orderNo ||
                        "关联工单"}
                    </strong>
                    <small>
                      {users.find((u) => u.id === r.applicantId)?.name ||
                        "维修人员"}
                    </small>
                  </td>
                  <td>{partName(r.partId)}</td>
                  <td>
                    {types[r.type]} · {r.quantity}
                  </td>
                  <td>{r.note}</td>
                  <td>
                    <Badge status={r.status} />
                  </td>
                  <td>
                    {r.status === "PENDING" && stockManage(user) && (
                      <div className="row-actions">
                        <button
                          disabled={busy}
                          className="text-button"
                          onClick={() =>
                            mutate(() =>
                              post(`/inventory/requests/${r.id}/review`, {
                                status: "APPROVED",
                              }),
                            )
                          }
                        >
                          批准
                        </button>
                        <button
                          disabled={busy}
                          className="text-button danger-text"
                          onClick={() =>
                            mutate(() =>
                              post(`/inventory/requests/${r.id}/review`, {
                                status: "REJECTED",
                              }),
                            )
                          }
                        >
                          拒绝
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!inventory.requests.length && <Empty>暂无物料申请</Empty>}
        </div>
      )}
      {view === "transactions" && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>零件</th>
                <th>单据类型</th>
                <th>数量</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {inventory.transactions.map((t) => (
                <tr key={t.id}>
                  <td>{date(t.createdAt)}</td>
                  <td>{partName(t.partId)}</td>
                  <td>{types[t.type]}</td>
                  <td>
                    {t.type === "OUT" ? "−" : "+"}
                    {t.quantity}
                  </td>
                  <td>{t.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!inventory.transactions.length && <Empty>暂无出入库流水</Empty>}
        </div>
      )}
    </>
  );
}
function PartForm({
  busy,
  save,
}: {
  busy: boolean;
  save: (body: unknown) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save(values(e));
      }}
    >
      <div className="form-grid">
        <Field label="零件编号">
          <input name="code" required maxLength={50} />
        </Field>
        <Field label="零件名称">
          <input name="name" required maxLength={100} />
        </Field>
        <Field label="规格">
          <input name="specification" maxLength={100} />
        </Field>
        <Field label="单位">
          <input
            name="unit"
            required
            maxLength={20}
            placeholder="件 / 个 / 瓶"
          />
        </Field>
      </div>
      <div className="form-footer">
        <Submit busy={busy}>保存零件</Submit>
      </div>
    </form>
  );
}
function IncomingForm({
  parts,
  busy,
  save,
}: {
  parts: Part[];
  busy: boolean;
  save: (body: unknown) => void;
}) {
  if (!parts.length) return <Empty>请先新建零件档案</Empty>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const body = values(e);
        save({ ...body, quantity: Number(body.quantity) });
      }}
    >
      <Field label="零件">
        <select name="partId">
          {parts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}（库存 {p.quantity} {p.unit}）
            </option>
          ))}
        </select>
      </Field>
      <Field label="入库数量">
        <input
          type="number"
          name="quantity"
          required
          min={1}
          max={100000}
          step={1}
        />
      </Field>
      <Field label="采购单号 / 入库备注">
        <textarea name="note" required minLength={2} maxLength={500} />
      </Field>
      <div className="form-footer">
        <Submit busy={busy}>确认入库</Submit>
      </div>
    </form>
  );
}
function MaterialForm({
  parts,
  busy,
  save,
}: {
  parts: Part[];
  busy: boolean;
  save: (body: Record<string, unknown>) => void;
}) {
  if (!parts.length) return <Empty>暂无可申请零件，请联系仓管建档</Empty>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const body = values(e);
        save({ ...body, quantity: Number(body.quantity) });
      }}
    >
      <Field label="类型">
        <select name="type">
          <option value="OUT">领料申请</option>
          <option value="RETURN">退料申请</option>
        </select>
      </Field>
      <Field label="零件">
        <select name="partId">
          {parts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}（{p.quantity} {p.unit}）
            </option>
          ))}
        </select>
      </Field>
      <Field label="数量">
        <input
          name="quantity"
          type="number"
          required
          min={1}
          max={100000}
          step={1}
        />
      </Field>
      <Field label="用途 / 退料原因">
        <textarea name="note" required minLength={2} maxLength={500} />
      </Field>
      <div className="form-footer">
        <Submit busy={busy}>提交申请</Submit>
      </div>
    </form>
  );
}
function Reports({ orders, parts }: { orders: Order[]; parts: Part[] }) {
  function download() {
    const rows = [
      ["工单号", "车牌 / VIN", "维修需求", "状态", "创建时间"],
      ...orders.map((o) => [
        o.orderNo,
        vehicleName(o.vehicle),
        o.customerRequest,
        statusNames[o.status],
        date(o.createdAt),
      ]),
    ];
    const csv =
      "\uFEFF" +
      rows
        .map((row) =>
          row
            .map(
              (cell) =>
                `"${/^[=+\-@\t\r]/.test(cell) ? "'" : ""}${cell.replaceAll('"', '""')}"`,
            )
            .join(","),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "维修工单报表.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <Metrics orders={orders} />
      <div className="toolbar">
        <h2>业务统计</h2>
        <button onClick={download}>
          <Download size={15} />
          导出工单 CSV
        </button>
      </div>
      <div className="dashboard-columns">
        <section>
          <div className="section-head">
            <h2>工单状态</h2>
          </div>
          <Distribution orders={orders} />
        </section>
        <section>
          <div className="section-head">
            <h2>零件库存汇总</h2>
          </div>
          <div className="summary-numbers">
            <span>
              零件种类<strong>{parts.length}</strong>
            </span>
            <span>
              零库存种类
              <strong>{parts.filter((p) => p.quantity === 0).length}</strong>
            </span>
            <span>
              累计工单<strong>{orders.length}</strong>
            </span>
            <span>
              取消工单
              <strong>
                {orders.filter((o) => o.status === "CANCELLED").length}
              </strong>
            </span>
          </div>
        </section>
      </div>
    </>
  );
}
function SettingsPage({
  user,
  busy,
  mutate,
}: {
  user: User;
  busy: boolean;
  mutate: Mutate;
}) {
  return (
    <section className="settings">
      <div className="section-head">
        <h2>账号与安全</h2>
      </div>
      <p>
        {user.name} · {user.username} · {roleNames[user.role]}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const body = values(e);
          const form = e.currentTarget;
          void mutate(async () => {
            await post("/auth/password", body);
            form.reset();
          }, "密码已修改");
        }}
      >
        <Field label="原密码">
          <input
            type="password"
            name="oldPassword"
            required
            autoComplete="current-password"
          />
        </Field>
        <Field label="新密码">
          <input
            type="password"
            name="newPassword"
            required
            minLength={8}
            maxLength={72}
            autoComplete="new-password"
          />
        </Field>
        <Submit busy={busy}>修改密码</Submit>
      </form>
    </section>
  );
}
