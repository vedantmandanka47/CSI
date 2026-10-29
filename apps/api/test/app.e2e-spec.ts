import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('API Foundation & Health (E2E) (DEP-13, ARCH-05, ARCH-15)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health (Liveness) returns 200 with X-Request-Id header', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.timestamp).toBeDefined();
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('GET /api/health/ready (Readiness) returns 200 and database connected status', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/ready').expect(200);

    expect(response.body.status).toBe('ready');
    expect(response.body.database).toBe('connected');
    expect(response.body.timestamp).toBeDefined();
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('GET /api/nonexistent returns standard error envelope (ARCH-15) and no-store header', async () => {
    const response = await request(app.getHttpServer()).get('/api/nonexistent').expect(404);

    expect(response.body.error).toBeDefined();
    expect(response.body.error.code).toBe('NOT_FOUND');
    expect(response.body.error.message).toBeDefined();
    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
