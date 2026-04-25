import { createTestingPinia } from '@pinia/testing'
import { setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCharacterRuntimeStore } from './runtime'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

describe('store character runtime', () => {
  beforeEach(() => {
    const pinia = createTestingPinia({ createSpy: vi.fn, stubActions: false })
    setActivePinia(pinia)
  })

  it('tracks turn state and writes fatigue memory when needed', () => {
    const store = useCharacterRuntimeStore()

    expect(store.emotion).toBe('neutral')
    expect(store.relationshipLevel).toBe(35)
    expect(store.mood).toBe(72)

    const thinkDirective = store.onBeforeSend('今天好累，不想上班')

    expect(thinkDirective.emotion).toBe('think')
    expect(store.emotion).toBe('think')
    expect(store.relationshipLevel).toBe(36)

    store.onAssistantResponseEnd('先休息一下，我陪你缓一会。')

    expect(store.memory).toContain('用户最近更容易疲惫，回应时应优先安抚与减压建议。')
  })

  it('parses ACT token and produces renderer directive', () => {
    const store = useCharacterRuntimeStore()

    const directive = store.applySpecialToken('<|ACT:{"emotion":{"name":"sad","intensity":0.5}}|>')

    expect(directive).not.toBeNull()
    expect(directive?.emotion).toBe('sad')
    expect(directive?.intensity).toBe(0.5)
    expect(directive?.live2dMotionGroup).toBe('Flick@Body')
    expect(directive?.vrmExpression).toBe('sad')
    expect(store.emotion).toBe('sad')
  })
})
