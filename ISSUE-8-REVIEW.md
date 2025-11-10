# Issue #8 Review: Improve Tool Harness Testing with Fake MCP Server

## Executive Summary

This review investigates the feasibility and value of implementing a mock MCP server to strengthen testing practices for tool handlers in the obsidian-mcp project. After thorough analysis of the current testing approach, MCP SDK capabilities, and emerging best practices in the MCP ecosystem, I recommend a **phased implementation** that progressively adds MCP protocol-level testing while maintaining the existing behavior tests.

**Key Finding:** The vitest config already includes placeholders for `tests/contracts/**/*.spec.ts` and `tests/http/**/*.spec.ts`, indicating prior intent to expand testing coverage in these areas.

## Current Testing Approach

### Architecture

The project currently uses a `ToolHarness` class (located at `packages/app/tests/support/harness/tool-harness.ts`) that:

1. **Creates a minimal `FakeMcpServer`** - Implements only the `registerTool()` method
2. **Registers tools** - Calls the real `registerTools()` function from production code
3. **Invokes handlers directly** - Bypasses the full MCP protocol stack
4. **Uses test doubles** - `InMemoryVaultManager` replaces `GitVaultManager`

### Current Coverage

The test suite includes **178 tests** across 10 test files:

**Behavior Tests (8 files, 160 tests):**
- `files.spec.ts` - 30 tests for file operations
- `patch-content.spec.ts` - 39 tests for content patching
- `search.spec.ts` - 17 tests for vault search
- `tags.spec.ts` - 16 tests for tag management
- `journal.spec.ts` - 13 tests for journal operations
- `apply-diff-patch.spec.ts` - 18 tests for diff patching
- `directories.spec.ts` - 9 tests for directory operations
- `error-handling.spec.ts` - 8 tests for error scenarios

**Unit Tests (2 files, 18 tests):**
- `journal-formatter.spec.ts` - 1 test
- `git-auth-provider.spec.ts` - 27 tests

All tests pass successfully in ~186ms.

### Strengths of Current Approach

✅ **Fast execution** - 186ms for 178 tests
✅ **Excellent handler coverage** - Comprehensive behavior validation
✅ **Easy to write** - Simple API: `harness.invoke('tool-name', args)`
✅ **Isolated** - No network, git, or external dependencies
✅ **Good error testing** - Validates error messages and failure modes

### Identified Gaps

❌ **No schema validation** - Zod schemas in `tool-definitions.ts` are never tested
❌ **No protocol testing** - JSON-RPC message format, error codes not validated
❌ **No transport testing** - Stdio and HTTP transports untested
❌ **No MCP SDK integration** - Actual `McpServer` class never instantiated in tests
❌ **No registration validation** - Tool metadata (annotations, descriptions) not verified
❌ **No end-to-end tests** - Full request/response cycle not exercised

## MCP SDK Testing Capabilities

### SDK Version

The project uses `@modelcontextprotocol/sdk` version `^1.0.4`.

### Built-in Testing Utilities

**Finding:** The MCP SDK provides **NO built-in testing utilities** or test harness.

The official documentation states:
> "To test your server, you can use the MCP Inspector."

### Available Testing Tools

1. **MCP Inspector** (Manual Testing)
   - Interactive visual tool for manual testing
   - CLI mode for automation: `npx @modelcontextprotocol/inspector node build/index.js`
   - Validates protocol compliance in real-time
   - **Limitation:** Not suitable for automated unit/integration tests

2. **StdioClientTransport** (Integration Testing)
   - Client-side transport that spawns server as child process
   - Enables real protocol-level testing
   - Example from SDK docs:
   ```typescript
   import { Client } from '@modelcontextprotocol/sdk/client/index.js';
   import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

   const transport = new StdioClientTransport({
     command: 'node',
     args: ['server.js']
   });

   const client = new Client({
     name: 'test-client',
     version: '1.0.0'
   });

   await client.connect(transport);
   ```

3. **Third-Party Testing Frameworks** (Emerging)
   - `@haakco/mcp-testing-framework` - Comprehensive testing framework
   - `mcp-server-tester` - Automated testing tool (WIP)
   - `testing-mcp` - LLM-authored E2E tests

## MCP Testing Best Practices (2025)

Research into the MCP ecosystem reveals several emerging best practices:

### Recommended Testing Layers

1. **Unit Tests** - Test handlers in isolation (✅ Currently implemented)
2. **Contract Tests** - Validate Zod schemas and tool definitions (❌ Missing)
3. **Integration Tests** - Test full MCP server via client connection (❌ Missing)
4. **Transport Tests** - Validate stdio/HTTP transports (❌ Missing)
5. **Security Tests** - SQL injection, path traversal (⚠️ Partial via error-handling tests)

### Protocol Compliance Testing

Security research in 2025 has revealed vulnerabilities in MCP implementations, emphasizing the need for:
- JSON-RPC protocol compliance validation
- Input validation at protocol level (before handler execution)
- Error code standardization
- Message format validation

### CI/CD Integration

Best practice is to run automated MCP tests in GitHub Actions with:
- Real server process spawning
- Protocol-level validation
- Coverage reporting
- Security scanning

