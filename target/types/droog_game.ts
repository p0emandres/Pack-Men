/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/droog_game.json`.
 */
export type DroogGame = {
  "address": "H5zERNABU2sbbPPaCzYdVabNmAzSWm9eX8PJr2fekncB",
  "metadata": {
    "name": "droogGame",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Competitive 1v1 grow/harvest game on Solana"
  },
  "instructions": [
    {
      "name": "finalizeMatch",
      "discriminator": [
        6,
        103,
        47,
        7,
        66,
        1,
        85,
        207
      ],
      "accounts": [
        {
          "name": "matchState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_state.match_id_hash",
                "account": "matchState"
              },
              {
                "kind": "account",
                "path": "match_state.player_a",
                "account": "matchState"
              },
              {
                "kind": "account",
                "path": "match_state.player_b",
                "account": "matchState"
              }
            ]
          }
        },
        {
          "name": "player",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "harvest",
      "docs": [
        "Legacy harvest instruction (kept for backwards compatibility)",
        "Note: New code should use harvest_strain instead"
      ],
      "discriminator": [
        228,
        241,
        31,
        182,
        53,
        169,
        59,
        199
      ],
      "accounts": [
        {
          "name": "matchState",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_state.match_id_hash",
                "account": "matchState"
              },
              {
                "kind": "account",
                "path": "match_state.player_a",
                "account": "matchState"
              },
              {
                "kind": "account",
                "path": "match_state.player_b",
                "account": "matchState"
              }
            ]
          }
        },
        {
          "name": "player",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "strainId",
          "type": "u8"
        },
        {
          "name": "plantedAt",
          "type": "i64"
        },
        {
          "name": "lastHarvestedAt",
          "type": {
            "option": "i64"
          }
        }
      ]
    },
    {
      "name": "harvestStrain",
      "docs": [
        "Harvest a ready plant from a grow slot",
        "Increments player inventory"
      ],
      "discriminator": [
        83,
        255,
        209,
        133,
        245,
        167,
        32,
        111
      ],
      "accounts": [
        {
          "name": "growState",
          "docs": [
            "The grow state PDA",
            "Boxed to avoid stack overflow (account is ~359 bytes)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "grow_state.match_id",
                "account": "matchGrowState"
              }
            ]
          }
        },
        {
          "name": "matchState",
          "docs": [
            "The corresponding match state (for timing validation)",
            "Boxed to avoid stack overflow (account is large with 23 customers)"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "grow_state.match_id_hash",
                "account": "matchGrowState"
              },
              {
                "kind": "account",
                "path": "grow_state.player_a",
                "account": "matchGrowState"
              },
              {
                "kind": "account",
                "path": "grow_state.player_b",
                "account": "matchGrowState"
              }
            ]
          }
        },
        {
          "name": "player",
          "docs": [
            "The player harvesting the plant"
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "slotIndex",
          "type": "u8"
        }
      ]
    },
    {
      "name": "initDeliveryState",
      "docs": [
        "Initialize the delivery state PDA for a match",
        "Should be called after init_match, before gameplay begins",
        "",
        "Authority: Solana ONLY",
        "- Delivery spots are selected deterministically",
        "- Client cannot influence initial selection"
      ],
      "discriminator": [
        28,
        193,
        130,
        189,
        74,
        93,
        224,
        44
      ],
      "accounts": [
        {
          "name": "deliveryState",
          "docs": [
            "The delivery state PDA to initialize"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  105,
                  118,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "matchState",
          "docs": [
            "The corresponding match state (must exist)",
            "Boxed to avoid stack overflow (account is large with 23 customers)"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchIdHash"
              },
              {
                "kind": "account",
                "path": "match_state.player_a",
                "account": "matchState"
              },
              {
                "kind": "account",
                "path": "match_state.player_b",
                "account": "matchState"
              }
            ]
          }
        },
        {
          "name": "payer",
          "docs": [
            "Payer for account creation (should be one of the players)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "docs": [
            "System program for account creation"
          ],
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "matchIdHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "matchId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initGrowState",
      "docs": [
        "Initialize the grow state PDA for a match",
        "Should be called after init_match"
      ],
      "discriminator": [
        127,
        199,
        146,
        67,
        238,
        161,
        246,
        197
      ],
      "accounts": [
        {
          "name": "growState",
          "docs": [
            "The grow state PDA to initialize",
            "Boxed to avoid stack overflow (account is ~359 bytes)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "arg",
                "path": "matchId"
              }
            ]
          }
        },
        {
          "name": "matchState",
          "docs": [
            "The corresponding match state (must exist)",
            "Boxed to avoid stack overflow (account is large with 23 customers)"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchIdHash"
              },
              {
                "kind": "account",
                "path": "match_state.player_a",
                "account": "matchState"
              },
              {
                "kind": "account",
                "path": "match_state.player_b",
                "account": "matchState"
              }
            ]
          }
        },
        {
          "name": "payer",
          "docs": [
            "Payer for account creation (should be one of the players)"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "systemProgram",
          "docs": [
            "System program for account creation"
          ],
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "matchIdHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "matchId",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initMatch",
      "discriminator": [
        168,
        73,
        110,
        30,
        58,
        141,
        39,
        145
      ],
      "accounts": [
        {
          "name": "matchState",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "arg",
                "path": "matchIdHash"
              },
              {
                "kind": "account",
                "path": "playerA"
              },
              {
                "kind": "account",
                "path": "playerB"
              }
            ]
          }
        },
        {
          "name": "playerA",
          "writable": true,
          "signer": true
        },
        {
          "name": "playerB",
          "docs": [
            "Player B's public key (used for PDA derivation and validation)",
            "Note: Player B does not need to sign - player_a initiates the match",
            "The constraint ensures player_a.key() < player_b.key() for deterministic ordering"
          ]
        },
        {
          "name": "systemProgram"
        }
      ],
      "args": [
        {
          "name": "matchIdHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "matchId",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "startTs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "plantStrain",
      "docs": [
        "Plant a strain in a grow slot",
        "Validates endgame lock, slot availability, and timing"
      ],
      "discriminator": [
        226,
        16,
        67,
        142,
        237,
        127,
        31,
        149
      ],
      "accounts": [
        {
          "name": "growState",
          "docs": [
            "The grow state PDA",
            "Boxed to avoid stack overflow (account is ~359 bytes)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "grow_state.match_id",
                "account": "matchGrowState"
              }
            ]
          }
        },
        {
          "name": "matchState",
          "docs": [
            "The corresponding match state (for timing validation)",
            "Boxed to avoid stack overflow (account is large with 23 customers)"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "grow_state.match_id_hash",
                "account": "matchGrowState"
              },
              {
                "kind": "account",
                "path": "grow_state.player_a",
                "account": "matchGrowState"
              },
              {
                "kind": "account",
                "path": "grow_state.player_b",
                "account": "matchGrowState"
              }
            ]
          }
        },
        {
          "name": "player",
          "docs": [
            "The player planting the strain"
          ],
          "signer": true
        }
      ],
      "args": [
        {
          "name": "slotIndex",
          "type": "u8"
        },
        {
          "name": "strainLevel",
          "type": "u8"
        }
      ]
    },
    {
      "name": "refreshDeliverySlots",
      "docs": [
        "Refresh delivery slots after 60-second rotation interval",
        "",
        "Permissionless: Anyone can call this, but it only succeeds if:",
        "- 60 seconds have passed since last refresh",
        "- Match is still active",
        "",
        "Authority: Solana ONLY",
        "- Selection is purely deterministic from match_id + timestamp bucket",
        "- All clients can independently verify expected spots"
      ],
      "discriminator": [
        141,
        174,
        244,
        246,
        233,
        168,
        175,
        107
      ],
      "accounts": [
        {
          "name": "deliveryState",
          "docs": [
            "The delivery state PDA to update"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  105,
                  118,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "delivery_state.match_id",
                "account": "matchDeliveryState"
              }
            ]
          }
        },
        {
          "name": "matchState",
          "docs": [
            "The corresponding match state (for validation)",
            "Boxed to avoid stack overflow (account is large with 23 customers)"
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_state.match_id_hash",
                "account": "matchState"
              },
              {
                "kind": "account",
                "path": "match_state.player_a",
                "account": "matchState"
              },
              {
                "kind": "account",
                "path": "match_state.player_b",
                "account": "matchState"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "sellToCustomer",
      "docs": [
        "Sell a strain to a customer",
        "Burns from inventory and applies variant reputation modifier"
      ],
      "discriminator": [
        178,
        207,
        200,
        153,
        118,
        221,
        9,
        36
      ],
      "accounts": [
        {
          "name": "matchState",
          "docs": [
            "Boxed to avoid stack overflow (account is large with 23 customers)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  116,
                  99,
                  104
                ]
              },
              {
                "kind": "account",
                "path": "match_state.match_id_hash",
                "account": "matchState"
              },
              {
                "kind": "account",
                "path": "match_state.player_a",
                "account": "matchState"
              },
              {
                "kind": "account",
                "path": "match_state.player_b",
                "account": "matchState"
              }
            ]
          }
        },
        {
          "name": "growState",
          "docs": [
            "The grow state PDA (for inventory management)",
            "Boxed to avoid stack overflow (account is ~359 bytes)"
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "grow_state.match_id",
                "account": "matchGrowState"
              }
            ]
          }
        },
        {
          "name": "deliveryState",
          "docs": [
            "The delivery state PDA (for availability validation)",
            "AUTHORITY: Solana determines which customers are available for delivery.",
            "Client CANNOT influence this - only render indicators based on this state."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  100,
                  101,
                  108,
                  105,
                  118,
                  101,
                  114,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "match_state.match_id",
                "account": "matchState"
              }
            ]
          }
        },
        {
          "name": "player",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "customerIndex",
          "type": "u8"
        },
        {
          "name": "strainLevel",
          "type": "u8"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "matchDeliveryState",
      "discriminator": [
        75,
        82,
        86,
        228,
        100,
        194,
        153,
        125
      ]
    },
    {
      "name": "matchGrowState",
      "discriminator": [
        189,
        27,
        230,
        206,
        182,
        124,
        93,
        232
      ]
    },
    {
      "name": "matchState",
      "discriminator": [
        250,
        209,
        137,
        70,
        235,
        96,
        121,
        216
      ]
    }
  ],
  "events": [
    {
      "name": "deliveryRotationEvent",
      "discriminator": [
        223,
        141,
        100,
        86,
        125,
        87,
        100,
        200
      ]
    },
    {
      "name": "deliveryStateInitializedEvent",
      "discriminator": [
        149,
        234,
        153,
        201,
        214,
        171,
        108,
        187
      ]
    },
    {
      "name": "growStateInitializedEvent",
      "discriminator": [
        222,
        118,
        104,
        137,
        205,
        71,
        173,
        202
      ]
    },
    {
      "name": "harvestEvent",
      "discriminator": [
        33,
        112,
        85,
        175,
        175,
        39,
        21,
        88
      ]
    },
    {
      "name": "harvestStrainEvent",
      "discriminator": [
        25,
        222,
        65,
        42,
        181,
        109,
        102,
        166
      ]
    },
    {
      "name": "matchFinalizedEvent",
      "discriminator": [
        253,
        68,
        199,
        47,
        123,
        171,
        248,
        221
      ]
    },
    {
      "name": "plantStrainEvent",
      "discriminator": [
        232,
        231,
        105,
        239,
        53,
        106,
        53,
        181
      ]
    },
    {
      "name": "saleEvent",
      "discriminator": [
        157,
        252,
        47,
        101,
        28,
        49,
        225,
        223
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "matchNotStarted",
      "msg": "Match has not started yet"
    },
    {
      "code": 6001,
      "name": "matchEnded",
      "msg": "Match has already ended"
    },
    {
      "code": 6002,
      "name": "growthTimeNotElapsed",
      "msg": "Plant growth time has not elapsed"
    },
    {
      "code": 6003,
      "name": "regrowthLockoutActive",
      "msg": "Regrowth lockout period has not passed"
    },
    {
      "code": 6004,
      "name": "strainNotActive",
      "msg": "Strain is not currently active"
    },
    {
      "code": 6005,
      "name": "customerOnCooldown",
      "msg": "Customer cooldown has not passed"
    },
    {
      "code": 6006,
      "name": "invalidStrainLevel",
      "msg": "Strain level does not match customer preferences"
    },
    {
      "code": 6007,
      "name": "invalidCustomerIndex",
      "msg": "Invalid customer index"
    },
    {
      "code": 6008,
      "name": "invalidPlayer",
      "msg": "Player is not part of this match"
    },
    {
      "code": 6009,
      "name": "customerNotAvailable",
      "msg": "Customer is not available"
    },
    {
      "code": 6010,
      "name": "invalidLayer",
      "msg": "Invalid layer assignment"
    },
    {
      "code": 6011,
      "name": "matchAlreadyFinalized",
      "msg": "Match has already been finalized"
    },
    {
      "code": 6012,
      "name": "matchFinalizationTooEarly",
      "msg": "Match cannot be finalized before end time"
    },
    {
      "code": 6013,
      "name": "unauthorizedFinalization",
      "msg": "Only match participants can finalize the match"
    },
    {
      "code": 6014,
      "name": "matchIdMismatch",
      "msg": "Match ID mismatch between accounts"
    },
    {
      "code": 6015,
      "name": "endgamePlantingLocked",
      "msg": "Planting is locked during the final 5 minutes of the match"
    },
    {
      "code": 6016,
      "name": "invalidSlotIndex",
      "msg": "Invalid grow slot index (must be 0-5)"
    },
    {
      "code": 6017,
      "name": "slotOccupied",
      "msg": "Grow slot is already occupied (plant_state is not Empty)"
    },
    {
      "code": 6018,
      "name": "slotEmpty",
      "msg": "Grow slot is empty"
    },
    {
      "code": 6019,
      "name": "plantWontBeReady",
      "msg": "Plant will not be ready before match ends"
    },
    {
      "code": 6020,
      "name": "insufficientInventory",
      "msg": "Insufficient inventory to complete this sale"
    },
    {
      "code": 6021,
      "name": "inventoryFull",
      "msg": "Inventory is at capacity (6 items max)"
    },
    {
      "code": 6022,
      "name": "customerNotAvailableForDelivery",
      "msg": "Customer is not available for delivery in the current rotation"
    },
    {
      "code": 6023,
      "name": "deliveryRotationTooSoon",
      "msg": "Delivery slots have not rotated yet (60s minimum between refreshes)"
    },
    {
      "code": 6024,
      "name": "deliveryStateNotInitialized",
      "msg": "Delivery state has not been initialized for this match"
    },
    {
      "code": 6025,
      "name": "invalidPlayerOrder",
      "msg": "Player A must have a lower pubkey than Player B for deterministic PDA derivation"
    }
  ],
  "types": [
    {
      "name": "customerState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "layer",
            "type": "u8"
          },
          {
            "name": "lastServedTs",
            "type": "i64"
          },
          {
            "name": "totalServes",
            "type": "u32"
          },
          {
            "name": "lastServedBy",
            "type": {
              "option": "pubkey"
            }
          }
        ]
      }
    },
    {
      "name": "deliveryRotationEvent",
      "docs": [
        "Event emitted when delivery slots rotate",
        "",
        "This event allows:",
        "- Clients to sync their visual indicators",
        "- Post-match audit of rotation history",
        "- Analytics on player navigation patterns"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "docs": [
              "Unique match identifier"
            ],
            "type": "u64"
          },
          {
            "name": "previousSpots",
            "docs": [
              "Previous delivery spots (for analytics)"
            ],
            "type": {
              "array": [
                "u8",
                5
              ]
            }
          },
          {
            "name": "previousCount",
            "docs": [
              "Previous active count"
            ],
            "type": "u8"
          },
          {
            "name": "newSpots",
            "docs": [
              "New delivery spots"
            ],
            "type": {
              "array": [
                "u8",
                5
              ]
            }
          },
          {
            "name": "newCount",
            "docs": [
              "New active count"
            ],
            "type": "u8"
          },
          {
            "name": "rotationBucket",
            "docs": [
              "Current rotation bucket (ts / 60)"
            ],
            "type": "u64"
          },
          {
            "name": "timestamp",
            "docs": [
              "Rotation timestamp"
            ],
            "type": "i64"
          },
          {
            "name": "remainingMatchTime",
            "docs": [
              "Remaining time in match (for pacing analytics)"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "deliveryStateInitializedEvent",
      "docs": [
        "Event emitted when delivery state is initialized"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "docs": [
              "Unique match identifier"
            ],
            "type": "u64"
          },
          {
            "name": "initialSpots",
            "docs": [
              "Initial delivery spots selected"
            ],
            "type": {
              "array": [
                "u8",
                5
              ]
            }
          },
          {
            "name": "activeCount",
            "docs": [
              "Number of active spots"
            ],
            "type": "u8"
          },
          {
            "name": "rotationBucket",
            "docs": [
              "Rotation bucket number for client sync"
            ],
            "type": "u64"
          },
          {
            "name": "timestamp",
            "docs": [
              "Initialization timestamp"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "growSlot",
      "docs": [
        "Individual grow slot state",
        "Slots represent land - they persist for the entire match",
        "Plants are ephemeral - destroyed on harvest, slot immediately freed"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "plantState",
            "docs": [
              "Current plant state (Empty, Growing, or Ready)"
            ],
            "type": {
              "defined": {
                "name": "plantState"
              }
            }
          },
          {
            "name": "strainLevel",
            "docs": [
              "Strain level (1, 2, or 3) - stored for variant lookup after harvest",
              "Only valid when plant_state != Empty (but kept for variant tracking)"
            ],
            "type": "u8"
          },
          {
            "name": "variantId",
            "docs": [
              "Deterministic variant ID (0, 1, or 2) - stored for variant lookup after harvest",
              "Only valid when plant_state != Empty (but kept for variant tracking)"
            ],
            "type": "u8"
          },
          {
            "name": "lastHarvestedTs",
            "docs": [
              "Timestamp of last harvest (only valid when plant_state == Empty)",
              "Used to determine most recently harvested variant for sales"
            ],
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "growStateInitializedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "u64"
          },
          {
            "name": "playerA",
            "type": "pubkey"
          },
          {
            "name": "playerB",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "harvestEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "matchId",
            "type": "u64"
          },
          {
            "name": "strainId",
            "type": "u8"
          },
          {
            "name": "harvestedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "harvestStrainEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "u64"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "slotIndex",
            "type": "u8"
          },
          {
            "name": "strainLevel",
            "type": "u8"
          },
          {
            "name": "variantId",
            "type": "u8"
          },
          {
            "name": "harvestedTs",
            "type": "i64"
          },
          {
            "name": "newInventoryCount",
            "type": "u8"
          },
          {
            "name": "totalInventory",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "inventory",
      "docs": [
        "Player inventory - tracks harvested strains by level",
        "Fixed capacity system: hard limit of 6 total items prevents hoarding"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "level1",
            "docs": [
              "Count of Level 1 strains in inventory"
            ],
            "type": "u8"
          },
          {
            "name": "level2",
            "docs": [
              "Count of Level 2 strains in inventory"
            ],
            "type": "u8"
          },
          {
            "name": "level3",
            "docs": [
              "Count of Level 3 strains in inventory"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "matchDeliveryState",
      "docs": [
        "Match-scoped delivery state PDA",
        "Seeds: [\"delivery\", match_id.to_le_bytes()]",
        "",
        "This PDA tracks which customers are currently available for delivery.",
        "Availability rotates every 60 seconds using deterministic on-chain randomness.",
        "",
        "Authority: Solana ONLY",
        "- Client renders indicators but cannot influence availability",
        "- sell_to_customer validates against this state"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "docs": [
              "Unique match identifier (must match corresponding MatchState)"
            ],
            "type": "u64"
          },
          {
            "name": "lastUpdateTs",
            "docs": [
              "Timestamp of last delivery slot refresh",
              "Used to enforce 60s minimum between refreshes"
            ],
            "type": "i64"
          },
          {
            "name": "availableCustomers",
            "docs": [
              "Currently available customer indices (0-22)",
              "Exactly MAX_DELIVERY_SPOTS slots; unused slots = 255 (invalid)"
            ],
            "type": {
              "array": [
                "u8",
                5
              ]
            }
          },
          {
            "name": "activeCount",
            "docs": [
              "Count of valid entries in available_customers",
              "Guaranteed: 3 <= active_count <= MAX_DELIVERY_SPOTS"
            ],
            "type": "u8"
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "matchFinalizedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "u64"
          },
          {
            "name": "finalizedAt",
            "type": "i64"
          },
          {
            "name": "playerASales",
            "type": "u32"
          },
          {
            "name": "playerBSales",
            "type": "u32"
          },
          {
            "name": "playerAReputation",
            "type": "i32"
          },
          {
            "name": "playerBReputation",
            "type": "i32"
          }
        ]
      }
    },
    {
      "name": "matchGrowState",
      "docs": [
        "Match-scoped grow state PDA",
        "Seeds: [\"grow\", match_id.to_le_bytes()]"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "docs": [
              "Unique match identifier (must match corresponding MatchState)"
            ],
            "type": "u64"
          },
          {
            "name": "matchIdHash",
            "docs": [
              "32-byte hash used for MatchState PDA derivation (canonical)"
            ],
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "playerA",
            "docs": [
              "Player A wallet (must match MatchState.player_a)"
            ],
            "type": "pubkey"
          },
          {
            "name": "playerB",
            "docs": [
              "Player B wallet (must match MatchState.player_b)"
            ],
            "type": "pubkey"
          },
          {
            "name": "playerASlots",
            "docs": [
              "Player A's 6 grow slots"
            ],
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "growSlot"
                  }
                },
                6
              ]
            }
          },
          {
            "name": "playerBSlots",
            "docs": [
              "Player B's 6 grow slots"
            ],
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "growSlot"
                  }
                },
                6
              ]
            }
          },
          {
            "name": "playerAInventory",
            "docs": [
              "Player A's harvested inventory"
            ],
            "type": {
              "defined": {
                "name": "inventory"
              }
            }
          },
          {
            "name": "playerBInventory",
            "docs": [
              "Player B's harvested inventory"
            ],
            "type": {
              "defined": {
                "name": "inventory"
              }
            }
          },
          {
            "name": "bump",
            "docs": [
              "PDA bump seed"
            ],
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "matchState",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "u64"
          },
          {
            "name": "matchIdHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "startTs",
            "type": "i64"
          },
          {
            "name": "endTs",
            "type": "i64"
          },
          {
            "name": "playerA",
            "type": "pubkey"
          },
          {
            "name": "playerB",
            "type": "pubkey"
          },
          {
            "name": "customers",
            "type": {
              "array": [
                {
                  "defined": {
                    "name": "customerState"
                  }
                },
                23
              ]
            }
          },
          {
            "name": "playerASales",
            "type": "u32"
          },
          {
            "name": "playerBSales",
            "type": "u32"
          },
          {
            "name": "playerAReputation",
            "type": "i32"
          },
          {
            "name": "playerBReputation",
            "type": "i32"
          },
          {
            "name": "isFinalized",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "plantState",
      "docs": [
        "Plant state enum - represents the lifecycle of a plant in a slot",
        "Slots = Land (persistent), Plants = Ephemeral (destroyed on harvest)"
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "empty"
          },
          {
            "name": "growing",
            "fields": [
              {
                "name": "strainLevel",
                "docs": [
                  "Strain level (1, 2, or 3)"
                ],
                "type": "u8"
              },
              {
                "name": "plantedAt",
                "docs": [
                  "Timestamp when plant was planted"
                ],
                "type": "i64"
              }
            ]
          },
          {
            "name": "ready",
            "fields": [
              {
                "name": "strainLevel",
                "docs": [
                  "Strain level (1, 2, or 3)"
                ],
                "type": "u8"
              }
            ]
          }
        ]
      }
    },
    {
      "name": "plantStrainEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "type": "u64"
          },
          {
            "name": "player",
            "type": "pubkey"
          },
          {
            "name": "slotIndex",
            "type": "u8"
          },
          {
            "name": "strainLevel",
            "type": "u8"
          },
          {
            "name": "variantId",
            "type": "u8"
          },
          {
            "name": "plantedTs",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "saleEvent",
      "docs": [
        "Enhanced sale event for auditability and analytics.",
        "All fields are included for post-match verification, replay, and indexing."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "matchId",
            "docs": [
              "Unique match identifier"
            ],
            "type": "u64"
          },
          {
            "name": "customerIndex",
            "docs": [
              "Customer index (0-22) - the CANONICAL on-chain identity"
            ],
            "type": "u8"
          },
          {
            "name": "customerLayer",
            "docs": [
              "Customer layer (1-3) - DERIVED from customer_index for convenience"
            ],
            "type": "u8"
          },
          {
            "name": "strainLevel",
            "docs": [
              "Strain level used for this sale (1-3)"
            ],
            "type": "u8"
          },
          {
            "name": "variantId",
            "docs": [
              "Variant ID of the sold strain (0, 1, or 2)"
            ],
            "type": "u8"
          },
          {
            "name": "player",
            "docs": [
              "Player who made the sale"
            ],
            "type": "pubkey"
          },
          {
            "name": "baseReputationDelta",
            "docs": [
              "Base reputation change from this sale (before variant modifier)"
            ],
            "type": "i32"
          },
          {
            "name": "variantBonus",
            "docs": [
              "Variant reputation bonus/penalty (-1, 0, or +1)"
            ],
            "type": "i32"
          },
          {
            "name": "totalReputationDelta",
            "docs": [
              "Total reputation change (base + variant)"
            ],
            "type": "i32"
          },
          {
            "name": "timestamp",
            "docs": [
              "On-chain timestamp when sale was recorded"
            ],
            "type": "i64"
          },
          {
            "name": "remainingInventory",
            "docs": [
              "Remaining inventory of this strain level after sale"
            ],
            "type": "u8"
          },
          {
            "name": "rotationBucket",
            "docs": [
              "Delivery rotation bucket (ts / 60) for replay verification",
              "Allows post-match audit to verify customer was legitimately available"
            ],
            "type": "u64"
          }
        ]
      }
    }
  ]
};
