/**
 * User-friendly error messages and recovery suggestions
 */

import { parseDroogError, type DroogError } from './errorHandler'

export interface ErrorInfo {
  message: string
  suggestion?: string
  canRetry: boolean
}

export function getErrorInfo(error: any): ErrorInfo {
  const droogError = parseDroogError(error)
  
  if (!droogError) {
    return {
      message: error?.message || 'An unexpected error occurred',
      suggestion: 'Please try again or contact support if the problem persists',
      canRetry: true,
    }
  }

  switch (droogError.name) {
    case 'MatchNotStarted':
      return {
        message: 'Match has not started yet',
        suggestion: 'Wait for the match to begin',
        canRetry: false,
      }
    
    case 'MatchEnded':
      return {
        message: 'Match has already ended',
        suggestion: 'This match is over. Start a new match to continue playing',
        canRetry: false,
      }
    
    case 'GrowthTimeNotElapsed':
      return {
        message: 'Plant is not ready to harvest yet',
        suggestion: 'Wait for the growth time to complete',
        canRetry: false,
      }
    
    case 'RegrowthLockoutActive':
      return {
        message: 'Plant is on regrowth lockout',
        suggestion: 'Wait for the regrowth lockout period to pass',
        canRetry: false,
      }
    
    case 'StrainNotActive':
      return {
        message: 'This strain is not currently active',
        suggestion: 'Wait for the strain rotation or plant a different strain',
        canRetry: false,
      }
    
    case 'CustomerOnCooldown':
      return {
        message: 'Customer is on cooldown',
        suggestion: 'Another player may have just served this customer. Check other available customers instead of retrying the same one.',
        canRetry: false, // Don't encourage retry spam - redirect to other customers
      }
    
    case 'InvalidStrainLevel':
      return {
        message: 'Strain level does not match customer preferences',
        suggestion: 'Sell a strain that matches the customer\'s layer preferences',
        canRetry: false,
      }
    
    case 'InvalidCustomerIndex':
      return {
        message: 'Invalid customer',
        suggestion: 'Please select a valid customer',
        canRetry: false,
      }
    
    case 'InvalidPlayer':
      return {
        message: 'You are not part of this match',
        suggestion: 'Join a match to participate',
        canRetry: false,
      }
    
    case 'CustomerNotAvailable':
      return {
        message: 'Customer is not available',
        suggestion: 'This customer may have been served by another player',
        canRetry: true,
      }
    
    case 'InvalidLayer':
      return {
        message: 'Invalid layer assignment',
        suggestion: 'Please contact support',
        canRetry: false,
      }
    
    case 'MatchAlreadyFinalized':
      return {
        message: 'Match has already been finalized',
        suggestion: 'This match is complete and cannot be modified',
        canRetry: false,
      }
    
    case 'MatchFinalizationTooEarly':
      return {
        message: 'Match cannot be finalized before end time',
        suggestion: 'Wait for the match to end before finalizing',
        canRetry: false,
      }
    
    case 'UnauthorizedFinalization':
      return {
        message: 'Only match participants can finalize the match',
        suggestion: 'You must be a participant in this match to finalize it',
        canRetry: false,
      }
    
    default:
      return {
        message: droogError.message,
        suggestion: 'Please try again',
        canRetry: true,
      }
  }
}
