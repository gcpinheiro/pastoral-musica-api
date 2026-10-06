import { HttpStatus } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AuthService } from './auth.service';

jest.mock('@nestjs/config', () => ({ ConfigService: class ConfigService {} }));

describe('AuthService invitation validation', () => {
  const query = jest.fn();
  const database = { query } as unknown as DatabaseService;
  const service = new AuthService(database, {} as never);

  beforeEach(() => query.mockReset());

  it('accepts a pending, unexpired invitation token', async () => {
    const expiresAt = new Date('2026-10-07T15:00:00.000Z');
    query.mockResolvedValue({ rows: [{ expires_at: expiresAt }], rowCount: 1 });

    await expect(service.validateInvitation('valid-token')).resolves.toEqual({
      valid: true,
      expiresAt,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining("status='PENDING'"), [expect.any(String)]);
  });

  it('does not reveal whether a token is expired, used or unknown', async () => {
    query.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(service.validateInvitation('invalid-token')).rejects.toMatchObject({
      status: HttpStatus.GONE,
      response: expect.objectContaining({ code: 'INVITATION_INVALID' }),
    });
  });
});
