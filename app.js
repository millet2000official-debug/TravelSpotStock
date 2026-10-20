// Spotstockのスポット一覧・カテゴリー・画面操作を管理するJavaScript。
// HTMLは構造、CSSは見た目、このファイルはデータと動作を担当する。

// localStorageに保存するキー。既存データを引き継ぐため、キー名は変更しない。
const STORAGE_KEY = "spotstock-v1";

// カテゴリー一覧をスポットデータとは別に保存する。
const CATEGORY_STORAGE_KEY = "spotstock-categories-v1";

// 初回起動時に表示するカテゴリー。
const DEFAULT_CATEGORIES = [
  "飲食店",
  "カフェ",
  "雑貨・ショッピング",
  "観光",
  "自然・公園",
  "宿泊",
  "その他"
];

// 起動時にブラウザ保存データを読み込む。
let spots = loadSpots();
let categories = loadCategories();

// 選択中のカテゴリーとトースト表示タイマー。
let activeCategory = "すべて";
let toastTimer;

// HTML要素をIDから取得するためのヘルパー関数。
const $ = (id) => document.getElementById(id);

// JavaScriptから使用するHTML要素をまとめて管理する。
const els = {
  list: $("spotList"),
  categorySelect: $("categorySelect"),
  search: $("searchInput"),
  count: $("resultCount"),
  dialog: $("spotDialog"),
  form: $("spotForm"),
  importInput: $("importInput"),
  toast: $("toast"),
  categoryDialog: $("categoryDialog")
};

// 保存済みのスポットデータを読み込む。
function loadSpots() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("スポットデータを読み込めませんでした。", error);
    return [];
  }
}

// 保存済みのカテゴリー一覧を読み込む。
function loadCategories() {
  try {
    const stored = localStorage.getItem(CATEGORY_STORAGE_KEY);
    return stored ? JSON.parse(stored) : [...DEFAULT_CATEGORIES];
  } catch (error) {
    console.error("カテゴリーを読み込めませんでした。", error);
    return [...DEFAULT_CATEGORIES];
  }
}

// スポットデータをブラウザ内に保存する。
function persistSpots() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(spots));
}

// カテゴリー一覧をブラウザ内に保存する。
function persistCategories() {
  localStorage.setItem(CATEGORY_STORAGE_KEY, JSON.stringify(categories));
}

// ユーザー入力を安全にHTML表示できる文字列に変換する。
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[ch]));
}

// 画面下部に操作結果を一時表示する。
function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    els.toast.classList.remove("show");
  }, 2600);
}

// 利用可能なカテゴリー一覧を取得する。
// 「すべて」は絞り込み専用の選択肢として扱う。
function getAllCategories() {
  const found = new Set(categories);

  // スポット側にしか存在しないカテゴリーも補完する。
  spots.forEach(spot => {
    getSpotCategories(spot).forEach(category => found.add(category));
  });

  categories = [...found].filter(
    category => category && category !== "すべて"
  );

  return ["すべて", ...categories];
}

// 古いデータ形式のcategoryと、新しいcategories配列の両方に対応する。
function getSpotCategories(spot) {
  if (Array.isArray(spot.categories) && spot.categories.length) {
    return spot.categories;
  }

  return [spot.category || "その他"];
}

