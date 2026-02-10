/**
 * User-friendly error messages and recovery suggestions
 * Themed for the Pack-Men underground dealing simulation
 */

import { parseDroogError, type DroogError } from './errorHandler'

export interface ErrorInfo {
  title: string
  message: string
  suggestion?: string
  canRetry: boolean
}

export function getErrorInfo(error: any): ErrorInfo {
  const droogError = parseDroogError(error)
  
  if (!droogError) {
    // Check for common network/RPC errors
    const errorMsg = error?.message || error?.toString() || ''
    
    if (errorMsg.includes('429') || errorMsg.includes('rate limit') || errorMsg.includes('Too many requests')) {
      return {
        title: 'Network Overload',
        message: 'Too many operations. The streets are busy right now.',
        suggestion: 'Wait a moment and try again. The heat will die down.',
        canRetry: true,
      }
    }
    
    if (errorMsg.includes('timeout') || errorMsg.includes('TIMEOUT')) {
      return {
        title: 'Connection Lost',
        message: 'Lost contact with the network. Check your signal.',
        suggestion: 'Verify your connection and try again.',
        canRetry: true,
      }
    }
    
    if (errorMsg.includes('insufficient') || errorMsg.includes('Insufficient')) {
      return {
        title: 'Insufficient Funds',
        message: 'Not enough SOL to cover the operation.',
        suggestion: 'Top up your wallet with some SOL to continue.',
        canRetry: false,
      }
    }
    
    if (errorMsg.includes('User rejected') || errorMsg.includes('rejected')) {
      return {
        title: 'Operation Cancelled',
        message: 'Transaction was cancelled.',
        suggestion: 'No worries, nothing was charged.',
        canRetry: true,
      }
    }
    
    return {
      title: 'Unknown Error',
      message: error?.message || 'Something went wrong in the operation.',
      suggestion: 'Try again, or contact support if it keeps happening.',
      canRetry: true,
    }
  }

  switch (droogError.name) {
    case 'MatchNotStarted':
      return {
        title: 'Hold Up',
        message: 'The match hasn\'t kicked off yet. Stay patient.',
        suggestion: 'Wait for the countdown to hit zero.',
        canRetry: false,
      }
    
    case 'MatchEnded':
      return {
        title: 'Game Over',
        message: 'This match is done. Time\'s up!',
        suggestion: 'Head back to the lobby for a new match.',
        canRetry: false,
      }
    
    case 'GrowthTimeNotElapsed':
      return {
        title: 'Not Ready Yet',
        message: 'This plant needs more time to mature.',
        suggestion: 'Keep an eye on the timer. Patience pays.',
        canRetry: false,
      }
    
    case 'RegrowthLockoutActive':
      return {
        title: 'Cooldown Active',
        message: 'Slot is in regrowth lockout.',
        suggestion: 'Wait for the lockout period to pass.',
        canRetry: false,
      }
    
    case 'StrainNotActive':
      return {
        title: 'Strain Unavailable',
        message: 'This strain isn\'t in rotation right now.',
        suggestion: 'Check the active strains or wait for the rotation.',
        canRetry: false,
      }
    
    case 'CustomerOnCooldown':
      return {
        title: 'Customer Busy',
        message: 'This customer was just served. They need a minute.',
        suggestion: 'Find another customer or wait it out.',
        canRetry: false,
      }
    
    case 'InvalidStrainLevel':
      return {
        title: 'Wrong Product',
        message: 'This customer doesn\'t want that strain level.',
        suggestion: 'Match the product to their layer preference.',
        canRetry: false,
      }
    
    case 'InvalidCustomerIndex':
      return {
        title: 'Customer Not Found',
        message: 'That customer doesn\'t exist on this block.',
        suggestion: 'Select a valid building to make a sale.',
        canRetry: false,
      }
    
    case 'InvalidPlayer':
      return {
        title: 'Access Denied',
        message: 'You\'re not part of this match.',
        suggestion: 'Join a match first to participate.',
        canRetry: false,
      }
    
    case 'CustomerNotAvailable':
      return {
        title: 'Beat to the Punch',
        message: 'Someone else got to this customer first!',
        suggestion: 'Move fast! Find another customer.',
        canRetry: true,
      }
    
    case 'InvalidLayer':
      return {
        title: 'Territory Error',
        message: 'Invalid layer assignment detected.',
        suggestion: 'This shouldn\'t happen. Contact support.',
        canRetry: false,
      }
    
    case 'MatchAlreadyFinalized':
      return {
        title: 'Already Settled',
        message: 'This match has already been finalized.',
        suggestion: 'The winnings have been distributed.',
        canRetry: false,
      }
    
    case 'MatchFinalizationTooEarly':
      return {
        title: 'Too Early',
        message: 'Can\'t finalize before the match ends.',
        suggestion: 'Wait for the timer to hit zero.',
        canRetry: false,
      }
    
    case 'UnauthorizedFinalization':
      return {
        title: 'Not Authorized',
        message: 'Only match participants can finalize.',
        suggestion: 'You must be playing to claim winnings.',
        canRetry: false,
      }
    
    case 'SlotOccupied':
      return {
        title: 'Slot Taken',
        message: 'This grow slot is already in use.',
        suggestion: 'Pick an empty slot to plant.',
        canRetry: false,
      }
    
    case 'EndgamePlantingLocked':
      return {
        title: 'Planting Locked',
        message: 'No new plants in the final minute!',
        suggestion: 'Focus on harvesting and selling.',
        canRetry: false,
      }
    
    case 'PlantWontBeReady':
      return {
        title: 'Not Enough Time',
        message: 'This strain won\'t be ready before the match ends.',
        suggestion: 'Choose a faster-growing strain.',
        canRetry: false,
      }
    
    case 'InsufficientInventory':
      return {
        title: 'Out of Stock',
        message: 'You don\'t have enough product to sell.',
        suggestion: 'Grow and harvest more before selling.',
        canRetry: false,
      }
    
    case 'AlreadyHarvested':
      return {
        title: 'Already Picked',
        message: 'This plant was already harvested.',
        suggestion: 'Plant something new in this slot.',
        canRetry: false,
      }
    
    case 'SlotEmpty':
      return {
        title: 'Empty Slot',
        message: 'There\'s nothing growing in this slot.',
        suggestion: 'Plant a strain first.',
        canRetry: false,
      }
    
    case 'NotDeliverySpot':
      return {
        title: 'Wrong Location',
        message: 'This isn\'t a delivery spot right now.',
        suggestion: 'Check the map for active delivery locations.',
        canRetry: false,
      }
    
    default:
      return {
        title: 'Operation Failed',
        message: droogError.message,
        suggestion: 'Try again or check the logs.',
        canRetry: true,
      }
  }
}

