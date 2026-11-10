/* Sổ Dấu Trang — kho của bản tiện ích: chrome.storage.local. */
(function (root) {
  'use strict';
  const backend = {
    get: keys => chrome.storage.local.get(keys),
    set: obj => chrome.storage.local.set(obj),
    remove: keys => chrome.storage.local.remove(keys),
    getAll: () => chrome.storage.local.get(null),
    // Khóa ghi chung cho popup, trình quản lý, các tab (cùng nguồn gốc tiện ích).
    lock(fn) { return (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) ? navigator.locks.request('sdt-write', fn) : fn(); },
    subscribe(fn) { chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local') fn(changes); }); },
  };
  root.SDTStore = root.SDTStorage.makeStore(backend);
})(typeof globalThis !== 'undefined' ? globalThis : this);