// カテゴリー選択用プルダウンを更新する。
function renderFilters() {
  const allCategories = getAllCategories();
  const select = els.categorySelect;

  // 現在選択中のカテゴリーを保持する。
  const previousValue = activeCategory;

  // 各カテゴリーとカテゴリー編集用の選択肢を作成する。
  const options = [
    ...allCategories.map(category =>
      `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
    ),
    `<option value="__edit_categories__">⚙ カテゴリーを編集…</option>`
  ];

  select.innerHTML = options.join("");

  // 選択中のカテゴリーが削除されていたら「すべて」に戻す。
  activeCategory = allCategories.includes(previousValue)
    ? previousValue
    : "すべて";

  select.value = activeCategory;
}

// スポットを検索語とカテゴリーで絞り込む。
// 並び替え機能は削除し、登録順を維持する。
function filteredSpots() {
  const query = els.search.value.trim().toLowerCase();

  return spots.filter(spot => {
    const spotCategories = getSpotCategories(spot);

    // 選択カテゴリーに一致するか確認する。
    const categoryMatch =
      activeCategory === "すべて" ||
      spotCategories.includes(activeCategory);

    // スポットの各情報を検索対象にする。
    const haystack = [
      spot.name,
      spot.address,
      spot.phone,
      spot.station,
      spot.memo,
      ...spotCategories
    ].join(" ").toLowerCase();

    return categoryMatch && haystack.includes(query);
  });
}

// スポット一覧を画面に描画する。
function render() {
  // カテゴリーの選択肢を最新状態に更新する。
  renderFilters();

  const visibleSpots = filteredSpots();

  // 表示件数を更新する。
  els.count.textContent = visibleSpots.length;

  // 表示対象がない場合のメッセージ。
  if (!visibleSpots.length) {
    els.list.innerHTML = `
      <div class="empty">
        ${
          spots.length
            ? "条件に合うスポットがありません。"
            : "まだスポットがありません。<br>「＋ スポット追加」から登録しましょう。"
        }
      </div>
    `;
    return;
  }

  // スポットごとのカードを生成する。
  els.list.innerHTML = visibleSpots.map(spot => {
    const categoryText = getSpotCategories(spot)
      .map(escapeHTML)
      .join(" · ");

    // Google MapsのURLがなければ、スポット名から検索URLを生成する。
    const mapLink = spot.mapUrl ||
      `https://www.google.com/maps/search/?api=1&query=${
        encodeURIComponent(
          [spot.name, spot.address].filter(Boolean).join(" ")
        )
      }`;

    return `
      <article class="spot-card">
        <div class="card-visual" aria-hidden="true">🗺️</div>

        <div class="card-content">
          <div class="card-top">
            <div>
              <span class="category-tag">${categoryText}</span>
              <h3 class="spot-name">${escapeHTML(spot.name)}</h3>
            </div>
          </div>

          ${
            spot.address
              ? `<p class="spot-info">${escapeHTML(spot.address)}</p>`
              : ""
          }

          ${
            spot.phone
              ? `<p class="spot-info">☎ ${escapeHTML(spot.phone)}</p>`
              : ""
          }

          ${
            spot.station
              ? `<p class="spot-info">🚉 ${escapeHTML(spot.station)}</p>`
              : ""
          }

          ${
            spot.memo
              ? `<div class="spot-memo">${escapeHTML(spot.memo)}</div>`
              : ""
          }

          <div class="card-actions">
            <a
              href="${escapeHTML(mapLink)}"
              target="_blank"
              rel="noopener noreferrer"
            >Google Maps ↗</a>

            <button
              type="button"
              data-edit="${escapeHTML(spot.id)}"
            >編集</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

// スポットの追加・編集フォームにカテゴリーを設定する。
function renderCategorySelect(selected = "") {
  const available = getAllCategories().filter(
    category => category !== "すべて"
  );

  if (!available.length) {
    available.push("その他");
  }

  $("categoryInput").innerHTML = available.map(category =>
    `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`
  ).join("");

  $("categoryInput").value = available.includes(selected)
    ? selected
    : available[0];
}

// スポット追加・編集ダイアログを開く。
function openForm(spot = null) {
  els.form.reset();

  $("spotId").value = spot?.id || "";
  $("dialogTitle").textContent = spot
    ? "スポットを編集"
    : "スポットを追加";

  $("nameInput").value = spot?.name || "";

  renderCategorySelect(
    getSpotCategories(spot || {})[0] || "その他"
  );

  $("mapUrlInput").value = spot?.mapUrl || "";
  $("addressInput").value = spot?.address || "";
  $("phoneInput").value = spot?.phone || "";
  $("stationInput").value = spot?.station || "";
  $("memoInput").value = spot?.memo || "";

  // 新規追加時は削除ボタンを隠す。
  $("deleteBtn").classList.toggle("hidden", !spot);

  els.dialog.showModal();
}

// スポット入力ダイアログを閉じる。
function closeForm() {
  els.dialog.close();
}

// カテゴリー管理ダイアログを開く。
function openCategoryManager() {
  renderCategoryManager();
  els.categoryDialog.showModal();
}

// カテゴリー管理一覧を描画する。
function renderCategoryManager() {
  $("categoryManagerList").innerHTML = categories.map(
    (category, index) => `
      <div class="category-manager-item">
        <span class="category-manager-name">
          ${escapeHTML(category)}
        </span>

        <button
          type="button"
          data-rename-category="${index}"
        >名前変更</button>

        <button
          type="button"
          class="category-delete"
          data-delete-category="${index}"
        >削除</button>
      </div>
    `
  ).join("");
}

// 新しいカテゴリーを追加する。
function addCategory() {
  const input = $("newCategoryInput");
  const name = input.value.trim();

  if (!name) {
    showToast("カテゴリー名を入力してください");
    return;
  }

  if (name === "すべて" || categories.includes(name)) {
    showToast("そのカテゴリー名は使用できません");
    return;
  }

  categories.push(name);

  persistCategories();

  input.value = "";

  renderCategoryManager();
  render();

  showToast("カテゴリーを追加しました");
}

// カテゴリー名を変更し、各スポットのカテゴリーも更新する。
function renameCategory(index) {
  const oldName = categories[index];

  if (!oldName) return;

  const newName = prompt(
    "新しいカテゴリー名を入力してください",
    oldName
  );

  if (newName === null) return;

  const trimmedName = newName.trim();

  if (!trimmedName || trimmedName === "すべて") {
    showToast("そのカテゴリー名は使用できません");
    return;
  }

  if (
    trimmedName !== oldName &&
    categories.includes(trimmedName)
  ) {
    showToast("同じ名前のカテゴリーがすでにあります");
    return;
  }

  categories[index] = trimmedName;

  // 各スポットに保存されているカテゴリー名も変更する。
  spots = spots.map(spot => {
    const updatedCategories = getSpotCategories(spot).map(
      category =>
        category === oldName ? trimmedName : category
    );

    return {
      ...spot,
      categories: updatedCategories,
      category: undefined
    };
  });

  // 選択中のカテゴリーが変更された場合は新しい名前にする。
  if (activeCategory === oldName) {
    activeCategory = trimmedName;
  }

  persistCategories();
  persistSpots();

  renderCategoryManager();
  render();

  showToast("カテゴリー名を変更しました");
}

// カテゴリーを削除し、使用中のスポットからも取り除く。
function deleteCategory(index) {
  const category = categories[index];

  if (!category) return;

  if (!confirm(
    `「${category}」を削除しますか？\nこのカテゴリーを使っているスポットからも外れます。`
  )) {
    return;
  }

  categories.splice(index, 1);

  spots = spots.map(spot => {
    let updatedCategories = getSpotCategories(spot)
      .filter(item => item !== category);
    // カテゴリーがなくなったスポットは「その他」に割り当てる。
    if (!updatedCategories.length) {
      if (!categories.includes("その他")) {
        categories.push("その他");
      }
      updatedCategories = ["その他"];
    }
    return {
      ...spot,
      categories: updatedCategories,
      category: undefined
    };
  });
  if (activeCategory === category) {
    activeCategory = "すべて";
  }
  persistCategories();
  persistSpots();
  renderCategoryManager();
  render();
  showToast("カテゴリーを削除しました");
}

// スポット追加ボタンで新規フォームを開く。
$("addBtn").addEventListener("click", () => openForm());// カードの「編集」ボタンを押したときの処理。
// 一覧全体でクリックを受け取り、押されたカードのスポットを探す。
els.list.addEventListener("click", event => {
  const editButton = event.target.closest("[data-edit]");
  // 編集ボタン以外を押した場合は何もしない。
  if (!editButton) return;
  // ボタンに保存してあるIDから、編集対象のスポットを探す。
  const spotId = editButton.dataset.edit;
  const spot = spots.find(
    item => String(item.id) === String(spotId)
  );
  // 対象が見つかった場合、編集フォームを開く。
  if (spot) {
    openForm(spot);
  }
});

// スポット入力ダイアログの閉じる・キャンセル操作。
$("closeDialogBtn").addEventListener("click", closeForm);
$("cancelBtn").addEventListener("click", closeForm);

// カテゴリー選択プルダウンの変更を処理する。
els.categorySelect.addEventListener("change", () => {
  const selected = els.categorySelect.value;

  // カテゴリー編集が選択されたら管理画面を開く。
  if (selected === "__edit_categories__") {
    $("manageCategoriesBtn").click();

    // 編集用の値が絞り込み状態に残らないようにする。
    els.categorySelect.value = activeCategory;

    return;
  }

  // 通常のカテゴリーを選択した場合は一覧を再描画する。
  activeCategory = selected;
  render();
});

// 検索欄の入力に応じて一覧を更新する。
els.search.addEventListener("input", render);

$("closeCategoriesBtn").addEventListener(
  "click",
  () => els.categoryDialog.close()
);

$("doneCategoriesBtn").addEventListener(
  "click",
  () => els.categoryDialog.close()
);

$("addCategoryBtn").addEventListener(
  "click",
  addCategory
);

// カテゴリー追加欄でEnterを押した場合も追加する。
$("newCategoryInput").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    addCategory();
  }
});

