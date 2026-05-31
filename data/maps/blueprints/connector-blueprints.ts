import { ChunkBlueprint } from '../authoring-types';

export const CONNECTOR_BLUEPRINTS: ChunkBlueprint[] = [
  {
    name: 'connector',
    bodyId: 'connector-horizontal-40',
    bodyByOrientation: {
      h: 'connector-horizontal-40',
      v: 'connector-vertical-40',
    },
    defaultStampId: 'cyberkawaii-port',
    variants: [
      {
        name: 'connector-horizontal',
        ports: [
          { side: 'W', centerOffsetTiles: 20, widthTiles: 6 },
          { side: 'E', centerOffsetTiles: 20, widthTiles: 6 },
        ],
        meta: { role: 'connector', orientation: 'h' },
        stampPolicy: 'none',
      },
      {
        name: 'connector-vertical',
        ports: [
          { side: 'N', centerOffsetTiles: 20, widthTiles: 8 },
          { side: 'S', centerOffsetTiles: 20, widthTiles: 8 },
        ],
        meta: { role: 'connector', orientation: 'v' },
        stampPolicy: 'none',
      },
    ],
  },
];

export default CONNECTOR_BLUEPRINTS;