## Gap Analysis

### Critical Gaps

1. **Schema Validation Gap**
   - **Current:** Zod schemas defined but never validated in tests
   - **Risk:** Schema bugs only discovered at runtime
   - **Impact:** Invalid tool inputs could bypass validation

2. **Transport Layer Gap**
   - **Current:** No tests for `packages/app/src/server/local/stdio.ts` or `http.ts`
   - **Risk:** Transport-specific bugs (OAuth, streaming, errors) undetected
   - **Impact:** Production failures in stdio/HTTP communication

3. **MCP Protocol Gap**
   - **Current:** Tests bypass JSON-RPC message format entirely
   - **Risk:** Protocol-level bugs (error codes, message structure) undetected
   - **Impact:** Incompatibility with MCP clients

### Medium-Priority Gaps

4. **Tool Registration Gap**
   - **Current:** Annotations (readOnlyHint, destructiveHint, etc.) never tested
   - **Risk:** Incorrect tool metadata sent to clients
   - **Impact:** Poor UX in MCP clients (wrong permissions, misleading descriptions)

5. **Lambda Integration Gap**
   - **Current:** No tests for `packages/app/src/server/lambda/index.ts`
   - **Risk:** Lambda-specific code (caching, DynamoDB) untested
   - **Impact:** AWS deployment failures

### Existing Vitest Configuration

The project's `vitest.config.ts` already includes test paths that don't exist:
```typescript
include: [
  'tests/behavior/**/*.spec.ts',     // ✅ Exists
  'tests/contracts/**/*.spec.ts',    // ❌ Missing - Schema/contract tests
  'tests/http/**/*.spec.ts',         // ❌ Missing - HTTP transport tests
  'tests/unit/**/*.spec.ts',         // ✅ Exists
]
```

This suggests **prior planning** for expanded test coverage.

## Recommendations

### Option 1: Phased Implementation (Recommended)

Implement MCP protocol testing in phases while maintaining existing tests:

#### Phase 1: Contract Tests (Low Complexity, High Value)
**Location:** `packages/app/tests/contracts/`

Create a lightweight schema validator that:
- Instantiates `McpServer` without transport
- Registers all tools using real `registerTools()`
- Validates each tool's schema against MCP spec
- Tests tool registration metadata

**Benefits:**
- Catches schema bugs early
- Validates tool metadata
- Low implementation effort
- No transport/process spawning needed

**Example:**
```typescript
// tests/contracts/tool-schemas.spec.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '@/mcp/tool-registrations';
import { InMemoryVaultManager } from '@tests/support/doubles/in-memory-vault-manager.js';

describe('Tool schema contracts', () => {
  it('registers all tools with valid schemas', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const vault = new InMemoryVaultManager();

    // This will throw if any schema is invalid
    registerTools(server, () => vault);

    // Validate each tool's registration
    const tools = server.getToolDefinitions();
    expect(tools).toHaveLength(18);

    tools.forEach(tool => {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.annotations).toBeDefined();
    });
  });

  it('validates read-note input schema', () => {
    // Test that schema accepts valid input
    const validInput = { path: 'Notes/test.md' };
    expect(() => ReadNoteSchema.inputSchema.parse(validInput)).not.toThrow();

    // Test that schema rejects invalid input
    const invalidInput = { path: 123 };
    expect(() => ReadNoteSchema.inputSchema.parse(invalidInput)).toThrow();
  });
});
```

#### Phase 2: HTTP Integration Tests (Medium Complexity, High Value)
**Location:** `packages/app/tests/http/`

Use `supertest` (already a dev dependency) to test HTTP server:
- Start Express app without spawning process
- Test OAuth flow
- Test MCP endpoint with Bearer tokens
- Validate error responses

**Benefits:**
- Tests real HTTP transport
- Validates OAuth implementation
- No process spawning needed (in-memory)
- Existing dependency (`supertest`)

**Example:**
```typescript
// tests/http/oauth-flow.spec.ts
import request from 'supertest';
import express from 'express';
import { registerOAuthRoutes } from '@/server/shared/oauth-routes';

describe('OAuth 2.0 flow', () => {
  let app: express.Application;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    registerOAuthRoutes(app, {
      clientId: 'test-client',
      clientSecret: 'test-secret',
      baseUrl: 'http://localhost:3000'
    });
  });

  it('returns authorization code for valid credentials', async () => {
    const response = await request(app)
      .post('/oauth/authorize')
      .send({ username: 'test', password: 'token' })
      .expect(200);

    expect(response.body).toHaveProperty('code');
  });
});
```

#### Phase 3: Stdio Integration Tests (Higher Complexity, Medium Value)
**Location:** `packages/app/tests/integration/`

Use `StdioClientTransport` to spawn real server process:
- Build stdio server
- Spawn as child process
- Connect with MCP client
- Test full request/response cycle

**Benefits:**
- Tests real stdio transport
- Validates complete protocol stack
- Catches integration bugs

**Challenges:**
- Requires process spawning
- Slower than unit tests
- More complex setup/teardown

