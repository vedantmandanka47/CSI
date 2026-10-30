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

  it('GET /api/public/status returns 200 with aggregates and drive window (ARCH-05, SEC-09)', async () => {
    const response = await request(app.getHttpServer()).get('/api/public/status').expect(200);

    expect(response.body.aggregates).toBeDefined();
    expect(typeof response.body.aggregates.active_members).toBe('number');
    expect(typeof response.body.aggregates.total_events).toBe('number');
    expect(typeof response.body.aggregates.certificates_issued).toBe('number');

    expect(response.body.membership_drive).toBeDefined();
    expect(typeof response.body.membership_drive.is_open).toBe('boolean');
    expect(typeof response.body.membership_drive.message).toBe('string');

    // SEC-07 / SEC-24: Assert no sensitive fields or user lists are leaked
    expect(response.body.users).toBeUndefined();
    expect(response.body.email).toBeUndefined();
    expect(response.body.password).toBeUndefined();
    expect(response.body.token).toBeUndefined();
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
