# koishi-plugin-jasper2024-discord-to-channel

[![npm](https://img.shields.io/npm/v/koishi-plugin-jasper2024-discord-to-channel?style=flat-square)](https://www.npmjs.com/package/koishi-plugin-jasper2024-discord-to-channel)

**获取discord的消息,并发送到指定的频道(自用)**

# Koishi Plugin: koishi-plugin-jasper2024-discord-to-channel

一个基于 [Koishi](https://koishi.chat/) 的插件，用于自动检测 **TruckersMP** 版本更新，抓取 **Discord** 公告，支持**百度翻译**，并通过 QQ 官方机器人接口推送到 QQ 群。

## ✨ 功能特性

*   **TruckersMP 版本监控**：定时轮询官方 API，自动记录 ETS2 / ATS 支持版本及更新时间。
*   **版本更新通知**：检测到新版本时，可自动向指定 QQ 群发送 Markdown 通知。
*   **Discord 公告抓取**：版本更新后，自动抓取 Discord 频道的对应公告。
*   **智能翻译**：集成百度翻译 API，自动将英文公告翻译为中文。
*   **QQ 群推送**：通过 QQ 官方接口（Markdown 格式）将更新日志或公告推送到群聊。
*   **指令管理**：提供便捷的指令，支持手动测试推送、查询版本信息及历史记录。

## 📦 安装

在你的 Koishi 项目根目录下运行：

```bash
npm install koishi-plugin-jasper2024-discord-to-channel
# 或者使用 yarn / pnpm