// カテゴリー管理一覧の名前変更・削除を処理する。
$("categoryManagerList").addEventListener("click", event => {
  const renameButton = event.target.closest(
    "[data-rename-category]"
  );

  const deleteButton = event.target.closest(
    "[data-delete-category]"
  );

  if (renameButton) {
    renameCategory(
      Number(renameButton.dataset.renameCategory)
    );
  }

  if (deleteButton) {
    deleteCategory(
      Number(deleteButton.dataset.deleteCategory)
    );
  }
});

// スポットの保存処理。新規追加と既存データの編集の両方に対応する。
els.form.addEventListener("submit", event => {
  event.preventDefault();

  // 編集時は既存IDを、新規作成時は新しいIDを使用する。
  const id = $("spotId").value ||
    (
      window.crypto?.randomUUID
        ? window.crypto.randomUUID()
        : String(Date.now())
    );

  const existing = spots.find(
    spot => String(spot.id) === String(id)
  );

  // フォームの内容をスポットデータにまとめる。
  const record = {
    id,
    name: $("nameInput").value.trim(),
    categories: [$("categoryInput").value],
    mapUrl: $("mapUrlInput").value.trim(),
    address: $("addressInput").value.trim(),
    phone: $("phoneInput").value.trim(),
    station: $("stationInput").value.trim(),
    memo: $("memoInput").value.trim()
  };

  // スポット名が空なら保存しない。
  if (!record.name) return;

  if (existing) {
    // 編集の場合は該当するスポットだけを置き換える。
    spots = spots.map(spot =>
      String(spot.id) === String(id) ? record : spot
    );
  } else {
    // 新規追加の場合は一覧の先頭に追加する。
    spots.unshift(record);
  }

  // 保存後にダイアログを閉じて一覧を再描画する。
  persistSpots();

  closeForm();
  render();

  showToast(
    existing ? "スポットを更新しました" : "スポットを追加しました"
  );
});

