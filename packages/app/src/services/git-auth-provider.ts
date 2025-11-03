type GitProvider = 'github' | 'gitlab' | 'bitbucket' | 'generic';

function detectProvider(repoUrl: string): GitProvider {
  try {
    const url = new URL(repoUrl);
    const hostname = url.hostname.toLowerCase();

    if (hostname === 'github.com') {
      return 'github';
    }

    if (hostname === 'gitlab.com' || hostname.includes('gitlab')) {
      return 'gitlab';
    }

    if (hostname === 'bitbucket.org') {
      return 'bitbucket';
    }

    return 'generic';
  } catch {
    throw new Error(`Invalid repository URL: ${repoUrl}`);
  }
}

function buildAuthenticatedUrl(
  repoUrl: string,
  token: string,
  provider: GitProvider,
  username?: string,
): string {
  try {
    const url = new URL(repoUrl);

    switch (provider) {
      case 'github':
        url.username = 'x-access-token';
        url.password = token;
        break;

      case 'gitlab':
        url.username = 'oauth2';
        url.password = token;
        break;

      case 'bitbucket':
        url.username = 'x-token-auth';
        url.password = token;
        break;

      case 'generic':
        if (!username) {
          throw new Error(
            `GIT_USERNAME environment variable is required for self-hosted git provider: ${url.hostname}`,
          );
        }
        url.username = username;
        url.password = token;
        break;

      default:
        throw new Error(`Unknown git provider: ${provider}`);
    }

    return url.toString();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Failed to build authenticated URL: ${error}`);
  }
}

export function getAuthenticatedGitUrl(repoUrl: string, token: string, username?: string): string {
  const provider = detectProvider(repoUrl);
  return buildAuthenticatedUrl(repoUrl, token, provider, username);
}
