// Pathfinding utilities
// Moved from @gotchiverse/shared to simplify build process

import { isValidTilePosition } from './utils';

export interface PathNode {
  x: number;
  y: number;
  g: number; // distance from start
  h: number; // heuristic distance to goal
  f: number; // g + h
  parent?: PathNode;
}

export interface Path {
  nodes: PathNode[];
  length: number;
}

// Euclidean distance for diagonal movement heuristic
function euclideanDistance(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export function findPath(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  obstacles: Set<string> = new Set()
): Path | null {
  const openSet = new Map<string, PathNode>();
  const closedSet = new Set<string>();

  const startNode: PathNode = {
    x: startX,
    y: startY,
    g: 0,
    h: euclideanDistance(startX, startY, goalX, goalY),
    f: 0,
  };
  startNode.f = startNode.g + startNode.h;

  const startKey = `${startX},${startY}`;
  openSet.set(startKey, startNode);

  while (openSet.size > 0) {
    // Find node with lowest f score (with tie-breaking)
    let current: PathNode | null = null;
    let currentKey = '';
    let lowestF = Infinity;

    for (const [key, node] of openSet) {
      if (
        node.f < lowestF ||
        (node.f === lowestF && node.h < (current?.h ?? Infinity))
      ) {
        current = node;
        currentKey = key;
        lowestF = node.f;
      }
    }

    if (!current) break;

    openSet.delete(currentKey);
    closedSet.add(currentKey);

    // Check if we reached the goal
    if (current.x === goalX && current.y === goalY) {
      return reconstructPath(current);
    }

    // Check all neighbors including diagonals
    const neighbors = [
      // Cardinal directions
      { x: current.x + 1, y: current.y, cost: 1 },
      { x: current.x - 1, y: current.y, cost: 1 },
      { x: current.x, y: current.y + 1, cost: 1 },
      { x: current.x, y: current.y - 1, cost: 1 },
      // Diagonal directions
      { x: current.x + 1, y: current.y + 1, cost: Math.SQRT2 },
      { x: current.x + 1, y: current.y - 1, cost: Math.SQRT2 },
      { x: current.x - 1, y: current.y + 1, cost: Math.SQRT2 },
      { x: current.x - 1, y: current.y - 1, cost: Math.SQRT2 },
    ];

    for (const neighbor of neighbors) {
      const neighborKey = `${neighbor.x},${neighbor.y}`;

      // Skip if invalid position or already processed
      if (
        !isValidTilePosition(neighbor.x, neighbor.y) ||
        closedSet.has(neighborKey) ||
        obstacles.has(neighborKey)
      ) {
        continue;
      }

      // For diagonal movement, check if path is blocked by adjacent obstacles
      if (neighbor.cost === Math.SQRT2) {
        const dx = neighbor.x - current.x;
        const dy = neighbor.y - current.y;
        const adjacentObstacle1 = `${current.x + dx},${current.y}`;
        const adjacentObstacle2 = `${current.x},${current.y + dy}`;

        // Skip diagonal if EITHER adjacent cell is blocked (prevents corner cutting through rocks)
        if (
          obstacles.has(adjacentObstacle1) ||
          obstacles.has(adjacentObstacle2)
        ) {
          continue;
        }
      }

      const g = current.g + neighbor.cost;
      const h = euclideanDistance(neighbor.x, neighbor.y, goalX, goalY);
      const f = g + h;

      // Check if this neighbor is already in open set with better score
      const existingNode = openSet.get(neighborKey);

      if (existingNode) {
        if (g < existingNode.g) {
          existingNode.g = g;
          existingNode.f = f;
          existingNode.parent = current;
        }
      } else {
        const neighborNode: PathNode = {
          x: neighbor.x,
          y: neighbor.y,
          g,
          h,
          f,
          parent: current,
        };
        openSet.set(neighborKey, neighborNode);
      }
    }
  }

  // If no direct path found, try finding path to nearest accessible location
  const fallbackPath = findPathToNearestAccessible(
    startX,
    startY,
    goalX,
    goalY,
    obstacles,
    5
  );
  if (fallbackPath) {
    return fallbackPath;
  }

  return null; // No path found
}

// Fallback: find path to nearest accessible location near the goal
function findPathToNearestAccessible(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  obstacles: Set<string>,
  maxRadius: number = 3
): Path | null {
  // Try locations in expanding rings around the goal
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        // Only check perimeter of current radius
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;

        const nearX = goalX + dx;
        const nearY = goalY + dy;
        const nearKey = `${nearX},${nearY}`;

        // Skip if invalid or blocked
        if (!isValidTilePosition(nearX, nearY) || obstacles.has(nearKey)) {
          continue;
        }

        // Try to find path to this nearby location
        const path = findDirectPath(startX, startY, nearX, nearY, obstacles);
        if (path) {
          return path;
        }
      }
    }
  }

  return null; // Still no path found
}

