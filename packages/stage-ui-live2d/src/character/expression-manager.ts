import type {
  CharacterInternalState,
  ExpressionBlendMode,
  ExpressionEntry,
  ExpressionGroupDefinition,
  ExpressionManager,
  ExpressionPreset,
} from './types'

// ---------------------------------------------------------------------------
// Types for model3.json / exp3.json data
// ---------------------------------------------------------------------------

interface Model3ExpressionRef {
  Name: string
  File: string
}

interface Exp3Parameter {
  Id: string
  Value: number
  Blend: 'Add' | 'Multiply' | 'Overwrite'
}

interface Exp3Json {
  Type: string
  Parameters: Exp3Parameter[]
}

// ---------------------------------------------------------------------------
// Expression Manager Implementation
// ---------------------------------------------------------------------------

export interface ExpressionManagerOptions {
  state: CharacterInternalState
}

/**
 * 创建表情管理器
 */
export function createExpressionManager(
  options: ExpressionManagerOptions,
): ExpressionManager {
  const { state } = options

  // Track which parameter IDs were written in the previous frame
  const activeLastFrame = new Set<string>()

  function normaliseBlend(raw: string): ExpressionBlendMode {
    switch (raw) {
      case 'Add':
        return 'Add'
      case 'Multiply':
        return 'Multiply'
      default:
        return 'Overwrite'
    }
  }

  function getModelParameterDefault(parameterId: string): number {
    if (!state.model)
      return 0

    try {
      const coreModel = state.model.internalModel.coreModel as any
      // Prefer the dedicated default-value API when available (Cubism 4+).
      const defaultApi = coreModel.getParameterDefaultValueById
      if (typeof defaultApi === 'function') {
        const val = defaultApi.call(coreModel, parameterId)
        if (val != null)
          return val as number
      }
      // Fall back to the current value which, right after model load, IS the default.
      return (coreModel.getParameterValueById(parameterId) as number) ?? 0
    }
    catch {
      return 0
    }
  }

  /**
   * Parse model3.json expression references and the corresponding exp3 data,
   * then register everything.
   */
  async function initialise(
    expressionRefs: Model3ExpressionRef[],
    readExpFile: (path: string) => Promise<string>,
  ): Promise<void> {
    const groups: ExpressionGroupDefinition[] = []
    const entryMap = new Map<string, ExpressionEntry>()

    for (const expRef of expressionRefs) {
      try {
        const raw = await readExpFile(expRef.File)
        const exp3: Exp3Json = JSON.parse(raw)

        const groupParams: ExpressionGroupDefinition['parameters'] = []

        for (const param of exp3.Parameters) {
          const blend = normaliseBlend(param.Blend)

          groupParams.push({
            parameterId: param.Id,
            blend,
            value: param.Value,
          })

          // Only create the entry once per parameterId
          if (!entryMap.has(param.Id)) {
            const modelDefault = getModelParameterDefault(param.Id)
            entryMap.set(param.Id, {
              name: param.Id,
              parameterId: param.Id,
              blend,
              currentValue: modelDefault,
              defaultValue: modelDefault,
              modelDefault,
              targetValue: param.Value,
            })
          }
          else if (param.Value !== 0) {
            // Update targetValue if this group has a non-zero value
            const existing = entryMap.get(param.Id)!
            if (existing.targetValue === 0) {
              existing.targetValue = param.Value
            }
          }
        }

        groups.push({ name: expRef.Name, parameters: groupParams })
      }
      catch (err) {
        console.warn(`[expression-manager] Failed to parse exp3 for "${expRef.Name}" (${expRef.File}):`, err)
      }
    }

    // Register expression groups
    for (const group of groups) {
      state.expressionGroups.set(group.name, group)
    }

    // Register individual parameter entries
    for (const entry of entryMap.values()) {
      state.expressions.set(entry.name, { ...entry })
    }
  }

  function resolve(name: string): { kind: 'group', group: ExpressionGroupDefinition } | { kind: 'param', entry: ExpressionEntry } | null {
    const group = state.expressionGroups.get(name)
    if (group)
      return { kind: 'group', group }

    const entry = state.expressions.get(name)
    if (entry)
      return { kind: 'param', entry }

    return null
  }

  function isNoopValue(entry: ExpressionEntry): boolean {
    switch (entry.blend) {
      case 'Add':
        return entry.currentValue === 0
      case 'Multiply':
        return entry.currentValue === 1
      default:
        return entry.currentValue === entry.modelDefault
    }
  }

  function computeTargetValue(entry: ExpressionEntry): number {
    if (!state.model)
      return entry.modelDefault

    const coreModel = state.model.internalModel.coreModel as any

    switch (entry.blend) {
      case 'Add':
        return entry.modelDefault + entry.currentValue
      case 'Multiply': {
        const currentFrameValue = coreModel.getParameterValueById(entry.parameterId) as number
        return currentFrameValue * entry.currentValue
      }
      default:
        return entry.currentValue
    }
  }

  /**
   * Apply all expression entries onto the Live2D model every frame.
   * This should be called by the renderer's update loop.
   */
  function applyExpressions(): void {
    if (!state.model)
      return

    const coreModel = state.model.internalModel.coreModel as any
    const activeThisFrame = new Set<string>()

    for (const entry of state.expressions.values()) {
      if (isNoopValue(entry))
        continue

      const blendedValue = computeTargetValue(entry)
      coreModel.setParameterValueById(entry.parameterId, blendedValue)
      activeThisFrame.add(entry.parameterId)
    }

    // Reset parameters that were active last frame but not this frame
    for (const paramId of activeLastFrame) {
      if (!activeThisFrame.has(paramId)) {
        const entry = findEntryByParameterId(paramId)
        if (entry)
          coreModel.setParameterValueById(paramId, entry.modelDefault)
      }
    }

    activeLastFrame.clear()
    for (const id of activeThisFrame)
      activeLastFrame.add(id)
  }

  function findEntryByParameterId(paramId: string): ExpressionEntry | undefined {
    for (const entry of state.expressions.values()) {
      if (entry.parameterId === paramId)
        return entry
    }
    return undefined
  }

  // ---------------------------------------------------------------------------
  // ExpressionManager API
  // ---------------------------------------------------------------------------

  function list(): string[] {
    return Array.from(state.expressions.keys())
  }

  function get(name: string): ExpressionPreset | undefined {
    const resolved = resolve(name)
    if (!resolved)
      return undefined

    if (resolved.kind === 'group') {
      // Return combined preset for group
      const params: Record<string, number> = {}
      for (const param of resolved.group.parameters) {
        params[param.parameterId] = param.value
      }
      return { name, parameters: params }
    }

    const entry = resolved.entry
    return { name, parameters: { [entry.parameterId]: entry.currentValue } }
  }

  function set(name: string, value: number | boolean): void {
    const resolved = resolve(name)
    if (!resolved) {
      console.warn(`[expression-manager] Expression not found: "${name}"`)
      return
    }

    const numericValue = typeof value === 'boolean' ? (value ? 1 : 0) : value

    if (resolved.kind === 'group') {
      for (const param of resolved.group.parameters) {
        const entry = state.expressions.get(param.parameterId)
        if (entry) {
          entry.currentValue = numericValue
        }
      }
    }
    else {
      resolved.entry.currentValue = numericValue
    }
  }

  function reset(): void {
    for (const entry of state.expressions.values()) {
      entry.currentValue = entry.modelDefault
    }
    activeLastFrame.clear()
  }

  return {
    list,
    get,
    set,
    reset,
    // Internal methods
    initialise,
    applyExpressions,
  } as any
}

/**
 * 扩展的 ExpressionManager，包含初始化方法
 */
export interface ExpressionManagerExtended extends ExpressionManager {
  initialise: (expressionRefs: Model3ExpressionRef[], readExpFile: (path: string) => Promise<string>) => Promise<void>
  applyExpressions: () => void
}
