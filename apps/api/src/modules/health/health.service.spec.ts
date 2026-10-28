import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service.js';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService],
    }).compile();

    service = module.get<HealthService>(HealthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return liveness status ok', () => {
    const liveness = service.getLiveness();
    expect(liveness.status).toBe('ok');
    expect(liveness.timestamp).toBeDefined();
  });
});
