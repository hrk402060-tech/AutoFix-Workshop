# 车匠云修 AutoFix Workshop

面向单个汽车维修厂的轻量维修业务系统，员工、主管、仓管和老板共用，首期不超过 15 人。

## 轻量部署基线

- Ubuntu 24.04
- 2 vCPU / 1 GB 内存 / 30 GB ESSD
- 单进程 Node.js + Fastify + NestJS 模块化单体
- SQLite，启用 WAL，数据库文件位于独立 `data/` 目录
- 本地 `uploads/` 保存图片和附件，数据库只保存相对路径和元数据
- 前期 HTTP，通过服务器 IP 访问
- 正式部署优先使用 systemd；Docker Compose 仅作为可选单容器方式
- 不使用 PostgreSQL、Redis、MinIO、Kubernetes 或复杂容器集群

## 目录

```text
backend/      NestJS API、实体和 SQLite 迁移
web/          React + TypeScript PC 后台
mobile/       Flutter 员工端/管理端基础入口
deploy/       systemd、备份和容量维护脚本
data/         SQLite 数据库（运行时创建，不提交）
uploads/      图片和附件（运行时创建，不提交）
```

## 本地开发

```bash
cd backend
npm install
set DATABASE_PATH=./data/autofix.sqlite
set JWT_SECRET=local-dev-secret
npm run start:dev
```

另开终端启动 PC 后台：

```bash
cd web
npm install
npm run dev
```

后端默认 `http://localhost:3000`，Web 默认 `http://localhost:5173`。

默认管理员账号：

```text
用户名：admin
密码：Admin@123
```

首次登录后应修改密码。默认账号只用于初始部署。

## Ubuntu 24.04 正式部署

服务器只需要 Node.js 22、npm 和 systemd。建议把代码放在 `/opt/autofix-workshop`：

```bash
sudo apt update
sudo apt install -y git curl build-essential sqlite3
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo useradd --system --home /opt/autofix-workshop --shell /usr/sbin/nologin autofix || true
sudo mkdir -p /opt/autofix-workshop/{data,uploads,backups,logs}
sudo chown -R $USER:$USER /opt/autofix-workshop
git clone https://github.com/hrk402060-tech/AutoFix-Workshop.git /opt/autofix-workshop
cd /opt/autofix-workshop
mkdir -p data uploads backups logs
sudo chown -R autofix:autofix /opt/autofix-workshop
sudo -u autofix -H bash -lc 'cd /opt/autofix-workshop/backend && npm install && npm run build'
sudo -u autofix -H bash -lc 'cd /opt/autofix-workshop/web && npm install && npm run build'
```

将 `deploy/autofix-workshop.service` 安装到 `/etc/systemd/system/`，然后：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now autofix-workshop
sudo systemctl status autofix-workshop
```

服务监听 `0.0.0.0:3000`。前期可以直接访问 `http://服务器IP:3000`。如果需要标准 80 端口，再单独使用一个 Nginx 反向代理，配置见 `deploy/nginx.conf`。

## 备份和容量

每日执行 `deploy/backup.sh`，SQLite 使用在线备份方式复制数据库，保留最近 7 份；`deploy/cleanup-uploads.sh` 会删除临时文件并报告容量。建议通过 root 的 cron 每天凌晨运行：

```cron
15 2 * * * /opt/autofix-workshop/deploy/backup.sh >> /opt/autofix-workshop/logs/backup.log 2>&1
45 2 * * * /opt/autofix-workshop/deploy/cleanup-uploads.sh >> /opt/autofix-workshop/logs/uploads.log 2>&1
```

默认容量建议：

- 数据库目录预留至少 2 GB
- `uploads/` 预留 20 GB
- 单个图片/附件限制 10 MB
- 图片上传前压缩到合理分辨率
- 保留 7 天数据库备份

## 第一版核心模块

登录和角色权限、车辆档案、车牌/VIN 查询、接车建单、维修项目、工单分配、多人参与、维修中、主管验收/返工和操作日志已建立基础接口。库存、领料/退料、车辆照片和维修照片按同一数据访问层继续扩展。