// Direct pathfinding without fallback (to avoid infinite recursion)
function findDirectPath(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  obstacles: Set<string>
): Path | null {
  const openSet = new Map<string, PathNode>();
  const closedSet = new Set<string>();

  const startNode: PathNode = {
    x: startX,
    y: startY,
    g: 0,
    h: euclideanDistance(startX, startY, goalX, goalY),
    f: 0,
  };
  startNode.f = startNode.g + startNode.h;

  const startKey = `${startX},${startY}`;
  openSet.set(startKey, startNode);

  while (openSet.size > 0) {
    // Find node with lowest f score (with tie-breaking)
    let current: PathNode | null = null;
    let currentKey = '';
    let lowestF = Infinity;

    for (const [key, node] of openSet) {
      if (
        node.f < lowestF ||
        (node.f === lowestF && node.h < (current?.h ?? Infinity))
      ) {
        current = node;
        currentKey = key;
        lowestF = node.f;
      }
    }

    if (!current) break;

    openSet.delete(currentKey);
    closedSet.add(currentKey);

    // Check if we reached the goal
    if (current.x === goalX && current.y === goalY) {
      const nodes: PathNode[] = [];
      let pathNode: PathNode | undefined = current;

      while (pathNode) {
        nodes.unshift(pathNode);
        pathNode = pathNode.parent;
      }

      return { nodes: smoothPath(nodes), length: nodes.length };
    }

    // Check all neighbors including diagonals
    const neighbors = [
      // Cardinal directions
      { x: current.x + 1, y: current.y, cost: 1 },
      { x: current.x - 1, y: current.y, cost: 1 },
      { x: current.x, y: current.y + 1, cost: 1 },
      { x: current.x, y: current.y - 1, cost: 1 },
      // Diagonal directions
      { x: current.x + 1, y: current.y + 1, cost: Math.SQRT2 },
      { x: current.x + 1, y: current.y - 1, cost: Math.SQRT2 },
      { x: current.x - 1, y: current.y + 1, cost: Math.SQRT2 },
      { x: current.x - 1, y: current.y - 1, cost: Math.SQRT2 },
    ];

    for (const neighbor of neighbors) {
      const neighborKey = `${neighbor.x},${neighbor.y}`;

      // Skip if invalid position or already processed
      if (
        !isValidTilePosition(neighbor.x, neighbor.y) ||
        closedSet.has(neighborKey) ||
        obstacles.has(neighborKey)
      ) {
        continue;
      }

      // For diagonal movement, check if path is blocked by adjacent obstacles
      if (neighbor.cost === Math.SQRT2) {
        const dx = neighbor.x - current.x;
        const dy = neighbor.y - current.y;
        const adjacentObstacle1 = `${current.x + dx},${current.y}`;
        const adjacentObstacle2 = `${current.x},${current.y + dy}`;

        // Skip diagonal if EITHER adjacent cell is blocked (prevents corner cutting through rocks)
        if (
          obstacles.has(adjacentObstacle1) ||
          obstacles.has(adjacentObstacle2)
        ) {
          continue;
        }
      }

      const g = current.g + neighbor.cost;
      const h = euclideanDistance(neighbor.x, neighbor.y, goalX, goalY);
      const f = g + h;

      // Check if this neighbor is already in open set with better score
      const existingNode = openSet.get(neighborKey);

      if (existingNode) {
        if (g < existingNode.g) {
          existingNode.g = g;
          existingNode.f = f;
          existingNode.parent = current;
        }
      } else {
        const neighborNode: PathNode = {
          x: neighbor.x,
          y: neighbor.y,
          g,
          h,
          f,
          parent: current,
        };
        openSet.set(neighborKey, neighborNode);
      }
    }
  }

  return null;
}

function reconstructPath(node: PathNode): Path {
  const nodes: PathNode[] = [];
  let current: PathNode | undefined = node;

  while (current) {
    nodes.unshift(current);
    current = current.parent;
  }

  // Smooth the path by removing unnecessary waypoints
  const smoothedNodes = smoothPath(nodes);

  return {
    nodes: smoothedNodes,
    length: smoothedNodes.length,
  };
}

// Path smoothing to remove unnecessary waypoints
function smoothPath(nodes: PathNode[]): PathNode[] {
  if (nodes.length <= 2) return nodes;

  const smoothed: PathNode[] = [nodes[0]]; // Always keep start node

  for (let i = 1; i < nodes.length - 1; i++) {
    const prev = nodes[i - 1];
    const current = nodes[i];
    const next = nodes[i + 1];

    // Calculate direction vectors
    const dir1 = {
      x: current.x - prev.x,
      y: current.y - prev.y,
    };
    const dir2 = {
      x: next.x - current.x,
      y: next.y - current.y,
    };

    // Keep waypoint if direction changes significantly
    if (dir1.x !== dir2.x || dir1.y !== dir2.y) {
      smoothed.push(current);
    }
  }

  smoothed.push(nodes[nodes.length - 1]); // Always keep end node
  return smoothed;
}
