/**
 * Shared MCP Routes
 *
 * MCP endpoint handlers used by both local and Lambda HTTP servers
 */

import { Express, Request, Response, NextFunction } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import * as auth from '@/services/auth';

/**
 * OAuth middleware to authenticate Bearer tokens
 */
async function authenticateToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'unauthorized',
      error_description: 'Missing or invalid Authorization header',
    });
    return;
  }

  const token = authHeader.substring(7);

  if (!(await auth.validateAccessToken(token))) {
    res.status(401).json({
      error: 'invalid_token',
      error_description: 'Access token is invalid or expired',
    });
    return;
  }

  next();
}

/**
 * Register MCP endpoint on an Express app
 *
 * OAuth authentication is always required for the MCP endpoint.
 *
 * @param app - Express application
 * @param mcpServer - MCP server instance
 */
export function registerMcpRoute(app: Express, mcpServer: McpServer): void {
  // Health check endpoint
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      oauth: 'enabled',
      vault: process.env.LOCAL_VAULT_PATH || process.env.VAULT_REPO_URL || 'configured',
    });
  });

  // SSE streaming not supported (Lambda limitation)
  app.get('/mcp', (_req, res) => {
    res.status(405).json({
      error: 'method_not_allowed',
      error_description: 'SSE streaming is not supported in Lambda',
    });
  });

  // MCP endpoint handler
  const mcpHandler = async (req: Request, res: Response) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      transport.close();
    });

    try {
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('[mcp] Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
            data: error instanceof Error ? error.message : 'Unknown error',
          },
          id: null,
        });
      }
    }
  };

  // Always require OAuth authentication
  app.post('/mcp', authenticateToken, mcpHandler);
}
