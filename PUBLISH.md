# 发布清单（GitHub + npm + DSH 插件市场）

仓库：**https://github.com/HuiLiyi2026-deepdeep/dsh-top-running-tasks**

---

## 现状（2026-10-28）

| 项 | 状态 |
|---|---|
| 代码 | 已推到 `main`：13 个提交、作者 `HuiLiyi <huiliyi2026@gmail.com>`、16 个文件 |
| 标签 | `v1.0.0` 已推 |
| 远端核对 | HEAD `9d82133`；`scripts/verify.mjs` / `PUBLISH.md` / `.gitignore` / `.gitattributes` 均在；`package.json` 指向本仓库 |
| 本地校验 | `npm test` ✅、`npm run verify` 43 项 ✅ |
| 发布包 | `E:\AI-RAG方向勘探测试\dist\dsh-top-running-tasks-1.0.0.tgz`（24 KB，12 文件） |
| **还差** | npm 登录并发布 → 建 GitHub Release → 提市场上架 PR |

---

## 0. 网络：github.com 连不上时怎么推

这台机器上 `github.com:443` 经常不通（TCP 偶通、TLS 被打断），但 `ssh.github.com:443` 稳定可用。仓库已按下面的方式配好，日常直接 `git push` 就行。

`~/.ssh/config`（**必须是无 BOM 的 UTF-8/ASCII**；带 BOM 会让 git 自带的 ssh 报 `Bad configuration option: ﻿#`）：

```text
Host github.com
  HostName ssh.github.com
  Port 443
  User git
  IdentityFile ~/.ssh/id_ed25519
```

`origin` 已经是 `git@github.com:HuiLiyi2026-deepdeep/dsh-top-running-tasks.git`，推送走 443 隧道，不经过被封的 `github.com`。

如果哪天又有代理可用，也可以临时走 HTTPS：

```powershell
git -c http.proxy=http://127.0.0.1:7890 push https://github.com/HuiLiyi2026-deepdeep/dsh-top-running-tasks.git main
```

---

## 1. 发布到 npm

`dsh-top-running-tasks` 这个名字在 npm 上是空的（实测 404），可以直接占用。

```powershell
cd E:\AI-RAG方向勘探测试\dsh-top-running-tasks
npm login                 # 浏览器授权或粘贴 OTP
npm publish --access public
```

- `publishConfig.access = public`、`registry` 已写好，不必再加参数。
- 发布前 `prepack` 会自动跑 `node tests/selfcheck.cjs`，自检不过会中止发布。
- 发完核对：`curl.exe -s -o NUL -w "%{http_code}" https://registry.npmjs.org/dsh-top-running-tasks` 应返回 `200`。

## 2. GitHub Release（README 的 tarball 安装链接依赖它）

仓库 → Releases → Draft a new release：

- tag：`v1.0.0`（已存在，直接选）
- 标题：`v1.0.0 — first public release`
- 附件：上传 `E:\AI-RAG方向勘探测试\dist\dsh-top-running-tasks-1.0.0.tgz`
- 正文：可用 `CHANGELOG.md` 的 1.0.0 段

上传后这条链接才可用：

```text
https://github.com/HuiLiyi2026-deepdeep/dsh-top-running-tasks/releases/latest/download/dsh-top-running-tasks-1.0.0.tgz
```

## 3. 提交到 DSH 插件市场（PR）

市场数据源是 [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)，收录方式是提 PR 新增一个 YAML（README 由脚本生成，不要手改）。

1. Fork 该仓库，新建 `data/plugins/HuiLiyi2026-deepdeep__dsh-top-running-tasks.yml`，内容：`E:\AI-RAG方向勘探测试\dist\awesome-dsh-plugin-entry.yml`
2. 本地重新生成 README 并一起提交：

   ```bash
   npm ci
   node scripts/generate-readme.mjs
   git add data/plugins/HuiLiyi2026-deepdeep__dsh-top-running-tasks.yml README.md README.zh.md
   git commit -m "add dsh-top-running-tasks"
   git push
   ```

3. 提 PR，标题 `add dsh-top-running-tasks`。
4. 收录门槛通常是「仓库满 1 天 + ≥10 提交」——本仓库 2026-10-25 建、13 个提交，已满足。合并后市场每日刷新，通常一天内出现。

YAML 格式要点（以该仓库 contributing 文档为准）：`url` 必须与仓库地址完全一致；`description.en` 必填、以句号结尾、只讲功能；描述里出现 `: ` 要加引号；`category` 选不准不会被拒。

## 4. 收录后自测「干净用户」路径

```powershell
dsh plugin --profile desktop remove dsh-top-running-tasks   # 移除本地 link 版
dsh plugin --profile desktop add dsh-top-running-tasks      # 从 npm 装
# 或：dsh plugin --profile desktop add github:HuiLiyi2026-deepdeep/dsh-top-running-tasks
```

重启并刷新页面，确认：侧栏「工作区」标题下出现 `运行中 N`；点行能跳到对应会话；任务跑完后整段消失；`window.__dshTopRunningTasks.version` 是 `1.0.0`。

## 5. 以后升版

1. 改 `client.js` 里的 `VERSION` 与 `package.json` 的 `version`（**两处要一致**，`npm run verify` 会检查）
2. 更新 `CHANGELOG.md`
3. `npm test && npm run verify`
4. `git commit` → `git tag -a v1.x.y` → `git push --follow-tags`
5. `npm publish`
6. GitHub 打 Release、上传新 tarball

---

## 附：这台机器上的两个坑（都已绕开，别踩第二次）

1. **BOM**：用 PowerShell 的 `Set-Content -Encoding utf8` 写 `~/.ssh/config` 或提交信息会带 BOM，前者让 git 的 ssh 拒绝整个配置、后者让提交信息首字符变成不可见字符。写配置用 `[System.IO.File]::WriteAllText(..., New-Object System.Text.UTF8Encoding($false))`；写提交信息直接把内容用 `-m` 传给 `git commit`。
2. **`sh.exe` 在某些受限模式下滑不起来**，`git rebase -x` / `filter-branch` 会因此失败；要批量改历史时用 PowerShell 循环调 `git commit-tree`（本仓库的作者重写就是这么做的）。
