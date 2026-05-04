# AIRI 语音聊天架构升级说明

## 概述

本次升级将 Open-LLM-VTuber 的核心语音聊天技术移植到 AIRI 项目中，实现了以下关键功能：

1. **流式分句 + faster_first_response** - 首句逗号即触发 TTS，大幅降低感知延迟
2. **并发 TTS 合成 + 顺序投递** - 多句话并行合成，按序播放
3. **TTS 文本预处理** - 字幕完整，但 TTS 只念干净内容
4. **口型对齐** - 基于音量包络的 Live2D 嘴型驱动
5. **多引擎 ASR/TTS 支持** - 可插拔的语音引擎架构
6. **VAD 语音活动检测** - 支持无耳机打断对话

## 新增组件

### 1. 句子分割器 (`processors/sentence-divider.ts`)

```typescript
import { createSentenceDividerStream, divideSentences } from '@proj-airi/pipelines-audio'

// 流式处理
const sentenceStream = createSentenceDividerStream(tokenStream, {
  fasterFirstResponse: true, // 首句逗号即触发
  segmentMethod: 'auto', // 自动语言检测
  validTags: ['think'], // 支持的标签
})

// 批量处理
for await (const sentence of divideSentences('Hello, world! How are you?')) {
  console.log(sentence.text, sentence.tags)
}
```

### 2. TTS 预处理器 (`processors/tts-preprocessor.ts`)

```typescript
import {
  ttsFilter,
  preprocessForTts,
  extractEmotionTags,
} from '@proj-airi/pipelines-audio'

// 基础过滤
const cleanText = ttsFilter("[joy] Hello *world* </think>")

// 完整预处理（字幕 + TTS）
const result = preprocessForTts("[joy] Hello </think>)


```

### 3. 音频载荷准备器 (`utils/audio-payload.ts`)

```typescript
import { createSilentPayload, prepareAudioPayload } from '@proj-airi/pipelines-audio'

// 准备音频载荷（含口型数据）
const payload = prepareAudioPayload(audioBuffer, 24000, {
  displayText: { text: '你好', name: 'AI' },
  actions: { expressions: ['joy'] },
})

// 静默载荷（think 标签内容）
const silent = createSilentPayload({ text: '(内心独白)' })
```

### 4. 流式处理管线 (`processors/transformers.ts`)

```typescript
import { createTransformPipeline } from '@proj-airi/pipelines-audio'

// 完整管线：tokens → SentenceOutput
for await (const output of createTransformPipeline(llmTokenStream, {
  sentenceDivider: { fasterFirstResponse: true },
  ttsFilter: { ignoreBrackets: true },
  extractEmotions: true,
})) {
  if ('displayText' in output) {
    console.log('Display:', output.displayText.text)
    console.log('TTS:', output.ttsText)
    console.log('Actions:', output.actions)
  }
}
```

### 5. TTS 引擎工厂 (`engines/tts-engine.ts`)

```typescript
import { EdgeTtsEngine, OpenAiTtsEngine, TtsEngineFactory } from '@proj-airi/pipelines-audio'

// 使用默认引擎
const engine = await TtsEngineFactory.getDefault()
const result = await engine.synthesize('你好', { voice: 'zh-CN-XiaoxiaoNeural' })

// 使用特定引擎
const edgeTts = new EdgeTtsEngine()
const openaiTts = new OpenAiTtsEngine('https://api.openai.com/v1', apiKey)
```

### 6. ASR 引擎工厂 (`engines/asr-engine.ts`)

```typescript
import { AsrEngineFactory, WhisperAsrEngine } from '@proj-airi/pipelines-audio'

// 使用 Whisper API
const whisper = new WhisperAsrEngine(apiKey, 'https://api.openai.com/v1')
const result = await whisper.recognize(audioData, 16000, { language: 'zh' })
```

### 7. VAD 引擎 (`engines/vad-engine.ts`)

```typescript
import { createVadStream, EnergyVadEngine } from '@proj-airi/pipelines-audio'

const vad = new EnergyVadEngine({
  probThreshold: 0.4,
  requiredHits: 3,
  requiredMisses: 24,
})

vad.on('onSpeechStart', () => console.log('开始说话'))
vad.on('onSpeechEnd', audio => console.log('结束说话，音频长度:', audio.length))

// 处理音频帧
const { state, signal } = vad.processFrame(audioFrame)
```

### 8. TTS 任务管理器 (`managers/tts-task-manager.ts`)

```typescript
import { createStreamingTtsManager, TtsTaskManager } from '@proj-airi/pipelines-audio'

const manager = new TtsTaskManager(ttsEngine, { maxConcurrent: 4 })

// 并发合成，有序投递
const payload1 = await manager.queue('第一句', display1, actions1)
const payload2 = await manager.queue('第二句', display2, actions2)
const payload3 = await manager.queue('第三句', display3, actions3)

// 获取下一个可播放的载荷
const next = manager.getNextPayload()
```

