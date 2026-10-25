# 发布清单（GitHub + npm + DSH 插件市场）

按顺序做，每步都有可复制的命令。前三步由你执行（涉及你的 GitHub 账号与 npm 凭据），仓库里已经准备好了其余全部内容。

---

## 说明

所有 URL 已对准 **[HuiLiyi2026-deepdeep/dsh-top-running-tasks](https://github.com/HuiLiyi2026-deepdeep/dsh-top-running-tasks)**，`origin` 也已指好。

当前本地状态：

- `main` 上是完整发布历史（13 个提交，含你之前用 zip 导入的那两个提交，它们的 sha 与签名都原样保留）；
- `v1.0.0` 是 annotated tag，指在最新提交上；
- 提交作者已统一为 `HuiLiyi <huiliyi2026@gmail.com>`（仓库级 `git config` 也是这个身份，后续提交不会再错）；
- 远端 `origin/main` 已 fetch，并且仍是 `main` 的祖先 → **`git push origin main --follow-tags` 是 fast-forward，不需要 force**；
- 重写前的那份历史留在本地标签 `backup/before-identity-rewrite` 上（只在本机，不会被 `--follow-tags` 推上去），需要回滚时 `git reset --hard backup/before-identity-rewrite`。

## 0. 改账号（只有换账号时才需要）

若某天要换到别的账号，改这几处即可：

```powershell
npm pkg set author="<你的用户名>" repository.url="git+https://github.com/<你的用户名>/dsh-top-running-tasks.git" homepage="https://github.com/<你的用户名>/dsh-top-running-tasks#readme" bugs.url="https://github.com/<你的用户名>/dsh-top-running-tasks/issues"
```

并把本文件与两份 README 里的 URL 同步替换（`(Get-Content *.md) -replace '旧名','新名'` 一把梭即可）。


```powershell
cd E:\AI-RAG方向勘探测试\dsh-top-running-tasks

# 把 HuiLiyi2026-deepdeep 换成你的 GitHub 用户名
npm pkg set author="HuiLiyi2026-deepdeep" `
  repository.type=git `
  repository.url="git+https://github.com/HuiLiyi2026-deepdeep/dsh-top-running-tasks.git" `
  homepage="https://github.com/HuiLiyi2026-deepdeep/dsh-top-running-tasks#readme" `
  bugs.url="https://github.com/HuiLiyi2026-deepdeep/dsh-top-running-tasks/issues"

# 顺带把 LICENSE 里的署名也换掉（可选）
```

`npm pack --dry-run --json` 可以随时复核最终发布会带上的文件（当前 12 个文件 / 24 KB 压缩包）。

---

## 1. GitHub 仓库

```powershell
cd E:\AI-RAG方向勘探测试\dsh-top-running-tasks
git init -b main            # 本仓库已初始化并提交过，若重来才需要
git remote add origin https://github.com/HuiLiyi2026-deepdeep/dsh-top-running-tasks.git
git push -u origin main
```

然后在仓库页面右上角齿轮 → **Topics** 加上：

```
dsh-plugin deepseek-harness dsh cordis sidebar sessions
```

> 加 `dsh-plugin` topic 是市场侧识别的常用约定，也方便别人按 topic 找到。

## 2. npm 发布（市场走预览构建通道的前提）

```powershell
npm login                 # 第一次
npm test                  # 本地自检（prepack 也会跑）
npm publish --access public
```

- `name` 目前是空的（`registry.npmjs.org/dsh-top-running-tasks` 返回 404），可以直接占用。
- `publishConfig.access = public`、`registry` 已写好，不需要额外参数。
- 建议在 npm 账号上开启 2FA；`npm publish --provenance` 需要 CI 环境，本地发布可跳过。
- 包内声明了 `engines.dsh`（`>=0.2.1-rc.3 <0.3.0`），市场据此显示宿主要求并在不兼容时拦住安装。

## 3. GitHub Release（README 里的 tarball 安装方式依赖它）

```powershell
npm pack --pack-destination ..\dist
# 生成 ..\dist\dsh-top-running-tasks-1.0.0.tgz
```

在 GitHub 上 `Releases → Draft a new release`：

- tag：`v1.0.0`
- 标题：`v1.0.0 — first public release`
- 附件：上传 `dsh-top-running-tasks-1.0.0.tgz`
- 正文可以直接用 `CHANGELOG.md` 里 1.0.0 那段

上传后这条链接才真正可用（README 里已有）：

```
https://github.com/HuiLiyi2026-deepdeep/dsh-top-running-tasks/releases/latest/download/dsh-top-running-tasks-1.0.0.tgz
```

## 4. 提交到 DSH 插件市场

市场的数据源是 **[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)**：收录方式是给那个仓库提一个 PR，新增一个 YAML 文件（README 由脚本生成，不要手改）。

### 4.1 Fork 并新建 `data/plugins/<github-user>__<repo>.yml`

```yaml
url: https://github.com/HuiLiyi2026-deepdeep/dsh-top-running-tasks
name: HuiLiyi2026-deepdeep/dsh-top-running-tasks
category: ui
description:
  en: A section at the top of the DSH Web sidebar that lists every session running right now across all workspaces, ranked by most recent activity, and hides itself when nothing is running.
  zh: 在 DSH Web 侧栏最顶部列出此刻正在运行的会话，不分工作区、按最近活跃时间排序，没有运行中的任务时自动隐藏。
```

格式要点（以该仓库的 contributing 文档为准）：

- `url` 必须与仓库地址**完全一致**；
- `description.en` 必填、以句号结尾、只讲功能，不写营销词；
- 描述里出现 `: `（冒号+空格）要加引号；
- `category` 选不准不会被拒，维护者会改；UI 类插件用 `ui`，如果不确定就看 `data/plugins/` 下同类插件用的值。

### 4.2 重新生成 README 并一起提交

```bash
npm ci
node scripts/generate-readme.mjs
git add data/plugins/HuiLiyi2026-deepdeep__dsh-top-running-tasks.yml README.md README.zh.md
git commit -m "add dsh-top-running-tasks"
```

### 4.3 提 PR

标题：`add dsh-top-running-tasks`

CI 会检查 manifest 声明、仓库年龄、提交数、YAML 格式与 README 可重现性；全绿后维护者会读代码再合并。

> **注意收录门槛**：这类列表通常要求仓库已存在 ≥1 天、提交数 ≥10（防刷）。本仓库目前是 7 个有意义的提交，建议等仓库建满一天后再提，期间把你的迭代继续提交上去即可，**不要为了凑数拆空提交**。

## 5. 收录生效后自测「干净用户」路径

```powershell
dsh plugin --profile desktop remove dsh-top-running-tasks   # 移除本地 link 版
dsh plugin --profile desktop add dsh-top-running-tasks      # 从 npm 装
# 或：dsh plugin --profile desktop add github:HuiLiyi2026-deepdeep/dsh-top-running-tasks
```

重启并刷新页面，确认：

1. 侧栏「工作区」标题下出现 `运行中 N`；
2. 行点开跳到对应会话；
3. 全部任务跑完后整段消失，侧栏与原来一致；
4. `window.__dshTopRunningTasks.version` 是 `1.0.0`。

## 6. 以后升版

```powershell
# 1. 改 client.js 里的 VERSION 与 package.json 的 version（两处要一致）
# 2. 写 CHANGELOG
npm test
npm publish
# 3. GitHub 上打新 tag + Release 附件
```

市场每日刷新数据源，升版后在市场里会自动跟上（用户端仍以 npm 上的 latest 为准）。
