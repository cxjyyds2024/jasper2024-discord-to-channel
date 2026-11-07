const { Schema } = require('koishi')

// ==========================================
// 常量
// ==========================================

const VERSION_API_ENDPOINT = 'https://api.truckersmp.com/v2/version'
const TRANSLATE_ENDPOINT = 'https://fanyi-api.baidu.com/ait/api/aiTextTranslate'
const QQ_API_BASE = 'https://api.bot.qq.com'
const TABLE = 'truckersmp_update_messages'

const HOURS_24 = 24 * 60 * 60 * 1000
const CHECK_MINUTES = [10, 15, 20, 25, 30]
const TOKEN_REFRESH_MARGIN = 60_000

const ANNOUNCEMENT_RESULT = Object.freeze({
	FOUND: 'found',
	NOT_FOUND: 'not-found',
	CHECKING: 'checking',
	FAILED: 'failed',
})

// ==========================================
// 文本处理
// ==========================================

function normalizeNewlines(text) {
	return text ? text.replace(/\r\n/g, '\n') : text
}

function protectWhitespace(text) {
	if (!text) return text

	return text
		.replace(/\n/g, '\u0001')
		.replace(/ {2,}/g, match => `\u0002${match.length}\u0002`)
}

function restoreWhitespace(text) {
	if (!text) return text

	return text
		.replace(/\u0001/g, '\n')
		.replace(/\u0002(\d+)\u0002/g, (_, n) => ' '.repeat(Number(n)))
}

function stripLeadingTitle(text) {
	if (!text) return text

	const lines = text.split('\n')

	if (
		lines.length &&
		/^\s*\*\*TruckersMP\s*更新\s*[0-9.]+\*\*\s*$/i.test(lines[0])
	) {
		lines.shift()

		while (lines.length && !lines[0].trim()) {
			lines.shift()
		}
	}

	return lines.join('\n')
}

function extractVersion(content) {
	if (!content) return null

	const match = String(content).match(
		/Update\s+([0-9]+(?:\.[0-9.]+)+)/i,
	)

	return match ? match[1] : null
}

function isWithin24h(timestamp) {
	if (!timestamp) return false

	const time = new Date(timestamp).getTime()
	const diff = Date.now() - time

	return (
		!Number.isNaN(time) &&
		diff >= 0 &&
		diff <= HOURS_24
	)
}

// ==========================================
// 消息构建
// ==========================================

function buildGameVersions(row) {
	const game = []

	if (row.ets2Version) {
		game.push(`ETS2 ${row.ets2Version}`)
	}

	if (row.atsVersion) {
		game.push(`ATS ${row.atsVersion}`)
	}

	return game
}

/**
 * QQ 群公告 Markdown 内容
 *
 * format:
 * - translated：仅中文译文
 * - both：原文 + 中文译文
 */
function buildContent(row, format) {
	const original = stripLeadingTitle(row.announcementText || '')
	const translated = stripLeadingTitle(row.translatedText || '')

	const lines = [
		`# 📦 TruckersMP 更新 ${row.version ?? '(未知版本)'}`,
	]

	if (row.versionTimeUtc8) {
		lines.push(`> 🕐 时间：${row.versionTimeUtc8} (UTC+8)`)
	}

	const game = buildGameVersions(row)

	if (game.length) {
		lines.push(`> 🎮 支持版本：${game.join(' · ')}`)
	}

	lines.push('', '---', '')

	const body = format === 'both'
		? [
			'## 📄 原始公告',
			'',
			original || '（暂无原文）',
			'',
			'---',
			'',
			'## 🇨🇳 中文翻译',
			'',
			translated || '（暂无译文）',
		].join('\n')
		: (translated || original || '该版本暂无更新公告')

	return `${lines.join('\n')}\n${body}`
}

/**
 * TruckersMP 版本更新通知
 */
