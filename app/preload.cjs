const {contextBridge,ipcRenderer}=require('electron');
const api={};for(const name of ['state','save','import','newTopic','attach','exportPackage','backup','restore','prompt','deletePackage'])api[name]=async(...args)=>{const r=await ipcRenderer.invoke(name,...args);if(!r.ok)throw Error(r.error);return r.data;};contextBridge.exposeInMainWorld('academy',api);
