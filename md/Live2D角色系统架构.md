# Live2D 角色系统架构

## 概述

AIRI 的 Live2D 角色系统经过重构后，采用了模块化、可扩展的架构设计。核心目标是：

1. **解耦角色与 UI** - 角色逻辑与渲染/交互完全分离
2. **支持角色商城** - 角色可作为独立资产包进行销售
3. **模型替换兼容** - 替换模型后表情/动作仍然正常工作
4. **标准 LLM 集成** - 提供统一的 API 供 AI 调用

## 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                        应用层                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  LLM 输出   │  │  用户交互    │  │    场景 UI 控制     │ │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘ │
└─────────┼─────────────────┼────────────────────┼────────────┘
          │                 │                    │
          ▼                 ▼                    ▼
┌─────────────────────────────────────────────────────────────┐
│                      情绪解析模块                            │
│         (将文本/情绪名称转换为角色命令)                       │
│                  "happy" → setEmotion("happy")              │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Live2D 角色模块                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  createLive2DCharacter(config, deps)                 │  │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │  │
│  │  │ 情绪映射器  │  │ 表情管理器  │  │  动作管理器   │  │  │
│  │  └────────────┘  └────────────┘  └──────────────┘  │  │
│  │  ┌────────────┐                                    │  │
│  │  │ 参数管理器  │                                    │  │
│  │  └────────────┘                                    │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    渲染引擎 (Pixi.js)                        │
│              Live2DModel → Canvas → WebGL                   │
└─────────────────────────────────────────────────────────────┘
```

## 核心模块

### 1. 角色工厂 (`character/factory.ts`)

**工厂函数模式**创建 Live2D 角色实例：

```typescript
const character = createLive2DCharacter({
  id: 'hiyori-v1',
  name: 'Hiyori',
  modelSrc: '/models/hiyori.zip',
  metadata: {
    author: 'Sample',
    version: '1.0',
    description: '示例角色',
    tags: ['cute', 'anime'],
  },
  presets: {
    // 情绪到表情的映射
    emotionMap: {
      happy: 'exp_01',
      sad: 'exp_02',
      angry: 'exp_03',
    },
    // 情绪到动作的映射
    motionMap: {
      happy: 'Idle_01',
      angry: 'Angry_01',
    },
    // 默认参数值
    defaultParameters: {
      angleX: 0,
      angleY: 0,
      leftEyeOpen: 1,
    },
  },
}, { app })
```

### 2. 标准角色 API (`ILive2DCharacter`)

```typescript
interface ILive2DCharacter {
  // 元数据（只读）
  readonly id: string
  readonly name: string
  readonly metadata: CharacterMetadata
  readonly presets: CharacterPresets

  // 子系统
  expressions: ExpressionManager // 表情控制
  motions: MotionManager // 动作控制
  parameters: ParameterManager // 参数控制

  // 模型引用
  getModel: () => Live2DModel | undefined

  // 生命周期
  load: () => Promise<void>
  dispose: () => void
}
```

### 3. LLM 集成接口 (`CharacterEmotionAPI`)

```typescript
interface CharacterEmotionAPI {
  // 设置情绪（由情绪解析模块调用）
  setEmotion: (emotion: string) => void

  // 播放指定动画
  playMotion: (motionName: string) => void

  // 重置到默认状态
  reset: () => void
}
```

**使用流程**：

```
LLM 输出: "用户说了一个笑话，我很开心"
    ↓
情绪解析模块: 识别为 "happy"
    ↓
character.setEmotion("happy")
    ↓
情绪映射器查表: happy → exp_01 (表情) + Idle_01 (动作)
    ↓
应用表情和播放动作
```

### 4. 情绪映射系统 (`emotion-mapper.ts`)

负责将抽象的情绪名称映射到具体的 Live2D 表情和动作：

```typescript
// 创建情绪映射器（包含默认映射）
const mapper = createEmotionMapperWithDefaults(
  presets, // 预设配置
  expressionManager, // 表情管理器
  motionManager, // 动作管理器
)

// 设置情绪
mapper.setEmotion('happy') // 应用表情 + 播放动作

// 注册自定义情绪
mapper.registerEmotion('excited', 'exp_05', 'Excited_01')
```

**默认情绪映射**：

| 情绪 | 表情 | 动作 |
|------|------|------|
| happy | happy | Idle |
| sad | sad | Idle |
| angry | angry | Idle |
| surprised | surprised | Idle |
| neutral | neutral | Idle |

### 5. 表情管理器 (`expression-manager.ts`)

管理 Live2D 的 exp3 表情文件：

```typescript
const expressions = character.expressions

// 列出所有表情
const list = expressions.list() // ['exp_01', 'exp_02', ...]

// 获取表情详情
const exp = expressions.get('exp_01')

// 设置表情
expressions.set('exp_01', true) // 开启
expressions.set('exp_01', false) // 关闭
expressions.set('exp_01', 0.5) // 设置值

// 重置所有表情
expressions.reset()
```

### 6. 动作管理器 (`motion-manager.ts`)

管理 Live2D 的动画文件：

```typescript
const motions = character.motions

// 列出所有动作
const list = motions.list() // [{ group: 'Idle', index: 0, fileName: ... }, ...]

// 播放动作
motions.play('Idle', 0) // 播放 Idle 组的第 0 个动作
motions.play('Tap_Body') // 播放 Tap_Body 动作

// 停止所有动作
motions.stopAll()
```

### 7. 参数管理器 (`parameter-manager.ts`)

直接控制 Live2D 模型参数：

```typescript
const params = character.parameters

// 获取参数值
const eyeOpen = params.get('leftEyeOpen')

