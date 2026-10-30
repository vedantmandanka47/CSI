import { spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';
import { existsSync } from 'fs';

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function probeUrl(url: string, maxRetries = 30): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      return res;
    } catch {
      await wait(500);
    }
  }
  throw new Error(`Timeout waiting for ${url}`);
}

async function testProxy() {
  console.log('🧪 Testing Next.js <-> NestJS Proxy Integration (P0-06)...');

  let apiProcess: ChildProcess | null = null;
  let webProcess: ChildProcess | null = null;

  try {
    // Check that database configuration is available (either from process.env or apps/api/.env)
    const apiEnvPath = resolve('apps/api/.env');
    const hasEnvConfig = Boolean(process.env.DATABASE_URL || existsSync(apiEnvPath));
    if (!hasEnvConfig) {
      throw new Error(
        '[FATAL] Neither DATABASE_URL is set in environment nor apps/api/.env exists. Cannot run proxy integration test without database configuration.',
      );
    }

    const apiEnv: NodeJS.ProcessEnv = {
      ...process.env,
      NODE_ENV: 'test',
      API_PORT: '4000',
    };
    // Preserve explicitly supplied DATABASE_URL; otherwise allow NestJS to load its own local apps/api/.env
    if (process.env.DATABASE_URL) {
      apiEnv.DATABASE_URL = process.env.DATABASE_URL;
    }

    // 1. Start API (NestJS) on port 4000
    console.log('🚀 Launching NestJS API service on port 4000...');
    apiProcess = spawn(process.execPath, [resolve('apps/api/dist/main.js')], {
      cwd: resolve('apps/api'),
      env: apiEnv,
      stdio: 'inherit',
    });

    // Wait for API to respond
    console.log('⏳ Probing API liveness at http://localhost:4000/api/health...');
    const apiRes = await probeUrl('http://localhost:4000/api/health');
    const apiJson = await apiRes.json();
    console.log('✅ NestJS API answered directly:', JSON.stringify(apiJson));

    // 2. Start Web (Next.js) on port 3000
    console.log('🚀 Launching Next.js Web service on port 3000...');
    const nextBin = resolve('node_modules/next/dist/bin/next');
    webProcess = spawn(process.execPath, [nextBin, 'start', '-p', '3000'], {
      cwd: resolve('apps/web'),
      env: {
        ...process.env,
        NODE_ENV: 'production',
        API_INTERNAL_URL: 'http://localhost:4000',
      },
      stdio: 'inherit',
    });

    // Wait for Web to respond
    console.log('⏳ Probing Next.js health page at http://localhost:3000/health...');
    const webHealthRes = await probeUrl('http://localhost:3000/health');
    const webHealthHtml = await webHealthRes.text();
    if (!webHealthHtml.includes('System Health Status')) {
      throw new Error('Next.js /health page did not render expected title');
    }
    console.log('✅ Next.js /health page rendered successfully.');

    // 3. Probe rewrite proxy: browser -> Next.js /api/health -> NestJS
    console.log('⏳ Probing Next.js reverse proxy rewrite at http://localhost:3000/api/health...');
    const proxyRes = await probeUrl('http://localhost:3000/api/health');
    const proxyJson = await proxyRes.json();
    console.log('✅ Next.js reverse proxy rewrite returned:', JSON.stringify(proxyJson));

    if (proxyJson.status !== 'ok') {
      throw new Error(`Unexpected proxy response: ${JSON.stringify(proxyJson)}`);
    }

    console.log('\n🎉 Step P0-06 Proxy Integration Test PASSED!');
    console.log('   - Next.js Web loads cleanly on port 3000');
    console.log('   - Reverse proxy rewrites /api/* seamlessly without CORS');
    console.log('   - NestJS API receives forwarded requests and answers correctly');
  } finally {
    console.log('🛑 Shutting down test server processes...');
    if (webProcess) {
      webProcess.kill('SIGTERM');
    }
    if (apiProcess) {
      apiProcess.kill('SIGTERM');
    }
  }
}

testProxy().catch((err) => {
  console.error('\n❌ Proxy Integration Test FAILED:', err);
  process.exit(1);
});
