import { findPath } from '../pathfinding';

describe('pathfinding.findPath', () => {
  test('allows diagonal movement when both adjacent tiles are clear (and smoothing removes intermediate nodes)', () => {
    const path = findPath(0, 0, 1, 1, new Set());

    expect(path).not.toBeNull();
    expect(path!.nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(path!.nodes[path!.nodes.length - 1]).toMatchObject({ x: 1, y: 1 });

    // Straight diagonal; the smoother should collapse the path to just start+end.
    expect(path!.length).toBe(2);
  });

  test('prevents diagonal corner-cutting when either adjacent tile is blocked', () => {
    // Goal is reachable via cardinal movement, but the direct diagonal step should be rejected
    // because the adjacent tile (1,0) is blocked.
    const obstacles = new Set<string>(['1,0']);
    const path = findPath(0, 0, 1, 1, obstacles);

    expect(path).not.toBeNull();
    expect(path!.nodes.map((n) => `${n.x},${n.y}`)).toEqual(['0,0', '0,1', '1,1']);
    expect(path!.length).toBe(3);
  });

  test('falls back to the nearest accessible tile when the goal tile is blocked', () => {
    const obstacles = new Set<string>(['2,0']);
    const path = findPath(0, 0, 2, 0, obstacles);

    expect(path).not.toBeNull();

    const end = path!.nodes[path!.nodes.length - 1];
    // Should not end on the blocked goal.
    expect(`${end.x},${end.y}`).not.toBe('2,0');

    // The nearest accessible perimeter tile at radius 1 includes (1,0), which is reachable.
    expect(end).toMatchObject({ x: 1, y: 0 });
  });
});
