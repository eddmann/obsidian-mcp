/**
 * Shared MCP Server Instructions
 *
 * Instructions provided to LLM clients on how to effectively use the server.
 */

export const MCP_SERVER_INSTRUCTIONS = `This server provides access to an Obsidian vault with tools for managing notes, tags, and directories.

**IMPORTANT: Journal Logging**
After completing tasks or meaningful work, use the 'log-journal-entry' tool to automatically document the activity in the user's daily journal. This helps maintain a record of:
- Work completed and decisions made
- Key insights and learnings from conversations
- Project updates and progress
- Code changes and technical discussions

Use journal logging proactively throughout conversations, not just at the end. It's a valuable feature for the user to track their work and thoughts over time.`;
