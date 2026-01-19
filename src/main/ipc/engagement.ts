import { IpcMain } from 'electron';
import { engagementService } from '../services/engagement.service';

export function setupEngagementHandlers(ipcMain: IpcMain) {
    ipcMain.handle('engagement:log', async (_event, { accessToken, log }) => {
        return await engagementService.logEngagement(accessToken, log);
    });

    ipcMain.handle('engagement:get-logs', async (_event, { accessToken, limit, target_username }) => {
        return await engagementService.getEngagementLogs(accessToken, { limit, target_username });
    });

    ipcMain.handle('engagement:get-stats', async (_event, { accessToken }) => {
        return await engagementService.getEngagementStats(accessToken);
    });

    ipcMain.handle('engagement:export-csv', async (_event, { accessToken }) => {
        return await engagementService.exportToCSV(accessToken);
    });
}
