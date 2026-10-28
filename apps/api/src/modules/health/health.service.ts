import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import { env } from '../../config/env.js';

@Injectable()
export class HealthService {
  private pool: Pool | null = null;

  private getPool(): Pool {
    if (!this.pool) {
      this.pool = new Pool({
        connectionString: env.DATABASE_URL,
        connectionTimeoutMillis: 3000,
      });
    }
    return this.pool;
  }

  getLiveness() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  async getReadiness() {
    try {
      const client = await this.getPool().connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }

      return {
        status: 'ready',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database readiness check failed',
      });
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }
}
