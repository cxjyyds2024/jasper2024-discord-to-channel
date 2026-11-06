const { Schema } = require('koishi')

// ==========================================
// 常量定义
// ==========================================
const VERSION_API_ENDPOINT = 'https://api.truckersmp.com/v2/version'
const TRANSLATE_ENDPOINT = 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate'
const QQ_API_BASE = 'https://api.bot.qq.com'
const TABLE = 'truckersmp_update_messages'

const HOURS_24 = 24 * 60 * 60 * 1000
const CHECK_MINUTES = [10, 15, 20, 25, 30]
const TOKEN_REFRESH_MARGIN = 60_000

// ==========================================
// 文本处理工具
// ==========================================

/**
 * 标准化换行符
 */
function normalizeNewlines(text) {
	return text ? text.replace(/\r\n/g, '\n') : text
}

/**
 * 保护翻译前的空白字符，防止翻译 API 吞掉格式
 */
function protectWhitespace(text) {
	if (!text) return text
	return text.replace(/\n/g, '\u0001').replace(/ {2,}/g, (m) => `\u0002${m.length}\u0002`)
}

/**
 * 还原翻译后的空白字符
 */
function restoreWhitespace(text) {
	if (!text) return text
	return text.replace(/\u0001/g, '\n').replace(/\u0002(\d+)\u0002/g, (_, n) => ' '.repeat(Number(n)))
}

/**
 * 移除公告正文首行的重复标题
 */
function stripLeadingTitle(text) {
	if (!text) return text
	const lines = text.split('\n')
	if (lines.length && /^\s*\*\*TruckersMP\s*更新\s*[0-9.]+\*\*\s*$/i.test(lines[0])) {
		lines.shift()
		while (lines.length && !lines[0].trim()) lines.shift()
	}
	return lines.join('\n')
}

/**
 * 清理文本中的 Markdown 标记，保留真实换行，并将分割线替换为美观符号
 * 用于最终发送前的纯文本兼容处理
 */
