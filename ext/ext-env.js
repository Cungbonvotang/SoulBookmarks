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
    // Chỉ lấy tab của cửa sổ đang dùng; đang ở trang của tiện ích (trình quản lý) thì báo "không lưu được" thay vì lấy nhầm cửa sổ khác.
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }
  // Trình quản lý nhớ cách sắp xếp, chỗ đang xem, vị trí cuộn (bộ nhớ riêng của tiện ích, không nằm trong dữ liệu dấu trang).
  const mgrState = {
    load() { try { return JSON.parse(localStorage.getItem('sdt_mgr') || 'null'); } catch (e) { return null; } },
    save(o) { try { localStorage.setItem('sdt_mgr', JSON.stringify(o)); } catch (e) { /* bỏ qua */ } },
  };

  function openManager() {
    chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
    window.close();
  }

  root.SDTExtEnv = { store, prefs, getTarget, openManager, mgrState };
})(typeof globalThis !== 'undefined' ? globalThis : this);