// 设置参数值
params.set('leftEyeOpen', 0.5)
params.set('angleX', 15)

// 重置所有参数
params.reset()
```

**标准参数名称映射**：

| 标准名称 | Live2D 参数 ID |
|----------|---------------|
| angleX | ParamAngleX |
| angleY | ParamAngleY |
| leftEyeOpen | ParamEyeLOpen |
| rightEyeOpen | ParamEyeROpen |
| mouthOpen | ParamMouthOpenY |
| ... | ... |

## 状态管理分离

### 角色内部状态 (`CharacterInternalState`)

位于角色模块内部，不对外暴露：

```typescript
interface CharacterInternalState {
  model: Live2DModel | undefined
  expressions: Map<string, ExpressionEntry>
  expressionGroups: Map<string, ExpressionGroupDefinition>
  motions: MotionPreset[]
  parameters: Record<string, number>
  isLoaded: boolean
}
```

### UI 场景状态 (`stores/scene-state.ts`)

与角色分离的 UI 状态：

```typescript
const sceneState = useLive2DSceneState()

// 位置（相对于屏幕中心的百分比）
sceneState.position = { x: 10, y: -5 }

// 缩放
sceneState.scale = 1.5

// 当前动作（显示用）
sceneState.currentMotion = { group: 'Idle', index: 0 }
```

## 角色资产包格式

角色资产包是一个 JSON 配置文件，包含角色完整定义：

```json
{
  "id": "hiyori-v1",
  "name": "Hiyori",
  "modelSrc": "/models/hiyori.zip",
  "metadata": {
    "author": "Sample Author",
    "version": "1.0.0",
    "description": "一个可爱的虚拟角色",
    "previewImage": "/previews/hiyori.png",
    "tags": ["cute", "anime", "school"]
  },
  "presets": {
    "emotionMap": {
      "happy": "exp_01",
      "sad": "exp_02",
      "angry": "exp_03",
      "surprised": "exp_04",
      "shy": "exp_05"
    },
    "motionMap": {
      "happy": "Idle_01",
      "angry": "Angry_01",
      "sad": "Sad_01"
    },
    "defaultParameters": {
      "angleX": 0,
      "angleY": 0,
      "angleZ": 0,
      "leftEyeOpen": 1,
      "rightEyeOpen": 1
    }
  }
}
```

## 模型替换兼容性

当用户替换 Live2D 模型时，通过预设配置确保兼容性：

1. **情绪映射** - 不同模型的表情文件名可能不同，通过 `emotionMap` 统一
2. **动作映射** - 不同模型的动作组结构可能不同，通过 `motionMap` 统一
3. **参数映射** - 不同模型可能使用不同的参数 ID，通过标准参数名称统一

**示例**：

```typescript
// 原模型 Hiyori
const hiyoriPresets = {
  emotionMap: { happy: 'exp_01' },
  motionMap: { happy: 'Idle_01' },
}

// 新模型 Haru（表情文件名不同）
const haruPresets = {
  emotionMap: { happy: 'haru_happy' }, // 不同的文件名
  motionMap: { happy: 'Haru_Idle' }, // 不同的动作组
}

// 使用相同 API 调用
hiyori.setEmotion('happy') // 应用 exp_01
haru.setEmotion('happy') // 应用 haru_happy
```

## 扩展性

### 创建自定义角色包

```typescript
import { createLive2DCharacter } from '@proj-airi/stage-ui-live2d'

// 从服务器加载角色配置
const response = await fetch('/store/characters/custom-character.json')
const config = await response.json()

// 创建角色实例
const character = createLive2DCharacter(config, { app })
await character.load()

// 立即可用
character.setEmotion('happy')
```

### 社区开发者扩展

社区开发者可以：

1. **创建自定义角色** - 定义自己的情绪映射和动作
2. **自定义参数映射** - 支持特殊模型的参数
3. **扩展情绪** - 注册新的情绪类型

```typescript
// 注册自定义情绪
const mapper = createEmotionMapper(presets, exprMgr, motionMgr)
mapper.registerEmotion('blush', 'exp_blush', 'Blush_Motion')
```

## 文件结构

```
packages/stage-ui-live2d/
├── src/
│   ├── character/                    # 角色核心模块
│   │   ├── types.ts                  # 接口定义
│   │   ├── factory.ts                # 工厂函数
│   │   ├── emotion-mapper.ts         # 情绪映射
│   │   ├── expression-manager.ts     # 表情管理
│   │   ├── motion-manager.ts         # 动作管理
│   │   ├── parameter-manager.ts      # 参数管理
│   │   └── index.ts                  # 导出
│   ├── stores/
│   │   ├── scene-state.ts            # UI 场景状态
│   │   ├── live2d.ts                 # 原有状态（兼容）
│   │   └── expression-store.ts       # 原有表情存储（兼容）
│   └── components/
│       └── scenes/
│           ├── Live2D.vue            # 主场景组件
│           └── live2d/
│               ├── Canvas.vue        # Pixi 画布
│               └── Model.vue         # 模型渲染
```

## 与现有系统的兼容性

重构保持了向后兼容：

1. **原有的 Pinia stores 仍然可用** - `useLive2d()`, `useExpressionStore()`
2. **原有的组件 API 不变** - `Live2DScene` 组件
3. **渐进式迁移** - 可以逐步迁移到新的角色 API

## 未来扩展

完成此架构后，可轻松实现：

1. **角色商城** - 销售角色资产包
2. **角色编辑器** - 可视化配置情绪映射
3. **角色分享** - 导出/导入角色配置
4. **版本管理** - 角色更新和版本控制
5. **云同步** - 跨设备同步角色配置
