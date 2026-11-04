/* Sổ Dấu Trang — kho của bản tiện ích: chrome.storage.local. */
(function (root) {
  'use strict';
  const backend = {
    get: keys => chrome.storage.local.get(keys),
    set: obj => chrome.storage.local.set(obj),
    remove: keys => chrome.storage.local.remove(keys),
    getAll: () => chrome.storage.local.get(null),
    subscribe(fn) { chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local') fn(changes); }); },
  };
  root.SDTStore = root.SDTStorage.makeStore(backend);
})(typeof globalThis !== 'undefined' ? globalThis : this);
