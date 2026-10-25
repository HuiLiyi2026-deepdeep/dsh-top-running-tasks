# dsh-top-running-tasks

[English](README.md) · **简体中文**

把此刻**正在运行**的会话固定在 DSH Web 侧栏最顶部——工作区列表之上、不分工作区、按最近活跃时间排序。没有运行中的任务时，整段不显示。

纯客户端插件：宿主半区只有一个空 `apply()`，全部逻辑在 `client.js`。

```
侧栏
├─ 品牌 / 新会话 / 全局面板
├─ 工作区                ← 区域标题（搜索 / 视图选项 / 添加工作区）
├─ ┌ 运行中 2 ────────  ← 本插件，插在列表自己的滚动容器顶部
│  │ ● 会话标题…    proj
│  │ ● 会话标题…    other
├─ └────────────────────
├─ 工作区分组一
└─ 工作区分组二
```

## 它是什么 / 不是什么

- **是**一个从会话状态推导出来的只读视图。点任意一行即打开该会话（走官方导航服务 `uiWorkspace.openSession`）。
- **不是**官方槽位。`sidebar.workspaces` 是 `single` 槽、区域内没有可插入的洞，外部插件也无法声明新槽位——所以本插件走 `shell.overlay`（加法槽）渲染，再 portal 进自己创建的 host 元素，插到列表自己的滚动容器里。**不自带浏览器实现、不替换任何自带 UI。**
- 没有设置项、没有持久化状态：区域内容完全是会话状态的函数。禁用插件时 host、样式表和观察器一并移除，滚动容器恢复原样。

## 安装

```sh
# 从 npm（发布后）
dsh plugin add dsh-top-running-tasks

# 从本地目录
dsh plugin add ./dsh-top-running-tasks

# 从 Release tarball
dsh plugin add https://github.com/yiyu123-creat/dsh-top-running-tasks/releases/latest/download/dsh-top-running-tasks-1.0.0.tgz
```

桌面版也可以在「插件」页里装。包内声明了 `dsh.bundle`，profile 会挂载它的 `cordis.patch.yml` 行，客户端注册表随之为浏览器提供 `./client.js`。

新装后需要**刷新一次页面**才生效（`application: applied` 只代表组合变了，不代表浏览器换了模块）。区域出现的条件是此刻确实有会话在跑——正在生成本条回复的那个会话本身也算。

## 实现要点

1. **数据**：每个根级槽条目都能拿到的标准 hook —— `useSessions`（`{ phase, ids, byId }`）、`useSessionStatus`（`Map<id, { running, pendingInteraction, completionUnread }>`）、`useWorkspaces`（归属 + `archivedSessionIds`）。只保留 `running === true` 的会话；跳过 subagent 与已归档会话。
2. **排序**：活跃时间取 `status.updatedAt / lastActivityAt / activityAt / startedAt` 与 `session.updatedAt / lastActivityAt / activityAt` 中的最大值（兼容 epoch 毫秒与 ISO 字符串），倒序。
3. **CSS `order`，不移动节点**：
   - **位置**：滚动容器加一条属性选择器规则变成 `flex column`，host 带 `order:-1`，并且只做 `appendChild`。这样 React reconciliation 无论怎么插自己的行，都不可能把区域挤到下面——这正是「必须在最顶部」最容易被 React 打破的地方。
   - **排名**：插件自己的行保持**稳定的 DOM 顺序（按会话 id）**，用 `style.order = rank` 表达名次。运行中的列表名次一直在变，靠移动 DOM 节点会让鼠标悬停（或键盘焦点）所在的行中途换成另一个任务；只改一个样式属性则不会。
   - **回退**：滚动容器若不是块级元素（grid、flex-row），或某条自带样式用 `!important` 压制了 flex 覆盖，插件**不动它的 display**，改为把 host 保持在容器的 `firstElementChild`。策略在每次 attach 时先读原生 `display` 再决定。
