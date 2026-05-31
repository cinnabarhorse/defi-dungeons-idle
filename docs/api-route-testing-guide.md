# API Route Testing Guide

This guide explains how to test Express API routes in the gotchiverse-live server.

## Testing Framework

We'll use **Supertest** for HTTP integration testing with Jest. Supertest allows us to test Express routes without starting a full HTTP server.

### Installation

```bash
pnpm add -D supertest @types/supertest
```

## Test Structure

### 1. Create Test App Factory

Create a test utility that builds a minimal Express app with only the routes we want to test:

```typescript
// apps/server/src/__tests__/utils/test-app.ts
import express, { type Application } from 'express';
import { registerCraftingRoutes } from '../../routes/crafting';
import { registerDailyQuestCompetitionRoutes } from '../../routes/daily-quest-competition';
// ... import other route registrars

export function createTestApp(): Application {
  const app = express();
  
  // Add middleware that routes expect
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Register only the routes we're testing
  // registerCraftingRoutes(app);
  // registerDailyQuestCompetitionRoutes(app);
  
  return app;
}
```

### 2. Mock Dependencies

Routes depend on:
- **Database repos** (`inventoryRepo`, `playersRepo`, etc.)
- **Auth functions** (`resolveSessionFromRequest`)
- **External APIs** (Aavegotchi, Subgraph)
- **Transaction handling** (`runTransaction`)

Create mocks for these:

```typescript
// apps/server/src/__tests__/utils/mocks.ts
import type { PoolClient } from 'pg';

export const mockInventoryRepo = {
  getInventory: jest.fn(),
  upsertInventoryItem: jest.fn(),
  decrementInventoryItem: jest.fn(),
};

export const mockPlayersRepo = {
  getByWallet: jest.fn(),
  getById: jest.fn(),
};

export const mockResolveSessionFromRequest = jest.fn();

export const mockRunTransaction = jest.fn();

// Mock the modules
jest.mock('../../lib/db/repos/inventory', () => ({
  inventoryRepo: mockInventoryRepo,
}));

jest.mock('../../lib/db/repos/players', () => ({
  playersRepo: mockPlayersRepo,
}));

jest.mock('../../lib/auth/session', () => ({
  resolveSessionFromRequest: mockResolveSessionFromRequest,
  readSessionFromRequest: jest.fn(),
}));

jest.mock('../../lib/db/client', () => ({
  runTransaction: mockRunTransaction,
}));
```

### 3. Test Helper Functions

Create helpers for common test scenarios:

```typescript
// apps/server/src/__tests__/utils/route-test-helpers.ts
import type { Response } from 'supertest';
import request from 'supertest';
import type { Application } from 'express';

export interface MockSession {
  playerId: string;
  walletAddress: string;
  sessionId: string;
}

export function createMockSession(overrides?: Partial<MockSession>): MockSession {
  return {
    playerId: 'test-player-id',
    walletAddress: '0x1234567890123456789012345678901234567890',
    sessionId: 'test-session-id',
    ...overrides,
  };
}

export function createAuthenticatedRequest(
  app: Application,
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  session: MockSession
) {
  const req = request(app)[method](path);
  
  // Set session cookie (you'll need to generate a valid token)
  req.set('Cookie', `session=${session.sessionId}`);
  
  return req;
}

export async function expectErrorResponse(
  response: Response,
  statusCode: number,
  errorMessage?: string
) {
  expect(response.status).toBe(statusCode);
  expect(response.body).toHaveProperty('error');
  if (errorMessage) {
    expect(response.body.error).toBe(errorMessage);
  }
}

export async function expectSuccessResponse(response: Response, statusCode = 200) {
  expect(response.status).toBe(statusCode);
  expect(response.body).not.toHaveProperty('error');
}
```

## Example Test: Crafting Route

Here's a complete example testing the crafting route:

