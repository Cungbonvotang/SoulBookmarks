/* Sổ Dấu Trang — nền: cập nhật biểu tượng/huy hiệu theo trang đang mở.
   Chỉ đọc bảng tra nhỏ (sdt_i_*) của đúng địa chỉ, không đọc toàn bộ dữ liệu. */
importScripts('core.js', 'storage.js', 'store.js');

const ICON_ON = { 16: 'icons/on-16.png', 32: 'icons/on-32.png', 48: 'icons/on-48.png', 128: 'icons/on-128.png' };
const ICON_OFF = { 16: 'icons/off-16.png', 32: 'icons/off-32.png', 48: 'icons/off-48.png', 128: 'icons/off-128.png' };
const bucketCache = new Map();   // khóa bảng tra → nội dung
let ensured = null;

async function isSaved(url) {
  if (!ensured) ensured = SDTStore.ensure();
  const e = await ensured;
  if (!e.ok || !e.meta) { ensured = null; return false; }
  const key = SDT.normalizeUrl(url);
  const bk = SDTStorage.bucketKey(SDTStorage.bucketOf(key));
  let m = bucketCache.get(bk);
  if (!m) {
    const r = await chrome.storage.local.get(bk);
    m = r[bk] || {};
    bucketCache.set(bk, m);
  }
  return Array.isArray(m[key]) && m[key].length > 0;
}

async function refreshTab(tab) {
  if (!tab || tab.id == null || tab.id < 0) return;
  const url = tab.pendingUrl || tab.url || '';
  let saved = false;
  try { if (SDT.isSavableUrl(url)) saved = await isSaved(url); } catch (e) { saved = false; }
  try {
    await chrome.action.setBadgeText({ tabId: tab.id, text: saved ? '✓' : '' });
    if (saved) await chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#E5484D' });
    if (chrome.action.setBadgeTextColor && saved) await chrome.action.setBadgeTextColor({ tabId: tab.id, color: '#FFFFFF' });
    await chrome.action.setIcon({ tabId: tab.id, path: saved ? ICON_ON : ICON_OFF });
    await chrome.action.setTitle({ tabId: tab.id, title: saved ? 'Sổ Dấu Trang: trang này đã lưu' : 'Sổ Dấu Trang: trang này chưa lưu' });
  } catch (e) {
    // Tab đã đóng hoặc trình duyệt không hỗ trợ một hàm nào đó: bỏ qua.
  }
}

async function refreshAll() {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(tabs.map(refreshTab));
  } catch (e) { /* bỏ qua */ }
}

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (info.url || info.status === 'complete' || info.status === 'loading') refreshTab(tab);
});
chrome.tabs.onActivated.addListener(({ tabId }) => { chrome.tabs.get(tabId).then(refreshTab).catch(() => {}); });
if (chrome.tabs.onReplaced) chrome.tabs.onReplaced.addListener(addedId => { chrome.tabs.get(addedId).then(refreshTab).catch(() => {}); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  let touched = false;
  for (const k of Object.keys(changes)) {
    if (k.startsWith('sdt_i_')) { bucketCache.delete(k); touched = true; }
    if (k === 'sdt_meta' || k === 'sdt_data') { ensured = null; touched = true; }
  }
  if (touched) { if (changes.sdt_meta && !changes.sdt_meta.newValue) bucketCache.clear(); refreshAll(); }
});
chrome.runtime.onInstalled.addListener(() => { ensured = null; bucketCache.clear(); refreshAll(); });
chrome.runtime.onStartup.addListener(refreshAll);
refreshAll();