4. **自愈**：`MutationObserver`（区域 `childList/subtree` + 根节点 `class`）加 1.5s 兜底轮询。缓存节点只在断连时重新解析，模式判断每拍都做（侧栏收起、列表被整体替换都能跟上）。
5. **边界**：侧栏收成 rail 时区域不可见 → host 摘除、标记移除，自带 rail 一个像素都不动；展开后自动挂回。快照形状不认识时降级为「不显示」，绝不向 slot 渲染器抛错（抛错会让条目在整个会话里被退役）。
6. **样式**：只用主题 token（`--dsw-alias-label-primary/secondary`、`--dsw-alias-brand-primary`、`--dsw-alias-bg-layer-2`、`--dsw-alias-border-l2`），各带字面量兜底；呼吸点尊重 `prefers-reduced-motion`。

### 一个值得记住的坑：`[data-slot]` 是 `display: contents`

自带渲染器给**每个** slot 出口套的包装都是
`<div data-slot="…" style="display:contents">`（`@deepseek-ai/dsh-client-ui-renderer` 里的 `ANCHOR_STYLE`）。`display:contents` 的元素不产生盒子，所以它的 `getClientRects()` **永远是空的**——哪怕侧栏完全展开。拿这个包装判可见性，就等于每次 reconcile 都判「隐藏」并静默摘除。

现在可见性只判**有盒子的列表区**；侧栏收起时 `.regionArea{display:none}` 会让所有后代都没有 rects，判断依然准确。这条约束写死在 `isVisible()` 的注释里——**不要把 `[data-slot]` 锚点传给它**。

## 自检

```sh
npm test
```

用桩化的动态模块协议加载 `client.js`，校验：模块 id、`apply` 只注册一个 `shell.overlay` 条目（id / order / locale / `openSession` 注入）、`deriveRows` 的筛选（只 `running`、排除 subagent 与归档、status 时间戳优先于会话时间戳）、DOM 顺序稳定、渲染树的 `order` 值与点击行为，以及全部降级路径（空态、未知快照形状、未绑定 locale）。`prepack` 会跑它，坏包发不出去。

DOM 注入部分另外在真实浏览器里、对一套**照抄真实结构**的骨架验证过（`display:contents` 的 `[data-slot]` 锚点、`root / listArea / treeBody / list` 的 flex 与 overflow、滚动容器上的 `role="tree"`）：锚点 rects 为 0 时仍能挂上、`order:-1` 让 host 正好落在区域标题下沿与首行之间、行插到它之前或之后都不夺位、`display:none` 祖先下摘除、卸载后滚动容器回到 `display:block`。

## 调试

浏览器控制台：

```js
window.__dshTopRunningTasks.version   // 当前标签页跑的是哪一代
window.__dshTopRunningTasks.inspect()
// { version, region, listArea, listAreaVisible, scroller, flexColumn, host, probe }
//   probe = { phase, sessions, running, rows: [{ id, title, where, rank }] }
window.__dshTopRunningTasks.deriveRows(list, statuses, workspaceState)  // 纯函数
```

`probe` 把「区域为什么没出现」的两种完全不同的原因分开：`probe.running === 0` 表示此刻确实没有会话在跑；`probe.sessions > 0` 而 `running` 一直为 0，表示状态快照的形状和这个构建不符。锚点找不到时，控制台会有一条**只打一次**的 `[dsh-top-running-tasks] section hidden: …`，写明是哪一环没找到。

## 已知限制

1. 依赖自带侧栏的 DOM 事实：`[data-slot="sidebar.workspaces"]`、类名含 `listArea` 的列表区、类名以 `_list` 结尾（或带 `role="tree"`）的滚动容器、行上的 `data-row-key`。DSH 若重构侧栏，需要同步 `client.js` 里的 `SELECTORS` 与 `resolve()`；每处都有结构性兜底，找不到只警告、不报错。
2. 挂载点按需求放在**列表滚动容器的顶部**（区域标题与搜索框之下、所有工作区分组之上），所以它跟着列表一起滚动，而不是浮在标题之上。
3. 名次用 CSS `order` 表达，键盘 Tab 顺序仍按稳定的 DOM 顺序（会话 id）而非视觉名次；行数通常只有个位数。
4. 要求 DSH `>=0.2.1-rc.3 <0.3.0`（实测 `0.2.1-rc.3`）。

## 许可

MIT
