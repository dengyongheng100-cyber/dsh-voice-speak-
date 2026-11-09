/**
 * @local/dsh-voice-speak
 * 注册 `speak` 工具：把文字用 智谱 GLM-TTS + 克隆音色「小翁」 合成并播放。
 * Host-only 插件，无 UI。
 */
import { execFile } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const defineTool = (def) => def;

export const name = "dsh-voice-speak";
export const inject = ["tools"];

// Python 解释器路径（需装有 httpx/numpy/sounddevice；可用环境变量覆盖）
const PYTHON = process.env.VOICE_PYTHON ||
  "C:\\Users\\win11abc\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe";
// 从环境变量读取（不要写死密钥！部署时 export 设置）
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || "";
// 克隆音色 ID（在智谱控制台「音色复刻」得到；也可用官方内置音色，如 tongtong / xiaochen 等）
const VOICE_ID = process.env.ZHIPU_VOICE_ID || "tongtong";

// 驱动：读文本文件 -> 智谱 TTS 合成 wav -> 播放 -> 退出
const PLAY_DRIVER = String.raw`
import sys, os, io, wave, numpy as np, sounddevice as sd, httpx
text_path, voice = sys.argv[1], sys.argv[2]
api_key = os.environ.get("ZHIPU_API_KEY", "")
text = open(text_path, encoding="utf-8").read().strip()
if not text:
    print("EMPTY"); sys.exit(0)
r = httpx.post("https://open.bigmodel.cn/api/paas/v4/audio/speech",
    headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"},
    json={"model": "glm-tts", "input": text, "voice": voice, "response_format": "wav"},
    timeout=60)
if r.status_code != 200 or len(r.content) < 1000:
    print("TTS_FAIL", r.status_code, r.text[:200]); sys.exit(1)
w = wave.open(io.BytesIO(r.content), "rb")
sr = w.getframerate()
a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
sd.play(a, sr); sd.wait()
print("SPOKEN", len(text))
`;

function runPython(args, env) {
  return new Promise((resolve, reject) => {
    execFile(PYTHON, args, { timeout: 120000, windowsHide: true, env: { ...process.env, ...env } },
      (err, stdout, stderr) => {
        if (err) reject(new Error((stderr || err.message || "").slice(0, 500)));
        else resolve((stdout || "").trim());
      });
  });
}

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: "speak",
    description: "把一段文字用语音朗读出来并播放（使用克隆音色「小翁」，智谱 GLM-TTS）。需要在回复用户时让对方'听到'内容就调用它。",
    parameters: {
      text: { type: "string", description: "要朗读的文字（中文/英文均可）。" },
    },
    output: {
      schema: { type: "string" },
      render: (_a, result) => [{ type: "text", text: result }],
    },
    async execute(args) {
      const text = String(args.text ?? "");
      if (!text.trim()) return "没内容可念。";
      const dir = mkdtempSync(join(tmpdir(), "dsh-tts-"));
      const textFile = join(dir, "say.txt");
      const driverFile = join(dir, "play.py");
      writeFileSync(textFile, text, "utf-8");
      writeFileSync(driverFile, PLAY_DRIVER, "utf-8");
      try {
        const out = await runPython([driverFile, textFile, VOICE_ID], { ZHIPU_API_KEY });
        if (out.startsWith("TTS_FAIL") || out.startsWith("EMPTY")) return "朗读失败：" + out;
        return `已朗读：${out || "ok"}`;
      } catch (e) {
        return `朗读失败：${e.message}`;
      }
    },
  }));
}
