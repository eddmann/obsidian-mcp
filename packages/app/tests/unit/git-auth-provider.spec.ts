import { describe, it, expect } from 'vitest';
import { getAuthenticatedGitUrl } from '@/services/git-auth-provider';

describe('git-auth-provider', () => {
  describe('GitHub', () => {
    it('auto-detects GitHub and builds URL with x-access-token', () => {
      const url = getAuthenticatedGitUrl('https://github.com/user/repo.git', 'ghp_token');
      expect(url).toBe('https://x-access-token:ghp_token@github.com/user/repo.git');
    });

    it('preserves repository path', () => {
      const url = getAuthenticatedGitUrl('https://github.com/org/my-vault.git', 'token');
      expect(url).toContain('/org/my-vault.git');
      expect(url).toContain('x-access-token:');
    });

    it('is case insensitive for hostname', () => {
      const url = getAuthenticatedGitUrl('https://GitHub.com/user/repo.git', 'token');
      expect(url).toBe('https://x-access-token:token@github.com/user/repo.git');
    });

    it('works with real GitHub repository URL', () => {
      const url = getAuthenticatedGitUrl(
        'https://github.com/eddmann/obsidian-vault.git',
        'ghp_realtoken123',
      );
      expect(url).toBe(
        'https://x-access-token:ghp_realtoken123@github.com/eddmann/obsidian-vault.git',
      );
    });
  });

  describe('GitLab', () => {
    it('auto-detects GitLab and builds URL with oauth2', () => {
      const url = getAuthenticatedGitUrl('https://gitlab.com/user/repo.git', 'glpat_token');
      expect(url).toBe('https://oauth2:glpat_token@gitlab.com/user/repo.git');
    });

    it('works with self-hosted GitLab', () => {
      const url = getAuthenticatedGitUrl('https://gitlab.company.com/group/project.git', 'token');
      expect(url).toBe('https://oauth2:token@gitlab.company.com/group/project.git');
    });

    it('detects gitlab in hostname', () => {
      const url = getAuthenticatedGitUrl('https://gitlab.internal.com/repo.git', 'token');
      expect(url).toBe('https://oauth2:token@gitlab.internal.com/repo.git');
    });

    it('is case insensitive', () => {
      const url = getAuthenticatedGitUrl('https://GITLAB.com/user/repo.git', 'token');
      expect(url).toBe('https://oauth2:token@gitlab.com/user/repo.git');
    });

    it('works with GitLab subgroups', () => {
      const url = getAuthenticatedGitUrl(
        'https://gitlab.com/company/team/vault.git',
        'glpat_token',
      );
      expect(url).toBe('https://oauth2:glpat_token@gitlab.com/company/team/vault.git');
    });
  });

  describe('Bitbucket', () => {
    it('auto-detects Bitbucket and builds URL with x-token-auth', () => {
      const url = getAuthenticatedGitUrl('https://bitbucket.org/user/repo.git', 'app_password');
      expect(url).toBe('https://x-token-auth:app_password@bitbucket.org/user/repo.git');
    });

    it('is case insensitive', () => {
      const url = getAuthenticatedGitUrl('https://BitBucket.org/user/repo.git', 'token');
      expect(url).toBe('https://x-token-auth:token@bitbucket.org/user/repo.git');
    });

    it('works with Bitbucket workspace', () => {
      const url = getAuthenticatedGitUrl('https://bitbucket.org/workspace/vault.git', 'app_pass');
      expect(url).toBe('https://x-token-auth:app_pass@bitbucket.org/workspace/vault.git');
    });
  });

  describe('Generic/Self-hosted', () => {
    it('auto-detects generic provider and uses username', () => {
      const url = getAuthenticatedGitUrl('https://git.company.com/repo.git', 'token', 'alice');
      expect(url).toBe('https://alice:token@git.company.com/repo.git');
    });

    it('throws error when username is missing for generic provider', () => {
      expect(() => getAuthenticatedGitUrl('https://git.company.com/repo.git', 'token')).toThrow(
        /GIT_USERNAME environment variable is required/,
      );
    });

    it('includes hostname in error message', () => {
      expect(() => getAuthenticatedGitUrl('https://gitea.example.com/repo.git', 'token')).toThrow(
        /gitea.example.com/,
      );
    });

    it('works with Gitea self-hosted', () => {
      const url = getAuthenticatedGitUrl(
        'https://gitea.mycompany.com/user/vault.git',
        'token123',
        'bob',
      );
      expect(url).toBe('https://bob:token123@gitea.mycompany.com/user/vault.git');
    });

    it('works with Gogs', () => {
      const url = getAuthenticatedGitUrl('https://gogs.example.com/repo.git', 'token', 'user');
      expect(url).toBe('https://user:token@gogs.example.com/repo.git');
    });
  });

  describe('URL handling', () => {
    it('handles URLs with .git extension', () => {
      expect(getAuthenticatedGitUrl('https://github.com/user/repo.git', 'token')).toContain(
        'repo.git',
      );
    });

    it('handles URLs without .git extension', () => {
      expect(getAuthenticatedGitUrl('https://github.com/user/repo', 'token')).toContain(
        'user/repo',
      );
    });

    it('handles URLs with port', () => {
      const url = getAuthenticatedGitUrl('https://gitlab.company.com:8443/repo.git', 'token');
      expect(url).toContain(':8443');
      expect(url).toBe('https://oauth2:token@gitlab.company.com:8443/repo.git');
    });

    it('handles special characters in tokens via URL encoding', () => {
      const url = getAuthenticatedGitUrl('https://github.com/user/repo.git', 'token!@#$%');
      expect(url).toMatch(/x-access-token:token.*@github\.com/);
    });

    it('throws error for invalid URL', () => {
      expect(() => getAuthenticatedGitUrl('invalid-url', 'token')).toThrow(
        'Invalid repository URL',
      );
    });

    it('throws error for malformed URL', () => {
      expect(() => getAuthenticatedGitUrl('not-a-url', 'token')).toThrow('Invalid repository URL');
    });
  });

  describe('Edge cases', () => {
    it('handles empty token gracefully', () => {
      const url = getAuthenticatedGitUrl('https://github.com/user/repo.git', '');
      expect(url).toBe('https://x-access-token@github.com/user/repo.git');
    });

    it('handles username parameter for GitHub (ignored)', () => {
      const url = getAuthenticatedGitUrl('https://github.com/user/repo.git', 'token', 'john');
      expect(url).toBe('https://x-access-token:token@github.com/user/repo.git');
    });

    it('handles username parameter for GitLab (ignored)', () => {
      const url = getAuthenticatedGitUrl('https://gitlab.com/user/repo.git', 'token', 'john');
      expect(url).toBe('https://oauth2:token@gitlab.com/user/repo.git');
    });

    it('handles username parameter for Bitbucket (ignored)', () => {
      const url = getAuthenticatedGitUrl('https://bitbucket.org/user/repo.git', 'token', 'john');
      expect(url).toBe('https://x-token-auth:token@bitbucket.org/user/repo.git');
    });
  });
});
