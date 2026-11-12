// src/styles.js

const BASE_CSS = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    /* 整体背景：深邃夜空 + 微微的彩色光晕 */
    body {
        background-color: #0b0f19;
        background-image: 
            radial-gradient(circle at 0% 0%, rgba(59, 130, 246, 0.15) 0%, transparent 40%),
            radial-gradient(circle at 100% 100%, rgba(249, 115, 22, 0.1) 0%, transparent 40%);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #f8fafc;
        -webkit-font-smoothing: antialiased;
        display: flex;
        justify-content: center;
        padding: 40px 20px;
    }
    
    /* 气泡卡片基础样式 */
    .bubble {
        background: rgba(30, 41, 59, 0.4);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 20px;
        box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
    }
    
    .brand {
        font-size: 12px;
        font-weight: 700;
        color: #94a3b8;
        letter-spacing: 2px;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .brand::before {
        content: ''; display: block; width: 8px; height: 8px; border-radius: 50%;
    }
`

// ==========================================
// 1. 新版本通知图 (NOTIFICATION_CSS)
// ==========================================
const NOTIFICATION_CSS = BASE_CSS + `
    .card { 
        width: 880px; 
        padding: 40px;
        display: flex;
        flex-direction: column;
        gap: 24px;
    }
    .brand::before { background: #3b82f6; box-shadow: 0 0 10px #3b82f6; }
    
    /* 头部纵向排版 */
    .header {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    
    .version-box { display: flex; flex-direction: column; gap: 4px; }
    
    .new-version {
        font-size: 64px;
        font-weight: 900;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        background: linear-gradient(135deg, #60a5fa, #3b82f6, #8b5cf6);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        line-height: 1;
        letter-spacing: -3px;
    }
    
    .old-version {
        font-size: 16px;
        color: #64748b;
        text-decoration: line-through;
        font-family: ui-monospace, monospace;
        font-weight: 500;
    }
    
    .time-text { 
        font-size: 14px; 
        color: #64748b; 
        font-family: ui-monospace, monospace;
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 4px;
    }
    
    /* 游戏版本气泡组 */
    .body { display: flex; flex-direction: column; gap: 16px; margin-top: 12px; }
    .section-title {
        font-size: 12px;
        font-weight: 700;
        color: #64748b;
        letter-spacing: 1px;
        text-transform: uppercase;
    }
    .game-list { display: flex; gap: 16px; }
    .game-card {
        flex: 1;
        padding: 20px 24px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .game-card.ets2 { border-left: 4px solid #3b82f6; }
    .game-card.ats { border-left: 4px solid #f97316; }
    
    .game-info { display: flex; flex-direction: column; gap: 4px; }
    .game-name { font-size: 11px; font-weight: 700; color: #94a3b8; letter-spacing: 0.5px;}
    .game-version { 
        font-size: 22px; 
        font-weight: 800; 
        color: #f8fafc; 
        font-family: ui-monospace, monospace;
    }
    
    /* 底部提示气泡 */
    .footer-note { 
        padding: 20px 24px;
        font-size: 15px; 
        color: #93c5fd; 
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(59, 130, 246, 0.1);
        border: 1px solid rgba(59, 130, 246, 0.2);
    }
`

// ==========================================
// 2. 公告详情图 (ANNOUNCEMENT_CSS) - 保持当前最完美的状态
// ==========================================
const ANNOUNCEMENT_CSS = BASE_CSS + `
    .card { 
        width: 1000px; 
        padding: 40px;
        display: flex;
        flex-direction: column;
        gap: 24px;
    }
    .brand::before { background: #a1a1aa; }
    
    /* 头部纵向排版 */
    .header {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }
    
    /* 版本号 */
    .new-version { 
        font-size: 64px; 
        font-weight: 900; 
        color: #f8fafc; 
        letter-spacing: -2px; 
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; 
        line-height: 1;
    }
    
    /* 极简风格的时间 */
    .time-text { 
        font-size: 14px; 
        color: #64748b; 
        font-family: ui-monospace, monospace;
        display: flex;
        align-items: center;
        gap: 6px;
    }
    
    /* 游戏版本条 */
    .game-wrapper { display: flex; gap: 16px; margin-top: 12px; }
    .game-card {
        flex: 1;
        padding: 16px 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    .game-card.ets2 { border-left: 3px solid #3b82f6; }
    .game-card.ats { border-left: 3px solid #f97316; }
    .game-name { font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;}
    .game-version { font-size: 18px; font-weight: 800; color: #f8fafc; font-family: ui-monospace, monospace; }
    
    /* 内容气泡区 */
    .notice-wrapper {
        padding: 32px;
        border-top: 1px solid rgba(255, 255, 255, 0.05);
        margin-top: 8px;
    }
    .section-heading {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 20px;
        font-weight: 800;
        margin-bottom: 24px;
        color: #f8fafc;
    }
    .heading-bar { width: 4px; height: 20px; background: #60a5fa; border-radius: 2px; }
    
    .content { font-size: 16px; line-height: 1.8; color: #cbd5e1; }
    .content p { margin-bottom: 18px; }
    .content h3 { margin: 32px 0 16px; color: #f8fafc; font-size: 20px; font-weight: 800; }
    .content ul { padding-left: 24px; margin-bottom: 24px; }
    .content li { margin-bottom: 10px; }
    
    .content blockquote {
        margin: 24px 0;
        padding: 20px 24px;
        background: rgba(255, 255, 255, 0.03);
        border-left: 4px solid #475569;
        border-radius: 0 12px 12px 0;
        color: #94a3b8;
    }
    .content code {
        background: rgba(0, 0, 0, 0.3);
        padding: 4px 8px;
        border-radius: 6px;
        font-family: ui-monospace, monospace;
        color: #fbbf24;
        font-size: 14px;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .content a { color: #60a5fa; text-decoration: none; border-bottom: 1px solid rgba(96, 165, 250, 0.3); font-weight: 600;}
    
    .category-tag {
        display: inline-block;
        padding: 6px 14px;
        background: rgba(255, 255, 255, 0.05);
        color: #e2e8f0;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        font-size: 13px;
        font-weight: 700;
        margin-bottom: 24px;
    }
`

// ==========================================
// 3. 历史版本长图 (HISTORY_CSS)
// ==========================================
const HISTORY_CSS = BASE_CSS + `
    .container { 
        width: 800px; 
        padding: 40px;
        display: flex;
        flex-direction: column;
        gap: 24px;
    }
    .brand::before { background: #94a3b8; }
    
    .header { 
        display: flex; 
        flex-direction: column; 
        gap: 8px;
        padding-bottom: 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .title { font-size: 32px; font-weight: 900; color: #f8fafc; letter-spacing: -0.5px; }
    
    .content { display: flex; flex-direction: column; gap: 32px; }
    .empty-global { color: #64748b; text-align: center; padding: 40px; font-size: 15px; }
    
    .section { display: flex; flex-direction: column; gap: 16px; }
    .section-title { display: flex; justify-content: space-between; align-items: center; }
    .section-name { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 800; color: #e2e8f0; }
    .count {
        font-size: 12px;
        padding: 4px 10px;
        border-radius: 20px;
        font-weight: 700;
        font-family: ui-monospace, monospace;
    }
    .count.success { background: rgba(34, 197, 94, 0.15); color: #4ade80; border: 1px solid rgba(34, 197, 94, 0.2); }
    .count.warning { background: rgba(249, 115, 22, 0.15); color: #fb923c; border: 1px solid rgba(249, 115, 22, 0.2); }
    .count.muted { background: rgba(255, 255, 255, 0.05); color: #94a3b8; border: 1px solid rgba(255, 255, 255, 0.05); }
    
    .version-list { display: flex; flex-direction: column; gap: 12px; }
    .version-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 24px;
        border-radius: 16px;
    }
    .version-item .version {
        font-family: ui-monospace, monospace;
        font-size: 16px;
        font-weight: 800;
        color: #f8fafc;
    }
    .version-item .date { font-size: 14px; color: #94a3b8; font-weight: 500; }
`

// ==========================================
// 4. 通用 Markdown 消息 (MESSAGE_CSS)
// ==========================================
const MESSAGE_CSS = BASE_CSS + `
    .card { 
        width: 1000px; 
        padding: 40px; 
    }
    .header { 
        margin-bottom: 32px; 
        padding-bottom: 24px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05); 
    }
    .content { font-size: 16px; line-height: 1.8; color: #cbd5e1; }
    
    .content h1, .content h2, .content h3 { color: #f8fafc; margin: 28px 0 16px; font-weight: 800; }
    .content h1 { font-size: 26px; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 12px; }
    .content h2 { font-size: 22px; }
    .content h3 { font-size: 18px; }
    .content p { margin-bottom: 18px; }
    .content ul, .content ol { padding-left: 24px; margin-bottom: 24px; }
    .content li { margin-bottom: 10px; }
    
    .content blockquote {
        margin: 24px 0;
        padding: 20px 24px;
        background: rgba(255, 255, 255, 0.03);
        border-left: 4px solid #475569;
        border-radius: 0 12px 12px 0;
        color: #94a3b8;
    }
    .content code {
        background: rgba(0, 0, 0, 0.3);
        padding: 4px 8px;
        border-radius: 6px;
        font-family: ui-monospace, monospace;
        color: #fbbf24;
        font-size: 15px;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .content pre {
        background: rgba(0, 0, 0, 0.4);
        padding: 24px;
        border-radius: 12px;
        overflow-x: auto;
        margin: 24px 0;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .content pre code { background: transparent; padding: 0; color: #e2e8f0; border: none;}
    .content a { color: #60a5fa; text-decoration: none; font-weight: 600;}
    
    .content table { width: 100%; border-collapse: collapse; margin: 32px 0; font-size: 15px; }
    .content th, .content td { padding: 14px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); text-align: left; }
    .content th { background: rgba(255, 255, 255, 0.02); color: #f8fafc; font-weight: 800; }
`

module.exports = {
    ANNOUNCEMENT_CSS,
    HISTORY_CSS,
    MESSAGE_CSS,
    NOTIFICATION_CSS,
}