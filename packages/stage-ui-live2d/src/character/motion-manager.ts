import type {
  CharacterInternalState,
  MotionManager,
  MotionPreset,
} from './types'

import { MotionPriority } from 'pixi-live2d-display/cubism4'

/**
 * 动作管理器配置
 */
export interface MotionManagerOptions {
  state: CharacterInternalState
}

/**
 * 创建动作管理器
 */
export function createMotionManager(
  options: MotionManagerOptions,
): MotionManager {
  const { state } = options

  /**
   * 初始化动作列表
   * 从已加载的模型中提取所有动作
   */
  function initialise(): void {
    if (!state.model)
      return

    const motionManager = state.model.internalModel.motionManager
    state.motions = Object
      .entries(motionManager.definitions)
      .flatMap(([motionName, definition]) =>
        (definition?.map((motion: any, index: number) => ({
          group: motionName,
          index,
          fileName: motion.File,
        })) || []),
      )
      .filter(Boolean)
  }

  /**
   * 查找动作
   */
  function findMotion(motionName: string): MotionPreset | undefined {
    return state.motions.find(m =>
      m.fileName === motionName
      || m.group === motionName
      || `${m.group}_${m.index}` === motionName,
    )
  }

  function list(): MotionPreset[] {
    return state.motions
  }

  function play(group: string, index?: number): void {
    if (!state.model) {
      console.warn('[motion-manager] Model not loaded')
      return
    }

    try {
      if (index !== undefined) {
        state.model.motion(group, index, MotionPriority.FORCE)
      }
      else {
        // Find by group name
        const motion = state.motions.find(m => m.group === group)
        if (motion) {
          state.model.motion(motion.group, motion.index, MotionPriority.FORCE)
        }
        else {
          console.warn(`[motion-manager] Motion not found: "${group}"`)
        }
      }
    }
    catch (error) {
      console.error(`[motion-manager] Failed to play motion:`, error)
    }
  }

  function stopAll(): void {
    if (!state.model)
      return

    state.model.internalModel.motionManager.stopAllMotions()
  }

  return {
    list,
    play,
    stopAll,
    // Internal methods
    initialise,
    findMotion,
  } as any
}

/**
 * 扩展的 MotionManager，包含初始化方法
 */
export interface MotionManagerExtended extends MotionManager {
  initialise: () => void
  findMotion: (motionName: string) => MotionPreset | undefined
}
