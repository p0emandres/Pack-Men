import React from 'react'
import { getErrorInfo } from '../game/errorMessages'

interface TransactionStatusProps {
  status: 'idle' | 'pending' | 'success' | 'error'
  error?: any
  message?: string
  onRetry?: () => void
  onDismiss?: () => void
}

export const TransactionStatus: React.FC<TransactionStatusProps> = ({
  status,
  error,
  message,
  onRetry,
  onDismiss,
}) => {
  if (status === 'idle') {
    return null
  }

  const errorInfo = error ? getErrorInfo(error) : null

  return (
    <div className={`transaction-status ${status}`}>
      {status === 'pending' && (
        <div className="status-content">
          <div className="spinner" />
          <span>{message || 'Processing transaction...'}</span>
        </div>
      )}

      {status === 'success' && (
        <div className="status-content success">
          <span className="success-icon">✓</span>
          <span>{message || 'Transaction successful!'}</span>
          {onDismiss && (
            <button onClick={onDismiss} className="dismiss-btn">
              Dismiss
            </button>
          )}
        </div>
      )}

      {status === 'error' && errorInfo && (
        <div className="status-content error">
          <span className="error-icon">✗</span>
          <div className="error-details">
            <div className="error-message">{errorInfo.message}</div>
            {errorInfo.suggestion && (
              <div className="error-suggestion">{errorInfo.suggestion}</div>
            )}
          </div>
          <div className="error-actions">
            {errorInfo.canRetry && onRetry && (
              <button onClick={onRetry} className="retry-btn">
                Retry
              </button>
            )}
            {onDismiss && (
              <button onClick={onDismiss} className="dismiss-btn">
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