/**
 * Get a themed error message for planting failures
 */
export function getPlantErrorMessage(error: any): { title: string; message: string; suggestion?: string } {
  const errorMsg = error?.message || String(error)
  
  if (errorMsg.includes('SlotOccupied')) {
    return {
      title: 'Slot Taken',
      message: 'This grow slot is already occupied.',
      suggestion: 'Select an empty slot to plant your strain.',
    }
  }
  
  if (errorMsg.includes('EndgamePlantingLocked')) {
    return {
      title: 'Planting Locked',
      message: 'Planting is disabled in the final minute.',
      suggestion: 'Focus on harvesting and making sales.',
    }
  }
  
  if (errorMsg.includes('PlantWontBeReady')) {
    return {
      title: 'Not Enough Time',
      message: 'This strain won\'t mature before match ends.',
      suggestion: 'Choose a quicker-growing strain.',
    }
  }
  
  if (errorMsg.includes('MatchNotStarted')) {
    return {
      title: 'Match Hasn\'t Started',
      message: 'Wait for the match to begin.',
    }
  }
  
  if (errorMsg.includes('MatchEnded')) {
    return {
      title: 'Match Over',
      message: 'The match has ended. No more planting.',
    }
  }
  
  return {
    title: 'Planting Failed',
    message: errorMsg,
    suggestion: 'Try again or check your connection.',
  }
}

/**
 * Get a themed error message for harvest failures
 */
export function getHarvestErrorMessage(error: any): { title: string; message: string; suggestion?: string } {
  const errorMsg = error?.message || String(error)
  
  if (errorMsg.includes('SlotEmpty') || errorMsg.includes('AlreadyHarvested')) {
    return {
      title: 'Already Harvested',
      message: 'This plant was already picked.',
      suggestion: 'Plant something new in this slot.',
    }
  }
  
  if (errorMsg.includes('GrowthTimeNotElapsed')) {
    return {
      title: 'Not Ready',
      message: 'The plant is still growing.',
      suggestion: 'Wait for the timer to complete.',
    }
  }
  
  return {
    title: 'Harvest Failed',
    message: errorMsg,
    suggestion: 'Check your connection and try again.',
  }
}

/**
 * Get a themed error message for sale failures
 */
export function getSaleErrorMessage(error: any): { title: string; message: string; suggestion?: string } {
  const errorMsg = error?.message || String(error)
  
  if (errorMsg.includes('CustomerOnCooldown')) {
    return {
      title: 'Customer Busy',
      message: 'This customer was just served.',
      suggestion: 'Find another customer or wait a moment.',
    }
  }
  
  if (errorMsg.includes('InvalidStrainLevel')) {
    return {
      title: 'Wrong Strain',
      message: 'This customer wants a different level.',
      suggestion: 'Match the product to their layer.',
    }
  }
  
  if (errorMsg.includes('InsufficientInventory')) {
    return {
      title: 'Out of Stock',
      message: 'You need more product in inventory.',
      suggestion: 'Harvest more before selling.',
    }
  }
  
  if (errorMsg.includes('NotDeliverySpot')) {
    return {
      title: 'Wrong Spot',
      message: 'This isn\'t a delivery location right now.',
      suggestion: 'Check the map for active spots.',
    }
  }
  
  return {
    title: 'Sale Failed',
    message: errorMsg,
    suggestion: 'Try again or find another customer.',
  }
}