// スポット削除ボタンの処理。
$("deleteBtn").addEventListener("click", () => {
  const id = $("spotId").value;

  if (!id || !confirm("このスポットを削除しますか？")) {
    return;
  }

  spots = spots.filter(
    spot => String(spot.id) !== String(id)
  );

  persistSpots();

  closeForm();
  render();

  showToast("スポットを削除しました");
});

// CSVのセルを安全に書き出す。
// カンマ・改行・ダブルクォートを含む値も正しく扱う。
function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

// スポット一覧をCSVテキストに変換する。
function spotsToCSV(spots) {
  const headers = [
    "id",
    "name",
    "categories",
    "mapUrl",
    "address",
    "phone",
    "station",
    "memo"
  ];

  // 各スポットをCSVの1行に変換する。
  const rows = spots.map(spot => [
    spot.id,
    spot.name,
    getSpotCategories(spot).join(" / "),
    spot.mapUrl,
    spot.address,
    spot.phone,
    spot.station,
    spot.memo
  ]);

  return [headers, ...rows]
    .map(row => row.map(csvEscape).join(","))
    .join("\r\n");
}

// CSVファイルとしてスポット一覧を書き出す。
$("exportBtn").addEventListener("click", () => {
  // BOMを付け、日本語が文字化けしにくいCSVにする。
  const csv = "\uFEFF" + spotsToCSV(spots);

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "spotstock-backup.csv";
  link.click();

  // ダウンロード用URLを解放する。
  URL.revokeObjectURL(url);
});