**Example:**
```typescript
// tests/integration/stdio-server.spec.ts
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

describe('Stdio server integration', () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: 'node',
      args: ['dist/stdio/index.js'],
      env: { /* test env vars */ }
    });

    client = new Client({
      name: 'test-client',
      version: '1.0.0'
    });

    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  it('lists all tools', async () => {
    const tools = await client.listTools();
    expect(tools.tools).toHaveLength(18);
  });

  it('calls read-note tool', async () => {
    const result = await client.callTool({
      name: 'read-note',
      arguments: { path: 'README.md' }
    });

    expect(result.content[0].type).toBe('text');
  });
});
```

#### Phase 4: Lambda Tests (Optional)
**Location:** `packages/app/tests/lambda/`

Test Lambda handler with mocked AWS context:
- Test cold start behavior
- Test cache management
- Test DynamoDB session storage

### Option 2: Custom Fake Server (Lower Priority)

Create a custom fake server that implements MCP protocol without transport:

**Pros:**
- More control over test environment
- Can simulate specific protocol edge cases
- No process spawning needed

**Cons:**
- Reinvents wheel (SDK already provides real server)
- Maintenance burden (must keep in sync with MCP spec)
- Doesn't test real SDK integration

**Verdict:** Not recommended unless specific edge cases require it.

### Option 3: Status Quo (Not Recommended)

Keep current testing approach without changes.

**Pros:**
- Zero implementation effort
- Tests remain fast

**Cons:**
- Schema bugs discovered only at runtime
- Transport layer completely untested
- Protocol compliance unknown
- Security vulnerabilities may go undetected

## Implementation Strategy

### Recommended Approach

Implement **Option 1 (Phased Implementation)** with the following priorities:

1. **Immediate (Phase 1):** Contract tests for schema validation
   - **Effort:** 1-2 days
   - **Value:** High (catches schema bugs early)
   - **Risk:** Low

2. **Short-term (Phase 2):** HTTP integration tests
   - **Effort:** 2-3 days
   - **Value:** High (validates OAuth + HTTP transport)
   - **Risk:** Low (uses existing `supertest`)

3. **Medium-term (Phase 3):** Stdio integration tests
   - **Effort:** 3-4 days
   - **Value:** Medium (validates complete stack)
   - **Risk:** Medium (process spawning complexity)

4. **Optional (Phase 4):** Lambda-specific tests
   - **Effort:** 2-3 days
   - **Value:** Medium (validates AWS deployment)
   - **Risk:** Low (can use mocked AWS SDK)

### Maintain Existing Tests

**Important:** Do NOT migrate or replace existing behavior tests. They provide:
- Fast feedback (186ms)
- Excellent handler coverage
- Easy debugging
- Clear failure messages

The new protocol-level tests **complement** rather than replace existing tests.

## Success Metrics

### Coverage Improvements

- **Schema coverage:** 100% of Zod schemas tested
- **Transport coverage:** Stdio and HTTP transports tested
- **Protocol coverage:** JSON-RPC compliance validated
- **Integration coverage:** End-to-end flows tested

### Quality Improvements

- **Earlier bug detection:** Schema bugs caught in CI, not production
- **Protocol compliance:** Validated against MCP spec
- **Transport reliability:** HTTP/stdio edge cases tested
- **Security:** Input validation tested at protocol level

### Performance

- **Unit tests:** Remain <300ms (current: 186ms)
- **Contract tests:** <500ms (schema validation only)
- **Integration tests:** <5s (process spawning overhead acceptable)
- **Total CI time:** <10s for full suite

## Conclusion

The current testing approach provides excellent handler coverage but has critical gaps in schema validation, transport testing, and protocol compliance. The MCP SDK provides no built-in testing utilities, but `StdioClientTransport` and standard testing tools (Vitest, supertest) are sufficient.

**Recommendation:** Implement Option 1 (Phased Implementation), starting with Phase 1 contract tests. This provides immediate value with minimal complexity, while establishing a foundation for more comprehensive integration testing in later phases.

The vitest config's existing placeholders for `contracts` and `http` test directories suggest this expansion was already anticipated, reducing organizational friction.

**Effort vs. Value Assessment:**
- Phase 1 (Contracts): ⭐⭐⭐⭐⭐ (High value, low effort)
- Phase 2 (HTTP): ⭐⭐⭐⭐ (High value, medium effort)
- Phase 3 (Stdio): ⭐⭐⭐ (Medium value, medium effort)
- Phase 4 (Lambda): ⭐⭐ (Medium value, medium effort)

This phased approach allows incremental improvement without disrupting the existing well-functioning test suite.

## References

- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
- MCP Inspector: https://github.com/modelcontextprotocol/inspector
- MCP Testing Framework: https://github.com/haakco/mcp-testing-framework
- Current ToolHarness: `packages/app/tests/support/harness/tool-harness.ts`
- Vitest Config: `packages/app/vitest.config.ts`

---

**Review Date:** 2025-11-10
**Issue:** #8 - Improve tool harness testing with fake MCP server
**Reviewer:** Claude (Sonnet 4.5)
**Status:** Investigation Complete, Implementation Recommended
