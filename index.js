/**
 * @local/dsh-voice-speak
 * 注册 `speak` 工具：把文字用 智谱 GLM-TTS + 克隆音色「小翁」 合成并播放。
 * Host-only 插件，无 UI。
 */
import { execFile } from "node:child_process";
import { writeFileSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

const defineTool = (def) => def;

export const name = "dsh-voice-speak";
export const inject = ["tools"];

// Python 解释器路径（需装有 httpx/numpy/sounddevice；可用环境变量覆盖）
const PYTHON = process.env.VOICE_PYTHON ||
  "C:\\Users\\win11abc\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe";
// 读取配置：优先环境变量，其次本地私有文件（不进 git） ~/.dsh-voice-speak.local.json
let _localCfg = {};
try {
  const cf = join(homedir(), ".dsh-voice-speak.local.json");
  if (existsSync(cf)) _localCfg = JSON.parse(readFileSync(cf, "utf-8"));
} catch { /* ignore */ }
const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY || _localCfg.ZHIPU_API_KEY || "";
const VOICE_ID = process.env.ZHIPU_VOICE_ID || _localCfg.ZHIPU_VOICE_ID || "tongtong";

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
    timeout=60, trust_env=False)  # 智谱是国内接口，禁用系统代理，避免本地代理抖动导致失败
if r.status_code != 200 or len(r.content) < 1000:
    print("TTS_FAIL", r.status_code, r.text[:200]); sys.exit(1)
w = wave.open(io.BytesIO(r.content), "rb")
sr = w.getframerate()
a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32)
# --- 去除智谱 TTS 开头自带的"嘟嘟/滴滴"提示音（平顶方波 + 静音），裁到真正语音开始 ---
hop = int(sr * 0.01)
en = np.array([np.abs(a[i:i+hop]).mean() for i in range(0, len(a), hop)])
def _is_flat(v):
    return 1000 <= v <= 1250
_start = None
for i in range(len(en)):
    v = en[i]
    if v < 60 or _is_flat(v):
        continue
    if sum(1 for j in range(i, min(i+8, len(en))) if en[j] > 80) >= 5:
        _start = i; break
if _start:
    a = a[_start*hop:]
a = a.astype(np.int16)
sd.play(a, sr); sd.wait()
print("SPOKEN", len(text))
`;

function runPython(args, env) {
  return new Promise((resolve, reject) => {
    // 清掉代理相关环境变量（智谱是国内接口，代理反而添乱/抖动）
    const cleanEnv = { ...process.env, ...env };
    for (const k of Object.keys(cleanEnv)) {
      if (/proxy/i.test(k)) delete cleanEnv[k];
    }
    cleanEnv.NO_PROXY = "*";
    cleanEnv.no_proxy = "*";
    execFile(PYTHON, args, { timeout: 120000, windowsHide: true, env: cleanEnv },
      (err, stdout, stderr) => {
        if (err) {
          const full = (stderr || err.message || "");
          try { writeFileSync(join(tmpdir(), "dsh-voice-speak.err.log"), String(full)); } catch {}
          reject(new Error(full.slice(-800)));
        }
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
