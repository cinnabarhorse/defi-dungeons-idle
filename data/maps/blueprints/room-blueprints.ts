import { ChunkBlueprint } from '../authoring-types';

export const ROOM_BLUEPRINTS: ChunkBlueprint[] = [
  {
    name: 'enemy-room',
    bodyId: 'room-base-40',
    defaultStampId: 'cyberkawaii-port',
    stampPolicy: 'all',
    variants: [
      {
        name: 'enemy-room-default',
        ports: [],
        stampPolicy: 'defaultOnly',
        meta: { role: 'room' },
      },
      {
        name: 'enemy-room-north',
        ports: [{ side: 'N', centerOffsetTiles: 20 }],
        meta: { role: 'room' },
      },
      {
        name: 'enemy-room-south',
        ports: [{ side: 'S', centerOffsetTiles: 20 }],
        meta: { role: 'room' },
      },
      {
        name: 'enemy-room-east',
        ports: [{ side: 'E', centerOffsetTiles: 20 }],
        meta: { role: 'room' },
      },
      {
        name: 'enemy-room-west',
        ports: [{ side: 'W', centerOffsetTiles: 20 }],
        meta: { role: 'room' },
      },
      {
        name: 'enemy-room-north-south',
        ports: [
          { side: 'N', centerOffsetTiles: 20 },
          { side: 'S', centerOffsetTiles: 20 },
        ],
        meta: { role: 'room' },
      },
      {
        name: 'enemy-room-west-east',
        ports: [
          { side: 'W', centerOffsetTiles: 20 },
          { side: 'E', centerOffsetTiles: 20 },
        ],
        meta: { role: 'room' },
      },
      {
        name: 'enemy-room-all-sides',
        ports: [
          { side: 'N', centerOffsetTiles: 20 },
          { side: 'S', centerOffsetTiles: 20 },
          { side: 'W', centerOffsetTiles: 20 },
          { side: 'E', centerOffsetTiles: 20 },
        ],
        meta: { role: 'room' },
      },
      {
        name: 'enemy-room-north-east',
        ports: [
          { side: 'N', centerOffsetTiles: 20 },
          { side: 'E', centerOffsetTiles: 20 },
        ],
        meta: { role: 'room' },
      },
      {
        name: 'enemy-room-north-south-east',
        ports: [
          { side: 'N', centerOffsetTiles: 20 },
          { side: 'S', centerOffsetTiles: 20 },
          { side: 'E', centerOffsetTiles: 20 },
        ],
        meta: { role: 'room' },
      },
      {
        name: 'enemy-room-north-west',
        ports: [
          { side: 'N', centerOffsetTiles: 20 },
          { side: 'W', centerOffsetTiles: 20 },
        ],
        meta: { role: 'room' },
      },
      {
        name: 'enemy-room-north-south-west',
        ports: [
          { side: 'N', centerOffsetTiles: 20 },
          { side: 'S', centerOffsetTiles: 20 },
          { side: 'W', centerOffsetTiles: 20 },
        ],
        meta: { role: 'room' },
      },
      {
        name: 'enemy-room-south-east',
        ports: [
          { side: 'S', centerOffsetTiles: 20 },
          { side: 'E', centerOffsetTiles: 20 },
        ],
        meta: { role: 'room' },
      },
      {
        name: 'enemy-room-east-south-west',
        ports: [
          { side: 'E', centerOffsetTiles: 20 },
          { side: 'S', centerOffsetTiles: 20 },
          { side: 'W', centerOffsetTiles: 20 },
        ],
        meta: { role: 'room' },
      },
      {
        name: 'enemy-room-south-west',
        ports: [
          { side: 'S', centerOffsetTiles: 20 },
          { side: 'W', centerOffsetTiles: 20 },
        ],
        meta: { role: 'room' },
      },
      {
        name: 'enemy-room-north-east-west',
        ports: [
          { side: 'N', centerOffsetTiles: 20 },
          { side: 'E', centerOffsetTiles: 20 },
          { side: 'W', centerOffsetTiles: 20 },
        ],
        meta: { role: 'room' },
      },
    ],
  },
  {
    name: 'rofl-room',
    bodyId: 'rofl-room',
    defaultStampId: 'cyberkawaii-port',
    stampPolicy: 'all',
    instances: 1,
    variants: [
      {
        name: 'rofl-room-default',
        ports: [],
        stampPolicy: 'defaultOnly',
        meta: { role: 'room', tags: ['custom'] },
      },
      {
        name: 'rofl-room-north',
        ports: [{ side: 'N', centerOffsetTiles: 12 }],
        meta: { role: 'room', tags: ['custom'] },
      },
      {
        name: 'rofl-room-south',
        ports: [{ side: 'S', centerOffsetTiles: 12 }],
        meta: { role: 'room', tags: ['custom'] },
      },
      {
        name: 'rofl-room-west',
        ports: [{ side: 'W', centerOffsetTiles: 12 }],
        meta: { role: 'room', tags: ['custom'] },
      },
      {
        name: 'rofl-room-east',
        ports: [{ side: 'E', centerOffsetTiles: 12 }],
        meta: { role: 'room', tags: ['custom'] },
      },
    ],
  },
  {
    name: 'rofl-pond',
    bodyId: 'rofl-pond',
    defaultStampId: 'cyberkawaii-port',
    stampPolicy: 'all',
    instances: 1,
    variants: [
      {
        name: 'rofl-pond-default',
        ports: [],
        stampPolicy: 'defaultOnly',
        meta: { role: 'room', tags: ['custom', 'pond'] },
      },
      {
        name: 'rofl-pond-north',
        ports: [{ side: 'N', centerOffsetTiles: 16 }],
        meta: { role: 'room', tags: ['custom', 'pond'] },
      },
      {
        name: 'rofl-pond-south',
        ports: [{ side: 'S', centerOffsetTiles: 16 }],
        meta: { role: 'room', tags: ['custom', 'pond'] },
      },
    ],
  },
];

export default ROOM_BLUEPRINTS;
