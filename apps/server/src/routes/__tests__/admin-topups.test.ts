process.env.DISCORD_USDC_TOPUP_WEBHOOK_URL = 'https://example.com/webhook';

import request from 'supertest';
import express, { type Application } from 'express';
import { registerAdminTopUpRoutes } from '../admin-topups';

jest.mock('../admin-auth', () => ({
  requireAdminSession: jest.fn(),
}));

import { requireAdminSession } from '../admin-auth';

describe('POST /api/admin/top-ups/test-discord', () => {
  let app: Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerAdminTopUpRoutes(app);
    jest.clearAllMocks();

    (requireAdminSession as jest.Mock).mockResolvedValue({
      address: '0xabc123',
      playerId: null,
    });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(''),
    }) as unknown as typeof fetch;
  });

  it('sends a Discord test message', async () => {
    const response = await request(app).post('/api/admin/top-ups/test-discord');

    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/webhook',
      expect.objectContaining({
        method: 'POST',
      })
    );
  });
});
