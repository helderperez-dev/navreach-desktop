import { app, Menu, shell, BrowserWindow, MenuItemConstructorOptions } from 'electron';

export function setupMenu(mainWindow: BrowserWindow): void {
    const isMac = process.platform === 'darwin';

    const template: MenuItemConstructorOptions[] = [
        ...(isMac
            ? ([
                {
                    label: app.name,
                    submenu: [
                        { role: 'about' },
                        { type: 'separator' },
                        { role: 'services' },
                        { type: 'separator' },
                        { role: 'hide' },
                        { role: 'hideOthers' },
                        { role: 'unhide' },
                        { type: 'separator' },
                        { role: 'quit' }
                    ]
                }
            ] as MenuItemConstructorOptions[])
            : []),
        {
            label: 'File',
            submenu: [
                {
                    label: 'New AI Chat',
                    accelerator: 'CmdOrCtrl+N',
                    click: (): void => {
                        mainWindow.webContents.send('menu:action', 'new-chat');
                    }
                },
                { type: 'separator' },
                isMac ? { role: 'close' } : { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Go',
            submenu: [
                {
                    label: 'Browser',
                    accelerator: 'CmdOrCtrl+1',
                    click: (): void => {
                        mainWindow.webContents.send('menu:action', 'go-browser');
                    }
                },
                {
                    label: 'Playbooks',
                    accelerator: 'CmdOrCtrl+2',
                    click: (): void => {
                        mainWindow.webContents.send('menu:action', 'go-playbooks');
                    }
                },
                {
                    label: 'Targets',
                    accelerator: 'CmdOrCtrl+3',
                    click: (): void => {
                        mainWindow.webContents.send('menu:action', 'go-targets');
                    }
                },
                {
                    label: 'Settings',
                    accelerator: 'CmdOrCtrl+,',
                    click: (): void => {
                        mainWindow.webContents.send('menu:action', 'go-settings');
                    }
                }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac
                    ? [{ type: 'separator' }, { role: 'front' }, { type: 'separator' }, { role: 'window' }]
                    : [{ role: 'close' }])
            ] as MenuItemConstructorOptions[]
        },
        {
            role: 'help',
            submenu: [
                {
                    label: 'Learn More',
                    click: async (): Promise<void> => {
                        await shell.openExternal('https://reavion.ai');
                    }
                }
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}
