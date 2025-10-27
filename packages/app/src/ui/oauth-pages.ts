/**
 * OAuth HTML Pages
 *
 * Login and consent screen pages for OAuth flow
 */

/**
 * Login page - asks for personal auth token
 */
export function loginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - Obsidian MCP</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 48px;
      max-width: 440px;
      width: 100%;
    }
    .logo {
      text-align: center;
      margin-bottom: 32px;
    }
    .logo h1 {
      font-size: 28px;
      color: #1a202c;
      margin-bottom: 8px;
    }
    .logo p {
      color: #718096;
      font-size: 14px;
    }
    .error {
      background: #fed7d7;
      color: #c53030;
      padding: 12px 16px;
      border-radius: 8px;
      margin-bottom: 24px;
      font-size: 14px;
      border-left: 4px solid #c53030;
    }
    .form-group {
      margin-bottom: 24px;
    }
    label {
      display: block;
      font-weight: 600;
      color: #2d3748;
      margin-bottom: 8px;
      font-size: 14px;
    }
    input[type="password"] {
      width: 100%;
      padding: 12px 16px;
      border: 2px solid #e2e8f0;
      border-radius: 8px;
      font-size: 16px;
      transition: border-color 0.2s;
    }
    input[type="password"]:focus {
      outline: none;
      border-color: #667eea;
    }
    button {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    button:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
    }
    button:active {
      transform: translateY(0);
    }
    .hint {
      margin-top: 24px;
      padding: 16px;
      background: #f7fafc;
      border-radius: 8px;
      font-size: 13px;
      color: #4a5568;
      border-left: 4px solid #667eea;
    }
    .hint strong {
      color: #2d3748;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">
      <h1>🔐 Obsidian MCP</h1>
      <p>Secure Authentication</p>
    </div>

    ${error ? `<div class="error">⚠️ ${error}</div>` : ''}

    <form method="POST" action="/login">
      <div class="form-group">
        <label for="token">Personal Authentication Token</label>
        <input
          type="password"
          id="token"
          name="token"
          placeholder="Enter your personal auth token"
          required
          autofocus
        />
      </div>

      <button type="submit">Authenticate</button>
    </form>

    <div class="hint">
      <strong>💡 Where to find your token:</strong><br>
      Your personal auth token is set in <code>PERSONAL_AUTH_TOKEN</code> in your server configuration.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Consent screen - asks user to approve ChatGPT/Claude access
 */
export function consentPage(clientId: string): string {
  const appName = clientId.includes('chatgpt')
    ? 'ChatGPT'
    : clientId.includes('claude')
      ? 'Claude'
      : clientId;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize Access - Obsidian MCP</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 48px;
      max-width: 500px;
      width: 100%;
    }
    .header {
      text-align: center;
      margin-bottom: 32px;
      padding-bottom: 24px;
      border-bottom: 2px solid #e2e8f0;
    }
    .header h1 {
      font-size: 24px;
      color: #1a202c;
      margin-bottom: 8px;
    }
    .app-info {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px;
      background: #f7fafc;
      border-radius: 12px;
      margin-bottom: 24px;
    }
    .app-icon {
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }
    .app-details h2 {
      font-size: 18px;
      color: #2d3748;
      margin-bottom: 4px;
    }
    .app-details p {
      font-size: 14px;
      color: #718096;
    }
    .permissions {
      margin-bottom: 32px;
    }
    .permissions h3 {
      font-size: 16px;
      color: #2d3748;
      margin-bottom: 16px;
      font-weight: 600;
    }
    .permission-item {
      display: flex;
      align-items: start;
      gap: 12px;
      padding: 12px;
      background: #f7fafc;
      border-radius: 8px;
      margin-bottom: 8px;
    }
    .permission-icon {
      font-size: 20px;
      margin-top: 2px;
    }
    .permission-text {
      flex: 1;
    }
    .permission-text strong {
      display: block;
      color: #2d3748;
      font-size: 14px;
      margin-bottom: 4px;
    }
    .permission-text span {
      color: #718096;
      font-size: 13px;
    }
    .actions {
      display: flex;
      gap: 12px;
    }
    button {
      flex: 1;
      padding: 14px;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn-approve {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .btn-approve:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.4);
    }
    .btn-deny {
      background: #e2e8f0;
      color: #4a5568;
    }
    .btn-deny:hover {
      background: #cbd5e0;
    }
    .warning {
      margin-top: 24px;
      padding: 16px;
      background: #fef5e7;
      border-radius: 8px;
      font-size: 13px;
      color: #744210;
      border-left: 4px solid #f59e0b;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Authorize Application</h1>
    </div>

    <div class="app-info">
      <div class="app-icon">🤖</div>
      <div class="app-details">
        <h2>${appName}</h2>
        <p>wants to access your Obsidian vault</p>
      </div>
    </div>

    <div class="permissions">
      <h3>This application will be able to:</h3>

      <div class="permission-item">
        <div class="permission-icon">📖</div>
        <div class="permission-text">
          <strong>Read your notes</strong>
          <span>View contents of files in your vault</span>
        </div>
      </div>

      <div class="permission-item">
        <div class="permission-icon">✏️</div>
        <div class="permission-text">
          <strong>Modify your notes</strong>
          <span>Create, edit, and delete files in your vault</span>
        </div>
      </div>

      <div class="permission-item">
        <div class="permission-icon">🔍</div>
        <div class="permission-text">
          <strong>Search your vault</strong>
          <span>Perform full-text search across all notes</span>
        </div>
      </div>

      <div class="permission-item">
        <div class="permission-icon">🏷️</div>
        <div class="permission-text">
          <strong>Manage tags</strong>
          <span>Add, remove, and rename tags in your notes</span>
        </div>
      </div>
    </div>

    <form method="POST" action="/oauth/approve">
      <div class="actions">
        <button type="button" class="btn-deny" onclick="window.location.href='/oauth/deny'">
          Deny
        </button>
        <button type="submit" class="btn-approve">
          Allow Access
        </button>
      </div>
    </form>

    <div class="warning">
      ⚠️ <strong>Security Note:</strong> Only approve if you trust this application. Access tokens expire after 1 hour but can be refreshed for up to 30 days.
    </div>
  </div>
</body>
</html>`;
}

/**
 * Success page after approval
 */
export function successPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Success - Obsidian MCP</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 48px;
      max-width: 440px;
      width: 100%;;
      text-align: center;
    }
    .success-icon {
      width: 80px;
      height: 80px;
      background: #48bb78;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      margin: 0 auto 24px;
    }
    h1 {
      font-size: 24px;
      color: #1a202c;
      margin-bottom: 12px;
    }
    p {
      color: #718096;
      font-size: 16px;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">✓</div>
    <h1>Authorization Successful</h1>
    <p>You can now close this window and return to the application.</p>
  </div>
</body>
</html>`;
}

/**
 * Error page
 */
export function errorPage(error: string, description?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - Obsidian MCP</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 48px;
      max-width: 440px;
      width: 100%;
      text-align: center;
    }
    .error-icon {
      width: 80px;
      height: 80px;
      background: #f56565;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 40px;
      margin: 0 auto 24px;
    }
    h1 {
      font-size: 24px;
      color: #1a202c;
      margin-bottom: 12px;
    }
    p {
      color: #718096;
      font-size: 16px;
      line-height: 1.6;
    }
    .error-code {
      margin-top: 20px;
      padding: 12px;
      background: #f7fafc;
      border-radius: 8px;
      font-family: monospace;
      font-size: 14px;
      color: #4a5568;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="error-icon">✕</div>
    <h1>Authorization Failed</h1>
    <p>${description || 'An error occurred during the authorization process.'}</p>
    ${error ? `<div class="error-code">Error: ${error}</div>` : ''}
  </div>
</body>
</html>`;
}
