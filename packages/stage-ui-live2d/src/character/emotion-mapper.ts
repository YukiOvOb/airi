import type {
  CharacterPresets,
  ExpressionManager,
  MotionManager,
} from './types'

/**
 * 情绪映射器
 * 负责将情绪名称映射到具体的表情和动作
 */
export interface EmotionMapper {
  /**
   * 设置情绪
   * @param emotion 情绪名称（如 "happy", "sad", "angry"）
   */
  setEmotion: (emotion: string) => void

  /**
   * 获取可用的情绪列表
   */
  listEmotions: () => string[]

  /**
   * 注册自定义情绪映射
   */
  registerEmotion: (emotion: string, expression?: string, motion?: string) => void
}

/**
 * 创建情绪映射器
 */
export function createEmotionMapper(
  presets: CharacterPresets,
  expressionManager: ExpressionManager,
  motionManager: MotionManager,
): EmotionMapper {
  // 合并预设映射和自定义映射
  const emotionMap = new Map<string, { expression?: string, motion?: string }>()

  // 初始化预设映射
  if (presets.emotionMap) {
    for (const [emotion, expression] of Object.entries(presets.emotionMap)) {
      const existing = emotionMap.get(emotion) || {}
      emotionMap.set(emotion, { ...existing, expression })
    }
  }

  if (presets.motionMap) {
    for (const [emotion, motion] of Object.entries(presets.motionMap)) {
      const existing = emotionMap.get(emotion) || {}
      emotionMap.set(emotion, { ...existing, motion })
    }
  }

  function setEmotion(emotion: string): void {
    const mapping = emotionMap.get(emotion)

    if (!mapping) {
      console.warn(`[EmotionMapper] No mapping found for emotion: "${emotion}"`)
      return
    }

    // 应用表情
    if (mapping.expression) {
      const expression = expressionManager.get(mapping.expression)
      if (expression) {
        expressionManager.set(mapping.expression, true)
      }
      else {
        console.warn(`[EmotionMapper] Expression not found: "${mapping.expression}"`)
      }
    }

    // 播放动作
    if (mapping.motion) {
      // 查找匹配的动作
      const motions = motionManager.list()
      const matchedMotion = motions.find(m =>
        m.fileName === mapping.motion || m.group === mapping.motion,
      )

      if (matchedMotion) {
        motionManager.play(matchedMotion.group, matchedMotion.index)
      }
      else {
        console.warn(`[EmotionMapper] Motion not found: "${mapping.motion}"`)
      }
    }
  }

  function listEmotions(): string[] {
    return Array.from(emotionMap.keys())
  }

  function registerEmotion(emotion: string, expression?: string, motion?: string): void {
    const existing = emotionMap.get(emotion) || {}
    emotionMap.set(emotion, {
      expression: expression ?? existing.expression,
      motion: motion ?? existing.motion,
    })
  }

  return {
    setEmotion,
    listEmotions,
    registerEmotion,
  }
}

/**
 * 默认情绪映射（用于没有预设的角色）
 */
export const DEFAULT_EMOTION_MAP: Record<string, { expression?: string, motion?: string }> = {
  happy: { expression: 'happy', motion: 'Idle' },
  sad: { expression: 'sad', motion: 'Idle' },
  angry: { expression: 'angry', motion: 'Idle' },
  surprised: { expression: 'surprised', motion: 'Idle' },
  neutral: { expression: 'neutral', motion: 'Idle' },
}

/**
 * 创建带有默认映射的情绪映射器
 */
export function createEmotionMapperWithDefaults(
  presets: CharacterPresets,
  expressionManager: ExpressionManager,
  motionManager: MotionManager,
): EmotionMapper {
  const mapper = createEmotionMapper(presets, expressionManager, motionManager)

  // 注册默认情绪
  for (const [emotion, mapping] of Object.entries(DEFAULT_EMOTION_MAP)) {
    mapper.registerEmotion(emotion, mapping.expression, mapping.motion)
  }

  return mapper
}
