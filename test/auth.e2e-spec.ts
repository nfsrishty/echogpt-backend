import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end tests of the authentication flow against a real database.
 * Requirements: PostgreSQL running (docker compose up -d), migrations applied
 * and seed run. Creates its own uniquely-named users and deletes them after.
 */
interface ErrorBody {
  message: string | string[];
  path: string;
}

interface TokensBody {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
}

interface AuthBody extends TokensBody {
  user: { email: string; role: string };
}

/** supertest types bodies as `any`; this gives them a checked shape. */
const bodyOf = <T>(res: Response): T => res.body as T;

describe('Auth flow (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'StrongPass123';

  const api = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await app.close();
  });

  it('GET /health is public', async () => {
    const res = await api().get('/api/v1/health').expect(200);
    expect(bodyOf<{ status: string }>(res)).toMatchObject({ status: 'ok' });
  });

  it('rejects invalid registration with every validation problem listed', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({
        email: 'not-an-email',
        password: 'short',
        fullName: 'X',
        isAdmin: true,
      })
      .expect(400);

    const body = bodyOf<ErrorBody>(res);
    expect(Array.isArray(body.message)).toBe(true);
    expect((body.message as string[]).join(' ')).toContain(
      'isAdmin should not exist',
    );
    expect(body.path).toBe('/api/v1/auth/register');
  });

  let refreshToken: string;
  let accessToken: string;

  it('registers a user on the Free plan with a token pair', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email, password, fullName: 'E2E User' })
      .expect(201);

    const body = bodyOf<AuthBody>(res);
    expect(body.user).toMatchObject({ email, role: 'USER' });
    expect(body.tokenType).toBe('Bearer');
    expect(JSON.stringify(body)).not.toContain('passwordHash');
    ({ accessToken, refreshToken } = body);

    const sub = await api()
      .get('/api/v1/subscriptions/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(bodyOf<{ tier: string }>(sub).tier).toBe('FREE');
  });

  it('refuses a duplicate email with 409', async () => {
    await api()
      .post('/api/v1/auth/register')
      .send({ email, password, fullName: 'Again' })
      .expect(409);
  });

  it('gives the same answer for wrong password and unknown email', async () => {
    const wrong = await api()
      .post('/api/v1/auth/login')
      .send({ email, password: 'WrongPass999' })
      .expect(401);
    const unknown = await api()
      .post('/api/v1/auth/login')
      .send({ email: `nobody-${email}`, password: 'WrongPass999' })
      .expect(401);

    expect(bodyOf<ErrorBody>(wrong).message).toBe(
      bodyOf<ErrorBody>(unknown).message,
    );
  });

  it('protects routes: 401 without token, 403 for admin routes', async () => {
    await api().get('/api/v1/users/me').expect(401);
    await api()
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('rotates refresh tokens and revokes the session on reuse', async () => {
    const first = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    const rotated = bodyOf<TokensBody>(first);
    expect(rotated.refreshToken).not.toBe(refreshToken);

    // Replaying the already-used token signals theft: whole session revoked.
    const replay = await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })
      .expect(401);
    expect(bodyOf<ErrorBody>(replay).message).toMatch(/reuse/i);

    await api()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: rotated.refreshToken })
      .expect(401);
  });

  it('logout revokes the access token immediately', async () => {
    const login = await api()
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    const token = bodyOf<TokensBody>(login).accessToken;

    await api()
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await api()
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    await api()
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });
});
