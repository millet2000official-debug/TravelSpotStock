const STORAGE_KEY = "spotstock-v1";
const DEFAULT_CATEGORIES = ["すべて", "飲食店", "カフェ", "雑貨・ショッピング", "観光", "自然・公園", "宿泊", "その他"];

let spots = loadSpots();
let activeCategory = "すべて";
let currentPosition = null;
let toastTimer;

const $ = (id) => document.getElementById(id);
const els = {
  list: $("spotList"), filters: $("categoryFilters"), search: $("searchInput"),
  sort: $("sortSelect"), count: $("resultCount"), status: $("locationStatus"),
  dialog: $("spotDialog"), form: $("spotForm"), importInput: $("importInput"),
  toast: $("toast")
};

function loadSpots() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    return [];
  }
}
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spots));
}
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove("show"), 2600);
}
function getCategories() {
  const found = new Set(DEFAULT_CATEGORIES.slice(1));
  spots.forEach(s => (s.categories || [s.category || "その他"]).forEach(c => found.add(c)));
  return ["すべて", ...found];
}
function renderFilters() {
  els.filters.innerHTML = getCategories().map(cat =>
    `<button class="chip ${activeCategory === cat ? "active" : ""}" data-category="${escapeHTML(cat)}">${escapeHTML(cat)}</button>`
  ).join("");
}
function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = n => n * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(dLon/2)**2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}
function getSpotCategories(spot) { return spot.categories || [spot.category || "その他"]; }
function filteredSpots() {
  const q = els.search.value.trim().toLowerCase();
  let result = spots.filter(s => {
    const categories = getSpotCategories(s);
    const categoryMatch = activeCategory === "すべて" || categories.includes(activeCategory);
    const haystack = [s.name, s.address, s.phone, s.station, s.memo, ...categories].join(" ").toLowerCase();
    return categoryMatch && haystack.includes(q);
  });
  if (els.sort.value === "name") result.sort((a,b) => a.name.localeCompare(b.name, "ja"));
  if (els.sort.value === "category") result.sort((a,b) => getSpotCategories(a)[0].localeCompare(getSpotCategories(b)[0], "ja"));
  if (els.sort.value === "distance" && currentPosition) {
    result.sort((a,b) => {
      const da = Number.isFinite(a.lat) && Number.isFinite(a.lng) ? distanceKm(currentPosition.lat, currentPosition.lng, a.lat, a.lng) : Infinity;
      const db = Number.isFinite(b.lat) && Number.isFinite(b.lng) ? distanceKm(currentPosition.lat, currentPosition.lng, b.lat, b.lng) : Infinity;
      return da - db;
    });
  }
  return result;
}
function distanceLabel(spot) {
  if (!currentPosition || !Number.isFinite(spot.lat) || !Number.isFinite(spot.lng)) return "";
  const km = distanceKm(currentPosition.lat, currentPosition.lng, spot.lat, spot.lng);
  return km < 1 ? `${Math.round(km*1000)} m` : `${km.toFixed(1)} km`;
}
function render() {
  renderFilters();
  const visible = filteredSpots();
  els.count.textContent = visible.length;
  if (!visible.length) {
    els.list.innerHTML = `<div class="empty">${spots.length ? "条件に合うスポットがありません。" : "まだスポットがありません。<br>「＋ スポット追加」から登録しましょう。"}</div>`;
    return;
  }
  els.list.innerHTML = visible.map(s => {
    const cats = getSpotCategories(s).map(escapeHTML).join(" · ");
    const dist = distanceLabel(s);
    const mapLink = s.mapUrl || (s.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([s.name,s.address].join(" "))}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.name)}`);
    return `<article class="spot-card">
      <div class="card-top"><div><span class="category-tag">${cats}</span><h3 class="spot-name">${escapeHTML(s.name)}</h3></div><span class="distance">${dist}</span></div>
      ${s.address ? `<p class="spot-info">⌖ ${escapeHTML(s.address)}</p>` : ""}
      ${s.phone ? `<p class="spot-info">☎ ${escapeHTML(s.phone)}</p>` : ""}
      ${s.station ? `<p class="spot-info">🚉 ${escapeHTML(s.station)}</p>` : ""}
      ${s.memo ? `<div class="spot-memo">${escapeHTML(s.memo)}</div>` : ""}
      <div class="card-actions"><a href="${escapeHTML(mapLink)}" target="_blank" rel="noopener noreferrer">Google Maps ↗</a><button data-edit="${escapeHTML(s.id)}">編集</button></div>
    </article>`;
  }).join("");
}
function openForm(spot = null) {
  els.form.reset();
  $("spotId").value = spot?.id || "";
  $("dialogTitle").textContent = spot ? "スポットを編集" : "スポットを追加";
  $("nameInput").value = spot?.name || "";
  $("categoryInput").value = getSpotCategories(spot || {})[0] || "その他";
  $("mapUrlInput").value = spot?.mapUrl || "";
  $("addressInput").value = spot?.address || "";
  $("phoneInput").value = spot?.phone || "";
  $("stationInput").value = spot?.station || "";
  $("latInput").value = Number.isFinite(spot?.lat) ? spot.lat : "";
  $("lngInput").value = Number.isFinite(spot?.lng) ? spot.lng : "";
  $("memoInput").value = spot?.memo || "";
  $("deleteBtn").classList.toggle("hidden", !spot);
  els.dialog.showModal();
}
function closeForm() { els.dialog.close(); }

$("addBtn").addEventListener("click", () => openForm());
$("closeDialogBtn").addEventListener("click", closeForm);
$("cancelBtn").addEventListener("click", closeForm);
els.filters.addEventListener("click", e => {
  const btn = e.target.closest("[data-category]");
  if (!btn) return;
  activeCategory = btn.dataset.category;
  render();
});
els.list.addEventListener("click", e => {
  const btn = e.target.closest("[data-edit]");
  if (!btn) return;
  const spot = spots.find(s => String(s.id) === btn.dataset.edit);
  if (spot) openForm(spot);
});
els.search.addEventListener("input", render);
els.sort.addEventListener("change", () => {
  if (els.sort.value === "distance" && !currentPosition) getCurrentLocation();
  render();
});
$("locationBtn").addEventListener("click", getCurrentLocation);

function getCurrentLocation() {
  if (!navigator.geolocation) {
    els.status.textContent = "このブラウザでは位置情報を利用できません。";
    return;
  }
  els.status.textContent = "現在地を取得しています…";
  navigator.geolocation.getCurrentPosition(
    pos => {
      currentPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      els.status.textContent = "現在地を取得しました。距離は直線距離です。";
      els.sort.value = "distance";
      render();
    },
    err => {
      els.status.textContent = "位置情報を取得できませんでした。ブラウザの位置情報許可を確認してください。";
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
  );
}

els.form.addEventListener("submit", e => {
  e.preventDefault();
  const id = $("spotId").value || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  const existing = spots.find(s => String(s.id) === String(id));
  const record = {
    id, name: $("nameInput").value.trim(),
    categories: [$("categoryInput").value],
    mapUrl: $("mapUrlInput").value.trim(),
    address: $("addressInput").value.trim(),
    phone: $("phoneInput").value.trim(),
    station: $("stationInput").value.trim(),
    memo: $("memoInput").value.trim(),
    lat: $("latInput").value.trim() === "" ? null : Number($("latInput").value),
    lng: $("lngInput").value.trim() === "" ? null : Number($("lngInput").value)
  };
  if (!record.name) return;
  if (existing) spots = spots.map(s => String(s.id) === String(id) ? record : s);
  else spots.unshift(record);
  persist(); closeForm(); render(); showToast(existing ? "スポットを更新しました" : "スポットを追加しました");
});
$("deleteBtn").addEventListener("click", () => {
  const id = $("spotId").value;
  if (!id || !confirm("このスポットを削除しますか？")) return;
  spots = spots.filter(s => String(s.id) !== String(id));
  persist(); closeForm(); render(); showToast("スポットを削除しました");
});
$("exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(spots, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "spotstock-backup.json"; a.click();
  URL.revokeObjectURL(url);
});
els.importInput.addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed) || !parsed.every(s => s && typeof s.name === "string")) throw new Error("invalid");
    if (!confirm(`${parsed.length}件のスポットを読み込みます。現在のデータを置き換えますか？`)) return;
    spots = parsed; persist(); render(); showToast("JSONを読み込みました");
  } catch {
    alert("読み込めるスポットJSONではありません。");
  } finally {
    e.target.value = "";
  }
});

// Google Maps URLから場所名らしき文字列だけを補助的に抽出する。
// Googleの情報を取得する処理ではないため、住所・電話番号等は自動取得しない。
$("mapUrlInput").addEventListener("change", () => {
  const urlText = $("mapUrlInput").value.trim();
  if (!$("nameInput").value.trim() && urlText) {
    try {
      const url = new URL(urlText);
      const match = url.pathname.match(/\/place\/([^/]+)/);
      if (match) $("nameInput").value = decodeURIComponent(match[1].replace(/\+/g, " "));
    } catch {}
  }
});

render();