```typescript
// apps/server/src/routes/__tests__/crafting.test.ts
import request from 'supertest';
import express, { type Application } from 'express';
import { registerCraftingRoutes } from '../crafting';
import { mockInventoryRepo, mockResolveSessionFromRequest, mockRunTransaction } from '../../__tests__/utils/mocks';
import { createMockSession } from '../../__tests__/utils/route-test-helpers';

// Mock dependencies before importing routes
jest.mock('../../lib/db/repos/inventory', () => ({
  inventoryRepo: {
    getInventory: jest.fn(),
    upsertInventoryItem: jest.fn(),
    decrementInventoryItem: jest.fn(),
  },
}));

jest.mock('../../lib/auth/session', () => ({
  resolveSessionFromRequest: jest.fn(),
}));

jest.mock('../../lib/db/client', () => ({
  runTransaction: jest.fn(),
}));

describe('POST /api/crafting/craft', () => {
  let app: Application;
  const mockSession = createMockSession();

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerCraftingRoutes(app);
    
    // Reset all mocks
    jest.clearAllMocks();
    
    // Default: authenticated session
    mockResolveSessionFromRequest.mockResolvedValue({
      playerId: mockSession.playerId,
      walletAddress: mockSession.walletAddress,
    });
  });

  describe('Authentication', () => {
    it('should return 401 when not authenticated', async () => {
      mockResolveSessionFromRequest.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/crafting/craft')
        .send({ fromTier: 1 });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ error: 'Not authenticated' });
    });
  });

  describe('Input Validation', () => {
    it('should return 400 for invalid tier (tier 3)', async () => {
      const response = await request(app)
        .post('/api/crafting/craft')
        .send({ fromTier: 3 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Cannot craft higher tier');
    });

    it('should return 400 for invalid tier (tier 0)', async () => {
      const response = await request(app)
        .post('/api/crafting/craft')
        .send({ fromTier: 0 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid potion tier');
    });

    it('should return 400 for invalid count', async () => {
      const response = await request(app)
        .post('/api/crafting/craft')
        .send({ fromTier: 1, count: -1 });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid craft count');
    });

    it('should default count to 1 when not provided', async () => {
      mockInventoryRepo.getInventory.mockResolvedValue([
        {
          itemType: 'potion',
          itemName: 'Health Potion',
          quantity: 3,
          itemData: { potionTier: 1 },
        },
      ]);

      mockRunTransaction.mockImplementation(async (handler) => {
        const mockClient = {} as any;
        return handler(mockClient);
      });

      mockInventoryRepo.decrementInventoryItem.mockResolvedValue({
        quantityBefore: 3,
        quantityAfter: 0,
        deleted: false,
        record: { quantity: 0 },
      });

      mockInventoryRepo.upsertInventoryItem.mockResolvedValue({
        itemType: 'greater_health_potion',
        itemName: 'Greater Healing Potion',
        quantity: 1,
      });

      const response = await request(app)
        .post('/api/crafting/craft')
        .send({ fromTier: 1 });

      expect(response.status).toBe(200);
      expect(response.body.outputProduced).toBe(1);
    });
  });

  describe('Business Logic', () => {
    beforeEach(() => {
      mockRunTransaction.mockImplementation(async (handler) => {
        const mockClient = {} as any;
        return handler(mockClient);
      });
    });

    it('should craft T2 from 3x T1', async () => {
      // Setup: player has 3x T1 potions
      mockInventoryRepo.getInventory.mockResolvedValue([
        {
          itemType: 'potion',
          itemName: 'Health Potion',
          quantity: 3,
          itemData: { potionTier: 1 },
        },
      ]);

      mockInventoryRepo.decrementInventoryItem.mockResolvedValue({
        quantityBefore: 3,
        quantityAfter: 0,
        deleted: false,
        record: { quantity: 0 },
      });

      mockInventoryRepo.upsertInventoryItem.mockResolvedValue({
        itemType: 'greater_health_potion',
        itemName: 'Greater Healing Potion',
        quantity: 1,
        itemData: { potionTier: 2 },
      });

      const response = await request(app)
        .post('/api/crafting/craft')
        .send({ fromTier: 1, count: 1 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        inputTier: 1,
        outputTier: 2,
        inputConsumed: 3,
        outputProduced: 1,
      });

      // Verify database calls
      expect(mockInventoryRepo.decrementInventoryItem).toHaveBeenCalledWith(
        mockSession.playerId,
        'potion',
        'Health Potion',
        3,
        expect.anything()
      );
      expect(mockInventoryRepo.upsertInventoryItem).toHaveBeenCalledWith(
        expect.objectContaining({
          playerId: mockSession.playerId,
          itemType: 'greater_health_potion',
          itemName: 'Greater Healing Potion',
          quantity: 1,
        })
      );
    });

    it('should return 400 when insufficient materials', async () => {
      mockInventoryRepo.getInventory.mockResolvedValue([
        {
          itemType: 'potion',
          itemName: 'Health Potion',
          quantity: 2, // Only 2, need 3
          itemData: { potionTier: 1 },
        },
      ]);

      const response = await request(app)
        .post('/api/crafting/craft')
        .send({ fromTier: 1, count: 1 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Insufficient materials',
        required: 3,
        available: 2,
      });
    });

    it('should handle batch crafting (count > 1)', async () => {
      mockInventoryRepo.getInventory.mockResolvedValue([
        {
          itemType: 'potion',
          itemName: 'Health Potion',
          quantity: 9, // Enough for 3 crafts
          itemData: { potionTier: 1 },
        },
      ]);

      mockInventoryRepo.decrementInventoryItem.mockResolvedValue({
        quantityBefore: 9,
        quantityAfter: 0,
        deleted: false,
        record: { quantity: 0 },
      });

      mockInventoryRepo.upsertInventoryItem.mockResolvedValue({
        itemType: 'greater_health_potion',
        itemName: 'Greater Healing Potion',
        quantity: 3,
      });

      const response = await request(app)
        .post('/api/crafting/craft')
        .send({ fromTier: 1, count: 3 });

      expect(response.status).toBe(200);
      expect(response.body.inputConsumed).toBe(9); // 3 * 3
      expect(response.body.outputProduced).toBe(3); // 3 * 1
    });
  });

  describe('Error Handling', () => {
    it('should return 500 when database transaction fails', async () => {
      mockInventoryRepo.getInventory.mockResolvedValue([
        {
          itemType: 'potion',
          itemName: 'Health Potion',
          quantity: 3,
          itemData: { potionTier: 1 },
        },
      ]);

      mockRunTransaction.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app)
        .post('/api/crafting/craft')
        .send({ fromTier: 1 });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Database connection failed');
    });

    it('should return 500 when decrement fails', async () => {
      mockInventoryRepo.getInventory.mockResolvedValue([
        {
          itemType: 'potion',
          itemName: 'Health Potion',
          quantity: 3,
          itemData: { potionTier: 1 },
        },
      ]);

      mockRunTransaction.mockImplementation(async (handler) => {
        const mockClient = {} as any;
        mockInventoryRepo.decrementInventoryItem.mockResolvedValue(null); // Failed
        return handler(mockClient);
      });

      const response = await request(app)
        .post('/api/crafting/craft')
        .send({ fromTier: 1 });

      expect(response.status).toBe(500);
      expect(response.body.error).toBe('Failed to deduct input potions');
    });
  });
});
```

