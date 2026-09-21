import { expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { registerMcpRoute } from '@/server/shared/mcp-routes';
import { setAuthStore } from '@/services/auth';
import { createInMemoryAuthStore } from '@/services/auth/stores';
import { configureLogger } from '@/utils/logger';

it('isolates overlapping requests with identical IDs and logs completion only after the response', async () => {
  const logs: Array<{ message: string; context: { tool?: string } }> = [];
  configureLogger({
    stream: {
      write: (line: string) => logs.push(JSON.parse(line)),
    } as unknown as NodeJS.WriteStream,
  });
  const store = createInMemoryAuthStore();
  setAuthStore(store);
  await store.setAccessToken({
    token: 'test-token',
    refreshToken: 'test-refresh',
    createdAt: Date.now(),
    expiresAt: Date.now() + 60000,
    scope: 'vault:read vault:write',
  });
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const entered = new Promise<void>(resolve => {
    started = resolve;
  });
  const factory = vi.fn(() => {
    const server = new McpServer({ name: 'test', version: '1' });
    server.registerTool('echo', { inputSchema: { value: z.string() } }, async ({ value }) => {
      if (value === 'slow') {
        started();
        await gate;
      }
      return { content: [{ type: 'text', text: value }] };
    });
    return server;
  });
  const app = express();
  app.use(express.json());
  registerMcpRoute(app, factory);
  const call = (value: string) =>
    request(app)
      .post('/mcp')
      .set('Authorization', 'Bearer test-token')
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 0,
        method: 'tools/call',
        params: { name: 'echo', arguments: { value } },
      });
  const slow = call('slow').then(r => r);
  try {
    await entered;
    expect(logs.filter(x => x.message === 'MCP request completed')).toHaveLength(0);
    const fast = await call('fast');
    expect(fast.status).toBe(200);
    expect(fast.body.result.content[0].text).toBe('fast');
    expect(logs.filter(x => x.message === 'MCP request completed')).toHaveLength(1);
  } finally {
    release();
  }
  const result = await slow;
  expect(result.status).toBe(200);
  expect(result.body.result.content[0].text).toBe('slow');
  expect(factory).toHaveBeenCalledTimes(2);
  expect(
    logs.filter(x => x.message === 'MCP request completed' && x.context.tool === 'echo'),
  ).toHaveLength(2);
});
