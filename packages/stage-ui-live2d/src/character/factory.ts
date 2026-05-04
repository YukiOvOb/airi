import type {
  CharacterEmotionAPI,
  CharacterInternalState,
  CharacterMetadata,
  CharacterPresets,
  ExpressionManagerExtended,
  ExpressionPreset,
  ILive2DCharacter,
  Live2DCharacterConfig,
  Live2DCharacterDependencies,
  MotionManagerExtended,
  MotionPreset,
  ParameterManagerExtended,
} from './types'

import { Live2DFactory, Live2DModel } from 'pixi-live2d-display/cubism4'

import { createEmotionMapperWithDefaults } from './emotion-mapper'
import { createExpressionManager } from './expression-manager'
import { createMotionManager } from './motion-manager'
import { createParameterManager, DEFAULT_MODEL_PARAMETERS } from './parameter-manager'

// ---------------------------------------------------------------------------
// Internal State
// ---------------------------------------------------------------------------

function createInternalState(): CharacterInternalState {
  return {
    model: undefined,
    expressions: new Map(),
    expressionGroups: new Map(),
    motions: [],
    parameters: { ...DEFAULT_MODEL_PARAMETERS },
    isLoaded: false,
  }
}

// ---------------------------------------------------------------------------
// Model Loader
// ---------------------------------------------------------------------------

async function loadModel(src: string, id: string, app: any) {
  const live2DModel = new Live2DModel()
  await Live2DFactory.setupLive2DModel(live2DModel, { url: src, id }, { autoInteract: false })
  return live2DModel
}

// ---------------------------------------------------------------------------
// Character Factory
// ---------------------------------------------------------------------------

/**
 * 创建 Live2D 角色
 *
 * @example
 * ```ts
 * const character = createLive2DCharacter(
 *   {
 *     id: 'hiyori-v1',
 *     name: 'Hiyori',
 *     modelSrc: '/models/hiyori.zip',
 *     metadata: { author: 'Sample', version: '1.0' },
 *     presets: {
 *       emotionMap: { happy: 'exp_01', sad: 'exp_02' },
 *       motionMap: { happy: 'Idle_01', angry: 'Angry_01' },
 *     },
 *   },
 *   { app, modelLoader: loadModel }
 * )
 *
 * await character.load()
 * character.setEmotion('happy')
 * ```
 */
export function createLive2DCharacter(
  config: Live2DCharacterConfig,
  deps: Live2DCharacterDependencies,
): ILive2DCharacter {
  const { id, name, metadata = {}, presets = {} } = config
  const { app, modelLoader = loadModel } = deps

  // Internal state
  const state = createInternalState()

  // Create subsystems
  const parameterManager = createParameterManager({ state })
  ;(parameterManager as any).initialise(presets.defaultParameters)

  const expressionManager = createExpressionManager({ state })
  const motionManager = createMotionManager({ state })

  // Create emotion mapper
  const emotionMapper = createEmotionMapperWithDefaults(
    presets,
    expressionManager as ExpressionManagerExtended,
    motionManager as MotionManagerExtended,
  )

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async function load(): Promise<void> {
    if (state.isLoaded) {
      console.warn(`[character:${id}] Already loaded`)
      return
    }

    try {
      // Load model
      state.model = await modelLoader(config.modelSrc, config.id, app)

      // Add to stage
      app.stage.addChild(state.model)

      // Initialize subsystems
      const motionManagerExt = motionManager as MotionManagerExtended
      motionManagerExt.initialise()

      const expressionManagerExt = expressionManager as ExpressionManagerExtended

      // Initialize expressions from model settings
      const settings = (state.model as any).internalModel.settings
      if (settings?.expressions && settings.expressions.length > 0) {
        const readExpFile = async (filePath: string): Promise<string> => {
          const resolvedUrl: string = settings.resolveURL?.(filePath) ?? filePath
          const response = await fetch(resolvedUrl)
          if (!response.ok)
            throw new Error(`Failed to fetch exp3 file: ${filePath} (${response.status})`)
          return response.text()
        }

        await expressionManagerExt.initialise(settings.expressions, readExpFile)
      }

      // Apply default parameters
      const parameterManagerExt = parameterManager as ParameterManagerExtended
      parameterManagerExt.applyAll()

      state.isLoaded = true
    }
    catch (error) {
      console.error(`[character:${id}] Failed to load:`, error)
      throw error
    }
  }

  function dispose(): void {
    if (!state.model)
      return

    try {
      // Remove from stage
      if (state.model.parent) {
        state.model.parent.removeChild(state.model)
      }

      // Destroy model
      state.model.destroy()
    }
    catch (error) {
      console.warn(`[character:${id}] Error during dispose:`, error)
    }

    // Clear state
    state.model = undefined
    state.expressions.clear()
    state.expressionGroups.clear()
    state.motions = []
    state.isLoaded = false
  }

  // ---------------------------------------------------------------------------
  // Character API
  // ---------------------------------------------------------------------------

  function getModel(): Live2DModel | undefined {
    return state.model
  }

  // ---------------------------------------------------------------------------
  // Emotion API (CharacterEmotionAPI)
  // ---------------------------------------------------------------------------

  function setEmotion(emotion: string): void {
    emotionMapper.setEmotion(emotion)
  }

  function playMotion(motionName: string): void {
    const motion = (motionManager as MotionManagerExtended).findMotion(motionName)
    if (motion) {
      motionManager.play(motion.group, motion.index)
    }
    else {
      console.warn(`[character:${id}] Motion not found: "${motionName}"`)
    }
  }

  function reset(): void {
    expressionManager.reset()
    parameterManager.reset()
    motionManager.stopAll()
  }

  return {
    // Metadata
    id,
    name,
    metadata,
    presets,

    // Subsystems
    expressions: expressionManager,
    motions: motionManager,
    parameters: parameterManager,

    // Model reference
    getModel,

    // Lifecycle
    load,
    dispose,

    // Emotion API
    setEmotion,
    playMotion,
    reset,
  } as ILive2DCharacter
}

/**
 * 角色类型别名（导出供外部使用）
 */
export type Live2DCharacter = ILive2DCharacter

/**
 * 角色配置类型（导出供外部使用）
 */
export type { CharacterMetadata, CharacterPresets, Live2DCharacterConfig }

/**
 * 情绪 API 类型（导出供外部使用）
 */
export type { CharacterEmotionAPI }

/**
 * 表情预设类型（导出供外部使用）
 */
export type { ExpressionPreset, MotionPreset }
