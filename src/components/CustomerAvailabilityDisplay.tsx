import React, { useEffect, useState } from 'react'
import type { MatchState, CustomerState } from '../game/solanaClient'
import { getCurrentMatchTime } from '../game/timeUtils'

interface CustomerAvailabilityDisplayProps {
  matchState: MatchState | null
  currentTs?: number
}

export const CustomerAvailabilityDisplay: React.FC<CustomerAvailabilityDisplayProps> = ({
  matchState,
  currentTs,
}) => {
  const [availableCustomers, setAvailableCustomers] = useState<number[]>([])
  const [customerCooldowns, setCustomerCooldowns] = useState<Map<number, number>>(new Map())
  const [recentlyServed, setRecentlyServed] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!matchState) {
      setAvailableCustomers([])
      setCustomerCooldowns(new Map())
      return
    }

    const updateAvailability = () => {
      const now = getCurrentMatchTime(matchState.startTs.toNumber(), currentTs)
      const available: number[] = []
      const cooldowns = new Map<number, number>()

      const cooldownTimes = [30, 45, 75] // Layer 1, 2, 3 in seconds

      const recentlyServedSet = new Set<number>()
      
      matchState.customers.forEach((customer, index) => {
        if (customer.lastServedTs.toNumber() === 0) {
          // Never served, always available
          available.push(index)
        } else {
          const cooldown = cooldownTimes[customer.layer - 1] || 0
          const timeSinceLastServe = now - customer.lastServedTs.toNumber()
          
          // Mark as recently served if served within last 10 seconds (likely by another player)
          if (timeSinceLastServe < 10 && customer.lastServedBy) {
            recentlyServedSet.add(index)
          }
          
          if (timeSinceLastServe >= cooldown) {
            available.push(index)
          } else {
            const remaining = cooldown - timeSinceLastServe
            cooldowns.set(index, remaining)
          }
        }
      })

      setAvailableCustomers(available)
      setCustomerCooldowns(cooldowns)
      setRecentlyServed(recentlyServedSet)
    }

    updateAvailability()
    const interval = setInterval(updateAvailability, 1000) // Update every second

    return () => clearInterval(interval)
  }, [matchState, currentTs])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (!matchState) {
    return <div className="customer-availability">Loading customer data...</div>
  }

  // Group customers by layer
  const layer1Customers = matchState.customers
    .map((c, i) => ({ customer: c, index: i }))
    .filter(({ customer }) => customer.layer === 1)
  
  const layer2Customers = matchState.customers
    .map((c, i) => ({ customer: c, index: i }))
    .filter(({ customer }) => customer.layer === 2)
  
  const layer3Customers = matchState.customers
    .map((c, i) => ({ customer: c, index: i }))
    .filter(({ customer }) => customer.layer === 3)

  return (
    <div className="customer-availability">
      <h3>Customer Availability</h3>
      
      <div className="customer-layer">
        <h4>Layer 1 ({availableCustomers.filter(i => matchState.customers[i]?.layer === 1).length} available)</h4>
        <div className="customers-list">
          {layer1Customers.map(({ customer, index }) => {
            const isAvailable = availableCustomers.includes(index)
            const cooldown = customerCooldowns.get(index)

            const wasRecentlyServed = recentlyServed.has(index)

            return (
              <div 
                key={index} 
                className={`customer-item ${isAvailable ? 'available' : 'cooldown'} ${wasRecentlyServed ? 'recently-served' : ''}`}
              >
                <span>Customer {index + 1}</span>
                {isAvailable ? (
                  <span className="status-badge available">Available</span>
                ) : (
                  <span className="status-badge cooldown">
                    {wasRecentlyServed ? 'Just served by another player' : `Cooldown: ${cooldown ? formatTime(cooldown) : '--'}`}
                  </span>
                )}
                <span className="serves-count">Served: {customer.totalServes}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="customer-layer">
        <h4>Layer 2 ({availableCustomers.filter(i => matchState.customers[i]?.layer === 2).length} available)</h4>
        <div className="customers-list">
          {layer2Customers.map(({ customer, index }) => {
            const isAvailable = availableCustomers.includes(index)
            const cooldown = customerCooldowns.get(index)

            const wasRecentlyServed = recentlyServed.has(index)

            return (
              <div 
                key={index} 
                className={`customer-item ${isAvailable ? 'available' : 'cooldown'} ${wasRecentlyServed ? 'recently-served' : ''}`}
              >
                <span>Customer {index + 1}</span>
                {isAvailable ? (
                  <span className="status-badge available">Available</span>
                ) : (
                  <span className="status-badge cooldown">
                    {wasRecentlyServed ? 'Just served by another player' : `Cooldown: ${cooldown ? formatTime(cooldown) : '--'}`}
                  </span>
                )}
                <span className="serves-count">Served: {customer.totalServes}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="customer-layer">
        <h4>Layer 3 ({availableCustomers.filter(i => matchState.customers[i]?.layer === 3).length} available)</h4>
        <div className="customers-list">
          {layer3Customers.map(({ customer, index }) => {
            const isAvailable = availableCustomers.includes(index)
            const cooldown = customerCooldowns.get(index)

            const wasRecentlyServed = recentlyServed.has(index)

            return (
              <div 
                key={index} 
                className={`customer-item ${isAvailable ? 'available' : 'cooldown'} ${wasRecentlyServed ? 'recently-served' : ''}`}
              >
                <span>Customer {index + 1}</span>
                {isAvailable ? (
                  <span className="status-badge available">Available</span>
                ) : (
                  <span className="status-badge cooldown">
                    {wasRecentlyServed ? 'Just served by another player' : `Cooldown: ${cooldown ? formatTime(cooldown) : '--'}`}
                  </span>
                )}
                <span className="serves-count">Served: {customer.totalServes}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
