import { afterEach, expect, it, vi } from 'vitest';
import { configureLogger, logger, redactSensitiveText } from '@/utils/logger';

afterEach(() => vi.unstubAllEnvs());

it('redacts credentials from nested Git errors while retaining the failure message', () => {
  vi.stubEnv('GIT_TOKEN', 'test-git-secret');
  vi.stubEnv('OAUTH_CLIENT_SECRET', 'test-oauth-secret');
  let output = '';
  configureLogger({
    stream: {
      write: (line: string) => {
        output += line;
      },
    } as NodeJS.WriteStream,
  });
  const error = Object.assign(
    new Error('clone failed: https://user:embedded-secret@github.com/repo'),
    {
      task: { commands: ['clone', 'https://user:embedded-secret@github.com/repo'] },
    },
  );
  logger.error('failure test-git-secret', { error, clientSecret: 'test-oauth-secret' });
  expect(output).not.toContain('test-git-secret');
  expect(output).not.toContain('test-oauth-secret');
  expect(output).not.toContain('embedded-secret');
  expect(JSON.parse(output).context.error.message).toContain('clone failed:');
  expect(JSON.parse(output).context.error.task.commands[1]).toContain('[REDACTED]');
  expect(redactSensitiveText('test-oauth-secret')).toBe('[REDACTED]');
});
