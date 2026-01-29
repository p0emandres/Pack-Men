/**
 * Anchor IDL for DroogGame program
 * This should be generated from the Anchor program after building
 * For now, this is a placeholder structure
 */

export const DroogGameIDL = {
  version: '0.1.0',
  name: 'droog_game',
  instructions: [
    {
      name: 'initMatch',
      accounts: [
        {
          name: 'matchState',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'playerA',
          isMut: true,
          isSigner: true,
        },
        {
          name: 'playerB',
          isMut: false,
          isSigner: true,
        },
        {
          name: 'systemProgram',
          isMut: false,
          isSigner: false,
        },
      ],
      args: [
        {
          name: 'matchId',
          type: 'u64',
        },
        {
          name: 'startTs',
          type: 'i64',
        },
      ],
    },
    {
      name: 'harvest',
      accounts: [
        {
          name: 'matchState',
          isMut: false,
          isSigner: false,
        },
        {
          name: 'player',
          isMut: false,
          isSigner: true,
        },
      ],
      args: [
        {
          name: 'strainId',
          type: 'u8',
        },
        {
          name: 'plantedAt',
          type: 'i64',
        },
        {
          name: 'lastHarvestedAt',
          type: {
            option: 'i64',
          },
        },
      ],
    },
    {
      name: 'sellToCustomer',
      accounts: [
        {
          name: 'matchState',
          isMut: true,
          isSigner: false,
        },
        {
          name: 'player',
          isMut: false,
          isSigner: true,
        },
      ],
      args: [
        {
          name: 'customerIndex',
          type: 'u8',
        },
        {
          name: 'strainLevel',
          type: 'u8',
        },
      ],
    },
  ],
  accounts: [
    {
      name: 'MatchState',
      type: {
        kind: 'struct',
        fields: [
          {
            name: 'matchId',
            type: 'u64',
          },
          {
            name: 'startTs',
            type: 'i64',
          },
          {
            name: 'endTs',
            type: 'i64',
          },
          {
            name: 'playerA',
            type: 'publicKey',
          },
          {
            name: 'playerB',
            type: 'publicKey',
          },
          {
            name: 'customers',
            type: {
              array: ['CustomerState', 23],
            },
          },
          {
            name: 'playerASales',
            type: 'u32',
          },
          {
            name: 'playerBSales',
            type: 'u32',
          },
          {
            name: 'playerAReputation',
            type: 'i32',
          },
          {
            name: 'playerBReputation',
            type: 'i32',
          },
          {
            name: 'bump',
            type: 'u8',
          },
        ],
      },
    },
    {
      name: 'CustomerState',
      type: {
        kind: 'struct',
        fields: [
          {
            name: 'layer',
            type: 'u8',
          },
          {
            name: 'lastServedTs',
            type: 'i64',
          },
          {
            name: 'totalServes',
            type: 'u32',
          },
          {
            name: 'lastServedBy',
            type: {
              option: 'publicKey',
            },
          },
        ],
      },
    },
  ],
  events: [
    {
      name: 'HarvestEvent',
      fields: [
        {
          name: 'player',
          type: 'publicKey',
          index: false,
        },
        {
          name: 'matchId',
          type: 'u64',
          index: false,
        },
        {
          name: 'strainId',
          type: 'u8',
          index: false,
        },
        {
          name: 'harvestedAt',
          type: 'i64',
          index: false,
        },
      ],
    },
    {
      name: 'SaleEvent',
      fields: [
        {
          name: 'player',
          type: 'publicKey',
          index: false,
        },
        {
          name: 'matchId',
          type: 'u64',
          index: false,
        },
        {
          name: 'customerIndex',
          type: 'u8',
          index: false,
        },
        {
          name: 'strainLevel',
          type: 'u8',
          index: false,
        },
        {
          name: 'reputationChange',
          type: 'i32',
          index: false,
        },
        {
          name: 'soldAt',
          type: 'i64',
          index: false,
        },
      ],
    },
  ],
  errors: [
    {
      code: 6000,
      name: 'MatchNotStarted',
      msg: 'Match has not started yet',
    },
    {
      code: 6001,
      name: 'MatchEnded',
      msg: 'Match has already ended',
    },
    {
      code: 6002,
      name: 'GrowthTimeNotElapsed',
      msg: 'Plant growth time has not elapsed',
    },
    {
      code: 6003,
      name: 'RegrowthLockoutActive',
      msg: 'Regrowth lockout period has not passed',
    },
    {
      code: 6004,
      name: 'StrainNotActive',
      msg: 'Strain is not currently active',
    },
    {
      code: 6005,
      name: 'CustomerOnCooldown',
      msg: 'Customer cooldown has not passed',
    },
    {
      code: 6006,
      name: 'InvalidStrainLevel',
      msg: 'Strain level does not match customer preferences',
    },
    {
      code: 6007,
      name: 'InvalidCustomerIndex',
      msg: 'Invalid customer index',
    },
    {
      code: 6008,
      name: 'InvalidPlayer',
      msg: 'Player is not part of this match',
    },
    {
      code: 6009,
      name: 'CustomerNotAvailable',
      msg: 'Customer is not available',
    },
    {
      code: 6010,
      name: 'InvalidLayer',
      msg: 'Invalid layer assignment',
    },
  ],
} as const
