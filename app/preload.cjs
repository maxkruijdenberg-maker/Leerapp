const { contextBridge, ipcRenderer } = require('electron');

const api = {};
for (const name of [
  'state', 'save', 'import', 'newModule', 'renameModule', 'deleteModule',
  'newTopic', 'updateTopic', 'deleteTopic', 'newSubtopic', 'updateSubtopic', 'deleteSubtopic', 'moveSubtopic', 'attach', 'removeAttachment', 'windowControl',
  'exportPackage', 'backup', 'restore', 'prompt', 'deletePackage'
]) {
  api[name] = async (...args) => {
    const result = await ipcRenderer.invoke(name, ...args);
    if (!result.ok) throw Error(result.error);
    return result.data;
  };
}
contextBridge.exposeInMainWorld('academy', api);
