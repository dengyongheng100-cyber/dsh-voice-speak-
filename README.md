# dsh-voice-speak

一个 **DeepSeek Harness（DSH）** Host 插件，注册 `speak` 工具：让 AI 助手把回复文字用语音朗读出来（默认智谱 GLM-TTS，支持克隆音色）。

> 使用场景：在 DSH 里让助手"说出来"——模型回复时调用 `speak` 工具，文字即被合成语音并在本机扬声器播放。

## 功能

- 注册一个名为 `speak` 的工具，参数 `text`（要朗读的文字）。
- 调用智谱 GLM-TTS（`/api/paas/v4/audio/speech`）合成 **wav**，用 `sounddevice` 在本机播放。
- 支持**克隆音色**：在智谱「音色复刻」拿到 voice id，填到 `ZHIPU_VOICE_ID` 即可用你自己的声音朗读。

## 与同类插件的差异（亮点）

DSH 生态已有若干语音朗读插件（dsh-tts-bridge、dsh-voice-mode、Voice 等）。本插件的核心优势：

- **克隆音色**：可用**你自己的声音**朗读（录约 3 秒即可复刻）——多数同类只支持固定音色或浏览器默认朗读。
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

## 配置（环境变量，不要写死在代码里）

| 变量 | 说明 | 默认 |
|---|---|---|
| `ZHIPU_API_KEY` | 智谱 API Key（**必填**） | 空 |
| `ZHIPU_VOICE_ID` | 音色 ID。内置：`tongtong`(女)、`xiaochen`(男)、`female-tianmei` 等；或你在控制台克隆的音色 ID（形如 UUID） | `tongtong` |
| `VOICE_PYTHON` | 装有上面依赖的 Python 解释器绝对路径 | 内置示例路径，**请改成你自己的** |

## 安装（作为 DSH 本地 bundle）

1. 把本目录放到任意位置（如 `~/dsh-voice-speak`）。
2. 在 DSH 的 profile 里用 `plugin_manager` 安装本目录（`install_bundle`，target 指向本目录绝对路径）。
3. 重启 / 重载 DSH profile，使其加载插件。
4. 设置上面的环境变量（DSH 启动环境里 export）。

安装后，助手即可调用 `speak({ text: "你好" })`。

## 文件结构

```
index.js          # Host 插件入口：注册 speak 工具
cordis.patch.yml  # Loader patch：插入插件行
package.json      # 包清单（dsh.bundle.patch）
locale/{en,zh}.json  # 展示标题/描述
icon.svg
```

## 原理

`index.js` 的 `execute` 把文字写入临时文件，调用一个内嵌的 Python 小脚本：
1. `httpx` 请求智谱 TTS 得到 wav 字节；
2. `wave` 解析、`numpy` 取 PCM；
3. `sounddevice` 播放。

用外部 Python 是为了省掉在 Node 里重度处理音频的依赖；TTS/播放逻辑集中在 `PLAY_DRIVER` 常量里，便于修改。

## 说明与限制

- 播放是同步阻塞（念完才算工具返回）；需要并发可改成后台播放。
- 智谱 TTS 在某些环境下合成为**整体 wav**（非逐字流式），单句较长时延稍高。
- 若用自建克隆音色，请遵守智谱相关条款，勿用于冒充他人。

## License

MIT（如需请自行补充 LICENSE 文件）