function cleanText(text) {
	if (!text) return ''
	return text
		.replace(/\*\*(.*?)\*\*/g, '$1')
		.replace(/_(.*?)_/g, '$1')
		.replace(/^#+\s+/gm, '')
		.replace(/^---$/gm, '━━━━━━━━━━')
}

/**
 * 从文本中提取版本号
 */
function extractVersion(content) {
	if (!content) return null
	const match = String(content).match(/Update\s+([0-9]+(?:\.[0-9]+)+)/i)
	return match ? match[1] : null
}

/**
 * 判断时间戳是否在 24 小时内
 */
function isWithin24h(timestamp) {
	if (!timestamp) return false
	const t = new Date(timestamp).getTime()
	return !Number.isNaN(t) && Date.now() - t <= HOURS_24
}

// ==========================================
// 消息构建工具
// ==========================================

/**
 * 构建发送到群聊的完整公告内容
 */
function buildContent(row, format) {
	const original = cleanText(stripLeadingTitle(row.announcementText))
	const translated = cleanText(stripLeadingTitle(row.translatedText))
	
	const lines = []
	lines.push(`📦 TruckersMP 更新 ${row.version ?? '(未知版本)'}`)
	if (row.versionTimeUtc8) lines.push(`🕐 时间：${row.versionTimeUtc8} (UTC+8)`)
	
	const game = []
	if (row.ets2Version) game.push(`ETS2 ${row.ets2Version}`)
	if (row.atsVersion) game.push(`ATS ${row.atsVersion}`)
	if (game.length) lines.push(`🎮 支持版本：${game.join(' · ')}`)
	
	lines.push('━━━━━━━━━━')
	
	let body = format === 'both' 
		? `${original ?? ''}\n\n━━━━━━━━━━\n\n${translated ?? '（暂无译文）'}`
		: (translated ?? original ?? '')
		
	return `${lines.join('\n')}\n\n${body}`
}

/**
 * 构建用于用户查询的简短头部信息
 */
function buildMetaHeader(row) {
	const lines = [`📦 TruckersMP 更新 ${row.version ?? '(未知版本)'}`]
	if (row.versionTimeUtc8) lines.push(`🕐 时间：${row.versionTimeUtc8} (UTC+8)`)
	const game = []
	if (row.ets2Version) game.push(`ETS2 ${row.ets2Version}`)
	if (row.atsVersion) game.push(`ATS ${row.atsVersion}`)
	if (game.length) lines.push(`🎮 支持版本：${game.join(' · ')}`)
	return lines.join('\n')
}

// ==========================================
// 核心业务入口
// ==========================================
module.exports = {
	name: 'discord-to-channel',
	inject: ['http', 'database'],

	Config: Schema.object({
		versionCheck: Schema.object({
			enabled: Schema.boolean().default(true).description('启用 TruckersMP 版本检测'),
			interval: Schema.number().default(600).min(0).description('轮询间隔（单位：秒）。设为 0 则仅在启动时检测一次'),
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
				apiKey: Schema.string().description('百度翻译 API Key（Authorization: Bearer）'),
				appid: Schema.string().description('百度翻译 APPID'),
			}).description('公告翻译'),
			qq: Schema.object({
				appId: Schema.string().description('QQ 机器人 AppID'),
				clientSecret: Schema.string().description('QQ 机器人 ClientSecret'),
			}).description('QQ 官方接口凭证'),
			sendTo: Schema.object({
				enabled: Schema.boolean().default(false).description('启用发送公告到 QQ 群'),
				channels: Schema.array(Schema.string()).default([]).description('目标群 openid 列表（非数字群号）'),
				format: Schema.string().default('translated').description('发送内容：translated（仅译文）/ both（原文+译文）'),
			}).description('发送到群'),
		}).description('公告检测'),
	}),

	apply(ctx, config) {
		const logger = ctx.logger('discord-to-channel')
		let announcementApi = null

		// ===== 数据库表定义 =====
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

		// ===== 内部查询辅助函数 =====
		async function findLatestRow() {
			const rows = await ctx.database.get(TABLE, {}, { sort: { createdAt: 'desc' }, limit: 1 })
			return rows[0] ?? null
		}

		async function findRowByVersion(version) {
			const rows = await ctx.database.get(TABLE, { version }, { limit: 1 })
			return rows[0] ?? null
		}

		// ===== 核心动作模块 =====
		const { sendToGroups, setupVersionCheck, setupAnnouncementCheck } = (() => {
			
			// ----------------------------------------
			// QQ 发送模块
			// ----------------------------------------
			const tokenCache = { token: null, expiresAt: 0, fetching: null }
			
			async function getAccessToken(qq) {
				const now = Date.now()
				if (tokenCache.token && now < tokenCache.expiresAt - TOKEN_REFRESH_MARGIN) return tokenCache.token
				if (tokenCache.fetching) return tokenCache.fetching
				
				tokenCache.fetching = (async () => {
					try {
						const res = await ctx.http.post(`${QQ_API_BASE}/app/getAppAccessToken`, { appId: qq.appId, clientSecret: qq.clientSecret })
						if (res?.code || !res?.access_token) {
							logger.error(`获取 access_token 失败或异常：%o`, res)
							return null
						}
						tokenCache.token = res.access_token
						tokenCache.expiresAt = Date.now() + (res.expires_in || 7200) * 1000
						return tokenCache.token
					} catch (error) {
						logger.error('获取 access_token 请求异常：%o', error)
						return null
					} finally { 
						tokenCache.fetching = null 
					}
				})()
				return tokenCache.fetching
			}

			async function sendToGroups(options, channels, content) {
				const qq = options.qq
				if (!qq?.appId || !qq?.clientSecret) {
					return channels.map(g => ({ group: g, ok: false, error: '缺少 QQ 凭证' }))
				}
				
				const token = await getAccessToken(qq)
				if (!token) {
					return channels.map(g => ({ group: g, ok: false, error: '获取 access_token 失败' }))
				}

				const results = []
				for (const groupOpenid of channels) {
					try {
						await ctx.http.post(`${QQ_API_BASE}/v2/groups/${encodeURIComponent(groupOpenid)}/messages`,
							{ msg_type: 0, content },
							{ headers: { Authorization: `QQBot ${token}`, 'Content-Type': 'application/json' } }
						)
						results.push({ group: groupOpenid, ok: true, mode: 'text' })
						logger.info(`已发送消息到群 ${groupOpenid}`)
					} catch (error) {
						// 增加详细错误打印，方便排查风控/权限问题
						const errorData = error.response?.data || error.message
						results.push({ group: groupOpenid, ok: false, error: errorData })
						logger.error(`发送消息到群 ${groupOpenid} 失败：%o`, errorData)
					}
				}
				return results
			}

			// ----------------------------------------
			// 版本检测模块
			// ----------------------------------------
			function setupVersionCheck(versionConfig, annApi) {
				async function getLatestRecordedVersion(excludeVersion = null) {
					try {
						const query = excludeVersion 
							? { $and: [{ version: { $ne: null } }, { version: { $ne: excludeVersion } }] } 
							: { version: { $ne: null } }
						const rows = await ctx.database.get(TABLE, query, { sort: { createdAt: 'desc' }, limit: 1 })
						return rows.length ? rows[0].version : null
					} catch (error) { 
						logger.error('读取已记录版本失败：%o', error)
						return null 
					}
				}

				async function fetchVersionInfo() {
					try {
						const payload = await ctx.http.get(VERSION_API_ENDPOINT)
						if (!payload?.name || !payload?.time) throw new Error('接口返回数据异常')
						
						const rawTime = String(payload.time).trim()
						const isoTime = /[TZ]/.test(rawTime) ? rawTime : rawTime.replace(' ', 'T') + 'Z'
						const utcDate = new Date(isoTime)
						if (Number.isNaN(utcDate.getTime())) throw new Error('UTC 时间格式错误')
						
						
						const formattedTimeUTC8 = new Intl.DateTimeFormat('zh-CN', { 
							timeZone: 'Asia/Shanghai', 
							year: 'numeric', 
							month: '2-digit', 
							day: '2-digit', 
							hour: '2-digit', 
							minute: '2-digit', 
							hour12: false 
						}).format(utcDate).replace(/\//g, '-')

						logger.info(`版本 ${payload.name}｜${formattedTimeUTC8}｜ETS2 ${payload.supported_game_version}｜ATS ${payload.supported_ats_game_version}`)
						
						const existing = await ctx.database.get(TABLE, { version: payload.name }, { limit: 1 })
						let isNewVersion = false

						if (existing.length) {
							const row = existing[0]
							const patch = { 
								versionTimeUtc: payload.time, 
								versionTimeUtc8: formattedTimeUTC8 + ':00',
								ets2Version: payload.supported_game_version, 
								atsVersion: payload.supported_ats_game_version, 
								updatedAt: new Date() 
							}
							if (!row.oldVersion) patch.oldVersion = await getLatestRecordedVersion(payload.name)
							await ctx.database.set(TABLE, row.id, patch)
						} else {
							const prev = await getLatestRecordedVersion()
							await ctx.database.create(TABLE, {
								version: payload.name, 
								oldVersion: prev, 
								versionTimeUtc: payload.time, 
								versionTimeUtc8: formattedTimeUTC8 + ':00',
								ets2Version: payload.supported_game_version, 
								atsVersion: payload.supported_ats_game_version, 
								announcementChecked: false,
								createdAt: new Date(), 
								updatedAt: new Date(),
							})
							logger.info(`发现新版本：${prev ?? '(未知)'} → ${payload.name}`)
							isNewVersion = true
						}

						if (isNewVersion && annApi) {
							logger.info(`触发公告检测：${payload.name}`)
							annApi.scheduleAnnouncementChecks(payload.name)
						}
					} catch (error) { 
						logger.error('获取 TruckersMP 版本信息失败：%o', error) 
					}
				}

				fetchVersionInfo()
				if (versionConfig.interval > 0) {
					ctx.setInterval(fetchVersionInfo, versionConfig.interval * 1000)
				}
			}

			// ----------------------------------------
			// 公告检测模块
			// ----------------------------------------
			function setupAnnouncementCheck(annConfig) {
				const pendingTimers = new Map()
				const doneVersions = new Set()

				function clearTimersFor(version) {
					const timers = pendingTimers.get(version)
					if (!timers) return
					for (const t of timers) clearTimeout(t)
					pendingTimers.delete(version)
				}
				
				function markDone(version) { 
					doneVersions.add(version)
					clearTimersFor(version) 
				}

				function buildUrl() {
					const base = annConfig.proxyPrefix.replace(/\/+$/, '')
					const api = annConfig.apiBase.replace(/\/+$/, '')
					const params = new URLSearchParams({ token: annConfig.proxyToken, limit: String(annConfig.limit) })
					return `${base}/proxy/${api}/channels/${annConfig.channelId.trim()}/messages?${params.toString()}`
				}
				
				async function fetchDiscordMessages() { 
					return ctx.http.get(buildUrl(), { headers: { Authorization: `Bot ${annConfig.discordToken}` } }) 
				}

				async function translateText(text) {
					if (!annConfig.translate?.enabled || !text) return null
					const { apiKey, appid } = annConfig.translate
					if (!apiKey || !appid) return null
					try {
						const res = await ctx.http.post(TRANSLATE_ENDPOINT, { appid, from: 'auto', to: 'zh', q: protectWhitespace(text) },
							{ headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` } })
						if (res?.error_code || !res?.trans_result) {
							logger.error('百度翻译请求异常：%o', res)
							return null
						}
						return restoreWhitespace(res.trans_result.map(p => p.dst).join(''))
					} catch (e) { 
						logger.error('百度翻译网络请求异常：%o', e)
						return null 
					}
				}

				async function sendAnnouncement(row) {
					if (!annConfig.sendTo?.enabled) return
					const channels = (annConfig.sendTo.channels || []).filter(Boolean)
					if (!channels.length) return
					const content = buildContent(row, annConfig.sendTo.format)
					if (!content.trim()) return
					await sendToGroups(annConfig, channels, content)
				}

				async function saveAnnouncement(message) {
					const announcementId = String(message.id)
					const announcementText = normalizeNewlines(message.content ?? null)
					
					const dup = await ctx.database.get(TABLE, { announcementId }, { limit: 1 })
					if (dup.length) {
						const row = dup[0]
						if (row.announcementText && !row.translatedText) {
							const translatedText = await translateText(row.announcementText)
							if (translatedText) {
								await ctx.database.set(TABLE, row.id, { translatedText, announcementChecked: true, updatedAt: new Date() })
								await sendAnnouncement({ ...row, translatedText })
								return 'filled'
							}
							return 'skip-translate-failed'
						}
						return 'skip-dup'
					}

					const version = extractVersion(message.content)
					if (!version) return 'skip-no-version'
					
					const existing = await ctx.database.get(TABLE, { version }, { limit: 1 })
					if (existing.length) {
						const row = existing[0]
						if (row.announcementId) return 'skip-has-announcement'
						const translatedText = await translateText(announcementText)
						await ctx.database.set(TABLE, row.id, { announcementId, announcementText, translatedText, announcementChecked: true, updatedAt: new Date() })
						await sendAnnouncement({ ...row, announcementId, announcementText, translatedText })
						return 'filled'
					}

					const translatedText = await translateText(announcementText)
					await ctx.database.create(TABLE, { 
						version, 
						oldVersion: null, versionTimeUtc: null, versionTimeUtc8: null, 
						ets2Version: null, atsVersion: null, 
						announcementId, announcementText, translatedText, 
						announcementChecked: true, 
						createdAt: new Date(), updatedAt: new Date() 
					})
					await sendAnnouncement({ announcementId, announcementText, translatedText })
					return 'filled'
				}

				async function fetchAnnouncements(targetVersion) {
					if (!targetVersion || doneVersions.has(targetVersion)) return
					try {
						const existing = await ctx.database.get(TABLE, { version: targetVersion, announcementId: { $ne: null } }, { limit: 1 })
						if (existing.length) { 
							markDone(targetVersion)
							return 
						}
					} catch {}

					let messages
					try { 
						messages = await fetchDiscordMessages() 
					} catch (e) { 
						logger.error('获取 Discord 公告失败：%o', e)
						return 
					}
					if (!Array.isArray(messages)) return

					let saved = false
					for (const message of messages) {
						if (!message?.id || !isWithin24h(message.timestamp)) continue
						const version = extractVersion(message.content)
						if (!version || version !== targetVersion) continue
						try {
							if (await saveAnnouncement(message) === 'filled') saved = true
						} catch (e) {
							logger.error(`处理公告 ${message.id} 失败：%o`, e)
						}
					}
					if (saved) { 
						markDone(targetVersion)
						logger.info(`版本 ${targetVersion} 公告已获取，取消后续检测`) 
					}
				}

				function scheduleAnnouncementChecks(targetVersion) {
					if (doneVersions.has(targetVersion)) return
					clearTimersFor(targetVersion)
					const timers = new Set()
					pendingTimers.set(targetVersion, timers)

					CHECK_MINUTES.forEach((min, index) => {
						const isLast = index === CHECK_MINUTES.length - 1
						const timer = setTimeout(async () => {
							timers.delete(timer)
							if (doneVersions.has(targetVersion)) return
							
							await fetchAnnouncements(targetVersion)
							
							// 最后一轮仍无公告，标记为确认无公告
							if (isLast && !doneVersions.has(targetVersion)) {
								const rows = await ctx.database.get(TABLE, { version: targetVersion }, { limit: 1 })
								if (rows.length && !rows[0].announcementId) {
									await ctx.database.set(TABLE, rows[0].id, { 
										announcementId: null, 
										announcementText: null, 
										translatedText: null, 
										announcementChecked: true, 
										updatedAt: new Date() 
									})
									logger.info(`版本 ${targetVersion} 五轮检测完成，确认无更新公告`)
								} else if (rows.length) {
									await ctx.database.set(TABLE, rows[0].id, { announcementChecked: true, updatedAt: new Date() })
								}
								markDone(targetVersion)
							}
						}, min * 60 * 1000)
						timers.add(timer)
					})
				}

				ctx.on('dispose', () => {
					for (const timers of pendingTimers.values()) {
						for (const t of timers) clearTimeout(t)
					}
					pendingTimers.clear()
				})

				return { 
					fetchAnnouncements, 
					scheduleAnnouncementChecks, 
					saveAnnouncement, 
					fetchRawMessages: async () => {
						try {
							const messages = await fetchDiscordMessages()
							return Array.isArray(messages) ? { ok: true, messages } : { ok: false, reason: '接口异常' }
						} catch (e) { 
							return { ok: false, reason: e.message } 
						}
					}
				}
			}

			return { sendToGroups, setupVersionCheck, setupAnnouncementCheck }
		})()

		// ===== 生命周期监听 =====
		ctx.on('ready', async () => {
			// 初始化公告检测模块
			if (config.announcementCheck.enabled) {
				announcementApi = setupAnnouncementCheck(config.announcementCheck)
				try {
					// 重启后恢复未完成检测的定时器
					const rows = await ctx.database.get(TABLE, { announcementChecked: false, version: { $ne: null } })
					for (const row of rows) {
						logger.info(`重启补调度公告检测：${row.version}`)
						announcementApi.scheduleAnnouncementChecks(row.version)
					}
				} catch (error) { 
					logger.error('重启补调度公告检测失败：%o', error) 
				}
			}
			
			// 初始化版本轮询模块
			if (config.versionCheck.enabled) {
				setupVersionCheck(config.versionCheck, announcementApi)
			}
		})

		// ===== 指令注册 - 普通用户 =====
		
		ctx.command('discord-to-channel.latest [version:string]', '获取最新的更新公告，或指定版本号的公告')
			.alias('更新', '最新公告')
			.action(async ({ session }, version) => {
				let row = version ? await findRowByVersion(version.trim()) : await findLatestRow()
				if (!row) return version ? `未找到版本 ${version} 的记录` : '暂无任何版本记录'
				
				let content = buildMetaHeader(row) + '\n━━━━━━━━━━\n\n'
				if (row.translatedText) content += cleanText(stripLeadingTitle(row.translatedText))
				else if (row.announcementText) content += `（该版本暂无译文，以下为原文）\n\n` + cleanText(stripLeadingTitle(row.announcementText))
				else if (row.announcementChecked) content += `该版本没有更新公告`
				else content += `该版本公告检测中，请稍后再试`

				return content
			})

		ctx.command('discord-to-channel.version [version:string]', '查询最新或指定版本的版本信息')
			.alias('版本')
			.action(async ({ session }, version) => {
				const row = version ? await findRowByVersion(version.trim()) : await findLatestRow()
				if (!row) return version ? `未找到版本 ${version} 的记录` : '暂无任何版本记录'
				
				const lines = [`📦 TruckersMP 更新 ${row.version ?? '(未知版本)'}`]
				if (row.oldVersion) lines.push(`⬅️ 上一版本：${row.oldVersion}`)
				if (row.versionTimeUtc8) lines.push(`🕐 发布时间：${row.versionTimeUtc8} (UTC+8)`)
				if (row.versionTimeUtc) lines.push(`🌐 UTC 时间：${row.versionTimeUtc}`)
				
				const game = []
				if (row.ets2Version) game.push(`ETS2 ${row.ets2Version}`)
				if (row.atsVersion) game.push(`ATS ${row.atsVersion}`)
				if (game.length) lines.push(`🎮 支持版本：${game.join(' · ')}`)
				
				if (row.announcementId) lines.push('📢 公告状态：已发布')
				else if (row.announcementChecked) lines.push('📭 公告状态：该版本无公告')
				else lines.push('⏳ 公告状态：检测中')

				const content = lines.join('\n')
				return content
			})

		ctx.command('discord-to-channel.history [count:number]', '查看最近的版本历史记录')
			.alias('历史', '版本历史')
			.action(async ({ session }, count) => {
				const limit = Math.max(1, Math.min(50, Number(count) || 10))
				const rows = await ctx.database.get(TABLE, { version: { $ne: null } }, { sort: { createdAt: 'desc' }, limit })
				if (!rows.length) return '暂无版本记录'
				
				const lines = rows.map((r, i) => {
					let mark = r.announcementId ? '📢有公告' : (r.announcementChecked ? '📭无公告' : '⏳检测中')
					return `${String(i + 1).padStart(2, ' ')}. ${r.version ?? '(未知)'}  ${r.versionTimeUtc8 ?? '(无时间)'}  [${mark}]`
				})
				
				const content = [`📅 最近 ${rows.length} 条版本记录：`, ...lines].join('\n')
				return content
			})
	},
}