function buildVersionNotification(row) {
	const lines = [
		'# 🚀 TruckersMP 检测到新版本',
		'',
		`📦 **新版本：${row.version ?? '(未知版本)'}**`,
	]

	if (row.oldVersion) {
		lines.push(`⬅️ 旧版本：${row.oldVersion}`)
	}

	if (row.versionTimeUtc8) {
		lines.push(`🕐 发布时间：${row.versionTimeUtc8} (UTC+8)`)
	}

	const game = buildGameVersions(row)

	if (game.length) {
		lines.push(`🎮 支持版本：${game.join(' · ')}`)
	}

	lines.push('', '请注意检查游戏版本更新。')

	return lines.join('\n')
}

// ==========================================
// 插件主体
// ==========================================

module.exports = {
	name: 'discord-to-channel',
	inject: ['http', 'database'],

	Config: Schema.object({
		versionCheck: Schema.object({
			enabled: Schema.boolean()
				.default(true)
				.description('启用 TruckersMP 版本检测'),

			interval: Schema.number()
				.default(10)
				.min(0)
				.description('轮询间隔（单位：分钟）。设为 0 则仅在启动时检测一次'),

			notifyUpdate: Schema.boolean()
				.default(false)
				.description('检测到新版本时，向所有目标群发送版本更新通知'),
		}).description('版本检测'),

		announcementCheck: Schema.object({
			enabled: Schema.boolean()
				.default(false)
				.description('启用 Discord 公告检测（由版本更新触发）'),

			proxyPrefix: Schema.string()
				.description('代理前缀'),

			proxyToken: Schema.string()
				.description('代理服务鉴权 token'),

			apiBase: Schema.string()
				.default('https://discord.com/api/v10')
				.description('Discord API 基础地址'),

			channelId: Schema.string()
				.description('公告频道 ID'),

			discordToken: Schema.string()
				.description('Discord Bot token（Authorization: Bot <token>）'),

			limit: Schema.number()
				.default(1)
				.min(1)
				.description('每次拉取条数'),

			translate: Schema.object({
				enabled: Schema.boolean()
					.default(false)
					.description('启用百度翻译'),

				apiKey: Schema.string()
					.description('百度翻译 API Key（Authorization: Bearer）'),

				appid: Schema.string()
					.description('百度翻译 APPID'),
			}).description('公告翻译'),

			qq: Schema.object({
				appId: Schema.string()
					.description('QQ 机器人 AppID'),

				clientSecret: Schema.string()
					.description('QQ 机器人 ClientSecret'),
			}).description('QQ 官方接口凭证'),

			sendTo: Schema.object({
				enabled: Schema.boolean()
					.default(false)
					.description('启用发送公告到 QQ 群'),

				channels: Schema.array(Schema.string())
					.default([])
					.description('目标群 openid 列表（非数字群号）'),

				format: Schema.string()
					.default('translated')
					.description('发送内容：translated（仅译文）/ both（原文+译文）'),
			}).description('发送到群'),
		}).description('公告检测'),
	}),

	apply(ctx, config) {
		const logger = ctx.logger('discord-to-channel')

		let announcementApi = null

		// ==========================================
		// 数据库
		// ==========================================

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
		}, {
			autoInc: true,
			unique: ['version', 'announcementId'],
		})

		async function findLatestRow() {
			const rows = await ctx.database.get(
				TABLE,
				{},
				{
					sort: { createdAt: 'desc' },
					limit: 1,
				},
			)

			return rows[0] ?? null
		}

		async function findRowByVersion(version) {
			const rows = await ctx.database.get(
				TABLE,
				{ version },
				{ limit: 1 },
			)

			return rows[0] ?? null
		}

		function getUniqueChannels(channels = []) {
			return [
				...new Set(
					channels
						.map(item => typeof item === 'string' ? item.trim() : '')
						.filter(Boolean),
				),
			]
		}

		// ==========================================
		// QQ 消息发送
		// ==========================================

		const tokenCache = {
			token: null,
			expiresAt: 0,
			fetching: null,
		}

		/**
		 * 获取 QQ Access Token。
		 * fetching 用于合并并发刷新请求。
		 */
		async function getAccessToken(qq) {
			const now = Date.now()

			if (
				tokenCache.token &&
				now < tokenCache.expiresAt - TOKEN_REFRESH_MARGIN
			) {
				return tokenCache.token
			}

			if (tokenCache.fetching) {
				const token = await tokenCache.fetching

				if (token) return token

				if (
					tokenCache.token &&
					Date.now() < tokenCache.expiresAt
				) {
					return tokenCache.token
				}

				return null
			}

			tokenCache.fetching = (async () => {
				try {
					const res = await ctx.http.post(
						`${QQ_API_BASE}/app/getAppAccessToken`,
						{
							appId: qq.appId,
							clientSecret: qq.clientSecret,
						},
					)

					if (res?.code || !res?.access_token) {
						logger.error('获取 access_token 失败或异常：%o', res)

						if (
							tokenCache.token &&
							Date.now() < tokenCache.expiresAt
						) {
							logger.warn('新 Token 获取失败，继续使用尚未过期的旧 Token')
							return tokenCache.token
						}

						return null
					}

					tokenCache.token = res.access_token
					tokenCache.expiresAt =
						Date.now() + (res.expires_in || 7200) * 1000

					return tokenCache.token
				} catch (error) {
					logger.error('获取 access_token 请求异常：%o', error)

					if (
						tokenCache.token &&
						Date.now() < tokenCache.expiresAt
					) {
						logger.warn('Token 刷新请求失败，继续使用尚未过期的旧 Token')
						return tokenCache.token
					}

					return null
				} finally {
					tokenCache.fetching = null
				}
			})()

			return tokenCache.fetching
		}

		/**
		 * QQ 官方群 Markdown 发送入口。
		 * channels 中保存的是群 OpenID。
		 */
		async function sendToGroups(options, channels, content) {
			const qq = options.qq

			if (!qq?.appId || !qq?.clientSecret) {
				return channels.map(group => ({
					group,
					ok: false,
					error: '缺少 QQ 凭证',
				}))
			}

			const token = await getAccessToken(qq)

			if (!token) {
				return channels.map(group => ({
					group,
					ok: false,
					error: '获取 access_token 失败',
				}))
			}

			const results = []

			for (const groupOpenid of channels) {
				try {
					await ctx.http.post(
						`${QQ_API_BASE}/v2/groups/${encodeURIComponent(groupOpenid)}/messages`,
						{
							msg_type: 2,
							markdown: { content },
						},
						{
							headers: {
								Authorization: `QQBot ${token}`,
								'Content-Type': 'application/json',
							},
						},
					)

					results.push({
						group: groupOpenid,
						ok: true,
					})

					logger.info(`Markdown 消息已发送到群 ${groupOpenid}`)
				} catch (error) {
					const errorData = error.response?.data || error.message

					results.push({
						group: groupOpenid,
						ok: false,
						error: errorData,
					})

					logger.error(
						`Markdown 消息发送到群 ${groupOpenid} 失败：%o`,
						errorData,
					)
				}
			}

			return results
		}

		// ==========================================
		// TruckersMP 版本检测
		// ==========================================

		function setupVersionCheck(versionConfig, annApi, annConfig) {
			let versionChecking = false

			// 插件运行期间的版本基准，首次成功获取时初始化。
			let baselineVersion = null

			async function fetchVersionInfo() {
				if (versionChecking) return

				versionChecking = true

				try {
					const payload = await ctx.http.get(VERSION_API_ENDPOINT)

					if (!payload?.name || !payload?.time) {
						throw new Error('接口返回数据异常')
					}

					const rawTime = String(payload.time).trim()

					const isoTime = /[TZ]/.test(rawTime)
						? rawTime
						: rawTime.replace(' ', 'T') + 'Z'

					const utcDate = new Date(isoTime)

					if (Number.isNaN(utcDate.getTime())) {
						throw new Error('UTC 时间格式错误')
					}

					const formattedTimeUTC8 = new Intl.DateTimeFormat(
						'zh-CN',
						{
							timeZone: 'Asia/Shanghai',
							year: 'numeric',
							month: '2-digit',
							day: '2-digit',
							hour: '2-digit',
							minute: '2-digit',
							second: '2-digit',
							hour12: false,
						},
					).format(utcDate).replace(/\//g, '-')

					logger.info(
						`版本 ${payload.name}｜${formattedTimeUTC8}｜ETS2 ${payload.supported_game_version}｜ATS ${payload.supported_ats_game_version}`,
					)

					const isFirstCheck = baselineVersion === null
					const previousVersion = baselineVersion

					// 版本变化以运行期间的检测结果为准，不依赖数据库是否已有记录。
					const versionChanged =
						!isFirstCheck &&
						previousVersion !== payload.name

					const existing = await ctx.database.get(
						TABLE,
						{ version: payload.name },
						{ limit: 1 },
					)

					let isNewRecord = false

					const patch = {
						versionTimeUtc: payload.time,
						versionTimeUtc8: formattedTimeUTC8,
						ets2Version: payload.supported_game_version,
						atsVersion: payload.supported_ats_game_version,
						updatedAt: new Date(),
					}

					if (existing.length) {
						const row = existing[0]

						// 已有版本记录时，只补充缺失的旧版本信息。
						if (versionChanged && !row.oldVersion) {
							patch.oldVersion = previousVersion
						}

						await ctx.database.set(TABLE, row.id, patch)
					} else {
						isNewRecord = true

						await ctx.database.create(TABLE, {
							version: payload.name,
							oldVersion: versionChanged
								? previousVersion
								: null,
							versionTimeUtc: payload.time,
							versionTimeUtc8: formattedTimeUTC8,
							ets2Version: payload.supported_game_version,
							atsVersion: payload.supported_ats_game_version,
							announcementChecked: false,
							createdAt: new Date(),
							updatedAt: new Date(),
						})
					}

					// 数据库同步成功后更新基准，避免重复通知。
					baselineVersion = payload.name

					if (versionChanged) {
						logger.info(
							`检测到版本变化：${previousVersion} → ${payload.name}`,
						)
					} else if (isFirstCheck) {
						logger.info(`初始化当前版本基准：${payload.name}`)
					} else if (isNewRecord) {
						logger.info(`补充版本记录：${payload.name}`)
					}

					// 版本更新通知：首次启动不发送。
					if (versionChanged && versionConfig.notifyUpdate) {
						const channels = getUniqueChannels(
							annConfig?.sendTo?.channels,
						)

						if (
							annConfig?.sendTo?.enabled &&
							channels.length
						) {
							const content = buildVersionNotification({
								version: payload.name,
								oldVersion: previousVersion,
								versionTimeUtc8: formattedTimeUTC8,
								ets2Version: payload.supported_game_version,
								atsVersion: payload.supported_ats_game_version,
							})

							logger.info(
								`开始发送版本更新通知：${previousVersion} → ${payload.name}，目标群 ${channels.length} 个`,
							)

							const results = await sendToGroups(
								annConfig,
								channels,
								content,
							)

							const success = results.filter(item => item.ok).length
							const failed = results.length - success

							logger.info(
								`版本更新通知发送完成：成功 ${success} 个群，失败 ${failed} 个群`,
							)
						} else {
							logger.warn(
								'版本更新通知已开启，但 QQ 群发送未启用或没有配置目标群',
							)
						}
					}

					// 首次建立版本记录或检测到版本变化时，安排公告检测。
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

			// 启动时立即检测一次。
			fetchVersionInfo()

			if (versionConfig.interval > 0) {
				ctx.setInterval(
					fetchVersionInfo,
					versionConfig.interval * 60 * 1000,
				)
			}
		}

		// ==========================================
		// Discord 公告检测
		// ==========================================

		function setupAnnouncementCheck(annConfig) {
			const pendingTimers = new Map()
			const doneVersions = new Set()
			const completedResults = new Map()
			const checkingVersions = new Map()

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
							q: protectWhitespace(text),
						},
						{
							headers: {
								'Content-Type': 'application/json',
								Authorization: `Bearer ${apiKey}`,
							},
						},
					)

					if (res?.error_code || !res?.trans_result) {
						logger.error('百度翻译请求异常：%o', res)
						return null
					}

					return restoreWhitespace(
						res.trans_result.map(item => item.dst).join(''),
					)
				} catch (error) {
					logger.error('百度翻译网络请求异常：%o', error)
					return null
				}
			}

			/**
			 * 自动公告推送：向全部配置群发送。
			 */
			async function sendAnnouncement(row) {
				if (!annConfig.sendTo?.enabled) return

				const channels = getUniqueChannels(
					annConfig.sendTo.channels,
				)

				if (!channels.length) return

				const content = buildContent(
					row,
					annConfig.sendTo.format,
				)

				if (!content.trim()) return

				await sendToGroups(annConfig, channels, content)
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
			 * 安排五轮公告检测，间隔由 CHECK_MINUTES 控制。
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
								`版本 ${targetVersion} 第五轮检测时已有任务执行，等待当前任务完成`,
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
											`版本 ${targetVersion} 五轮检测完成，确认无更新公告`,
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
										`版本 ${targetVersion} 五轮检测结束，但仍无法确认公告状态，保留未确认状态，等待后续处理`,
									)
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

				CHECK_MINUTES.forEach((min, index) => {
					const timer = setTimeout(() => {
						timers.delete(timer)

						runCheck(
							index,
							index === CHECK_MINUTES.length - 1,
						)
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
			})

			return {
				scheduleAnnouncementChecks,
			}
		}

		// ==========================================
		// 生命周期
		// ==========================================

		ctx.on('ready', async () => {
			if (config.announcementCheck.enabled) {
				announcementApi = setupAnnouncementCheck(
					config.announcementCheck,
				)

				try {
					// 恢复重启前尚未完成的公告检测。
					const rows = await ctx.database.get(
						TABLE,
						{
							announcementChecked: false,
							version: { $ne: null },
						},
					)

					for (const row of rows) {
						if (row.announcementId) {
							await ctx.database.set(
								TABLE,
								row.id,
								{
									announcementChecked: true,
									updatedAt: new Date(),
								},
							)

							logger.info(
								`版本 ${row.version} 已有公告记录，跳过重启补检测`,
							)

							continue
						}

						logger.info(
							`重启补调度公告检测：${row.version}`,
						)

						announcementApi.scheduleAnnouncementChecks(
							row.version,
						)
					}
				} catch (error) {
					logger.error(
						'重启补调度公告检测失败：%o',
						error,
					)
				}
			}

			if (config.versionCheck.enabled) {
				setupVersionCheck(
					config.versionCheck,
					announcementApi,
					config.announcementCheck,
				)
			}
		})

		// ==========================================
		// 指令处理
		// ==========================================

		/**
		 * 手动 Markdown 推送只发送到当前命令所在群。
		 */
		async function handleMarkdownPush(version, actionName, session) {
			const annConfig = config.announcementCheck
			const sendConfig = annConfig?.sendTo

			if (!sendConfig?.enabled) {
				return `${actionName}失败：请先启用 QQ 群发送功能`
			}

			const groupOpenid = session?.guildId?.trim()

			if (!groupOpenid) {
				return `${actionName}失败：请在 QQ 群内执行此命令`
			}

			const targetVersion = version?.trim()

			const row = targetVersion
				? await findRowByVersion(targetVersion)
				: await findLatestRow()

			if (!row) {
				return targetVersion
					? `未找到版本 ${targetVersion} 的记录`
					: '暂无版本记录'
			}

			const content = buildContent(row, sendConfig.format)

			logger.info(
				`开始 Markdown ${actionName}：版本 ${row.version}，目标群 ${groupOpenid}`,
			)

			const results = await sendToGroups(
				annConfig,
				[groupOpenid],
				content,
			)

			const success = results.filter(item => item.ok).length

			logger.info(
				`Markdown ${actionName}完成：版本 ${row.version}，成功 ${success} 个群`,
			)
		}

		async function handleTestPush(version, session) {
			return handleMarkdownPush(version, '测试推送', session)
		}

		async function handleLatestAnnouncement(version, session) {
			return handleMarkdownPush(version, '最新公告推送', session)
		}

		/**
		 * 查询单个版本信息。
		 */
		async function handleVersion(version) {
			const targetVersion = version?.trim()

			const row = targetVersion
				? await findRowByVersion(targetVersion)
				: await findLatestRow()

			if (!row) {
				return targetVersion
					? `未找到版本 ${targetVersion} 的记录`
					: '暂无任何版本记录'
			}

			const lines = [
				`📦 TruckersMP 更新 ${row.version ?? '(未知版本)'}`,
			]

			if (row.oldVersion) {
				lines.push(`⬅️ 上一版本：${row.oldVersion}`)
			}

			if (row.versionTimeUtc8) {
				lines.push(
					`🕐 发布时间：${row.versionTimeUtc8} (UTC+8)`,
				)
			}

			if (row.versionTimeUtc) {
				lines.push(
					`🌐 UTC 时间：${row.versionTimeUtc}`,
				)
			}

			const game = buildGameVersions(row)

			if (game.length) {
				lines.push(
					`🎮 支持版本：${game.join(' · ')}`,
				)
			}

			if (row.announcementId) {
				lines.push('📢 公告状态：已发布')
			} else if (row.announcementChecked) {
				lines.push('📭 公告状态：该版本无公告')
			} else {
				lines.push('⏳ 公告状态：检测中')
			}

			return lines.join('\n')
		}

		/**
		 * 查询最近版本记录，最多显示 50 条。
		 */
		async function handleVersionHistory(count) {
			const limit = Math.max(
				1,
				Math.min(50, Number(count) || 10),
			)

			const rows = await ctx.database.get(
				TABLE,
				{ version: { $ne: null } },
				{
					sort: { createdAt: 'desc' },
					limit,
				},
			)

			if (!rows.length) {
				return '暂无版本记录'
			}

			const lines = rows.map((row, index) => {
				const mark = row.announcementId
					? '📢有公告'
					: (
						row.announcementChecked
							? '📭无公告'
							: '⏳检测中'
					)

				return `${String(index + 1).padStart(2, ' ')}. ${row.version ?? '(未知)'}  ${row.versionTimeUtc8 ?? '(无时间)'}  [${mark}]`
			})

			return [
				`📅 最近 ${rows.length} 条版本记录：`,
				...lines,
			].join('\n')
		}

		// ==========================================
		// 指令注册
		// ==========================================

		const d2c = ctx.command(
			'd2c',
			'Discord 公告推送管理',
		).action(() => {
			return [
				'📦 Discord 公告推送管理',
				'',
				'使用方法：',
				'd2c 测试推送 [版本] - 测试 QQ 群推送',
				'd2c 最新公告 [版本] - 推送最新公告',
				'd2c 版本 [版本] - 查询版本信息',
				'd2c 版本历史 [数量] - 查询版本历史',
			].join('\n')
		})

		d2c.subcommand(
			'.测试推送 [version:string]',
			'测试推送',
		).action(async ({ session }, version) => {
			return handleTestPush(version, session)
		})

		d2c.subcommand(
			'.最新公告 [version:string]',
			'获取最新公告',
		).action(async ({ session }, version) => {
			return handleLatestAnnouncement(version, session)
		})

		d2c.subcommand(
			'.版本 [version:string]',
			'查询版本',
		).action(async (_, version) => {
			return handleVersion(version)
		})

		d2c.subcommand(
			'.版本历史 [count:number]',
			'查询版本历史',
		).action(async (_, count) => {
			return handleVersionHistory(count)
		})
	},
}