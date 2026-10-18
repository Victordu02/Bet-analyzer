import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
config({ path: '.env.test.local', quiet: true });
export default defineConfig({ test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'], testTimeout: 30000, fileParallelism: false }, resolve: { alias: { '@': new URL('./src', import.meta.url).pathname } } });
