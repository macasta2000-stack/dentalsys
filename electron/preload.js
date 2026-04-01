// Preload script — puente seguro entre Electron y la web app
// Se ejecuta en el contexto de la página antes que el JS de la app
const { contextBridge, ipcRenderer } = require('electron')

// Exponer APIs seguras a la web app
contextBridge.exposeInMainWorld('electronAPI', {
  // Información del entorno
  isElectron: true,
  platform: process.platform,
  version: process.env.npm_package_version ?? '1.0.0',
})
