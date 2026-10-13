# 更新日志

本文件记录 dsh-plugin-nickname 的所有版本变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本遵循语义化版本规范。

## [v0.3.0] - 2026-10-13

### 新增
- **官方插件保护**：`@deepseek-ai/*` 命名空间与 dsh 内置 bundle（`@deepseek-ai/dsh-base`、`dsh-web-app`、`dsh-headless`、`dsh-sdk-app`、`dsh-acp-app`、`dsh-sdk-minimal`，取自 dsh 自己的 `BUILTIN_PROFILE_BUNDLES`）默认不参与改名
  - `replaceNicknames` 过滤掉官方包
  - `saveNickname` 在写入前拦截，绕过界面（如 `window.__setPluginNickname`）也改不动
  - 面板里官方条目带「官方」角标，输入框 `disabled`，占位文案为「官方插件，默认不可改名」
- **「改官方」开关**：面板「高级」区的复选框（设置项 `allowOfficial`，默认 `false`），勾上后官方插件恢复正常改名能力；面板头部改为 `flex-wrap` 布局，避免控件过多时挤爆

### 说明
- 官方插件改名后容易在 dsh 的更新、排障、官方支持场景下造成混淆，因此改为默认屏蔽
- 此改动会停掉此前对官方插件已设的备注（备注数据保留，勾上开关即恢复生效）

## [v0.2.9] - 2026-10-13

### 修复
- **真实浏览器下备注不生效**：替换守卫写的是 `el.children.length !== 0 && el.childNodes.length > 2`，其中 `childNodes` 会把换行产生的空白文本节点算进去。同一份 DOM 由 React 渲染（元素之间无空白文本节点）时 `childNodes.length` 为 1，手写 HTML 带缩进换行时为 3 —— 后者直接被守卫挡掉。改为只按**元素子节点**计数（`el.children.length > 2`），与渲染方式无关
- **插件改写自己的界面**：编辑面板里每个条目的包名标签，文本恰好就是包名，会被自己的替换逻辑命中并改成备注名，导致面板上「标签」和「输入框」显示成同一个值。现在 `replaceNicknames` 跳过所有位于 `[data-nickname-ui]` 内部的节点

### 新增
- `tests/harness/index.html`：按 dsh `CardHead` / `PackageCard` 结构复刻的插件列表页
- `tests/browser-check.mjs` + `npm run test:browser`：用本机 Chromium 加载该页面并断言 7 项（替换生效、按钮完好、图标描述未丢、面板渲染、面板标签仍是包名）。找不到 Chromium 时打印 SKIP 并以 0 退出

## [v0.2.8] - 2026-10-13

### 修复
- **备注完全不生效**：dsh 的插件名是 `<button class="cardTitle">`，外层还套着 `div.titleRow` / `div.cardMain`。v0.2.6 起把写入改成「只改写直接文本节点、不破坏子元素」后，容器里没有直接文本节点，`findText` 返回失败，整个替换被跳过 —— 表现为面板能打开、备注能保存，但列表上毫无变化。现改为向下定位真正承载文本的叶子节点再写入
- **标题按钮被抹掉**：v0.2.5 及更早直接 `el.textContent = 备注`，命中 `div.titleRow` 时会把里面的 `<button>` 一起清空，列表项失去点击能力（用真实 DOM 复现：替换后 `button.cardTitle` 变为 `null`）
- 支持 dsh 的「显示名 (包名)」标题形式（如 `上下文 (dsh-context)`），这类标题原来既不等于包名也不以包名开头，永远匹配不上
- 还原逻辑改为按记录的原标题回写，不再统一回写成包名，避免把「显示名 (包名)」还原成裸包名

### 优化
- 默认扫描选择器补上 `button`
- `scanPlugins` 改以 dsh 卡片上的 `data-plugin-package` 属性为准收集已安装插件
- 修掉上一轮补丁把 `initShortcut` 守卫与赋值挤到同一行的排版问题

## [v0.2.7] - 2026-10-13

### 新增
- 适配无 `__ModuleLoader__` 的宿主环境（dsh web 版）：检测不到模块加载器时监听 `DOMContentLoaded` 自行启动，并把 dispose 挂到 `window.__nicknameDispose`
- 存储读写统一走 `storageGet` / `storageSet` / `storageRemove`，localStorage 被禁用时降级到内存存储，不再抛异常中断
- 扫描选择器（`scanSelector`）与包名匹配正则（`namePattern`）可在面板「高级」里配置，dsh 改版导致 DOM 结构变化时无需改代码；选择器或正则非法时自动回退到默认值
- 检测不到插件列表时，浮动按钮上方出现「未检测到插件列表，点此刷新页面」提示；面板底部新增「刷新页面使改动生效」按钮

