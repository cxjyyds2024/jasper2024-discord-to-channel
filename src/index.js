const { Schema } = require('koishi')
const MarkdownIt = require('markdown-it')
const { ANNOUNCEMENT_CSS, HISTORY_CSS, MESSAGE_CSS, NOTIFICATION_CSS } = require('./styles')

// ==========================================
// 常量
// ==========================================

const VERSION_API_ENDPOINT = 'https://api.truckersmp.com/v2/version'
const TRANSLATE_ENDPOINT = 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate'
const QQ_API_BASE = 'https://api.bot.qq.com'
const TABLE = 'truckersmp_update_messages'

const HOURS_24 = 24 * 60 * 60 * 1000
const CHECK_MINUTES = [10, 15, 20, 25, 30]
const SLOW_CHECK_MINUTES = [60] // 30分钟后追加一次1小时的兜底检测
const TOKEN_REFRESH_MARGIN = 60_000

const ANNOUNCEMENT_RESULT = Object.freeze({
	FOUND: 'found',
	NOT_FOUND: 'not-found',
	CHECKING: 'checking',
	FAILED: 'failed',
})

const BRAND = Object.freeze({
	announcement: 'TRUCKERSMP · 公告更新',
	history: 'TRUCKERSMP · 历史版本',
	notification: 'TRUCKERSMP · 新版本',
	message: 'TRUCKERSMP · 消息通知',
})

const markdown = new MarkdownIt({
	html: false,
	breaks: true,
	linkify: true,
	typographer: true,
})

// ==========================================
// 文本工具
// ==========================================

function normalizeNewlines(text) {
	if (!text) return text
	return String(text)
		.replace(/\\r\\n/g, '\n')
		.replace(/\\n/g, '\n')
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n')
}

function escapeHtml(value) {
	return String(value ?? '').replace(/[&<>"']/g, char => ({
		'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
	})[char])
}

function rebuildTranslatedText(results) {
	if (!Array.isArray(results)) return null
	return results.map(item => {
		const source = String(item.src ?? '')
		const translated = String(item.dst ?? '')
		if (!source) return ''
		const leading = source.match(/^[ \t]*/)?.[0] ?? ''
		const trailing = source.match(/[ \t]*$/)?.[0] ?? ''
		const content = translated.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '')
		return leading + content + trailing
	}).join('\n')
}

function stripLeadingTitle(text) {
	if (!text) return text
	const lines = text.split('\n')
	if (
		lines.length &&
		/^\s*\**\s*TruckersMP\s*(?:Update|更新)\s*[0-9]+(?:\.[0-9]+)*\s*\**\s*$/i.test(lines[0])
	) {
		lines.shift()
		while (lines.length && !lines[0].trim()) lines.shift()
	}
	return lines.join('\n')
}

function extractVersion(content) {
	if (!content) return null
	const match = String(content).match(/Update\s+([0-9]+(?:\.[0-9.]+)+)/i)
	return match ? match[1] : null
}

function isWithin24h(timestamp) {
	if (!timestamp) return false
	const time = new Date(timestamp).getTime()
	const diff = Date.now() - time
	return (!Number.isNaN(time) && diff >= 0 && diff <= HOURS_24)
}

function formatHistoryDate(value) {
	if (!value) return '时间未知'
	if (value instanceof Date) {
		const year = value.getFullYear()
		const month = String(value.getMonth() + 1).padStart(2, '0')
		const day = String(value.getDate()).padStart(2, '0')
		const hour = String(value.getHours()).padStart(2, '0')
		const minute = String(value.getMinutes()).padStart(2, '0')
		const second = String(value.getSeconds()).padStart(2, '0')
		return `${year}-${month}-${day} ${hour}:${minute}:${second}`
	}
	return String(value).replace('T', ' ').replace(/\.\d+Z?$/, '').slice(0, 19)
}

// ==========================================
// Markdown 渲染
// ==========================================

function markdownToHtml(text) {
	return markdown.render(normalizeNewlines(text || ''))
}

// ==========================================
// 消息内容构建
// ==========================================

function buildGameVersions(row) {
	const game = []
	if (row.ets2Version) game.push(`ETS2 ${row.ets2Version}`)
	if (row.atsVersion) game.push(`ATS ${row.atsVersion}`)
	return game
}

function buildContent(row, includeOriginal) {
	const original = stripLeadingTitle(normalizeNewlines(row.announcementText || ''))
	const translated = stripLeadingTitle(normalizeNewlines(row.translatedText || ''))

	const lines = [`# 📦 TruckersMP 更新 ${row.version ?? '(未知版本)'}`]
	if (row.versionTimeUtc8) lines.push(`> 🕐 时间：${row.versionTimeUtc8} (UTC+8)`)

	const game = buildGameVersions(row)
	if (game.length) lines.push(`> 🎮 支持版本：${game.join(' · ')}`)

	lines.push('', '---', '')

	const body = includeOriginal
		? ['## 📄 原始公告', '', original || '（暂无原文）', '', '---', '', '## 🇨🇳 中文翻译', '', translated || '（暂无译文）'].join('\n')
		: (translated || '暂无中文译文')

	return `${lines.join('\n')}\n${body}`
}

function buildVersionNotification(row) {
	const lines = ['# 🚀 TruckersMP 检测到新版本', '', `📦 **新版本：${row.version ?? '(未知版本)'}**`]
	if (row.oldVersion) lines.push(`⬅️ 旧版本：${row.oldVersion}`)
	if (row.versionTimeUtc8) lines.push(`🕐 发布时间：${row.versionTimeUtc8} (UTC+8)`)

	const game = buildGameVersions(row)
	if (game.length) lines.push(`🎮 支持版本：${game.join(' · ')}`)

	lines.push('', '请注意检查游戏版本更新。')
	return lines.join('\n')
}

