# dsh-voice-speak

一个 **DeepSeek Harness（DSH）** Host 插件，注册 `speak` 工具：让 AI 助手把回复文字用语音朗读出来（默认智谱 GLM-TTS，支持克隆音色、自动去除开头提示音）。

> 使用场景：在 DSH 里让助手"说出来"——模型回复时调用 `speak` 工具，文字即被合成语音并在本机扬声器播放。

## 功能

- 注册一个名为 `speak` 的工具，参数 `text`（要朗读的文字）。
- 调用智谱 GLM-TTS（`/api/paas/v4/audio/speech`）合成 **wav**，用 `sounddevice` 在本机播放。
- 支持**克隆音色**：在智谱「音色复刻」拿到 voice id，填到 `ZHIPU_VOICE_ID` 即可用你自己的声音朗读。
- **自动去除开头的"嘟嘟/滴滴"提示音**：智谱 TTS 返回的音频开头自带一段方波提示音，插件会按能量特征裁掉它，只播真正的人声（见下方「去提示音」）。

## 与同类插件的差异（亮点）

DSH 生态已有若干语音朗读插件（dsh-tts-bridge、dsh-voice-mode、Voice 等）。本插件的核心优势：

- **克隆音色**：可用**你自己的声音**朗读（录约 3 秒即可复刻）——多数同类只支持固定音色或浏览器默认朗读。
- **去开头提示音**：自动裁掉智谱 TTS 开头的嘟嘟声，听感更干净（同类少有处理）。
- **轻量**：单文件 Host 插件，逻辑集中、易改。
- **引擎可选**：默认智谱 GLM-TTS，逻辑上可换任何兼容 OpenAI 风格的 TTS。

> 同类插件在「语音输入 / 全双工对话」方向更完整；本插件专注「把回复念出来」，开箱即用。

## 环境要求

- Node.js ≥ 18（DSH 自带）
- Python 3，且装有：
  ```bash
  pip install httpx numpy sounddevice
  ```
- 智谱开放平台 API Key（https://bigmodel.cn）

## 配置

密钥**不要写死在代码里**。插件按以下顺序读取配置：

1. **环境变量** `ZHIPU_API_KEY`、`ZHIPU_VOICE_ID`（推荐，最稳）
2. **本地私有文件** `~/.dsh-voice-speak.local.json`（不想动环境变量时用；内容形如）：
   ```json
   { "ZHIPU_API_KEY": "你的key", "ZHIPU_VOICE_ID": "你的音色ID" }
   ```
   ⚠️ 该文件**不要提交到 git**。

| 配置项 | 说明 | 默认 |
|---|---|---|
| `ZHIPU_API_KEY` | 智谱 API Key（**必填**） | 空 |
| `ZHIPU_VOICE_ID` | 音色 ID。内置：`tongtong`(女)、`xiaochen`(男)、`female-tianmei` 等；或你在控制台克隆的音色 ID（形如 UUID） | `tongtong` |
| `VOICE_PYTHON` | 装有上面依赖的 Python 解释器绝对路径（仅环境变量） | 内置示例路径，**请改成你自己的** |

## 安装（作为 DSH 本地 bundle）

1. 把本目录放到任意位置（如 `~/dsh-voice-speak`）。
2. 在 DSH 的 profile 里用 `plugin_manager` 的 `install_bundle`，target 指向本目录绝对路径。
3. **重启 DSH**（重要，见下）。
4. 配置好上面的 key（环境变量或本地文件）。

安装后，助手即可调用 `speak({ text: "你好" })`。

## 重要：改了插件代码必须重启 DSH

DSH 对**已安装**的插件，改 `index.js` 后**只做 install_bundle / remove+install 不会加载新代码**，必须**重启 DSH 应用**才会加载新的 JS 模块代。排查"改了没反应"时先想到这一点。

## 原理

`index.js` 的 `execute` 把文字写入临时文件，调用一个内嵌的 Python 小脚本（`PLAY_DRIVER` 常量）：
1. `httpx` 请求智谱 TTS 得到 wav 字节；
2. `wave` 解析、`numpy` 取 PCM；
3. **能量分析裁掉开头提示音**（见下）；
4. `sounddevice` 播放。

用外部 Python 是为了省掉在 Node 里重度处理音频的依赖；TTS/播放逻辑集中在 `PLAY_DRIVER`，便于修改。

### 去提示音（trim leading beep）

智谱 TTS 音频开头通常是这样：`[方波提示音 0-120ms] [静音] [方波提示音 300-650ms] [静音] … [真正人声]`。
插件按下述规则把开头裁掉：逐 10ms 算能量，跳过"平顶方波（能量约 1000–1250 且几乎不变）"与"静音（<60）"，直到出现**持续有起伏的人声**，从那里开始播放。这样既去掉嘟嘟，又不会切掉第一个字。

## 已知坑（实战经验）

- **代理**：智谱是国内接口（open.bigmodel.cn），**不需要走代理**。若系统/环境设了本地代理（如 `127.0.0.1:xxxx`），httpx 默认会走、可能因代理抖动失败。插件已用 `trust_env=False` 并清空子进程的 `*_PROXY` 变量规避。
- **Key 读不到**：报 `httpx.LocalProtocolError: Illegal header value b'Bearer '` 说明 key 为空——检查环境变量是否在 **DSH 启动环境**里可见，或本地 JSON 是否正确（注意 **JSON 文件不要带 BOM**）。
- **改了没生效**：见上「必须重启 DSH」。
- **播放阻塞**：念完才返回。需要并发可改成后台播放。

## 文件结构

```
index.js          # Host 插件入口：注册 speak 工具（含裁剪、配置读取）
cordis.patch.yml  # Loader patch：插入插件行
package.json      # 包清单（dsh.bundle.patch）
locale/{en,zh}.json  # 展示标题/描述
icon.svg
```

## 限制与合规

- 智谱 TTS 在某些环境返回整段 wav（非逐字流式），长句延迟稍高。
- 使用克隆音色请遵守智谱相关条款，勿用于冒充他人；不要朗读密钥、密码等敏感信息。

## License

MIT（如需请自行补充 LICENSE 文件）