### 修复
- 首次初始化固定 `setTimeout(..., 1000)`，按钮和备注要等满 1 秒；改为立即执行 + 每 200ms 重试（最多 10 次，约 2 秒），实测 150ms 内即生效
- `dispose` 只清理当时存在的 UI，宿主若在 dispose 之后补渲染出按钮就会残留；改为给注入的 UI 打会话标记 `data-nickname-ui`，dispose 时按标记在 0 / 200 / 600ms 做三轮清扫

### 优化
- `initShortcut` 增加幂等守卫，重试初始化不会重复注册 keydown 监听

## [v0.2.6] - 2026-10-13

### 修复
- 替换插件名时用 `textContent` 覆盖整个元素，会把插件卡片里的图标等子元素一起抹掉；改为只改写直接文本节点
- 包名存在包含关系时（如 `dsh.plugin` 与 `dsh.plugin-manager`），短包名会抢先命中长包名的文本；改为按包名长度降序匹配
- 编辑面板渲染时包名与备注未转义，备注里输入 `"` 或 `<` 会破坏面板结构；改为渲染前 HTML 转义
- 重置 / 导入备注后调用的 `openEditPanel()` 命中「已存在则移除并返回」分支，导致面板被关闭而非刷新；拆出 `closeEditPanel` / `toggleEditPanel`
- 反复开关面板会向 `<head>` 累积 `<style>` 标签，且旧面板的外部点击监听未移除；关闭时统一清理
- dispose 未清理 MutationObserver 的防抖定时器与 `window.__setPluginNickname`、`window.__nicknameTimer`
- 导出 JSON 时 `<a>` 未挂入文档且 `URL.revokeObjectURL` 立即执行，部分浏览器可能中断下载

### 优化
- MutationObserver 的防抖定时器从 `window.__nicknameTimer` 移入闭包；一轮扫描结束后用 `takeRecords()` 丢弃自身写入触发的变更记录，减少无意义的全量重扫
- `scanPlugins` 额外从 `[data-original-name]` 收集包名，DOM 重排后仍能取回已替换的包名

## [v0.2.5] - 2026-10-13

### 修复
- 编辑面板样式注入时向未声明变量 `style` 赋值，在 `'use strict'` 严格模式下抛出 `ReferenceError`，导致面板可能无法正常打开
- 注入的 `<style>` 元素未保存到已声明的 `styleEl`，dispose 清理时该变量始终为 null，样式标签无法移除，造成残留

## [v0.2.4] - 2026-10-13

### 新增
- 卸载插件按钮：一键清除插件的全部本地数据（备注映射、设置、按钮位置），并提示用户在 dsh 插件列表完成卸载

## [v0.2.3] - 2026-10-13

### 修复
- 关闭插件后 UI 残留的问题，完善 dispose 清理逻辑

## [v0.2.2] - 2026-10-13

### 新增
- 排序：支持按原名称 / 按备注名排序
- 分组：支持按是否有备注分组显示

### 优化
- UI 样式：更美观的深色主题设计

## [v0.2.1] - 2026-10-13

### 优化
- UI 样式与 dsh 深色主题更匹配
- 浮动按钮新增悬停效果与过渡动画

## [v0.2.0] - 2026-10-13

### 新增
- 总开关：一键启用 / 禁用全部备注替换
- 重置按钮：一键清除所有自定义备注
- 浮动按钮可自由拖动，位置自动保存，刷新后不变

## [v0.1.2] - 2026-10-13

### 修复
- 关闭插件后遗留浮动按钮的问题

### 新增
- dispose 清理函数：卸载时自动移除所有 DOM 元素、定时器与事件监听

## [v0.1.1] - 2026-10-13

### 新增
- 搜索框：插件数量多时快速查找
- 导出 / 导入：把备注列表导出为 JSON 文件或从文件导入
- 点击面板外部自动关闭编辑面板

## [v0.1.0] - 2026-10-13

### 新增
- 首次发布
- 插件中文备注名自定义与原生列表内替换显示
- 左下角浮动按钮与可视化编辑面板
- 快捷键 `Ctrl+Shift+N` 打开面板
- 悬停显示原英文包名