## Testing Patterns

### 1. Test Authentication First

Always test authentication/authorization before business logic:

```typescript
describe('Authentication', () => {
  it('should require authentication', async () => {
    mockResolveSessionFromRequest.mockResolvedValue(null);
    // ... test 401 response
  });

  it('should require admin for admin routes', async () => {
    mockResolveSessionFromRequest.mockResolvedValue({
      playerId: 'user-id',
      isAdmin: false,
    });
    // ... test 403 response
  });
});
```

### 2. Test Input Validation

Test all validation branches:

```typescript
describe('Input Validation', () => {
  it('should reject missing required fields', async () => {
    // Test missing fromTier
  });

  it('should reject invalid types', async () => {
    // Test fromTier as string, null, etc.
  });

  it('should reject out-of-range values', async () => {
    // Test negative, zero, too large
  });
});
```

### 3. Test Business Logic

Test the core functionality:

```typescript
describe('Business Logic', () => {
  it('should perform the operation successfully', async () => {
    // Happy path
  });

  it('should handle edge cases', async () => {
    // Edge cases (empty results, boundary values)
  });

  it('should maintain data consistency', async () => {
    // Verify database state after operation
  });
});
```

### 4. Test Error Handling

Test all error paths:

```typescript
describe('Error Handling', () => {
  it('should handle database errors', async () => {
    mockRunTransaction.mockRejectedValue(new Error('DB error'));
    // ... verify 500 response
  });

  it('should handle missing resources', async () => {
    mockInventoryRepo.getInventory.mockResolvedValue([]);
    // ... verify appropriate error
  });

  it('should handle concurrent modification', async () => {
    // Test race conditions if applicable
  });
});
```

