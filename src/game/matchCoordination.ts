import { PublicKey } from '@solana/web3.js'
import { getCurrentRoomId, getCurrentSceneType } from '../scene'
import { identityStore } from './identityStore'
import type { PlayerIdentity } from '../types/identity'

/**
 * Match coordination service for deterministic match start flow.
 * 
 * Handles:
 * - Detecting when both players are in grow rooms
 * - Determining which client should submit the transaction (deterministic)
 * - Coordinating match initialization
 */

/**
 * Check if the local player is currently in a grow room.
 * Uses scene state to determine room presence.
 * 
 * @returns true if player is in growRoomA or growRoomB
 */
export function isLocalPlayerInGrowRoom(): boolean {
  const roomId = getCurrentRoomId()
  const sceneType = getCurrentSceneType()
  
  // Player is in a grow room if:
  // - roomId is set (1 or 2)
  // - OR sceneType indicates growRoomA or growRoomB
  return roomId !== null || sceneType === 'growRoomA' || sceneType === 'growRoomB'
}

/**
 * Get the current room ID for the local player.
 * 
 * @returns Room ID (1 for growRoomA, 2 for growRoomB) or null if not in room
 */
export function getLocalPlayerRoomId(): number | null {
  const roomId = getCurrentRoomId()
  const sceneType = getCurrentSceneType()
  
  if (roomId !== null) {
    return roomId
  }
  
  // Derive from sceneType
  if (sceneType === 'growRoomA') return 1
  if (sceneType === 'growRoomB') return 2
  
  return null
}

/**
 * Determine which player should submit the transaction based on deterministic ordering.
 * Uses lexicographic comparison of public keys.
 * 
 * @param playerA - First player's public key
 * @param playerB - Second player's public key
 * @returns The public key of the player who should submit (lowest pubkey)
 */
export function determineTransactionSubmitter(
  playerA: PublicKey,
  playerB: PublicKey
): PublicKey {
  const aBytes = playerA.toBytes()
  const bBytes = playerB.toBytes()
  
  // Lexicographic comparison
  for (let i = 0; i < aBytes.length; i++) {
    if (aBytes[i] < bBytes[i]) return playerA
    if (aBytes[i] > bBytes[i]) return playerB
  }
  
  // Should never happen (pubkeys are unique), but return playerA as fallback
  return playerA
}

/**
 * Check if the local wallet should submit the transaction.
 * 
 * @param localWallet - Local player's wallet public key
 * @param playerA - First player's public key
 * @param playerB - Second player's public key
 * @returns true if local wallet should submit the transaction
 */
export function shouldSubmitTransaction(
  localWallet: PublicKey,
  playerA: PublicKey,
  playerB: PublicKey
): boolean {
  const submitter = determineTransactionSubmitter(playerA, playerB)
  return localWallet.equals(submitter)
}

/**
 * Sort two public keys deterministically.
 * Returns them in lexicographic order.
 * 
 * @param playerA - First player's public key
 * @param playerB - Second player's public key
 * @returns [first, second] where first < second lexicographically
 */
export function sortPlayerPubkeys(
  playerA: PublicKey,
  playerB: PublicKey
): [PublicKey, PublicKey] {
  const aBytes = playerA.toBytes()
  const bBytes = playerB.toBytes()
  
  for (let i = 0; i < aBytes.length; i++) {
    if (aBytes[i] < bBytes[i]) return [playerA, playerB]
    if (aBytes[i] > bBytes[i]) return [playerB, playerA]
  }
  
  // Should never happen, but return as-is
  return [playerA, playerB]
}

/**
 * Get player identity from identity store.
 * Helper to extract wallet address and matchId.
 * 
 * @returns PlayerIdentity or null if not set
 */
export function getPlayerIdentity(): PlayerIdentity | null {
  return identityStore.getIdentity()
}

/**
 * Check if both players are ready to start the match.
 * 
 * This is a basic implementation that checks:
 * - Local player is in a grow room
 * - Identity is set with matchId
 * - Wallet address is available
 * 
 * For full coordination, this should be extended to:
 * - Query server API for other player's room state
 * - Use presence system to detect other player location
 * 
 * @returns true if local player is ready (both players check requires server coordination)
 */
export function isLocalPlayerReady(): boolean {
  const identity = getPlayerIdentity()
  if (!identity) return false
  if (!identity.matchId) return false
  if (!identity.walletAddress) return false
  
  return isLocalPlayerInGrowRoom()
}

/**
 * Get both player wallet addresses from match participants.
 * 
 * This requires server API integration to fetch match participants.
 * For now, returns null - should be implemented with server API call.
 * 
 * @param matchId - The string matchId
 * @returns Promise resolving to [playerA, playerB] pubkeys or null
 */
export async function getMatchPlayerPubkeys(
  matchId: string
): Promise<[PublicKey, PublicKey] | null> {
  // TODO: Implement server API call to fetch match participants
  // For now, this is a placeholder
  // The actual implementation should:
  // 1. Call GET /api/match/:matchId to get participants
  // 2. Fetch wallet addresses for each participant
  // 3. Convert to PublicKey objects
  // 4. Return sorted [playerA, playerB]
  
  return null
}
