import type { Live2DModel } from 'pixi-live2d-display/cubism4'

// ---------------------------------------------------------------------------
// exp3.json Types (for expression loading, internal use)
// ---------------------------------------------------------------------------

export interface Model3ExpressionRef {
  Name: string
  File: string
}

export interface Exp3Parameter {
  Id: string
  Value: number
  Blend: 'Add' | 'Multiply' | 'Overwrite'
}

export interface Exp3Json {
  Type: string
  Parameters: Exp3Parameter[]
}

// ---------------------------------------------------------------------------
// Configuration Types
// ---------------------------------------------------------------------------

/**
 * 元数据（用于商城展示）
 */
export interface CharacterMetadata {
  author?: string
  version?: string
  description?: string
  previewImage?: string
  tags?: string[]
}

/**
 * 预设参数配置（确保模型替换后的兼容性）
 */
export interface CharacterPresets {
  /** 情绪到表达式的映射 { "happy": "exp_01", "sad": "exp_02" } */
  emotionMap?: Record<string, string>
  /** 情绪到动作的映射 { "happy": "Idle_01", "angry": "Angry_01" } */
  motionMap?: Record<string, string>
  /** 默认参数值 */
  defaultParameters?: Record<string, number>
}

/**
 * 角色配置（用于工厂函数创建）
 */
export interface Live2DCharacterConfig {
  id: string
  name: string
  modelSrc: string
  metadata?: CharacterMetadata
  presets?: CharacterPresets
}

/**
 * 工厂函数依赖注入
 */
export interface Live2DCharacterDependencies {
  /** Pixi Application 实例 */
  app: any
  /** 模型加载器 */
  modelLoader: (src: string, id: string) => Promise<Live2DModel>
}

// ---------------------------------------------------------------------------
// Expression Types
// ---------------------------------------------------------------------------

export type ExpressionBlendMode = 'Add' | 'Multiply' | 'Overwrite'

/**
 * 表情预设
 */
export interface ExpressionPreset {
  name: string
  parameters: Record<string, number>
}

/**
 * 表情参数条目
 */
export interface ExpressionEntry {
  name: string
  parameterId: string
  blend: ExpressionBlendMode
  currentValue: number
  defaultValue: number
  modelDefault: number
  targetValue: number
}

/**
 * 表情组定义
 */
export interface ExpressionGroupDefinition {
  name: string
  parameters: {
    parameterId: string
    blend: ExpressionBlendMode
    value: number
  }[]
}

// ---------------------------------------------------------------------------
// Motion Types
// ---------------------------------------------------------------------------

/**
 * 动作预设
 */
export interface MotionPreset {
  group: string
  index: number
  fileName: string
}

// ---------------------------------------------------------------------------
// Core Character Interface
// ---------------------------------------------------------------------------

/**
 * 标准 LLM 集成接口
 * 由情绪解析模块调用，不直接依赖 LLM
 */
export interface CharacterEmotionAPI {
  /**
   * 设置情绪
   * 根据预设的 emotionMap 查找对应的表情和动作
   */
  setEmotion: (emotion: string) => void

  /**
   * 播放指定动画
   */
  playMotion: (motionName: string) => void

  /**
   * 重置到默认状态
   */
  reset: () => void
}

/**
 * 表情管理接口
 */
export interface ExpressionManager {
  list: () => string[]
  get: (name: string) => ExpressionPreset | undefined
  set: (name: string, value: number | boolean) => void
  reset: () => void
}

/**
 * 动作管理接口
 */
export interface MotionManager {
  list: () => MotionPreset[]
  play: (group: string, index?: number) => void
  stopAll: () => void
}

/**
 * 参数管理接口
 */
export interface ParameterManager {
  get: (id: string) => number
  set: (id: string, value: number) => void
  reset: () => void
}

/**
 * Live2D 角色核心接口
 */
export interface ILive2DCharacter extends CharacterEmotionAPI {
  // 只读元数据
  readonly id: string
  readonly name: string
  readonly metadata: CharacterMetadata
  readonly presets: CharacterPresets

  // 子系统
  expressions: ExpressionManager
  motions: MotionManager
  parameters: ParameterManager

  // 模型引用（供渲染器使用）
  getModel: () => Live2DModel | undefined

  // 生命周期
  load: () => Promise<void>
  dispose: () => void
}

// ---------------------------------------------------------------------------
// Internal Types
// ---------------------------------------------------------------------------

/**
 * 角色内部状态（不对外暴露）
 */
export interface CharacterInternalState {
  model: Live2DModel | undefined
  expressions: Map<string, ExpressionEntry>
  expressionGroups: Map<string, ExpressionGroupDefinition>
  motions: MotionPreset[]
  parameters: Record<string, number>
  isLoaded: boolean
}

// ---------------------------------------------------------------------------
// Extended Interfaces (for internal use)
// ---------------------------------------------------------------------------

/**
 * 扩展的表情管理接口（包含初始化方法）
 */
export interface ExpressionManagerExtended extends ExpressionManager {
  initialise: (expressionRefs: Model3ExpressionRef[], readExpFile: (path: string) => Promise<string>) => Promise<void>
  applyExpressions: () => void
}

/**
 * 扩展的动作管理接口（包含初始化方法）
 */
export interface MotionManagerExtended extends MotionManager {
  initialise: () => void
  findMotion: (motionName: string) => MotionPreset | undefined
}

/**
 * 扩展的参数管理接口（包含初始化方法）
 */
export interface ParameterManagerExtended extends ParameterManager {
  initialise: (defaultParameters?: Record<string, number>) => void
  applyAll: () => void
  resolveParameterId: (id: string) => string
}
