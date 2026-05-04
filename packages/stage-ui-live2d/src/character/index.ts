// Emotion mapper
export { createEmotionMapper, createEmotionMapperWithDefaults, DEFAULT_EMOTION_MAP } from './emotion-mapper'

export type { EmotionMapper } from './emotion-mapper'

// Managers (for advanced usage)
export { createExpressionManager } from './expression-manager'

// Factory function
export { createLive2DCharacter } from './factory'
// Type alias from factory
export type { Live2DCharacter } from './factory'

export { createMotionManager } from './motion-manager'

export { createParameterManager, DEFAULT_MODEL_PARAMETERS, STANDARD_PARAMETER_MAP } from './parameter-manager'

// Types
export type {
  CharacterEmotionAPI,
  CharacterInternalState,
  CharacterMetadata,
  CharacterPresets,
  ExpressionManager,
  ExpressionManagerExtended,
  ExpressionPreset,
  ILive2DCharacter,
  Live2DCharacterConfig,
  Live2DCharacterDependencies,
  MotionManager,
  MotionManagerExtended,
  MotionPreset,
  ParameterManager,
  ParameterManagerExtended,
} from './types'
