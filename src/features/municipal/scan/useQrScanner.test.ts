import { describe, expect, it } from 'vitest'
import { cameraErrorState } from './useQrScanner'

const domError = (name: string) => new DOMException('camera', name)

describe('cameraErrorState', () => {
  it('tells a denied permission apart from a missing camera', () => {
    expect(cameraErrorState(domError('NotAllowedError'))).toEqual({ status: 'denied' })
    expect(cameraErrorState(domError('SecurityError'))).toEqual({ status: 'denied' })
    expect(cameraErrorState(domError('NotFoundError'))).toEqual({ status: 'no-camera' })
    expect(cameraErrorState(domError('OverconstrainedError'))).toEqual({ status: 'no-camera' })
  })

  it('explains a camera held by another app, and passes other errors on', () => {
    expect(cameraErrorState(domError('NotReadableError'))).toEqual({
      status: 'error',
      message: 'the camera is in use by another app or tab.',
    })
    expect(cameraErrorState(new Error('boom'))).toEqual({ status: 'error', message: 'boom' })
    expect(cameraErrorState('weird')).toEqual({ status: 'error', message: 'unknown error.' })
  })
})