## Mocking Strategies

### 1. Mock at Module Level

Mock entire modules to avoid real database calls:

```typescript
jest.mock('../../lib/db/repos/inventory', () => ({
  inventoryRepo: {
    getInventory: jest.fn(),
    // ... other methods
  },
}));
```

### 2. Use Jest Mocks for Functions

For functions, use `jest.fn()`:

```typescript
const mockResolveSession = jest.fn();
jest.mock('../../lib/auth/session', () => ({
  resolveSessionFromRequest: mockResolveSession,
}));
```

### 3. Mock Transaction Handlers

For `runTransaction`, provide a mock client:

```typescript
mockRunTransaction.mockImplementation(async (handler) => {
  const mockClient = {
    query: jest.fn(),
    release: jest.fn(),
  } as any;
  return handler(mockClient);
});
```

### 4. Reset Mocks Between Tests

Always reset mocks in `beforeEach`:

```typescript
beforeEach(() => {
  jest.clearAllMocks();
  // Set default mock implementations
});
```

## Test Organization

### File Structure

```
apps/server/src/routes/__tests__/
├── crafting.test.ts
├── daily-quest-competition.test.ts
├── shop.test.ts
├── token-withdrawals.test.ts
└── ...
```

### Test Naming

Use descriptive test names:

```typescript
it('should return 401 when player is not authenticated', ...);
it('should craft T2 potion from 3x T1 potions', ...);
it('should return 400 when insufficient materials', ...);
```

## Running Tests

Add to `package.json`:

```json
{
  "scripts": {
    "test:routes": "jest -c jest.config.js --testPathPattern='routes/__tests__'"
  }
}
```

Run with:

```bash
pnpm test:routes
```

## Best Practices

1. **Isolate Tests**: Each test should be independent
2. **Mock External Dependencies**: Never hit real databases or APIs
3. **Test All Branches**: Cover all if/else paths
4. **Test Error Cases**: Don't just test happy paths
5. **Verify Side Effects**: Check database calls, not just responses
6. **Use TypeScript**: Leverage types for better test safety
7. **Keep Tests Fast**: Mock everything, avoid real I/O
8. **Test Edge Cases**: Zero, null, undefined, empty arrays, etc.

## Example: Testing Admin Routes

Admin routes require special handling:

```typescript
describe('Admin Routes', () => {
  it('should require admin session', async () => {
    mockResolveSessionFromRequest.mockResolvedValue({
      playerId: 'user-id',
      isAdmin: false,
    });

    const response = await request(app)
      .get('/api/admin/players');

    expect(response.status).toBe(403);
  });

  it('should allow admin access', async () => {
    mockResolveSessionFromRequest.mockResolvedValue({
      playerId: 'admin-id',
      isAdmin: true,
    });

    mockPlayersRepo.getAll.mockResolvedValue([]);

    const response = await request(app)
      .get('/api/admin/players');

    expect(response.status).toBe(200);
  });
});
```

## Next Steps

1. Install `supertest` and `@types/supertest`
2. Create test utilities (`test-app.ts`, `mocks.ts`, `route-test-helpers.ts`)
3. Start with one route (e.g., `crafting.test.ts`)
4. Gradually add tests for other routes
5. Add route tests to CI pipeline

## Common Pitfalls

1. **Forgetting to mock**: Always mock database and external dependencies
2. **Not resetting mocks**: Use `beforeEach` to reset state
3. **Testing implementation**: Test behavior, not implementation details
4. **Incomplete error testing**: Test all error paths
5. **Not verifying side effects**: Check database calls, not just responses
