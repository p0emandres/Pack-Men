import type { PlayerIdentity } from './identity'

/**
 * WebRTC message format with authentication.
 * 
 * Security: All WebRTC messages MUST include peerToken and privyUserId.
 * Messages without valid tokens are ignored.
 */
export type WebRTCMessage<T = unknown> = {
  // Authentication fields (required)
  peerToken: string
  privyUserId: string

  // Message payload
  type: string
  data: T

  // Timestamp for replay attack prevention
  timestamp: number
}

/**
 * Helper to create a WebRTC message with authentication.
 */
export function createWebRTCMessage<T>(
  type: string,
  data: T,
  identity: PlayerIdentity,
  peerToken: string
): WebRTCMessage<T> {
  return {
    peerToken,
    privyUserId: identity.privyUserId,
    type,
    data,
    timestamp: Date.now(),
  }
}

/**
 * Validate WebRTC message structure.
 * Returns true if message has required authentication fields.
 */
export function isValidWebRTCMessage(message: unknown): message is WebRTCMessage {
  if (!message || typeof message !== 'object') {
    return false
  }

  const msg = message as Record<string, unknown>
  return (
    typeof msg.peerToken === 'string' &&
    typeof msg.privyUserId === 'string' &&
    typeof msg.type === 'string' &&
    typeof msg.timestamp === 'number'
  )
}