// CSVテキストを行とセルに分解する。
// セル内のカンマ・改行・二重のダブルクォートに対応する。
function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    // CSV内で "" と書かれたダブルクォートを処理する。
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      // セルがダブルクォート内にいるかを切り替える。
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      // セルの区切りに到達したら現在の値を保存する。
      row.push(cell);
      cell = "";
    } else if (
      (char === "\n" || char === "\r") &&
      !inQuotes
    ) {
      // Windows形式のCRLFは1つの改行として扱う。
      if (char === "\r" && next === "\n") {
        i++;
      }

      row.push(cell);
      rows.push(row);

      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  // 最後の行を追加する。
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

// CSVファイルを読み込み、スポット一覧を復元する。
els.importInput.addEventListener("change", async event => {
  const file = event.target.files[0];

  if (!file) return;

  try {
    // ファイルをテキストとして読み込む。
    const text = (await file.text()).replace(/^\uFEFF/, "");
    const rows = parseCSV(text);

    if (rows.length < 2) {
      throw new Error("CSVにデータがありません");
    }

    // 1行目を列名として扱う。
    const headers = rows[0].map(header => header.trim());

    const column = name => headers.indexOf(name);

    if (column("name") === -1) {
      throw new Error("name列がありません");
    }

    // CSVの各行をSpotstockのデータ形式に変換する。
    const importedSpots = rows.slice(1)
      .filter(row => row.some(value => value.trim() !== ""))
      .map(row => {
        // 指定した列の値を取得する。
        const value = name => {
          const index = column(name);
          return index >= 0 ? (row[index] ?? "") : "";
        };

        const categoryText = value("categories") || "その他";

        return {
          id: value("id") || (
            window.crypto?.randomUUID
              ? window.crypto.randomUUID()
              : String(Date.now() + Math.random())
          ),
          name: value("name"),
          categories: categoryText.split(" / ").filter(Boolean),
          mapUrl: value("mapUrl"),
          address: value("address"),
          phone: value("phone"),
          station: value("station"),
          memo: value("memo")
        };
      });

    // スポット名が空の行があれば、読み込みを中止する。
    if (!importedSpots.every(spot => spot.name.trim())) {
      throw new Error("スポット名が空の行があります");
    }

    // 現在のデータを上書きする前に確認する。
    if (!confirm(
      `${importedSpots.length}件のスポットを読み込みます。現在のデータを置き換えますか？`
    )) {
      return;
    }

    // 読み込んだスポットを現在の一覧に設定する。
    spots = importedSpots;

    // CSVに含まれるカテゴリーも管理対象に追加する。
    spots.forEach(spot => {
      getSpotCategories(spot).forEach(category => {
        if (category && !categories.includes(category)) {
          categories.push(category);
        }
      });
    });

    // データを保存し、一覧を更新する。
    persistSpots();
    persistCategories();

    render();

    showToast("CSVを読み込みました");
  } catch (error) {
    // 読み込みに失敗した理由を開発者コンソールに記録する。
    console.error(error);

    alert(
      "CSVを読み込めませんでした。Spotstockから書き出したCSVか確認してください。"
    );
  } finally {
    // 同じファイルを再度選べるように入力欄をリセットする。
    event.target.value = "";
  }
});

// Google Maps URLから場所名らしき文字列を補助的に取得する。
// Googleの情報そのものを取得する処理ではないため、住所などは自動取得しない。
$("mapUrlInput").addEventListener("change", () => {
  const urlText = $("mapUrlInput").value.trim();

  // 名前がすでに入力済み、またはURLが空なら何もしない。
  if ($("nameInput").value.trim() || !urlText) {
    return;
  }

  try {
    const url = new URL(urlText);

    const match = url.pathname.match(/\/place\/([^/]+)/);

    if (match) {
      $("nameInput").value = decodeURIComponent(
        match[1].replace(/\+/g, " ")
      );
    }
  } catch (error) {
    // 入力途中のURLや特殊なリンクでは何もしない。
  }
});

// 初期画面を描画する。
// 保存済みデータがあれば一覧に表示する。
render();