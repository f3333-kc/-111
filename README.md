# 护航单统计

面向小团队共用的护航订单网页应用。用户从浏览器访问并登录后，可以录入、修改、删除订单，查看总单数、总金额，并按打手、客户或玩法汇总和筛选。此版本不包含赔付、分账、对局记录或 Excel/CSV 导出。

## 本地预览

需要安装 Node.js。项目目录中运行：

```powershell
npm install
$env:ADMIN_USERNAME = "admin"
$env:ADMIN_PASSWORD = "仅用于本地预览的密码"
$env:JWT_SECRET = "本地预览用的至少32字符随机密钥"
npm start
```

浏览器打开 `http://localhost:3000`。不设置 `DATABASE_URL` 时，订单保存在本机的 `guard.db`。本地预览配置不能用于公开部署。

## 发布给不同地点的人共用

公开运行需要部署到支持 Node.js 的网络服务，并连接 PostgreSQL 数据库。不要依赖主机上的本地 SQLite 文件：云服务可能在重启或重新发布时清除本地文件。

在托管平台的环境变量设置以下值，不要把密码或密钥写进代码或提交到公开仓库：

| 环境变量 | 用途 |
| --- | --- |
| `NODE_ENV` | 设置为 `production` |
| `DATABASE_URL` | PostgreSQL 数据库连接地址 |
| `ADMIN_USERNAME` | 所有人共用的登录用户名 |
| `ADMIN_PASSWORD` | 所有人共用的强密码，至少 12 个字符 |
| `JWT_SECRET` | 至少 32 个字符的随机密钥 |
| `PORT` | 由托管平台提供；通常无需手动设置 |

生产模式缺少这些配置、仍使用默认账号，或没有 PostgreSQL 地址时，服务会拒绝启动，避免公开默认密码或使用可能会丢失数据的本地文件。使用托管平台提供的 HTTPS 网址登录；只把共用账号密码交给可信任的成员。

`render.yaml` 是 Render Web Service 的基础配置；PostgreSQL 数据库需要单独创建并把连接地址填入 `DATABASE_URL`。

### Render 免费试用：只用于测试数据

Render 当前的免费方案适合试用，不适合保存真实订单：

- 免费网站连续约 15 分钟没有访问会休眠；下次打开可能需要约一分钟启动。
- 免费 PostgreSQL 数据库创建 30 天后过期；过期后有 14 天升级期限，之后数据库及订单会被删除。
- 因此请先用虚构测试单验证功能。不要在免费数据库里录入真实订单，也不要把免费试用当作备份。

具体限制以 [Render 免费方案说明](https://render.com/docs/free) 为准。若要长期记录真实订单，应先确认服务商当前收费、数据库留存和备份政策，再选择稳定的付费方案。

### 自己发布到 Render

以下步骤会由你在自己的 GitHub 和 Render 账号中操作；**不要把密码、验证码、数据库连接地址或 JWT 密钥发到聊天里**。

1. 在 GitHub 新建一个**私有仓库**，仓库初始化选项可以留空。
2. 打开 Windows PowerShell，执行：

   ```powershell
   Set-Location "C:\Users\Administrator\Desktop\单子统计"
   git init
   git add .
   git status --short
   ```

   检查待上传文件列表：确认没有 `.env`、`guard.db`、`data.json`、`app-config.json`、订单导出文件或任何真实密码、密钥。`.gitignore` 已排除本地数据库、配置、打包产物和依赖目录；**不要用 `git add -f` 强行添加被排除的文件**。

3. 确认列表安全后，提交代码并把下面的地址替换成 GitHub 私有仓库页面给出的地址：

   ```powershell
   git branch -M main
   git commit -m "Prepare app for online trial"
   git remote add origin https://github.com/你的GitHub用户名/你的仓库名.git
   git push -u origin main
   ```

   GitHub 若要求验证，请只在 GitHub 或本机弹出的登录窗口中完成。
4. 在 Render 选择 **New → PostgreSQL**，先选免费方案做测试，创建后在数据库页面复制 **Internal Database URL**。后续 Web Service 和数据库应选择同一地区。
5. 在 Render 选择 **New → Web Service**，连接刚才的 GitHub 私有仓库。构建命令用 `npm install`，启动命令用 `node server.js`，试用时选择 Free。
6. 在 Web Service 的 Environment 页面添加 `NODE_ENV=production`、`DATABASE_URL`、`ADMIN_USERNAME`、`ADMIN_PASSWORD`、`JWT_SECRET`。用户名自行设置；密码至少 12 个字符；`JWT_SECRET` 使用随机生成的 32 个以上字符。不要用示例值。保存后等待部署成功。
7. 打开 Render 分配的 HTTPS 网址，用测试账号登录，试录一条虚构订单，确认统计正确且刷新后仍存在，再测试修改和删除。由于免费数据库有过期删除风险，测试完成后不要录入真实业务数据。

第一次上传时，本机数据库 `guard.db` 和旧数据文件不会上传。当前检查到本机订单数为 0。若之后本机有真实订单，上传前先单独备份，并另行确认安全迁移方案。

## 数据说明

- 订单记录保存在服务端数据库中，所有登录成员共用同一份数据。
- 打手和玩法选项由已有订单整理；客户名直接填写。
- 原有本机数据不会自动上传到云端。发布前如需保留旧数据，请先单独备份并确认迁移方式。
- 不要公开分享部署网址和共用账号密码。共用账号下的每位成员都可以修改和删除订单。

## 测试

```powershell
npm test
```
