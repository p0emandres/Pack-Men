/**
 * Error handling utilities for Anchor program errors
 */

export interface DroogError {
  code: number
  name: string
  message: string
}

export const DROOG_ERRORS: Record<number, DroogError> = {
  6000: {
    code: 6000,
    name: 'MatchNotStarted',
    message: 'Match has not started yet',
  },
  6001: {
    code: 6001,
    name: 'MatchEnded',
    message: 'Match has already ended',
  },
  6002: {
    code: 6002,
    name: 'GrowthTimeNotElapsed',
    message: 'Plant growth time has not elapsed',
  },
  6003: {
    code: 6003,
    name: 'RegrowthLockoutActive',
    message: 'Regrowth lockout period has not passed',
  },
  6004: {
    code: 6004,
    name: 'StrainNotActive',
    message: 'Strain is not currently active',
  },
  6005: {
    code: 6005,
    name: 'CustomerOnCooldown',
    message: 'Customer cooldown has not passed',
  },
  6006: {
    code: 6006,
    name: 'InvalidStrainLevel',
    message: 'Strain level does not match customer preferences',
  },
  6007: {
    code: 6007,
    name: 'InvalidCustomerIndex',
    message: 'Invalid customer index',
  },
  6008: {
    code: 6008,
    name: 'InvalidPlayer',
    message: 'Player is not part of this match',
  },
  6009: {
    code: 6009,
    name: 'CustomerNotAvailable',
    message: 'Customer is not available',
  },
  6010: {
    code: 6010,
    name: 'InvalidLayer',
    message: 'Invalid layer assignment',
  },
  6011: {
    code: 6011,
    name: 'MatchAlreadyFinalized',
    message: 'Match has already been finalized',
  },
  6012: {
    code: 6012,
    name: 'MatchFinalizationTooEarly',
    message: 'Match cannot be finalized before end time',
  },
  6013: {
    code: 6013,
    name: 'UnauthorizedFinalization',
    message: 'Only match participants can finalize the match',
  },
}

/**
 * Parse Anchor program error from error object
 */
export function parseDroogError(error: any): DroogError | null {
  // Check if it's an Anchor error with error code
  if (error?.code && DROOG_ERRORS[error.code]) {
    return DROOG_ERRORS[error.code]
  }

  // Check error message for Anchor error pattern
  const errorMessage = error?.message || error?.toString() || ''
  
  // Try to extract error code from message
  const codeMatch = errorMessage.match(/Error Code: (\d+)/)
  if (codeMatch) {
    const code = parseInt(codeMatch[1], 10)
    if (DROOG_ERRORS[code]) {
      return DROOG_ERRORS[code]
    }
  }

  // Try to match error name
  for (const [code, droogError] of Object.entries(DROOG_ERRORS)) {
    if (errorMessage.includes(droogError.name)) {
      return droogError
    }
  }

  return null
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyError(error: any): string {
  const droogError = parseDroogError(error)
  if (droogError) {
    return droogError.message
  }

  // Handle common Solana errors
  const errorMessage = error?.message || error?.toString() || 'Unknown error'
  
  if (errorMessage.includes('insufficient funds')) {
    return 'Insufficient SOL balance for transaction'
  }
  
  if (errorMessage.includes('User rejected')) {
    return 'Transaction was cancelled'
  }
  
  if (errorMessage.includes('Network request failed')) {
    return 'Network error. Please check your connection'
  }
  
  if (errorMessage.includes('Transaction was not confirmed')) {
    return 'Transaction confirmation timeout. Please try again'
  }

  return errorMessage
}

/**
 * Check if error is a specific Droog error
 */
export function isDroogError(error: any, errorName: string): boolean {
  const droogError = parseDroogError(error)
  return droogError?.name === errorName
}

/**
 * Get error code if it's a Droog error
 */
export function getDroogErrorCode(error: any): number | null {
  const droogError = parseDroogError(error)
  return droogError?.code || null
}
