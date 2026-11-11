// styles.js

const ANNOUNCEMENT_CSS = `
* {
    box-sizing: border-box;
}

html,
body {
    margin: 0;
    padding: 0;
    width: 1200px;
    background: #F4F5F7;
    color: #1f2937;
    font-family:
        "Noto Sans CJK SC",
        "WenQuanYi Zen Hei",
        sans-serif;
}

body {
    padding: 36px;
}

.card {
    width: 100%;
}

/* ==============================
   顶部版本卡片
============================== */

.header {
    padding: 38px 42px;
    border-radius: 16px;
    background: #1E3A8A;
}

.brand {
    color: rgba(255, 255, 255, 0.65);
    font-size: 19px;
    font-weight: 700;
    letter-spacing: 2px;
}

.version {
    margin-top: 18px;
    color: #ffffff;
    font-size: 82px;
    font-weight: 800;
    line-height: 1.15;
}

.time {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 20px;
    color: rgba(255, 255, 255, 0.72);
    font-size: 19px;
}

.time svg {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
}

/* ==============================
   主体布局
============================== */

.main {
    margin-top: 22px;
}

/* 白色卡片 */

.block {
    margin-bottom: 18px;
    padding: 28px 32px;
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 3px 12px rgba(15, 23, 42, 0.045);
}

.block:last-child {
    margin-bottom: 0;
}

.block-title {
    margin-bottom: 22px;
    color: #1f2937;
    font-size: 26px;
    font-weight: 800;
}

/* ==============================
   游戏版本卡片
============================== */

.game-list {
    display: flex;
    gap: 18px;
}

.game-empty {
    flex: 1;
    padding: 19px 22px;
    border-radius: 8px;
    background: #f8fafc;
    color: #9ca3af;
    font-size: 18px;
}

.game-card {
    flex: 1;
    min-width: 0;
    padding: 19px 22px;
    border-left: 6px solid;
    border-radius: 8px;
    background: #f8fafc;
}

.game-card.ets2 {
    border-left-color: #2563eb;
}

.game-card.ats {
    border-left-color: #ea8a32;
}

.game-name {
    color: #9ca3af;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.5px;
}

.game-version {
    margin-top: 10px;
    color: #1e293b;
    font-size: 34px;
    font-weight: 800;
    line-height: 1.3;
}

/* ==============================
   公告内容
============================== */

.notice-section {
    margin-bottom: 26px;
}

.notice-section:last-child {
    margin-bottom: 0;
}

.section-heading {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 22px;
    color: #1f2937;
    font-size: 27px;
    font-weight: 800;
}

.heading-bar {
    width: 6px;
    height: 27px;
    border-radius: 4px;
    background: #2563eb;
}

/* 正文 */

.content {
    color: #374151;
    font-size: 22px;
    line-height: 1.75;
    overflow-wrap: anywhere;
    word-break: break-word;
}

/* 分类标签 */

.category-tag {
    display: inline-block;
    margin: 12px 0 8px;
    padding: 5px 15px;
    border-radius: 20px;
    background: #eaf2ff;
    color: #2563eb;
    font-size: 17px;
    font-weight: 700;
    line-height: 1.6;
}

/* 游戏名称子标题 */

.content h3 {
    margin: 18px 0 12px;
    color: #1f2937;
    font-size: 24px;
    font-weight: 800;
    line-height: 1.5;
}

.content h1,
.content h2,
.content h4,
.content h5,
.content h6 {
    margin: 20px 0 12px;
    color: #1f2937;
    font-weight: 800;
    line-height: 1.5;
}

.content h1 {
    font-size: 30px;
}

.content h2 {
    font-size: 27px;
}

.content h4 {
    font-size: 22px;
}

.content h5 {
    font-size: 20px;
}

.content h6 {
    font-size: 19px;
}

/* 段落 */

.content p {
    margin: 10px 0;
}

.content p:first-child {
    margin-top: 0;
}

.content p:last-child {
    margin-bottom: 0;
}

/* 粗体 */

.content strong {
    color: #1f2937;
    font-weight: 800;
}

/* 斜体 */

.content em {
    color: #64748b;
    font-style: italic;
}

/* 删除线 */

.content del {
    color: #9ca3af;
    text-decoration: line-through;
}

/* 列表 */

.content ul,
.content ol {
    margin: 10px 0;
    padding-left: 30px;
}

.content li {
    margin: 6px 0;
    padding-left: 5px;
}

.content li::marker {
    color: #2563eb;
}

.content li > ul,
.content li > ol {
    margin: 5px 0;
}

/* 行内代码 */

.content code {
    padding: 2px 7px;
    border-radius: 5px;
    background: #f1f3f5;
    color: #8b929c;
    font-size: 17px;
    font-family: Consolas, monospace;
}

/* 代码块 */

.content pre {
    margin: 16px 0;
    padding: 16px;
    overflow: hidden;
    border-radius: 8px;
    background: #1e293b;
    color: #e5e7eb;
    white-space: pre-wrap;
    word-break: break-word;
}

.content pre code {
    padding: 0;
    background: transparent;
    color: inherit;
    font-size: 18px;
    line-height: 1.7;
}

/* 引用 */

.content blockquote {
    margin: 16px 0;
    padding: 12px 18px;
    border-left: 4px solid #2563eb;
    border-radius: 0 8px 8px 0;
    background: #f1f5f9;
    color: #64748b;
}

.content blockquote p {
    margin: 4px 0;
}

/* 分割线 */

.content hr {
    margin: 20px 0;
    border: none;
    border-top: 1px solid #e5e7eb;
}

/* 超链接 */

.content a {
    color: #2563eb;
    text-decoration: underline;
}

/* 图片 */

.content img {
    display: block;
    max-width: 100%;
    height: auto;
    margin: 14px 0;
    border-radius: 8px;
}

/* 表格 */

.content table {
    width: 100%;
    margin: 16px 0;
    border-collapse: collapse;
    font-size: 19px;
}

.content th,
.content td {
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    text-align: left;
}

.content th {
    background: #f1f5f9;
    color: #1e3a8a;
    font-weight: 800;
}

.content tr:nth-child(even) {
    background: #f9fafb;
}
`

