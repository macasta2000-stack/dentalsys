// ============================================================
// Clingest — App de escritorio (Electron)
// Envuelve la web app en una ventana nativa de Windows/Mac
// ============================================================
const { app, BrowserWindow, Menu, shell, ipcMain, Notification } = require('electron')
const path = require('path')

// URL de producción de la app web
const APP_URL = 'https://clingest.app'

let mainWindow

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'Clingest',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // Permite que la web app guarde datos localmente
      partition: 'persist:dentalsys',
    },
    // Mostrar la ventana recién cuando cargue (evita flash blanco)
    show: false,
    backgroundColor: '#0f172a',
  })

  // Cargar la app web
  mainWindow.loadURL(APP_URL)

  // Mostrar cuando termine de cargar
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  // Si la carga falla (sin internet), mostrar página de error local
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    if (errorCode === -106) { // ERR_INTERNET_DISCONNECTED
      mainWindow.loadFile(path.join(__dirname, 'offline.html'))
    }
  })

  // Abrir links externos en el navegador, no en Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ── Menú de la app ──────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'Clingest',
      submenu: [
        {
          label: 'Inicio',
          click: () => mainWindow?.loadURL(APP_URL)
        },
        {
          label: 'Recargar',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.reload()
        },
        { type: 'separator' },
        {
          label: 'Salir',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        {
          label: 'Pantalla completa',
          accelerator: 'F11',
          click: () => mainWindow?.setFullScreen(!mainWindow.isFullScreen())
        },
        {
          label: 'Zoom +',
          accelerator: 'CmdOrCtrl+=',
          click: () => {
            const zoom = mainWindow?.webContents.getZoomFactor() ?? 1
            mainWindow?.webContents.setZoomFactor(Math.min(zoom + 0.1, 2))
          }
        },
        {
          label: 'Zoom -',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            const zoom = mainWindow?.webContents.getZoomFactor() ?? 1
            mainWindow?.webContents.setZoomFactor(Math.max(zoom - 0.1, 0.5))
          }
        },
        {
          label: 'Zoom normal',
          accelerator: 'CmdOrCtrl+0',
          click: () => mainWindow?.webContents.setZoomFactor(1)
        },
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Abrir en navegador',
          click: () => shell.openExternal(APP_URL)
        },
        {
          label: 'Versión',
          click: () => {
            const { dialog } = require('electron')
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Clingest',
              message: 'Clingest - Gestión Médica',
              detail: `Versión: ${app.getVersion()}\nElectron: ${process.versions.electron}\nNode: ${process.versions.node}`,
              icon: path.join(__dirname, 'icon.png'),
            })
          }
        }
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

// ── Eventos del ciclo de vida ──────────────────────────────
app.whenReady().then(() => {
  buildMenu()
  createWindow()

  // macOS: re-crear ventana al hacer click en el dock
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Cerrar la app cuando se cierran todas las ventanas (excepto macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Prevenir múltiples instancias
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}