function buildHistoryVersionMarkdown(rows) {
	const hasTranslation = rows.filter(row => row.translatedText?.trim())
	const noTranslation = rows.filter(row => row.announcementText?.trim() && !row.translatedText?.trim())
	const noAnnouncement = rows.filter(row => !row.announcementText?.trim() && !row.translatedText?.trim())

	function buildList(list) {
		if (!list.length) return '暂无数据'
		return list.map(row => `- **${row.version}**　${formatHistoryDate(row.versionTimeUtc8 || row.createdAt)}`).join('\n')
	}

	return [
		'# 📅 TruckersMP 历史版本', '',
		`## 🌐 已有中文译文 (${hasTranslation.length})`, buildList(hasTranslation), '',
		`## ⚠️ 暂无中文译文 (${noTranslation.length})`, buildList(noTranslation), '',
		`## 📢 暂无公告 (${noAnnouncement.length})`, buildList(noAnnouncement),
	].join('\n')
}

// ==========================================
// HTML 模板
// ==========================================

function buildVersionNotificationHtml(row) {
	const gameVersions = buildGameVersions(row)
	const versionMap = {}
	for (const item of gameVersions) {
		const match = item.match(/^(ETS2|ATS)\s+(.+)$/)
		if (match) versionMap[match[1]] = match[2]
	}

	const gameHtml = [
		{ key: 'ETS2', label: 'EURO TRUCK SIMULATOR 2' },
		{ key: 'ATS', label: 'AMERICAN TRUCK SIMULATOR' },
	]
		.filter(game => versionMap[game.key])
		.map(game => `
            <div class="game-card">
                <div class="game-name">${game.label}</div>
                <div class="game-version">${escapeHtml(versionMap[game.key])}</div>
            </div>
        `).join('')

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><style>${NOTIFICATION_CSS}</style></head>
<body>
    <article class="card">
        <header class="header">
            <div class="brand">${escapeHtml(BRAND.notification)}</div>
            <div class="version-box">
                <div class="new-version">${escapeHtml(row.version || '未知版本')}</div>
                ${row.oldVersion ? `<div class="old-version">${escapeHtml(row.oldVersion)}</div>` : ''}
            </div>
            <div class="time">🕐 发布时间：${escapeHtml(row.versionTimeUtc8 || '未知时间')} (UTC+8)</div>
        </header>
        <main class="body">
            ${gameHtml ? `<div class="section-title">支持游戏版本</div><div class="game-list">${gameHtml}</div>` : ''}
            <div class="footer-note">🚀 检测到新版本，请及时更新游戏客户端。</div>
        </main>
    </article>
</body>
</html>`
}

function formatAnnouncementMarkdown(text) {
	return normalizeNewlines(text || '')
		.replace(/^\s*(?:\*\*)?([【\[][^】\]]+[】\]])(?:\*\*)?\s*$/gm, '**$1**')
		.replace(/\[([a-f0-9]{8,})\]/gi, '`[$1]`')
		.replace(/^(\s*)-(?=\S)/gm, '$1- ')
}

function renderAnnouncementContent(text) {
	return markdownToHtml(formatAnnouncementMarkdown(text))
		.replace(/<p>\s*<strong>[【\[](.+?)[】\]]<\/strong>\s*<\/p>/g, '<div class="category-tag">$1</div>')
		.replace(/<p>\s*<strong>(欧洲卡车模拟2|美国卡车模拟)<\/strong>\s*<\/p>/g, '<h3>$1</h3>')
}

function buildAnnouncementHtml(row, includeOriginal) {
	const original = stripLeadingTitle(normalizeNewlines(row.announcementText || ''))
	const translated = stripLeadingTitle(normalizeNewlines(row.translatedText || ''))

	const sections = includeOriginal
		? [
			{ title: '原始公告', content: original || '暂无原文' },
			{ title: '中文翻译', content: translated || '暂无译文' },
		]
		: [{ title: '更新内容', content: translated || original || '暂无公告内容' }]

	const sectionHtml = sections.map(section => `
        <section class="notice-section">
            <div class="section-heading"><span class="heading-bar"></span><span>${escapeHtml(section.title)}</span></div>
            <div class="content">${renderAnnouncementContent(section.content)}</div>
        </section>
    `).join('')

	const gameVersions = buildGameVersions(row)
	const versionMap = {}
	for (const item of gameVersions) {
		const match = item.match(/^(ETS2|ATS)\s+(.+)$/)
		if (match) versionMap[match[1]] = match[2]
	}

	const gameHtml = [
		{ key: 'ETS2', className: 'ets2', label: 'EURO TRUCK SIMULATOR 2' },
		{ key: 'ATS', className: 'ats', label: 'AMERICAN TRUCK SIMULATOR' },
	]
		.filter(game => versionMap[game.key])
		.map(game => `
            <div class="game-card ${game.className}">
                <div class="game-name">${game.label}</div>
                <div class="game-version">${escapeHtml(versionMap[game.key])}</div>
            </div>
        `).join('')

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><style>${ANNOUNCEMENT_CSS}</style></head>
<body>
    <article class="card">
        <header class="header">
            <div class="brand">${escapeHtml(BRAND.announcement)}</div>
            <div class="version">${escapeHtml(row.version || '未知版本')}</div>
            <div class="time">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="12" cy="12" r="9"></circle>
                    <path d="M12 7v5l3 2"></path>
                </svg>
                <span>${escapeHtml(row.versionTimeUtc8 || '未知时间')} (UTC+8)</span>
            </div>
        </header>
        <main class="main">
            <section class="block">
                <div class="block-title">支持游戏版本</div>
                <div class="game-list">${gameHtml || '<div class="game-empty">暂无游戏版本信息</div>'}</div>
            </section>
            <section class="block">${sectionHtml}</section>
        </main>
    </article>
</body>
</html>`
}