const HISTORY_CSS = `
* {
    box-sizing: border-box;
}

html, body {
    margin: 0;
    padding: 0;
    width: 880px;
    background: #f5f7fa;
    color: #1f2937;
    font-family: "Noto Sans CJK SC", "Microsoft YaHei",
        "WenQuanYi Zen Hei", sans-serif;
}

body {
    padding: 32px;
}

.container {
    width: 100%;
    max-width: 816px;
    margin: 0 auto;
    padding: 28px 32px;
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 4px 18px rgba(15, 23, 42, 0.05);
}

/* 顶部标题区合并 */
.header {
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #e5e7eb;
}

.brand {
    display: block;
    color: #2563eb;
    font-size: 13px;
    font-weight: 800;
    letter-spacing: 1.5px;
    margin-bottom: 8px;
}

.title {
    margin: 0;
    color: #1e293b;
    font-size: 24px;
    font-weight: 800;
}

/* 内容区 */
.content {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.section {
    display: flex;
    flex-direction: column;
}

.section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
    font-size: 15px;
    font-weight: 700;
    color: #374151;
}

.section-name {
    display: flex;
    align-items: center;
    gap: 6px;
}

.icon {
    font-size: 16px;
}

.count {
    min-width: 24px;
    padding: 2px 8px;
    border-radius: 12px;
    text-align: center;
    font-size: 12px;
    font-weight: 800;
}

.count.success {
    color: #1d4ed8;
    background: #eff6ff;
}

.count.warning {
    color: #b45309;
    background: #fffbeb;
}

.count.muted {
    color: #6b7280;
    background: #f3f4f6;
}

/* 版本列表 */
.version-list {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
}

.version-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #edf0f3;
    background: #ffffff;
}

.version-item:last-child {
    border-bottom: none;
}

.version {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 6px;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 14px;
    font-weight: 800;
}

.date {
    color: #6b7280;
    font-size: 13px;
    white-space: nowrap;
}

/* 全局空状态 */
.empty-global {
    padding: 32px;
    text-align: center;
    color: #9ca3af;
    font-size: 14px;
    background: #f8fafc;
    border-radius: 8px;
    border: 1px dashed #e5e7eb;
}
`

