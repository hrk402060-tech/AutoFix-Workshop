# 车匠云修 AutoFix Workshop

单门店汽车维修业务系统，首期不超过 15 人。当前只开发与部署 PC 浏览器端；`mobile/` 保留早期 Flutter 草稿，暂停开发，未编译、未验证，不属于此次交付。

## 运行架构

- React + TypeScript + Vite PC 前端
- NestJS + Fastify，单 Node.js 进程，同时提供静态页面与 `/api`
- TypeORM + SQLite WAL；新版本通过迁移升级，`synchronize=false`
- `data/` 数据库，`uploads/` 照片，均不进 Git
- Ubuntu 24.04、2 vCPU / 1 GB RAM / 30 GB 磁盘，systemd，HTTP
- 不引入 PostgreSQL、Redis、MinIO 或多进程集群；单实例运行

## 当前 PC 功能

| 页面 | 可执行操作 |
| --- | --- |
| 登录与账号 | 登录、会话验证、修改密码；主管建员工账号，老板建各角色账号；停用账号立即阻止现有会话访问 |
| 管理工作台 | 真实工单统计、状态分布、最近工单、业务入口 |
| 车辆档案 | 车牌或 VIN 至少一项，新建、查询、主管编辑、关联进厂历史 |
| 工单 | 建单、多维修项目、分配多人、详情、维修记录、开始维修、提交验收、主管验收、返工、取消 |
| 照片 | 接车、维修前/中/后分类；浏览器压缩、上传、权限校验、预览 |
| 零件与仓库 | 建档、采购入库、领退料申请、审批、库存查询、流水 |
| 员工与进度 | 真实参与工单数和状态，不使用模拟百分比或维修计时 |
| 统计报表 | 当前可见范围的工单统计、零件汇总、CSV 导出 |

PC 页面参照需求 PDF 第 11 页的深色导航、紧凑表格、业务统计和蓝色操作。未把图中的虚构数据当作业务数据，也不声称逐像素还原。旧 Flutter 页面中的占位操作不代表已完成功能。

权限：老板/主管查看全店维修业务并验收；员工只能查看自己创建或参与的工单及相关车辆，自己新建的车辆可继续建单；仓管查看工单、管理库存，但不能修改维修记录。员工不能分配他人、审批物料或验收完成。照片下载同样验证工单权限。

流程：待处理 → 维修中 → 待验收 → 已完成；待验收可由主管退回返工，再提交验收。返工和取消必须留原因。提交验收前需有维修记录，工单结束前需处理全部物料申请。完成或取消后禁止追加业务内容。

库存只通过单据变化。领料审批校验库存，退料不能超过本人该工单已领未退数量，重复或并发审批不能重复扣库；库存变化、单据、操作记录在同一事务提交。

当前边界：单店单仓库；未做采购供应商账款、财务结算、短信、OCR、扫码引擎、HTTPS、自动照片归档和公网压力测试。

## Ubuntu 24.04 部署

先安装 Node.js 22、Git、SQLite CLI、编译依赖；内存紧张时在开发机或 CI 构建前端和后端，只在服务器安装生产依赖。不要在 1 GB 服务器上同时运行多个构建。

```bash
sudo apt update
sudo apt install -y git sqlite3 build-essential curl
# 通过 Node.js 官方认可的安装方式准备 Node.js 22，然后验证：
node --version
npm --version
sudo useradd --system --home /opt/autofix-workshop --shell /usr/sbin/nologin autofix
sudo git clone https://github.com/hrk402060-tech/AutoFix-Workshop.git /opt/autofix-workshop
sudo chown -R "$USER":autofix /opt/autofix-workshop
cd /opt/autofix-workshop
npm ci --prefix backend
npm run build --prefix backend
npm ci --prefix web
npm run build --prefix web
npm prune --omit=dev --prefix backend
sudo install -d -o autofix -g autofix -m 750 data uploads logs
sudo install -m 600 deploy/autofix.env.example /etc/autofix-workshop.env
sudoedit /etc/autofix-workshop.env
# JWT_SECRET 换成至少 32 字符随机值；首次部署设置 ADMIN_PASSWORD
sudo install -m 644 deploy/autofix-workshop.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now autofix-workshop
sudo systemctl status autofix-workshop
```

已有目录时不要重新克隆；在现有仓库 `git pull --ff-only`，依次构建并重启服务。升级启动会自动执行新的迁移；不要删除或重新初始化业务库。迁移增加维修记录、照片、库存单据、车辆创建人字段，旧车辆记录不丢失。

直接访问 `http://服务器IP:3000`，或安装 Nginx 后把 `deploy/nginx.conf` 放入 `sites-available` 并启用，访问 80 端口。数据库不监听网络端口，上传文件不提供公开静态目录。正式生产启动会拒绝占位或不足 32 字符的 JWT 密钥。

## 容量管理

- 浏览器接受 JPEG/PNG/WebP 原图不超过 15 MB，压缩到最长边 1600 像素、JPEG；服务端单张上限 2 MB，单工单最多 120 张。
- 照片额度默认 6 GB，可用 `UPLOAD_MAX_BYTES` 调整；上限按照片元数据累计，超过时拒绝上传，不自动删除业务照片。
- SQLite 上限设为 131072 页（默认 4 KB 页时约 512 MB），为 OS、程序和照片留空间。
- `cleanup-uploads.sh` 只清理一天前的 `.tmp` 临时文件并报告额度，不删除业务图片。照片已用空间包含元数据外文件时，应人工核查。

```bash
sudo chmod +x deploy/cleanup-uploads.sh
sudo /opt/autofix-workshop/deploy/cleanup-uploads.sh
```

root crontab（服务器时区应明确设置，下面时间按服务器本地时区）：

```cron
45 2 * * * /opt/autofix-workshop/deploy/cleanup-uploads.sh >> /opt/autofix-workshop/logs/uploads.log 2>&1
```