function buildHistoryVersionHtml(rows) {
	const hasTranslation = rows.filter(row => row.translatedText?.trim())
	const noTranslation = rows.filter(row => row.announcementText?.trim() && !row.translatedText?.trim())
	const noAnnouncement = rows.filter(row => !row.announcementText?.trim() && !row.translatedText?.trim())

	function renderList(list) {
		if (!list.length) return ''
		return `
            <div class="version-list">
                ${list.map(row => `
                    <div class="version-item">
                        <span class="version">${escapeHtml(row.version)}</span>
                        <span class="date">${escapeHtml(formatHistoryDate(row.versionTimeUtc8 || row.createdAt))}</span>
                    </div>
                `).join('')}
            </div>
        `
	}

	function renderSection(title, icon, count, type, list) {
		if (count === 0) return ''
		return `
            <section class="section">
                <div class="section-title">
                    <div class="section-name">
                        <span class="icon">${icon}</span>
                        <span>${title}</span>
                    </div>
                    <span class="count ${type}">${count}</span>
                </div>
                ${renderList(list)}
            </section>
        `
	}

	const isEmpty = hasTranslation.length === 0 && noTranslation.length === 0 && noAnnouncement.length === 0
	const emptyHtml = isEmpty ? '<div class="empty-global">暂无任何版本记录</div>' : ''

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><style>${HISTORY_CSS}</style></head>
<body>
    <main class="container">
        <header class="header">
            <span class="brand">${escapeHtml(BRAND.history)}</span>
            <h1 class="title">TruckersMP 历史版本</h1>
        </header>
        <main class="content">
            ${emptyHtml}
            ${renderSection('已有中文译文', '🌐', hasTranslation.length, 'success', hasTranslation)}
            ${renderSection('暂无中文译文', '⚠️', noTranslation.length, 'warning', noTranslation)}
            ${renderSection('暂无公告', '📢', noAnnouncement.length, 'muted', noAnnouncement)}
        </main>
    </main>
</body>
</html>`
}

function buildMessageHtml(content, brand = BRAND.message) {
	return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><style>${MESSAGE_CSS}</style></head>
<body>
    <article class="card">
        <header class="header"><div class="brand">${escapeHtml(brand)}</div></header>
        <main class="content">${markdownToHtml(content)}</main>
    </article>
</body>
</html>`
}

// ==========================================
// 插件主体
// ==========================================

