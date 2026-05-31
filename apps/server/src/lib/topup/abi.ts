export const GAMEPOINTS_ABI = [
  {
    type: 'event',
    name: 'Deposited',
    inputs: [
      { name: 'user', type: 'address', indexed: true },
      { name: 'depositId', type: 'uint256', indexed: true },
      { name: 'depositToken', type: 'address', indexed: false },
      { name: 'depositAmount', type: 'uint256', indexed: false },
      { name: 'yieldAmount', type: 'uint256', indexed: false },
      { name: 'pointsMinted', type: 'uint256', indexed: false },
      { name: 'unlockAt', type: 'uint64', indexed: false },
    ],
  },
] as const;










