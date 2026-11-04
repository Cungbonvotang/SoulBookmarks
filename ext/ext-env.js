/* Sổ Dấu Trang — môi trường của bản tiện ích (chrome.*). */
(function (root) {
  'use strict';

  const store = root.SDTStore;

  const prefs = {
    get(k) { try { return localStorage.getItem('sdt_' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('sdt_' + k, v); } catch (e) { /* bỏ qua */ } },
  };

  // Tab mà popup đang nói tới: ?tabId=… (dùng khi thử) hoặc tab đang hiện.
  async function getTarget() {
    const params = new URLSearchParams(location.search);
    const id = Number(params.get('tabId'));
    if (id) { try { return await chrome.tabs.get(id); } catch (e) { /* rơi xuống dưới */ } }
    const own = chrome.runtime.getURL('');
    let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    let t = tabs.find(x => !(x.url || '').startsWith(own));
    if (t) return t;
    tabs = await chrome.tabs.query({ active: true });
    t = tabs.find(x => !(x.url || '').startsWith(own));
    return t || tabs[0] || null;
  }

  function openManager() {
    chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
    window.close();
  }

  root.SDTExtEnv = { store, prefs, getTarget, openManager };
})(typeof globalThis !== 'undefined' ? globalThis : this);