module.exports = {
	name: 'discord-to-channel',
	inject: ['http', 'database', 'puppeteer'],

	Config: Schema.object({
		enableTestPush: Schema.boolean().default(false).description('是否启用测试推送命令'),
		versionCheck: Schema.object({
			enabled: Schema.boolean().default(true).description('启用 TruckersMP 版本检测'),
			interval: Schema.number().default(10).min(0).description('轮询间隔（单位：分钟）。设为 0 则仅在启动时检测一次'),
			notifyUpdate: Schema.boolean().default(false).description('检测到新版本时，向所有目标群发送版本更新通知'),
		}).description('版本检测'),
		announcementCheck: Schema.object({
			enabled: Schema.boolean().default(false).description('启用 Discord 公告检测（由版本更新触发）'),
			proxyPrefix: Schema.string().description('代理前缀'),
			proxyToken: Schema.string().description('代理服务鉴权 token'),
			apiBase: Schema.string().default('https://discord.com/api/v10').description('Discord API 基础地址'),
			channelId: Schema.string().description('公告频道 ID'),
			discordToken: Schema.string().description('Discord Bot token（Authorization: Bot <token>）'),
			limit: Schema.number().default(1).min(1).description('每次拉取条数'),
			translate: Schema.object({
				enabled: Schema.boolean().default(false).description('启用百度翻译'),
				appid: Schema.string().description('百度翻译 APPID'),
				apiKey: Schema.string().description('百度翻译 API Key（Authorization: Bearer）'),
			}).description('公告翻译'),
			qq: Schema.object({
				appId: Schema.string().description('QQ 机器人 AppID'),
				clientSecret: Schema.string().description('QQ 机器人 ClientSecret'),
			}).description('QQ 官方接口凭证'),
			sendTo: Schema.object({
				enabled: Schema.boolean().default(false).description('启用发送公告到 QQ 群'),
				channels: Schema.array(Schema.string()).default([]).description('目标群 openid 列表（非数字群号）'),
				format: Schema.union([
					Schema.const('image').description('图片'),
					Schema.const('markdown').description('Markdown 文字'),
				]).default('markdown').description('消息发送格式'),
				includeOriginal: Schema.boolean().default(false).description('是否同时发送原始公告和中文译文'),
			}).description('发送到群'),
		}).description('公告检测'),
	}),

	apply(ctx, config) {
		const logger = ctx.logger('discord-to-channel')
		let announcementApi = null

		ctx.model.extend(TABLE, {
			id: 'unsigned',
			version: 'string',
			oldVersion: 'string',
			versionTimeUtc: 'string',
			versionTimeUtc8: 'string',
			ets2Version: 'string',
			atsVersion: 'string',
			announcementId: 'string',
			announcementText: 'text',
			translatedText: 'text',
			announcementChecked: 'boolean',
			createdAt: 'timestamp',
			updatedAt: 'timestamp',
		}, { autoInc: true, unique: ['version', 'announcementId'] })

		async function findLatestRow() {
			const rows = await ctx.database.get(TABLE, {}, { sort: { createdAt: 'desc' }, limit: 1 })
			return rows[0] ?? null
		}

		async function findRowByVersion(version) {
			const rows = await ctx.database.get(TABLE, { version }, { limit: 1 })
			return rows[0] ?? null
		}

		function getUniqueChannels(channels = []) {
			return [...new Set(channels.map(item => typeof item === 'string' ? item.trim() : '').filter(Boolean))]
		}

		const tokenCache = { token: null, expiresAt: 0, fetching: null }

		async function getAccessToken(qq) {
			const now = Date.now()
			if (tokenCache.token && now < tokenCache.expiresAt - TOKEN_REFRESH_MARGIN) return tokenCache.token
			if (tokenCache.fetching) {
				const token = await tokenCache.fetching
				if (token) return token
				if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token
				return null
			}

			tokenCache.fetching = (async () => {
				try {
					const res = await ctx.http.post(`${QQ_API_BASE}/app/getAppAccessToken`, { appId: qq.appId, clientSecret: qq.clientSecret })
					if (res?.code || !res?.access_token) {
						logger.error('获取 access_token 失败或异常：%o', res)
						if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token
						return null
					}
					tokenCache.token = res.access_token
					tokenCache.expiresAt = Date.now() + (res.expires_in || 7200) * 1000
					return tokenCache.token
				} catch (error) {
					logger.error('获取 access_token 请求异常：%o', error)
					if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token
					return null
				} finally {
					tokenCache.fetching = null
				}
			})()

			return tokenCache.fetching
		}

		async function sendImageToGroup(options, groupOpenid, imageBuffer) {
			const qq = options.qq
			if (!qq?.appId || !qq?.clientSecret) throw new Error('缺少 QQ 机器人凭证')
			const token = await getAccessToken(qq)
			if (!token) throw new Error('获取 access_token 失败')
			const headers = { Authorization: `QQBot ${token}`, 'Content-Type': 'application/json' }
			const baseUrl = `${QQ_API_BASE}/v2/groups/${encodeURIComponent(groupOpenid)}`
			const upload = await ctx.http.post(`${baseUrl}/files`, { file_type: 1, file_data: imageBuffer.toString('base64'), srv_send_msg: false }, { headers })
			if (!upload?.file_info) throw new Error(`图片上传未返回 file_info：${JSON.stringify(upload)}`)
			await ctx.http.post(`${baseUrl}/messages`, { msg_type: 7, content: ' ', media: { file_info: upload.file_info } }, { headers })
		}

		async function sendToGroups(options, channels, content, createImage = null) {
			const results = []
			const useImage = options.sendTo?.format === 'image'
			const qq = options.qq
			const hasCredentials = Boolean(qq?.appId && qq?.clientSecret)

			let imageBuffer = null
			if (useImage) {
				try {
					imageBuffer = createImage ? await createImage() : await buildMessageImage(content)
				} catch (error) {
					logger.warn('消息图片生成失败，回退 Markdown：%o', error.response?.data || error.message)
				}
			}

			for (const groupOpenid of channels) {
				if (imageBuffer) {
					try {
						await sendImageToGroup(options, groupOpenid, imageBuffer)
						results.push({ group: groupOpenid, ok: true, type: 'image' })
						logger.info(`图片消息已发送到群 ${groupOpenid}`)
						continue
					} catch (error) {
						logger.warn(`图片发送到群 ${groupOpenid} 失败，回退 Markdown：%o`, error.response?.data || error.message)
					}
				}

				if (!hasCredentials) {
					results.push({ group: groupOpenid, ok: false, error: '缺少 QQ 凭证' })
					continue
				}

				try {
					const token = await getAccessToken(qq)
					if (!token) throw new Error('获取 access_token 失败')
					await ctx.http.post(`${QQ_API_BASE}/v2/groups/${encodeURIComponent(groupOpenid)}/messages`, { msg_type: 2, markdown: { content } }, { headers: { Authorization: `QQBot ${token}`, 'Content-Type': 'application/json' } })
					results.push({ group: groupOpenid, ok: true, type: 'markdown' })
					logger.info(`Markdown 消息已发送到群 ${groupOpenid}`)
				} catch (error) {
					const errorData = error.response?.data || error.message
					results.push({ group: groupOpenid, ok: false, error: errorData })
					logger.error(`Markdown 消息发送到群 ${groupOpenid} 失败：%o`, errorData)
				}
			}
			return results
		}

		async function renderHtmlToPng(html, viewportWidth) {
			const page = await ctx.puppeteer.page()
			try {
				await page.setViewport({ width: viewportWidth, height: 200, deviceScaleFactor: 1 })
				await page.setContent(html, { waitUntil: 'domcontentloaded' })
				await page.evaluate(async () => { await document.fonts.ready })
				const contentHeight = await page.evaluate(() => {
					const body = document.body
					const root = document.documentElement
					return Math.max(body.scrollHeight, body.offsetHeight, root.clientHeight, root.scrollHeight, root.offsetHeight)
				})
				await page.setViewport({ width: viewportWidth, height: contentHeight, deviceScaleFactor: 1 })
				return await page.screenshot({ type: 'png', fullPage: true })
			} finally {
				await page.close()
			}
		}

		function buildAnnouncementImage(row, includeOriginal) {
			return renderHtmlToPng(buildAnnouncementHtml(row, includeOriginal), 1200)
		}

		function buildMessageImage(content, brand) {
			return renderHtmlToPng(buildMessageHtml(content, brand), 1200)
		}

		function buildVersionNotificationImage(row) {
			return renderHtmlToPng(buildVersionNotificationHtml(row), 1000)
		}

		function buildHistoryVersionImage(rows) {
			return renderHtmlToPng(buildHistoryVersionHtml(rows), 880)
		}

		function setupVersionCheck(versionConfig, annApi, annConfig) {
			let versionChecking = false
			let baselineVersion = null

			async function fetchVersionInfo() {
				if (versionChecking) return
				versionChecking = true
				try {
					const payload = await ctx.http.get(VERSION_API_ENDPOINT)
					if (!payload?.name || !payload?.time) throw new Error('接口返回数据异常')
					const rawTime = String(payload.time).trim()
					const isoTime = /[TZ]/.test(rawTime) ? rawTime : rawTime.replace(' ', 'T') + 'Z'
					const utcDate = new Date(isoTime)
					if (Number.isNaN(utcDate.getTime())) throw new Error('UTC 时间格式错误')
					const formattedTimeUTC8 = new Intl.DateTimeFormat('zh-CN', {
						timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
						hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
					}).format(utcDate).replace(/\//g, '-')

					logger.info(`版本 ${payload.name}｜${formattedTimeUTC8}｜ETS2 ${payload.supported_game_version}｜ATS ${payload.supported_ats_game_version}`)

					const isFirstCheck = baselineVersion === null
					const previousVersion = baselineVersion
					const versionChanged = !isFirstCheck && previousVersion !== payload.name
					const existing = await ctx.database.get(TABLE, { version: payload.name }, { limit: 1 })

					let isNewRecord = false
					const patch = {
						versionTimeUtc: payload.time, versionTimeUtc8: formattedTimeUTC8,
						ets2Version: payload.supported_game_version, atsVersion: payload.supported_ats_game_version,
						updatedAt: new Date(),
					}

					if (existing.length) {
						const row = existing[0]
						if (versionChanged && !row.oldVersion) patch.oldVersion = previousVersion
						await ctx.database.set(TABLE, row.id, patch)
					} else {
						isNewRecord = true
						await ctx.database.create(TABLE, {
							version: payload.name, oldVersion: versionChanged ? previousVersion : null,
							versionTimeUtc: payload.time, versionTimeUtc8: formattedTimeUTC8,
							ets2Version: payload.supported_game_version, atsVersion: payload.supported_ats_game_version,
							announcementChecked: false, createdAt: new Date(), updatedAt: new Date(),
						})
					}

					baselineVersion = payload.name

					if (versionChanged) logger.info(`检测到版本变化：${previousVersion} → ${payload.name}`)
					else if (isFirstCheck) logger.info(`当前版本：${payload.name}`)
					else if (isNewRecord) logger.info(`补充版本记录：${payload.name}`)

					if (versionChanged && versionConfig.notifyUpdate) {
						const channels = getUniqueChannels(annConfig?.sendTo?.channels)
						if (annConfig?.sendTo?.enabled && channels.length) {
							const content = buildVersionNotification({
								version: payload.name, oldVersion: previousVersion, versionTimeUtc8: formattedTimeUTC8,
								ets2Version: payload.supported_game_version, atsVersion: payload.supported_ats_game_version,
							})
							logger.info(`开始发送版本更新通知：${previousVersion} → ${payload.name}，目标群 ${channels.length} 个`)
							const results = await sendToGroups(annConfig, channels, content, () => buildVersionNotificationImage({
								version: payload.name, oldVersion: previousVersion, versionTimeUtc8: formattedTimeUTC8,
								ets2Version: payload.supported_game_version, atsVersion: payload.supported_ats_game_version,
							}))
							const success = results.filter(item => item.ok).length
							const failed = results.length - success
							logger.info(`版本更新通知发送完成：成功 ${success} 个群，失败 ${failed} 个群`)
						} else {
							logger.warn('版本更新通知已开启，但 QQ 群发送未启用或没有配置目标群')
						}
					}

					if ((isNewRecord || versionChanged) && annApi) {
						logger.info(`触发公告检测：${payload.name}`)
						annApi.scheduleAnnouncementChecks(payload.name)
					}
				} catch (error) {
					logger.error('获取 TruckersMP 版本信息失败：%o', error)
				} finally {
					versionChecking = false
				}
			}

			fetchVersionInfo()
			if (versionConfig.interval > 0) ctx.setInterval(fetchVersionInfo, versionConfig.interval * 60 * 1000)
		}

		function setupAnnouncementCheck(annConfig) {
			const pendingTimers = new Map()
			const doneVersions = new Set()
			const completedResults = new Map()
			const checkingVersions = new Map()

			// 记录每个版本的实时检测进度
			const progressCache = new Map()

			// 对外暴露的获取进度方法
			function getVersionProgress(targetVersion) {
				return progressCache.get(targetVersion) ?? null
			}

			function clearTimersFor(version) {
				const timers = pendingTimers.get(version)

				if (!timers) return

				for (const timer of timers) {
					clearTimeout(timer)
				}

				pendingTimers.delete(version)
			}

			function markDone(version, result) {
				doneVersions.add(version)
				completedResults.set(version, result)
				clearTimersFor(version)
			}

			function buildUrl() {
				const base = annConfig.proxyPrefix.replace(/\/+$/, '')
				const api = annConfig.apiBase.replace(/\/+$/, '')

				const params = new URLSearchParams({
					token: annConfig.proxyToken,
					limit: String(annConfig.limit),
				})

				return `${base}/proxy/${api}/channels/${annConfig.channelId.trim()}/messages?${params.toString()}`
			}

			async function fetchDiscordMessages() {
				return ctx.http.get(
					buildUrl(),
					{
						headers: {
							Authorization: `Bot ${annConfig.discordToken}`,
						},
					},
				)
			}

			/**
			 * 返回译文字符串；未启用或翻译失败时返回 null。
			 */
			async function translateText(text) {
				if (!annConfig.translate?.enabled || !text) {
					return null
				}

				const { apiKey, appid } = annConfig.translate

				if (!apiKey || !appid) {
					return null
				}

				try {
					const res = await ctx.http.post(
						TRANSLATE_ENDPOINT,
						{
							appid,
							from: 'auto',
							to: 'zh',
							q: normalizeNewlines(text),
							reference: '整段翻译，保留原本的 Markdown 格式、空格和换行符',
						},
						{
							headers: {
								'Content-Type': 'application/json',
								Authorization: `Bearer ${apiKey}`,
							},
						},
					)

					if (res?.error_code || !Array.isArray(res?.trans_result)) {
						logger.error('百度翻译请求异常：%o', res)
						return null
					}

					return rebuildTranslatedText(res.trans_result)
				} catch (error) {
					logger.error('百度翻译网络请求异常：%o', error)
					return null
				}
			}

			/**
			 * 自动公告推送：向全部配置群发送。
			 * 与手动「最新公告 / 历史公告」使用同一公告模板，品牌一致。
			 */
			async function sendAnnouncement(row) {
				if (!annConfig.sendTo?.enabled) return

				const channels = getUniqueChannels(
					annConfig.sendTo.channels,
				)

				if (!channels.length) return

				const content = buildContent(
					row,
					annConfig.sendTo.includeOriginal,
				)

				if (!content.trim()) return

				await sendToGroups(annConfig, channels, content,
					() => buildAnnouncementImage(row, annConfig.sendTo.includeOriginal))
			}

			/**
			 * 保存公告，并关联对应版本记录。
			 *
			 * 返回值：
			 * - filled：成功保存或补充公告
			 * - 其他值：跳过当前公告
			 */
			async function saveAnnouncement(message) {
				const announcementId = String(message.id)

				const announcementText = normalizeNewlines(
					message.content ?? null,
				)

				const dup = await ctx.database.get(
					TABLE,
					{ announcementId },
					{ limit: 1 },
				)

				if (dup.length) {
					const row = dup[0]

					// 已保存原文但没有译文时，补充翻译。
					if (row.announcementText && !row.translatedText) {
						const translatedText = await translateText(
							row.announcementText,
						)

						if (translatedText) {
							await ctx.database.set(
								TABLE,
								row.id,
								{
									translatedText,
									announcementChecked: true,
									updatedAt: new Date(),
								},
							)

							await sendAnnouncement({
								...row,
								translatedText,
							})

							return 'filled'
						}

						return 'skip-translate-failed'
					}

					return 'skip-dup'
				}

				const version = extractVersion(message.content)

				if (!version) {
					return 'skip-no-version'
				}

				const existing = await ctx.database.get(
					TABLE,
					{ version },
					{ limit: 1 },
				)

				const translatedText = await translateText(
					announcementText,
				)

				if (existing.length) {
					const row = existing[0]

					if (row.announcementId) {
						return 'skip-has-announcement'
					}

					await ctx.database.set(
						TABLE,
						row.id,
						{
							announcementId,
							announcementText,
							translatedText,
							announcementChecked: true,
							updatedAt: new Date(),
						},
					)

					await sendAnnouncement({
						...row,
						announcementId,
						announcementText,
						translatedText,
					})

					return 'filled'
				}

				await ctx.database.create(TABLE, {
					version,
					oldVersion: null,
					versionTimeUtc: null,
					versionTimeUtc8: null,
					ets2Version: null,
					atsVersion: null,
					announcementId,
					announcementText,
					translatedText,
					announcementChecked: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				})

				await sendAnnouncement({
					announcementId,
					announcementText,
					translatedText,
				})

				return 'filled'
			}

			/**
			 * 执行一次指定版本的公告检测。
			 */
			async function performFetchAnnouncements(targetVersion) {
				if (!targetVersion || doneVersions.has(targetVersion)) {
					return completedResults.get(targetVersion)
						?? ANNOUNCEMENT_RESULT.NOT_FOUND
				}

				// 数据库中已有公告时不再请求 Discord。
				try {
					const existing = await ctx.database.get(
						TABLE,
						{
							version: targetVersion,
							announcementId: { $ne: null },
						},
						{ limit: 1 },
					)

					if (existing.length) {
						markDone(
							targetVersion,
							ANNOUNCEMENT_RESULT.FOUND,
						)

						return ANNOUNCEMENT_RESULT.FOUND
					}
				} catch (error) {
					logger.error(
						`检查版本 ${targetVersion} 的已有公告失败：%o`,
						error,
					)

					return ANNOUNCEMENT_RESULT.FAILED
				}

				let messages

				try {
					messages = await fetchDiscordMessages()
				} catch (error) {
					logger.error('获取 Discord 公告失败：%o', error)
					return ANNOUNCEMENT_RESULT.FAILED
				}

				if (!Array.isArray(messages)) {
					logger.error('Discord 公告接口返回数据格式异常')
					return ANNOUNCEMENT_RESULT.FAILED
				}

				let saved = false
				let processingFailed = false

				for (const message of messages) {
					if (
						!message?.id ||
						!isWithin24h(message.timestamp)
					) {
						continue
					}

					const version = extractVersion(message.content)

					if (!version || version !== targetVersion) {
						continue
					}

					try {
						if (await saveAnnouncement(message) === 'filled') {
							saved = true
						}
					} catch (error) {
						processingFailed = true

						logger.error(
							`处理公告 ${message.id} 失败：%o`,
							error,
						)
					}
				}

				if (saved) {
					markDone(
						targetVersion,
						ANNOUNCEMENT_RESULT.FOUND,
					)

					logger.info(
						`版本 ${targetVersion} 公告已获取，取消后续检测`,
					)

					return ANNOUNCEMENT_RESULT.FOUND
				}

				if (processingFailed) {
					return ANNOUNCEMENT_RESULT.FAILED
				}

				return ANNOUNCEMENT_RESULT.NOT_FOUND
			}

			/**
			 * 同一版本同时只允许一个检测任务执行。
			 */
			function fetchAnnouncements(targetVersion) {
				if (!targetVersion) {
					return Promise.resolve(ANNOUNCEMENT_RESULT.FAILED)
				}

				if (doneVersions.has(targetVersion)) {
					return Promise.resolve(
						completedResults.get(targetVersion)
							?? ANNOUNCEMENT_RESULT.NOT_FOUND,
					)
				}

				if (checkingVersions.has(targetVersion)) {
					return Promise.resolve(ANNOUNCEMENT_RESULT.CHECKING)
				}

				const task = performFetchAnnouncements(targetVersion)

				checkingVersions.set(targetVersion, task)

				const cleanup = () => {
					if (checkingVersions.get(targetVersion) === task) {
						checkingVersions.delete(targetVersion)
					}
				}

				task.then(cleanup, cleanup)

				return task
			}

			/**
			 * 安排高频检测与 1 小时兜底检测。
			 */
			function scheduleAnnouncementChecks(targetVersion) {
				if (!targetVersion || doneVersions.has(targetVersion)) {
					return
				}

				clearTimersFor(targetVersion)

				const timers = new Set()

				pendingTimers.set(targetVersion, timers)

				async function runCheck(index, isLast) {
					if (doneVersions.has(targetVersion)) return

					try {
						const activeTask = checkingVersions.get(targetVersion)

						let result = await fetchAnnouncements(targetVersion)

						// 最后一轮等待已经执行中的任务，避免重复请求。
						if (
							result === ANNOUNCEMENT_RESULT.CHECKING &&
							isLast &&
							activeTask
						) {
							logger.info(
								`版本 ${targetVersion} 最后一轮检测时已有任务执行，等待当前任务完成`,
							)

							try {
								result = await activeTask
							} catch (error) {
								logger.error(
									`版本 ${targetVersion} 等待公告检测任务失败：%o`,
									error,
								)

								result = ANNOUNCEMENT_RESULT.FAILED
							}
						}

						switch (result) {
							case ANNOUNCEMENT_RESULT.FOUND:
								logger.info(
									`版本 ${targetVersion} 已找到公告，检测结束`,
								)
								progressCache.delete(targetVersion)
								return

							case ANNOUNCEMENT_RESULT.NOT_FOUND:
								if (isLast) {
									const rows = await ctx.database.get(
										TABLE,
										{ version: targetVersion },
										{ limit: 1 },
									)

									if (
										rows.length &&
										!rows[0].announcementId
									) {
										await ctx.database.set(
											TABLE,
											rows[0].id,
											{
												announcementId: null,
												announcementText: null,
												translatedText: null,
												announcementChecked: true,
												updatedAt: new Date(),
											},
										)

										logger.info(
											`版本 ${targetVersion} 所有轮次检测完成，确认无更新公告`,
										)
									} else if (rows.length) {
										await ctx.database.set(
											TABLE,
											rows[0].id,
											{
												announcementChecked: true,
												updatedAt: new Date(),
											},
										)
									}

									markDone(
										targetVersion,
										ANNOUNCEMENT_RESULT.NOT_FOUND,
									)
									progressCache.delete(targetVersion)
								}

								return

							case ANNOUNCEMENT_RESULT.CHECKING:
								logger.info(
									`版本 ${targetVersion} 当前已有检测任务，等待下一轮检测`,
								)
								return

							case ANNOUNCEMENT_RESULT.FAILED:
								logger.warn(
									`版本 ${targetVersion} 第 ${index + 1} 轮检测失败，无法判断是否存在公告`,
								)

								if (isLast) {
									logger.error(
										`版本 ${targetVersion} 所有轮次检测结束，但仍无法确认公告状态，保留未确认状态，等待后续处理`,
									)
									progressCache.delete(targetVersion)
								}

								return
						}
					} catch (error) {
						logger.error(
							`版本 ${targetVersion} 第 ${index + 1} 轮公告检测处理失败：%o`,
							error,
						)
					}
				}

				// 将短期高频轮询与 1 小时兜底合并
				const allChecks = [...CHECK_MINUTES, ...SLOW_CHECK_MINUTES]
				const totalRounds = allChecks.length

				// 刚触发时的初始进度
				progressCache.set(targetVersion, {
					currentRound: 1,
					totalRounds,
					nextMinutes: allChecks[0],
					nextTimeText: `下次将在 ${allChecks[0]} 分钟后`,
				})

				allChecks.forEach((min, index) => {
					const timer = setTimeout(() => {
						timers.delete(timer)
						
						// 每轮触发时更新当前进度
						const isLast = index === totalRounds - 1
						progressCache.set(targetVersion, {
							currentRound: index + 1,
							totalRounds,
							nextMinutes: isLast ? 0 : allChecks[index + 1],
							nextTimeText: isLast ? '最后一轮' : `下次将在 ${allChecks[index + 1]} 分钟后`,
						})

						runCheck(index, isLast)
					}, min * 60 * 1000)

					timers.add(timer)
				})
			}

			ctx.on('dispose', () => {
				for (const timers of pendingTimers.values()) {
					for (const timer of timers) {
						clearTimeout(timer)
					}
				}

				pendingTimers.clear()
				progressCache.clear()
			})

			return {
				scheduleAnnouncementChecks,
				getVersionProgress,
			}
		}

		ctx.on('ready', async () => {
			if (config.announcementCheck.enabled) {
				announcementApi = setupAnnouncementCheck(config.announcementCheck)
				try {
					const rows = await ctx.database.get(TABLE, { announcementChecked: false, version: { $ne: null } })
					for (const row of rows) {
						if (row.announcementId) {
							await ctx.database.set(TABLE, row.id, { announcementChecked: true, updatedAt: new Date() })
							logger.info(`版本 ${row.version} 已有公告记录，跳过重启补检测`)
							continue
						}
						logger.info(`重启补调度公告检测：${row.version}`)
						announcementApi.scheduleAnnouncementChecks(row.version)
					}
				} catch (error) {
					logger.error('重启补调度公告检测失败：%o', error)
				}
			}

			if (config.versionCheck.enabled) {
				setupVersionCheck(config.versionCheck, announcementApi, config.announcementCheck)
			}
		})

		async function handleMarkdownPush(version, actionName, session) {
			const annConfig = config.announcementCheck
			const sendConfig = annConfig?.sendTo
			if (!sendConfig?.enabled) return `${actionName}失败：请先启用 QQ 群发送功能`

			const groupOpenid = session?.guildId?.trim()
			if (!groupOpenid) return `${actionName}失败：请在 QQ 群内执行此命令`

			const targetVersion = version?.trim()
			const row = targetVersion ? await findRowByVersion(targetVersion) : await findLatestRow()
			if (!row) return targetVersion ? `未找到版本 ${targetVersion} 的记录` : '暂无版本记录'

			const content = buildContent(row, sendConfig.includeOriginal)
			logger.info(`开始 Markdown ${actionName}：版本 ${row.version}，目标群 ${groupOpenid}`)
			const results = await sendToGroups(annConfig, [groupOpenid], content, () => buildAnnouncementImage(row, sendConfig.includeOriginal))
			const success = results.filter(item => item.ok).length
			logger.info(`Markdown ${actionName}完成：版本 ${row.version}，成功 ${success} 个群`)
		}

		async function handleTestPush(version, session) {
			const annConfig = config.announcementCheck
			const sendConfig = annConfig?.sendTo
			if (!sendConfig?.enabled) return '测试推送失败：请先启用 QQ 群发送功能'

			const groupOpenid = session?.guildId?.trim()
			if (!groupOpenid) return '测试推送失败：请在 QQ 群内执行此命令'

			const targetVersion = version?.trim()
			const row = targetVersion ? await findRowByVersion(targetVersion) : await findLatestRow()
			if (!row) return targetVersion ? `未找到版本 ${targetVersion} 的记录` : '暂无版本记录'

			const content = buildContent(row, sendConfig.includeOriginal)
			logger.info(`开始测试推送：版本 ${row.version}，目标群 ${groupOpenid}，发送格式 ${sendConfig.format}`)

			const results = await sendToGroups(annConfig, [groupOpenid], content, () => buildAnnouncementImage(row, sendConfig.includeOriginal))
			if (!results.some(item => item.ok)) return '测试推送失败，请查看日志'
			logger.info(`测试推送完成：版本 ${row.version}`)
		}

		async function handleLatestAnnouncement(session) {
			return handleMarkdownPush(null, '最新公告推送', session)
		}

		async function handleHistoryAnnouncement(version, session) {
			const annConfig = config.announcementCheck
			const sendConfig = annConfig?.sendTo
			if (!sendConfig?.enabled) return '历史公告推送失败：请先启用 QQ 群发送功能'

			const groupOpenid = session?.guildId?.trim()
			if (!groupOpenid) return '历史公告推送失败：请在 QQ 群内执行此命令'

			const targetVersion = version?.trim()
			if (!targetVersion) return '请指定版本号，例如：d2c 历史公告 0.7.10.0'

			const row = await findRowByVersion(targetVersion)
			if (!row) return `未找到版本 ${targetVersion} 的记录`

			const content = buildContent(row, sendConfig.includeOriginal)
			logger.info(`开始历史公告推送：版本 ${row.version}，目标群 ${groupOpenid}，发送格式 ${sendConfig.format}`)
			const results = await sendToGroups(annConfig, [groupOpenid], content, () => buildAnnouncementImage(row, sendConfig.includeOriginal))
			if (!results.some(item => item.ok)) return '历史公告推送失败，请查看日志'
			logger.info(`历史公告推送完成：版本 ${row.version}`)
		}

		async function handleAnnouncementStatus(version, session) {
			const targetVersion = version?.trim()
			const row = targetVersion
				? await findRowByVersion(targetVersion)
				: await findLatestRow()

			if (!row) {
				return targetVersion
					? `未找到版本 ${targetVersion} 的记录`
					: '暂无任何版本记录'
			}

			// 1. 判断公告状态
			let statusText = ''
			if (row.announcementId) {
				statusText = '✅ 已获取公告（已完成）'
			} else if (row.announcementChecked) {
				statusText = '📭 确认无公告（已完成）'
			} else {
				statusText = '⏳ 检测中...'
			}

			// 2. 判断当前运行到第几轮，以及下一次触发的时间
			let progressText = ''
			if (announcementApi) {
				const progressInfo = announcementApi.getVersionProgress(row.version)
				if (progressInfo) {
					let nextText = progressInfo.nextTimeText
					if (progressInfo.nextMinutes > 0) {
						const nextDate = new Date(Date.now() + progressInfo.nextMinutes * 60 * 1000)
						const hh = String(nextDate.getHours()).padStart(2, '0')
						const mm = String(nextDate.getMinutes()).padStart(2, '0')
						const ss = String(nextDate.getSeconds()).padStart(2, '0')
						nextText = `下次触发：${hh}:${mm}:${ss}`
					}
					progressText = `第 ${progressInfo.currentRound} / ${progressInfo.totalRounds} 轮 (${nextText})`
				}
			}

			if (!progressText) {
				if (row.announcementId) {
					progressText = '无需检测'
				} else if (row.announcementChecked) {
					progressText = '检测已结束'
				} else {
					progressText = '等待触发或已过期'
				}
			}

			return [
				`📦 版本：${row.version}`,
				`🕐 发布：${row.versionTimeUtc8 || '未知时间'} (UTC+8)`,
				`📢 状态：${statusText}`,
				`🔄 进度：${progressText}`,
			].join('\n')
		}

		async function handleMarkdownContentPush(content, actionName, session) {
			const annConfig = config.announcementCheck
			const sendConfig = annConfig?.sendTo
			if (!sendConfig?.enabled) return `${actionName}失败：请先启用 QQ 群发送功能`

			const groupOpenid = session?.guildId?.trim()
			if (!groupOpenid) return `${actionName}失败：请在 QQ 群内执行此命令`

			logger.info(`开始 Markdown ${actionName}，目标群 ${groupOpenid}`)
			const results = await sendToGroups(annConfig, [groupOpenid], content, () => buildMessageImage(content, BRAND.message))
			const success = results.filter(item => item.ok).length
			if (success === 0) return `${actionName}失败，请查看日志`
			logger.info(`Markdown ${actionName}完成，成功 ${success} 个群`)
		}

		async function handleVersionHistory(session) {
			const annConfig = config.announcementCheck
			const sendConfig = annConfig?.sendTo
			if (!sendConfig?.enabled) return '历史版本发送失败：请先启用 QQ 群发送功能'

			const groupOpenid = session?.guildId?.trim()
			if (!groupOpenid) return '历史版本发送失败：请在 QQ 群内执行此命令'

			const rows = await ctx.database.get(TABLE, {}, { sort: { versionTimeUtc: 'desc' }, limit: 10 })
			if (!rows.length) return '暂无版本记录'

			const content = buildHistoryVersionMarkdown(rows)
			logger.info(`开始历史版本推送：共 ${rows.length} 条，目标群 ${groupOpenid}，发送格式 ${sendConfig.format}`)
			const results = await sendToGroups(annConfig, [groupOpenid], content, () => buildHistoryVersionImage(rows))
			if (!results.some(item => item.ok)) return '历史版本发送失败，请查看日志'
			logger.info(`历史版本推送完成：共 ${rows.length} 条`)
		}

		const d2c = ctx.command('d2c', 'Discord 公告推送管理').action(() => {
			const commands = ['📦 Discord 公告推送管理', '', '使用方法：']
			if (config.enableTestPush) commands.push('d2c 测试推送 [版本] - 测试 QQ 群推送')
			commands.push(
				'd2c 最新公告 - 推送数据库中的最新公告',
				'd2c 历史公告 [版本] - 查询指定版本的历史公告',
				'd2c 历史版本 - 查询最近 10 条版本记录',
			)
			return commands.join('\n')
		})

		if (config.enableTestPush) {
			d2c.subcommand('.测试推送 [version:string]', '测试推送').action(async ({ session }, version) => {
				return handleTestPush(version, session)
			})
		}

		d2c.subcommand('.最新公告', '推送最新公告', { hidden: true }).action(async ({ session }) => {
			return handleLatestAnnouncement(session)
		})

		d2c.subcommand('.历史公告 <version:string>', '推送指定版本的历史公告', { hidden: true }).action(async ({ session }, version) => {
			if (!version?.trim()) return '请指定版本号，例如：d2c 历史公告 0.7.10.0'
			return handleHistoryAnnouncement(version, session)
		})

		d2c.subcommand('.历史版本', '查询历史版本记录', { hidden: true }).action(async ({ session }) => {
			return handleVersionHistory(session)
		})

		d2c.subcommand('.公告检测状态 [version:string]', '查看公告抓取的实时进度', { hidden: true }).action(async ({ session }, version) => {
			return handleAnnouncementStatus(version, session)
		})
	},
}