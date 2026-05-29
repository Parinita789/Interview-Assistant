import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { truncateAll } from './helpers/db';
import { signupUser, authHeader } from './helpers/users';

describe('Auth boundaries (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncateAll(app);
  });

  describe('signup + login flow', () => {
    it('signup returns a JWT + SafeUser (no passwordHash leak)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: 'first@test.local',
          password: 'goodpassword1234',
          displayName: 'First User',
        })
        .expect(201);

      expect(res.body.token).toMatch(/^eyJ/); // JWT header is base64-encoded "{
      expect(res.body.user.email).toBe('first@test.local');
      expect(res.body.user.displayName).toBe('First User');
      expect(res.body.user).not.toHaveProperty('passwordHash');
    });

    it('login with the signup password returns the same user id', async () => {
      const signup = await signupUser(app, { email: 'lf@test.local' });
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'lf@test.local', password: 'integration-test-password-1234' })
        .expect(200);
      expect(res.body.user.id).toBe(signup.id);
    });

    it('login with the wrong password returns 401', async () => {
      await signupUser(app, { email: 'lf2@test.local' });
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'lf2@test.local', password: 'wrong-password-here' })
        .expect(401);
    });

    it('login for a non-existent user returns 401 (not 404 — avoids enumeration)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ email: 'nobody@test.local', password: 'whatever1234567' })
        .expect(401);
    });

    it('signup rejects duplicate emails with 409', async () => {
      await signupUser(app, { email: 'dup@test.local' });
      await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: 'dup@test.local',
          password: 'integration-test-password-1234',
          displayName: 'Dup',
        })
        .expect(409);
    });
  });

  describe('AuthGuard: protected routes', () => {
    it('GET /api/auth/me without a token returns 401', async () => {
      await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    });

    it('GET /api/auth/me with a valid JWT returns the SafeUser', async () => {
      const user = await signupUser(app);
      const res = await request(app.getHttpServer())
        .get('/api/auth/me')
        .set(authHeader(user))
        .expect(200);
      expect(res.body.id).toBe(user.id);
      expect(res.body.email).toBe(user.email);
      expect(res.body).not.toHaveProperty('passwordHash');
    });

    it('GET /api/auth/me with a tampered JWT returns 401', async () => {
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set({ Authorization: 'Bearer not-a-real-jwt' })
        .expect(401);
    });

    it('GET /api/sessions without a token returns 401', async () => {
      await request(app.getHttpServer()).get('/api/sessions').expect(401);
    });
  });

  describe('Soft-delete: DELETE /api/auth/me', () => {
    it('returns 204 and makes the account unreachable to login + /auth/me', async () => {
      const user = await signupUser(app, {
        email: 'sd-flow@test.local',
        password: 'integration-test-password-1234',
      });

      // Soft-delete the account.
      await request(app.getHttpServer())
        .delete('/api/auth/me')
        .set(authHeader(user))
        .expect(204);

      // Login with the correct password now returns 401 — the account
      // is treated as nonexistent (UsersRepository.findByEmail excludes
      // soft-deleted). No enumeration leak vs. wrong-password timing.
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({
          email: 'sd-flow@test.local',
          password: 'integration-test-password-1234',
        })
        .expect(401);

      // /auth/me with the still-valid JWT returns 404 — token decodes
      // fine (caveat documented in AuthService.softDeleteAccount) but
      // the user row no longer matches UsersRepository.findById. The
      // frontend treats 404 here as a sign to clear local auth state.
      await request(app.getHttpServer())
        .get('/api/auth/me')
        .set(authHeader(user))
        .expect(404);
    });

    it('blocks re-signup with the same email (email is unique forever)', async () => {
      const user = await signupUser(app, { email: 'sd-reuse@test.local' });
      await request(app.getHttpServer())
        .delete('/api/auth/me')
        .set(authHeader(user))
        .expect(204);

      // Attempt to re-create with the same email — Prisma unique
      // constraint still fires, P2002 translates to 409.
      await request(app.getHttpServer())
        .post('/api/auth/signup')
        .send({
          email: 'sd-reuse@test.local',
          password: 'integration-test-password-1234',
          displayName: 'Second Try',
        })
        .expect(409);
    });

    it('is idempotent (second DELETE returns 204; the row is already soft-deleted)', async () => {
      const user = await signupUser(app, { email: 'sd-idempotent@test.local' });
      await request(app.getHttpServer())
        .delete('/api/auth/me')
        .set(authHeader(user))
        .expect(204);
      // Token still cryptographically valid; AuthGuard passes; service
      // refreshes the deletedAt timestamp without throwing.
      await request(app.getHttpServer())
        .delete('/api/auth/me')
        .set(authHeader(user))
        .expect(204);
    });

    it('DELETE without a token returns 401', async () => {
      await request(app.getHttpServer()).delete('/api/auth/me').expect(401);
    });
  });
});