## 架构对比

### Open-LLM-VTuber 原架构

```
浏览器麦克风
   ↓
Silero VAD (检测说话起止)
   ↓
ASR (SenseVoice)
   ↓
LLM Agent (流式 token)
   ↓
SentenceDivider (pysbd + faster_first_response)
   ↓
TTS 过滤器 (去括号、表情)
   ↓
TTSTaskManager (并发合成 + 顺序投递)
   ↓
prepare_audio_payload (含口型数据)
   ↓
WebSocket 推送
   ↓
前端 Live2D (音量驱动嘴型)
```

### AIRI 新架构

```
麦克风输入
   ↓
EnergyVadEngine (说话检测)
   ↓
AsrEngine (Whisper API / Web Speech)
   ↓
LLM Token Stream
   ↓
createTransformPipeline (装饰器链)
   ├─ sentenceDividerTransformer (Intl.Segmenter)
   ├─ actionsExtractorTransformer (表情提取)
   ├─ displayProcessorTransformer (think 标签处理)
   └─ ttsFilterTransformer (文本过滤)
   ↓
TtsTaskManager (并发 + 顺序)
   ↓
TtsEngine (Edge TTS / OpenAI TTS)
   ↓
prepareAudioPayload (口型音量)
   ↓
前端播放 (Live2D 同步)
```

## 关键差异说明

| 特性 | Open-LLM-VTuber | AIRI 实现 |
|------|----------------|-----------|
| 句子分割 | pysbd (Python) | Intl.Segmenter (浏览器原生) |
| 首次响应 | 逗号分割 | 逗号分割 |
| TTS 引擎 | Edge TTS (py) | Edge TTS (Web API) |
| ASR 引擎 | Sherpa-ONNX SenseVoice | Whisper API / Web Speech |
| VAD | Silero (PyTorch) | Energy-based (简化版) |
| 音量计算 | pydub (FFmpeg) | Web Audio API |

## 前端集成

### 口型驱动

前端接收到 `AudioPayload` 后：

```typescript
// 播放音频
const audioContext = new AudioContext()
const audioBuffer = audioContext.decodeBuffer(base64ToArray(payload.audio.audio))

// 按音量驱动嘴型
const { volumes, sliceLength } = payload.audio
let frameIndex = 0

function onAnimationFrame() {
  if (frameIndex < volumes.length) {
    live2dModel.setParameter('ParamMouthOpenY', volumes[frameIndex])
    frameIndex++
  }
  requestAnimationFrame(onAnimationFrame)
}

// 开始播放
const source = audioContext.createBufferSource()
source.buffer = audioBuffer
source.connect(audioContext.destination)
source.start()
onAnimationFrame()
```

### 表情触发

```typescript
if (payload.actions?.expressions) {
  for (const expr of payload.actions.expressions) {
    live2dModel.setExpression(expr)
  }
}
```

## 配置示例

```typescript
// 完整配置
const pipeline = createSpeechPipeline({
  tts: async (request, signal) => {
    const engine = await TtsEngineFactory.getDefault()
    const result = await engine.synthesize(request.text, { voice: 'zh-CN-XiaoxiaoNeural' }, signal)
    return result
  },
  ttsMaxConcurrent: 4,
  segmenter: (tokens, meta) => createTtsSegmentStream(tokens, meta, {
    boost: 2,
    minimumWords: 4,
    maximumWords: 12,
  }),
  playback: {
    schedule: item => playAudio(item),
    stopAll: reason => stopAllAudio(),
    // ...其他回调
  },
})
```

## 后续改进建议

1. **完整 Silero VAD** - 使用 ONNX Runtime Web 集成真正的 Silero 模型
2. **SenseVoice ASR** - 通过 ONNX 或 WebAssembly 集成本地 ASR
3. **GPT-SoVITS TTS** - 添加声纹克隆支持
4. **双端 VAD** - 前端 + 后端双层检测，更可靠的打断支持

## 文件清单

- `src/processors/sentence-divider.ts` - 句子分割器
- `src/processors/tts-preprocessor.ts` - TTS 文本预处理器
- `src/processors/transformers.ts` - 流式处理管线装饰器
- `src/utils/audio-payload.ts` - 音频载荷准备器
- `src/engines/tts-engine.ts` - TTS 引擎接口和工厂
- `src/engines/asr-engine.ts` - ASR 引擎接口和工厂
- `src/engines/vad-engine.ts` - VAD 引擎
- `src/managers/tts-task-manager.ts` - 并发 TTS 任务管理器
- `src/types.ts` - 类型定义更新
- `src/index.ts` - 导出更新
