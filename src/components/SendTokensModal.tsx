import React, { useState, useEffect, useCallback } from 'react'
import { useWallets } from '@privy-io/react-auth/solana'
import { 
  Connection, 
  PublicKey, 
  Transaction, 
  SystemProgram, 
  LAMPORTS_PER_SOL 
} from '@solana/web3.js'
import { 
  getAssociatedTokenAddress, 
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token'
import { createSolanaConnection } from '../game/solanaConnection'
import { PACKS_MINT } from '../game/solanaClient'

interface SendTokensModalProps {
  isOpen: boolean
  onClose: () => void
  initialTokenType: 'SOL' | 'PACKS'
  solBalance: number | null
  packsBalance: number | null
  walletAddress: string
  onTransactionComplete?: () => void
}

const modalStyles = `
.send-tokens-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.9);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 30000;
  backdrop-filter: blur(8px);
  animation: fadeInModal 0.2s ease-out;
}

@keyframes fadeInModal {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.send-tokens-modal {
  background: rgba(10, 10, 26, 0.98);
  border: 2px solid rgba(0, 255, 0, 0.5);
  border-radius: 12px;
  padding: 24px;
  max-width: 420px;
  width: 90%;
  color: #fff;
  font-family: 'Courier New', monospace;
  box-shadow: 0 0 40px rgba(0, 255, 0, 0.3);
  animation: slideUpModal 0.2s ease-out;
}

@keyframes slideUpModal {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.send-tokens-modal h3 {
  margin: 0 0 20px 0;
  font-size: 16px;
  color: #00ff00;
  text-align: center;
  text-transform: uppercase;
  letter-spacing: 2px;
  text-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
}

.token-toggle {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.token-toggle-btn {
  flex: 1;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-family: 'Courier New', monospace;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.token-toggle-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.token-toggle-btn.active {
  background: rgba(0, 255, 0, 0.15);
  border-color: rgba(0, 255, 0, 0.6);
  color: #00ff00;
}

.token-toggle-btn .balance {
  font-size: 11px;
  opacity: 0.7;
}

.send-tokens-input-group {
  margin-bottom: 16px;
}

.send-tokens-label {
  display: block;
  font-size: 11px;
  color: rgba(0, 255, 0, 0.7);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.send-tokens-input {
  width: 100%;
  padding: 12px 14px;
  background: rgba(0, 0, 0, 0.6);
  border: 2px solid rgba(0, 255, 0, 0.3);
  border-radius: 6px;
  color: #00ff00;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  outline: none;
  transition: all 0.2s ease;
  box-sizing: border-box;
}

.send-tokens-input::placeholder {
  color: rgba(0, 255, 0, 0.3);
}

.send-tokens-input:focus {
  border-color: rgba(0, 255, 0, 0.6);
  box-shadow: 0 0 15px rgba(0, 255, 0, 0.2);
}

.send-tokens-input.error {
  border-color: rgba(255, 100, 100, 0.6);
}

.amount-input-wrapper {
  position: relative;
}

.max-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  padding: 4px 10px;
  background: rgba(0, 255, 0, 0.2);
  border: 1px solid rgba(0, 255, 0, 0.4);
  border-radius: 4px;
  color: #00ff00;
  font-family: 'Courier New', monospace;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.max-btn:hover {
  background: rgba(0, 255, 0, 0.3);
}

.error-message {
  color: #ff6b6b;
  font-size: 11px;
  margin-top: 6px;
}

.send-tokens-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.send-btn {
  flex: 1;
  padding: 14px 20px;
  background: rgba(0, 255, 0, 0.2);
  border: 2px solid rgba(0, 255, 0, 0.5);
  border-radius: 8px;
  color: #00ff00;
  font-family: 'Courier New', monospace;
  font-size: 14px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.send-btn:hover:not(:disabled) {
  background: rgba(0, 255, 0, 0.3);
  box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.send-btn.sending {
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.6;
  }
}

.cancel-btn {
  flex: 1;
  padding: 14px 20px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.7);
  font-family: 'Courier New', monospace;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.tx-success {
  text-align: center;
  padding: 20px;
}

.tx-success-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.tx-success-message {
  color: #00ff00;
  font-size: 14px;
  margin-bottom: 8px;
}

.tx-signature {
  color: rgba(0, 255, 0, 0.6);
  font-size: 10px;
  word-break: break-all;
  background: rgba(0, 0, 0, 0.4);
  padding: 8px;
  border-radius: 4px;
  margin-top: 12px;
}
`

// PACKS token decimals
const PACKS_DECIMALS = 6

export const SendTokensModal: React.FC<SendTokensModalProps> = ({
  isOpen,
  onClose,
  initialTokenType,
  solBalance,
  packsBalance,
  walletAddress,
  onTransactionComplete
}) => {
  const { wallets: solanaWallets } = useWallets()
  
  const [tokenType, setTokenType] = useState<'SOL' | 'PACKS'>(initialTokenType)
  const [recipientAddress, setRecipientAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txSignature, setTxSignature] = useState<string | null>(null)
  
  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setTokenType(initialTokenType)
      setRecipientAddress('')
      setAmount('')
      setError(null)
      setTxSignature(null)
      setIsSending(false)
    }
  }, [isOpen, initialTokenType])
  
  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSending) {
        onClose()
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleEscape)
    }
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose, isSending])
  
  const validateAddress = (address: string): boolean => {
    try {
      new PublicKey(address)
      return true
    } catch {
      return false
    }
  }
  
  const validateAmount = (value: string): boolean => {
    const num = parseFloat(value)
    if (isNaN(num) || num <= 0) return false
    
    const balance = tokenType === 'SOL' ? solBalance : packsBalance
    if (balance === null) return false
    
    // For SOL, leave some for transaction fees
    if (tokenType === 'SOL') {
      return num <= balance - 0.001
    }
    return num <= balance
  }
  
  const handleMaxClick = () => {
    const balance = tokenType === 'SOL' ? solBalance : packsBalance
    if (balance === null) return
    
    // For SOL, leave 0.01 SOL for fees
    if (tokenType === 'SOL') {
      const maxAmount = Math.max(0, balance - 0.01)
      setAmount(maxAmount.toFixed(6))
    } else {
      setAmount(balance.toString())
    }
  }
  
  const handleSend = useCallback(async () => {
    setError(null)
    
    // Validate inputs
    if (!recipientAddress.trim()) {
      setError('Please enter a recipient address')
      return
    }
    
    if (!validateAddress(recipientAddress.trim())) {
      setError('Invalid Solana address')
      return
    }
    
    if (!amount || !validateAmount(amount)) {
      setError('Invalid amount or insufficient balance')
      return
    }
    
    if (!solanaWallets || solanaWallets.length === 0) {
      setError('No wallet connected')
      return
    }
    
    const wallet = solanaWallets[0]
    
    setIsSending(true)
    
    try {
      const connection = createSolanaConnection('confirmed')
      const fromPubkey = new PublicKey(walletAddress)
      const toPubkey = new PublicKey(recipientAddress.trim())
      
      if (tokenType === 'SOL') {
        // SOL transfer
        const lamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL)
        
        const transaction = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey,
            toPubkey,
            lamports
          })
        )
        
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
        transaction.recentBlockhash = blockhash
        transaction.feePayer = fromPubkey
        
        // Use Privy wallet's signAndSendTransaction
        const result = await wallet.signAndSendTransaction!({
          chain: 'solana:devnet',
          transaction: new Uint8Array(
            transaction.serialize({
              requireAllSignatures: false,
              verifySignatures: false
            })
          )
        })
        
        // Extract signature from result
        let signature: string
        if (typeof result === 'object' && result.signature) {
          // Signature might be Uint8Array or string
          if (result.signature instanceof Uint8Array) {
            signature = Buffer.from(result.signature).toString('base64')
          } else {
            signature = result.signature
          }
        } else if (typeof result === 'string') {
          signature = result
        } else {
          signature = JSON.stringify(result)
        }
        
        setTxSignature(signature)
        console.log('[SendTokensModal] SOL transfer successful:', signature)
        
      } else {
        // PACKS (SPL token) transfer
        const mintPubkey = PACKS_MINT
        const tokenAmount = Math.floor(parseFloat(amount) * Math.pow(10, PACKS_DECIMALS))
        
        // Get sender's token account
        const fromTokenAccount = await getAssociatedTokenAddress(mintPubkey, fromPubkey)
        
        // Get or create recipient's token account
        const toTokenAccount = await getAssociatedTokenAddress(mintPubkey, toPubkey)
        
        const transaction = new Transaction()
        
        // Check if recipient's token account exists
        try {
          await getAccount(connection, toTokenAccount)
        } catch {
          // Token account doesn't exist, create it
          transaction.add(
            createAssociatedTokenAccountInstruction(
              fromPubkey, // payer
              toTokenAccount, // associated token account
              toPubkey, // owner
              mintPubkey, // mint
              TOKEN_PROGRAM_ID,
              ASSOCIATED_TOKEN_PROGRAM_ID
            )
          )
        }
        
        // Add transfer instruction
        transaction.add(
          createTransferInstruction(
            fromTokenAccount,
            toTokenAccount,
            fromPubkey,
            tokenAmount
          )
        )
        
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash()
        transaction.recentBlockhash = blockhash
        transaction.feePayer = fromPubkey
        
        // Use Privy wallet's signAndSendTransaction
        const result = await wallet.signAndSendTransaction!({
          chain: 'solana:devnet',
          transaction: new Uint8Array(
            transaction.serialize({
              requireAllSignatures: false,
              verifySignatures: false
            })
          )
        })
        
        // Extract signature from result
        let signature: string
        if (typeof result === 'object' && result.signature) {
          if (result.signature instanceof Uint8Array) {
            signature = Buffer.from(result.signature).toString('base64')
          } else {
            signature = result.signature
          }
        } else if (typeof result === 'string') {
          signature = result
        } else {
          signature = JSON.stringify(result)
        }
        
        setTxSignature(signature)
        console.log('[SendTokensModal] PACKS transfer successful:', signature)
      }
      
      // Trigger balance refresh
      if (onTransactionComplete) {
        onTransactionComplete()
      }
      
    } catch (err: any) {
      console.error('[SendTokensModal] Transfer failed:', err)
      setError(err.message || 'Transaction failed. Please try again.')
    } finally {
      setIsSending(false)
    }
  }, [tokenType, recipientAddress, amount, solanaWallets, walletAddress, onTransactionComplete])
  
  if (!isOpen) return null
  
  // Success state
  if (txSignature) {
    return (
      <>
        <style>{modalStyles}</style>
        <div className="send-tokens-modal-overlay" onClick={onClose}>
          <div className="send-tokens-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tx-success">
              <div className="tx-success-icon">✓</div>
              <div className="tx-success-message">
                {tokenType} sent successfully!
              </div>
              <div className="tx-signature">
                TX: {txSignature.slice(0, 20)}...{txSignature.slice(-20)}
              </div>
              <div className="send-tokens-actions" style={{ marginTop: '20px', justifyContent: 'center' }}>
                <button className="send-btn" onClick={onClose} style={{ maxWidth: '200px' }}>
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }
  
  return (
    <>
      <style>{modalStyles}</style>
      <div className="send-tokens-modal-overlay" onClick={() => !isSending && onClose()}>
        <div className="send-tokens-modal" onClick={(e) => e.stopPropagation()}>
          <h3>Send Tokens</h3>
          
          {/* Token Type Toggle */}
          <div className="token-toggle">
            <button 
              className={`token-toggle-btn ${tokenType === 'SOL' ? 'active' : ''}`}
              onClick={() => setTokenType('SOL')}
              disabled={isSending}
            >
              <span>◎ SOL</span>
              <span className="balance">
                {solBalance !== null ? solBalance.toFixed(4) : '?'}
              </span>
            </button>
            <button 
              className={`token-toggle-btn ${tokenType === 'PACKS' ? 'active' : ''}`}
              onClick={() => setTokenType('PACKS')}
              disabled={isSending}
            >
              <span>🎒 PACKS</span>
              <span className="balance">
                {packsBalance !== null ? packsBalance.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '?'}
              </span>
            </button>
          </div>
          
          {/* Recipient Address */}
          <div className="send-tokens-input-group">
            <label className="send-tokens-label">Recipient Address</label>
            <input
              type="text"
              className={`send-tokens-input ${error && !recipientAddress ? 'error' : ''}`}
              placeholder="Enter Solana address..."
              value={recipientAddress}
              onChange={(e) => {
                setRecipientAddress(e.target.value)
                setError(null)
              }}
              disabled={isSending}
            />
          </div>
          
          {/* Amount */}
          <div className="send-tokens-input-group">
            <label className="send-tokens-label">Amount</label>
            <div className="amount-input-wrapper">
              <input
                type="number"
                className={`send-tokens-input ${error && amount && !validateAmount(amount) ? 'error' : ''}`}
                placeholder={`0.00 ${tokenType}`}
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setError(null)
                }}
                disabled={isSending}
                step="any"
                min="0"
              />
              <button 
                className="max-btn" 
                onClick={handleMaxClick}
                disabled={isSending}
              >
                MAX
              </button>
            </div>
          </div>
          
          {/* Error Message */}
          {error && (
            <div className="error-message">{error}</div>
          )}
          
          {/* Actions */}
          <div className="send-tokens-actions">
            <button 
              className="cancel-btn" 
              onClick={onClose}
              disabled={isSending}
            >
              Cancel
            </button>
            <button 
              className={`send-btn ${isSending ? 'sending' : ''}`}
              onClick={handleSend}
              disabled={isSending || !recipientAddress || !amount}
            >
              {isSending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
