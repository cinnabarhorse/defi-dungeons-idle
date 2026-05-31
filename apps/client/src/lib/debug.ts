/**
 * Debug utilities for visualizing game entities and chunks
 */

// Central client debug flag: set via NEXT_PUBLIC_DEBUG_CLIENT or NEXT_PUBLIC_DEBUG
export const DEBUG_CLIENT: boolean =
  (typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_DEBUG_CLIENT === '1' ||
      (process.env.NEXT_PUBLIC_DEBUG_CLIENT || '').toLowerCase() === 'true' ||
      process.env.NEXT_PUBLIC_DEBUG === '1')) ||
  false;

export function isDebugClient(): boolean {
  return DEBUG_CLIENT;
}

export function debugLog(...args: unknown[]): void {
  if (DEBUG_CLIENT) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}

// Optionally silence console logs in production/non-debug to avoid hot-path stalls
export function silenceConsoleLogsUnlessDebug(): void {
  if (typeof window === 'undefined') {
    return; // Do nothing during SSR
  }
  if (DEBUG_CLIENT) {
    return;
  }
  // eslint-disable-next-line no-console
  const noop = () => {};
  // eslint-disable-next-line no-console
  console.log = noop as any;
  // eslint-disable-next-line no-console
  console.debug = noop as any;
}

/**
 * Render debug rectangle for chunk visualization
 */
export function renderDebugRectangle(
  scene: any,
  entity: any,
  entityId: string
) {
  const state = JSON.parse(entity.state || '{}');
  const { width, height, color, chunkName } = state;

  debugLog(
    `🟩 Rendering debug rectangle for chunk "${chunkName}" at (${entity.x}, ${entity.y})`
  );

  // Always create the debug rectangle, but set initial visibility based on debug state
  const debugEnabled = (scene as any).debugEnabled || false;

  // Create graphics object for the rectangle
  const graphics = scene.add.graphics();

  // Set line style (border) - make it more visible
  graphics.lineStyle(4, color, 1.0); // 4px width, color from server, 100% opacity

  // Set fill style (semi-transparent)
  graphics.fillStyle(color, 0.3); // 30% opacity fill for better visibility

  // Draw rectangle
  graphics.strokeRect(entity.x, entity.y, width, height);
  graphics.fillRect(entity.x, entity.y, width, height);

  // Add text label showing chunk name
  const labelText = scene.add.text(entity.x + 10, entity.y + 10, chunkName, {
    fontSize: '14px',
    fontFamily: 'Arial',
    color: '#ffffff',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: { x: 6, y: 4 },
  });

  // Create a container to group graphics and text
  const container = scene.add.container(0, 0, [graphics, labelText]);

  // Set depth so debug rectangles render on top for debugging
  container.setDepth(1000); // High depth to ensure visibility

  // Set initial visibility based on debug state
  container.setVisible(debugEnabled);

  // Store in debug entities for cleanup
  if (!scene.debugEntities) {
    scene.debugEntities = {};
  }
  scene.debugEntities[entityId] = container;

  return container;
}

/**
 * Toggle visibility of all debug rectangles
 */
export function toggleDebugRectangles(scene: any, visible: boolean) {
  if (scene.debugEntities) {
    Object.values(scene.debugEntities).forEach((container: any) => {
      container.setVisible(visible);
    });
  }
}

/**
 * Clean up debug rectangle
 */
export function removeDebugRectangle(scene: any, entityId: string) {
  if (scene.debugEntities && scene.debugEntities[entityId]) {
    scene.debugEntities[entityId].destroy();
    delete scene.debugEntities[entityId];
  }
}
