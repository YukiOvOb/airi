import type {
  CharacterInternalState,
  ParameterManager,
} from './types'

/**
 * 默认模型参数
 */
export const DEFAULT_MODEL_PARAMETERS = {
  angleX: 0,
  angleY: 0,
  angleZ: 0,
  leftEyeOpen: 1,
  rightEyeOpen: 1,
  leftEyeSmile: 0,
  rightEyeSmile: 0,
  leftEyebrowLR: 0,
  rightEyebrowLR: 0,
  leftEyebrowY: 0,
  rightEyebrowY: 0,
  leftEyebrowAngle: 0,
  rightEyebrowAngle: 0,
  leftEyebrowForm: 0,
  rightEyebrowForm: 0,
  mouthOpen: 0,
  mouthForm: 0,
  cheek: 0,
  bodyAngleX: 0,
  bodyAngleY: 0,
  bodyAngleZ: 0,
  breath: 0,
}

/**
 * 标准参数名称到 Live2D 参数 ID 的映射
 */
export const STANDARD_PARAMETER_MAP: Record<string, string> = {
  angleX: 'ParamAngleX',
  angleY: 'ParamAngleY',
  angleZ: 'ParamAngleZ',
  leftEyeOpen: 'ParamEyeLOpen',
  rightEyeOpen: 'ParamEyeROpen',
  leftEyeSmile: 'ParamEyeSmile',
  rightEyeSmile: 'ParamEyeSmile',
  leftEyebrowLR: 'ParamBrowLX',
  rightEyebrowLR: 'ParamBrowRX',
  leftEyebrowY: 'ParamBrowLY',
  rightEyebrowY: 'ParamBrowRY',
  leftEyebrowAngle: 'ParamBrowLAngle',
  rightEyebrowAngle: 'ParamBrowRAngle',
  leftEyebrowForm: 'ParamBrowLForm',
  rightEyebrowForm: 'ParamBrowRForm',
  mouthOpen: 'ParamMouthOpenY',
  mouthForm: 'ParamMouthForm',
  cheek: 'ParamCheek',
  bodyAngleX: 'ParamBodyAngleX',
  bodyAngleY: 'ParamBodyAngleY',
  bodyAngleZ: 'ParamBodyAngleZ',
  breath: 'ParamBreath',
}

/**
 * 参数管理器配置
 */
export interface ParameterManagerOptions {
  state: CharacterInternalState
  /** 自定义参数映射（用于兼容不同模型） */
  parameterMap?: Record<string, string>
}

/**
 * 创建参数管理器
 */
export function createParameterManager(
  options: ParameterManagerOptions,
): ParameterManager {
  const { state, parameterMap = {} } = options

  // 合并标准映射和自定义映射
  const paramMap = { ...STANDARD_PARAMETER_MAP, ...parameterMap }

  /**
   * 初始化参数
   * 从预设配置中加载默认参数
   */
  function initialise(defaultParameters?: Record<string, number>): void {
    state.parameters = { ...DEFAULT_MODEL_PARAMETERS, ...defaultParameters }
  }

  /**
   * 获取标准参数名称对应的 Live2D 参数 ID
   */
  function resolveParameterId(id: string): string {
    return paramMap[id] || id
  }

  function get(id: string): number {
    const paramId = resolveParameterId(id)

    // 如果模型已加载，直接从模型读取当前值
    if (state.model) {
      try {
        const coreModel = state.model.internalModel.coreModel as any
        const value = coreModel.getParameterValueById(paramId) as number
        if (value !== undefined)
          return value
      }
      catch {
        // Fall back to stored value
      }
    }

    return state.parameters[paramId] ?? state.parameters[id] ?? 0
  }

  function set(id: string, value: number): void {
    const paramId = resolveParameterId(id)

    // 更新存储的值
    if (paramId in state.parameters || id in state.parameters) {
      if (paramId in state.parameters) {
        state.parameters[paramId] = value
      }
      else {
        state.parameters[id] = value
      }
    }

    // 如果模型已加载，直接设置模型参数
    if (state.model) {
      try {
        const coreModel = state.model.internalModel.coreModel as any
        coreModel.setParameterValueById(paramId, value)
      }
      catch (error) {
        console.warn(`[parameter-manager] Failed to set parameter "${paramId}":`, error)
      }
    }
  }

  function reset(): void {
    // 重置所有参数到默认值
    for (const [key, defaultValue] of Object.entries(DEFAULT_MODEL_PARAMETERS)) {
      set(key, defaultValue)
    }
  }

  /**
   * 应用所有存储的参数到模型
   */
  function applyAll(): void {
    if (!state.model)
      return

    const coreModel = state.model.internalModel.coreModel as any

    for (const [key, value] of Object.entries(state.parameters)) {
      const paramId = resolveParameterId(key)
      try {
        coreModel.setParameterValueById(paramId, value)
      }
      catch {
        // 参数可能不存在于此模型，忽略
      }
    }
  }

  return {
    get,
    set,
    reset,
    // Internal methods
    initialise,
    applyAll,
    resolveParameterId,
  } as any
}

/**
 * 扩展的 ParameterManager，包含初始化方法
 */
export interface ParameterManagerExtended extends ParameterManager {
  initialise: (defaultParameters?: Record<string, number>) => void
  applyAll: () => void
  resolveParameterId: (id: string) => string
}