const MESSAGE_CSS = `
* {
    box-sizing: border-box;
}

html,
body {
    margin: 0;
    padding: 0;
    width: 1200px;
    background: #F4F5F7;
    color: #1f2937;
    font-family:
        "Noto Sans CJK SC",
        "WenQuanYi Zen Hei",
        sans-serif;
}

body {
    padding: 36px;
}

.card {
    padding: 34px 38px;
    border-radius: 16px;
    background: #ffffff;
    box-shadow: 0 3px 12px rgba(15, 23, 42, 0.045);
}

.header {
    margin-bottom: 28px;
    padding-bottom: 20px;
    border-bottom: 1px solid #e5e7eb;
}

.brand {
    color: #2563eb;
    font-size: 17px;
    font-weight: 800;
    letter-spacing: 2px;
}

.content {
    color: #374151;
    font-size: 22px;
    line-height: 1.8;
    overflow-wrap: anywhere;
    word-break: break-word;
}

.content h1,
.content h2,
.content h3,
.content h4 {
    color: #1e3a8a;
    font-weight: 800;
    line-height: 1.5;
}

.content h1 {
    font-size: 32px;
}

.content h2 {
    font-size: 27px;
}

.content h3 {
    font-size: 24px;
}

.content p {
    margin: 12px 0;
}

.content strong {
    color: #1f2937;
    font-weight: 800;
}

.content ul,
.content ol {
    padding-left: 32px;
}

.content li {
    margin: 7px 0;
}

.content li::marker {
    color: #2563eb;
}

.content code {
    padding: 2px 7px;
    border-radius: 5px;
    background: #f1f3f5;
    color: #64748b;
    font-size: 17px;
    font-family: Consolas, monospace;
}

.content pre {
    padding: 16px;
    border-radius: 8px;
    background: #1e293b;
    color: #e5e7eb;
    white-space: pre-wrap;
    word-break: break-word;
}

.content pre code {
    padding: 0;
    background: transparent;
    color: inherit;
}

.content blockquote {
    margin: 16px 0;
    padding: 12px 18px;
    border-left: 4px solid #2563eb;
    border-radius: 0 8px 8px 0;
    background: #f1f5f9;
    color: #64748b;
}

.content hr {
    margin: 20px 0;
    border: none;
    border-top: 1px solid #e5e7eb;
}

.content a {
    color: #2563eb;
    text-decoration: underline;
}

.content table {
    width: 100%;
    border-collapse: collapse;
}

.content th,
.content td {
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    text-align: left;
}

.content th {
    background: #f1f5f9;
    color: #1e3a8a;
}
`

const NOTIFICATION_CSS = `
* {
    box-sizing: border-box;
}

html,
body {
    margin: 0;
    padding: 0;
    width: 1000px;
    background: #F4F5F7;
    color: #1f2937;
    font-family: "Noto Sans CJK SC", "WenQuanYi Zen Hei", sans-serif;
}

body {
    padding: 36px;
}

.card {
    width: 100%;
    border-radius: 16px;
    background: #ffffff;
    box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
    overflow: hidden;
}

/* 顶部渐变深色区域 */
.header {
    padding: 40px 48px;
    background: linear-gradient(135deg, #1E3A8A 0%, #3B82F6 100%);
    color: #ffffff;
}

.brand {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 2px;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 24px;
}

.version-box {
    display: flex;
    align-items: baseline;
    gap: 16px;
    margin-bottom: 16px;
}

.new-version {
    font-size: 72px;
    font-weight: 800;
    line-height: 1;
}

.old-version {
    font-size: 24px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.6);
    text-decoration: line-through;
}

.time {
    font-size: 16px;
    color: rgba(255, 255, 255, 0.8);
}

/* 底部白色内容区域 */
.body {
    padding: 32px 48px;
}

.section-title {
    font-size: 20px;
    font-weight: 800;
    color: #1e293b;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.section-title::before {
    content: "";
    display: block;
    width: 6px;
    height: 20px;
    background: #2563eb;
    border-radius: 3px;
}

.game-list {
    display: flex;
    gap: 16px;
    margin-bottom: 28px;
}

.game-card {
    flex: 1;
    padding: 20px;
    border-radius: 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    display: flex;
    flex-direction: column;
}

.game-name {
    font-size: 14px;
    font-weight: 700;
    color: #64748b;
    letter-spacing: 1px;
    margin-bottom: 8px;
}

.game-version {
    font-size: 28px;
    font-weight: 800;
    color: #0f172a;
}

.footer-note {
    text-align: center;
    font-size: 16px;
    color: #64748b;
    padding-top: 16px;
    border-top: 1px dashed #e2e8f0;
}
`

module.exports = {
    ANNOUNCEMENT_CSS,
    HISTORY_CSS,
    MESSAGE_CSS,
    NOTIFICATION_CSS
}