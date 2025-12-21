import { IpcMain } from 'electron';
import { mcpService } from '../services/mcp';

export function setupMCPHandlers(ipcMain: IpcMain): void {
  ipcMain.handle('mcp:connect', async (_event, serverId: string) => {
    try {
      await mcpService.connect(serverId);
      return { success: true };
    } catch (error) {
      return { success: false, reason: String(error) };
    }
  });

  ipcMain.handle('mcp:disconnect', async (_event, serverId: string) => {
    try {
      await mcpService.disconnect(serverId);
      return { success: true };
    } catch (error) {
      return { success: false, reason: String(error) };
    }
  });

  ipcMain.handle('mcp:list-tools', async (_event, serverId: string) => {
    try {
      const tools = await mcpService.listTools(serverId);
      return { success: true, tools };
    } catch (error) {
      return { success: false, reason: String(error) };
    }
  });

  ipcMain.handle('mcp:call-tool', async (_event, serverId: string, toolName: string, args: Record<string, unknown>) => {
    try {
      const result = await mcpService.callTool(serverId, toolName, args);
      return { success: true, result };
    } catch (error) {
      return { success: false, reason: String(error) };
    }
  });

  ipcMain.handle('mcp:get-status', async (_event, serverId: string) => {
    return { status: mcpService.getStatus(serverId) };
  });

  ipcMain.handle('mcp:get-all-statuses', async () => {
    return mcpService.getAllStatuses();
  });
}
