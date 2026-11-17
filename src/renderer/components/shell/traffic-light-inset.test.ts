import { describe, expect, it } from 'vitest'
import { TRAFFIC_LIGHT_CLEARANCE_PX } from './traffic-light-inset'

describe('TRAFFIC_LIGHT_CLEARANCE_PX', () => {
  it('clears the lights (x = 14..66) plus the 10px header gap', () => {
    expect(TRAFFIC_LIGHT_CLEARANCE_PX).toBe(76)
  })
})
