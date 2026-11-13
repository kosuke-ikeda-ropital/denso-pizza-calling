// スタッフ管理画面のメインロジック

let appState = {
  menu: [],
  orders: [],
  settings: {}
};

let currentOrderSelection = {}; // { "margherita_piece": 1, ... }
let currentStaffPin = localStorage.getItem('staff_pin') || '';

// 認証チェック
async function checkAuth() {
  const modal = document.getElementById('pinLockModal');
  if (!currentStaffPin) {
    modal.classList.remove('hidden');
    return false;
  }
  try {
    const res = await fetch('/api/verify_pin', {
      method: 'POST',
      headers: { 'X-Staff-Pin': currentStaffPin }
    });
    if (res.ok) {
      modal.classList.add('hidden');
      return true;
    } else {
      localStorage.removeItem('staff_pin');
      currentStaffPin = '';
      modal.classList.remove('hidden');
      return false;
    }
  } catch (e) {
    return false;
  }
}

async function handlePinSubmit(e) {
  e.preventDefault();
  const pin = document.getElementById('staffPinInput').value.trim();
  const errorEl = document.getElementById('pinErrorMsg');
  errorEl.classList.add('hidden');

  try {
    const res = await fetch('/api/verify_pin', {
      method: 'POST',
      headers: { 'X-Staff-Pin': pin }
    });
    if (res.ok) {
      currentStaffPin = pin;
      localStorage.setItem('staff_pin', pin);
      document.getElementById('pinLockModal').classList.add('hidden');
      fetchState();
    } else {
      errorEl.classList.remove('hidden');
    }
  } catch (err) {
    alert('通信エラーが発生しました');
  }
}

function logoutStaff() {
  localStorage.removeItem('staff_pin');
  currentStaffPin = '';
  document.getElementById('staffPinInput').value = '';
  document.getElementById('pinLockModal').classList.remove('hidden');
}

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    'X-Staff-Pin': currentStaffPin
  };
}

// 時計更新
function updateClock() {
  const el = document.getElementById('currentTime');
  if (el) {
    const d = new Date();
    el.textContent = d.toLocaleTimeString('ja-JP');
  }
}
setInterval(updateClock, 1000);
updateClock();

// --- API 通信 & 状態同期 ---

async function fetchState() {
  try {
    const res = await fetch('/api/state');
    if (!res.ok) throw new Error('Failed to fetch state');
    appState = await res.json();
    renderAll();
  } catch (err) {
    console.error('Error fetching state:', err);
  }
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
  const badge = document.getElementById('wsStatusBadge');

  ws.onopen = () => {
    if (badge) {
      badge.className = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-800 text-emerald-200";
      badge.innerHTML = '<span class="w-2 h-2 mr-1 rounded-full bg-emerald-400"></span> 接続中';
    }
    fetchState();
  };

  ws.onmessage = (event) => {
    // 変更通知を受信したら再取得
    fetchState();
  };

  ws.onclose = () => {
    if (badge) {
      badge.className = "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-800 text-rose-200";
      badge.innerHTML = '<span class="w-2 h-2 mr-1 rounded-full bg-rose-400"></span> 切断・再接続中';
    }
    setTimeout(connectWebSocket, 2000);
  };

  ws.onerror = () => ws.close();
}

// --- レンダリング ---

function renderAll() {
  renderStats();
  renderKanban();
  if (appState.settings && appState.settings.shop_name) {
    document.getElementById('headerShopName').textContent = `${appState.settings.shop_name} 管理画面`;
  }
}

function renderStats() {
  const activeOrders = appState.orders.filter(o => o.status === 'waiting' || o.status === 'calling');
  const completedOrders = appState.orders.filter(o => o.status === 'completed');
  const totalSales = completedOrders.reduce((sum, o) => sum + (o.total_price || 0), 0);

  document.getElementById('statActiveCount').textContent = `${activeOrders.length} 件`;
  document.getElementById('statCompletedCount').textContent = `${completedOrders.length} 件`;
  document.getElementById('statTotalSales').textContent = `¥${totalSales.toLocaleString()}`;
}

function renderKanban() {
  const waitingOrders = appState.orders.filter(o => o.status === 'waiting');
  const callingOrders = appState.orders.filter(o => o.status === 'calling');
  const completedOrders = appState.orders.filter(o => o.status === 'completed').reverse(); // 新しい順

  // バッジ
  document.getElementById('waitingBadge').textContent = waitingOrders.length;
  document.getElementById('callingBadge').textContent = callingOrders.length;
  document.getElementById('completedBadge').textContent = completedOrders.length;

  // 1. 焼き待ちリスト
  const waitingContainer = document.getElementById('waitingList');
  if (waitingOrders.length === 0) {
    waitingContainer.innerHTML = '<div class="text-center text-slate-400 py-12 text-sm">現在、焼き待ちの注文はありません</div>';
  } else {
    waitingContainer.innerHTML = waitingOrders.map(o => createWaitingCardHtml(o)).join('');
  }

  // 2. 呼出中リスト
  const callingContainer = document.getElementById('callingList');
  if (callingOrders.length === 0) {
    callingContainer.innerHTML = '<div class="text-center text-slate-400 py-12 text-sm">現在、呼び出し中の注文はありません</div>';
  } else {
    callingContainer.innerHTML = callingOrders.map(o => createCallingCardHtml(o)).join('');
  }

  // 3. 受取完了リスト
  const completedContainer = document.getElementById('completedList');
  if (completedOrders.length === 0) {
    completedContainer.innerHTML = '<div class="text-center text-slate-400 py-12 text-sm">受取完了した注文がここに表示されます</div>';
  } else {
    completedContainer.innerHTML = completedOrders.slice(0, 10).map(o => createCompletedCardHtml(o)).join('');
  }
}

function createWaitingCardHtml(order) {
  const numStr = order.number < 10 ? '0' + order.number : order.number;
  const itemsText = order.items.map(it => `
    <div class="flex justify-between items-center text-xs py-0.5">
      <span class="font-medium">${it.pizza_name} <span class="text-amber-800 font-bold">(${it.size === 'piece' ? 'ピース' : 'ホール'})</span> × ${it.quantity}</span>
      <span class="text-slate-600">¥${(it.quantity * it.unit_price).toLocaleString()}</span>
    </div>
  `).join('');

  return `
    <div class="bg-white rounded-xl p-4 shadow-sm border border-amber-200 flex flex-col gap-3">
      <div class="flex items-center justify-between border-b border-slate-100 pb-2">
        <div class="flex items-center gap-2">
          <span class="text-xs text-slate-400 uppercase font-bold">番号</span>
          <span class="text-3xl font-black text-amber-600">${numStr}</span>
        </div>
        <div class="text-right">
          <div class="text-xs font-bold text-slate-500">合計 ¥${order.total_price.toLocaleString()}</div>
          <button onclick="deleteOrder('${order.id}')" class="text-[11px] text-slate-400 hover:text-rose-600 transition">
            <i class="fa-solid fa-trash"></i> 削除
          </button>
        </div>
      </div>

      <div class="bg-amber-50/60 rounded-lg p-2.5 space-y-0.5">
        ${itemsText}
        ${order.note ? `<div class="text-[11px] text-amber-800 pt-1 border-t border-amber-100 italic">📝 ${order.note}</div>` : ''}
      </div>

      <button onclick="updateOrderStatus('${order.id}', 'calling')" class="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2.5 px-4 rounded-xl shadow transition flex items-center justify-center gap-2 transform active:scale-95">
        <i class="fa-solid fa-bell"></i> 焼き上がり！(呼出)
      </button>
    </div>
  `;
}

function createCallingCardHtml(order) {
  const numStr = order.number < 10 ? '0' + order.number : order.number;
  const itemsText = order.items.map(it => `
    <div class="flex justify-between items-center text-xs py-0.5">
      <span class="font-medium">${it.pizza_name} (${it.size === 'piece' ? 'ピース' : 'ホール'}) × ${it.quantity}</span>
      <span>¥${(it.quantity * it.unit_price).toLocaleString()}</span>
    </div>
  `).join('');

  return `
    <div class="bg-white rounded-xl p-4 shadow-md border-2 border-orange-400 flex flex-col gap-3 calling-card">
      <div class="flex items-center justify-between border-b border-orange-100 pb-2">
        <div class="flex items-center gap-2">
          <span class="text-xs text-orange-600 font-bold uppercase">呼出中</span>
          <span class="text-4xl font-black text-orange-600">${numStr}</span>
        </div>
        <div class="text-right">
          <span class="bg-orange-100 text-orange-800 text-[11px] font-bold px-2 py-0.5 rounded-full animate-pulse">スマホ呼出中</span>
        </div>
      </div>

      <div class="bg-orange-50 rounded-lg p-2.5 space-y-0.5 text-orange-950">
        ${itemsText}
        ${order.note ? `<div class="text-[11px] text-orange-800 pt-1 border-t border-orange-200/60 italic">📝 ${order.note}</div>` : ''}
      </div>

      <div class="flex gap-2">
        <button onclick="updateOrderStatus('${order.id}', 'waiting')" class="w-1/3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-2 rounded-xl text-xs transition">
          焼き中に戻す
        </button>
        <button onclick="updateOrderStatus('${order.id}', 'completed')" class="w-2/3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-2.5 px-3 rounded-xl shadow transition flex items-center justify-center gap-1.5 transform active:scale-95">
          <i class="fa-solid fa-check"></i> 受取完了
        </button>
      </div>
    </div>
  `;
}

function createCompletedCardHtml(order) {
  const numStr = order.number < 10 ? '0' + order.number : order.number;
  const itemsSummary = order.items.map(it => `${it.pizza_name}(${it.size === 'piece' ? 'P' : 'H'})×${it.quantity}`).join(', ');

  return `
    <div class="bg-white rounded-xl p-3 shadow-sm border border-emerald-100 flex items-center justify-between text-xs">
      <div class="flex items-center gap-2.5">
        <span class="text-xl font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded-lg">${numStr}</span>
        <div class="truncate max-w-[180px]">
          <div class="font-bold text-slate-700 truncate">${itemsSummary}</div>
          <div class="text-[10px] text-slate-400">¥${order.total_price.toLocaleString()}</div>
        </div>
      </div>
      <div class="text-emerald-600 font-bold flex items-center gap-1">
        <i class="fa-solid fa-circle-check"></i> 完了
      </div>
    </div>
  `;
}

// --- ステータス変更操作 ---

async function updateOrderStatus(orderId, newStatus) {
  try {
    const res = await fetch(`/api/orders/${orderId}/status`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status: newStatus })
    });
    if (res.status === 401) {
      alert('スタッフ認証の有効期限が切れました。再度PINを入力してください');
      logoutStaff();
      return;
    }
    if (!res.ok) throw new Error('ステータス更新に失敗しました');
    fetchState();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteOrder(orderId) {
  if (!confirm('この注文を削除しますか？')) return;
  try {
    const res = await fetch(`/api/orders/${orderId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.status === 401) {
      alert('スタッフ認証の有効期限が切れました。再度PINを入力してください');
      logoutStaff();
      return;
    }
    if (!res.ok) throw new Error('注文削除に失敗しました');
    fetchState();
  } catch (e) {
    alert(e.message);
  }
}

// --- 新規注文モーダル ---

function openOrderModal() {
  currentOrderSelection = {};
  
  // 未使用の最小番号を推定（1〜50の中で現在activeでない番号）
  const activeNumbers = new Set(appState.orders.filter(o => o.status === 'waiting' || o.status === 'calling').map(o => o.number));
  let suggestNum = 1;
  while (activeNumbers.has(suggestNum) && suggestNum <= 50) {
    suggestNum++;
  }
  document.getElementById('orderNumberInput').value = suggestNum;

  renderQuickNumberButtons(activeNumbers);
  renderOrderMenuGrid();
  updateOrderTotalPreview();

  document.getElementById('orderNoteInput').value = '';
  document.getElementById('orderModal').classList.remove('hidden');
}

function closeOrderModal() {
  document.getElementById('orderModal').classList.add('hidden');
}

function renderQuickNumberButtons(activeNumbers) {
  const container = document.getElementById('quickNumberButtons');
  let html = '';
  for (let i = 1; i <= 30; i++) {
    const isActive = activeNumbers.has(i);
    const numStr = i < 10 ? '0' + i : String(i);
    if (isActive) {
      html += `<span class="px-2 py-1 bg-slate-200 text-slate-400 rounded text-xs font-bold cursor-not-allowed" title="現在使用中">${numStr}</span>`;
    } else {
      html += `<button type="button" onclick="setOrderNumber(${i})" class="px-2 py-1 bg-white hover:bg-emerald-100 border border-slate-300 rounded text-xs font-bold text-slate-700 transition">${numStr}</button>`;
    }
  }
  container.innerHTML = html;
}

function setOrderNumber(num) {
  document.getElementById('orderNumberInput').value = num;
}

function renderOrderMenuGrid() {
  const grid = document.getElementById('orderMenuGrid');
  grid.innerHTML = appState.menu.map(pizza => {
    const pieceKey = `${pizza.id}_piece`;
    const wholeKey = `${pizza.id}_whole`;
    const pieceQty = currentOrderSelection[pieceKey] || 0;
    const wholeQty = currentOrderSelection[wholeKey] || 0;

    return `
      <div class="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-between">
        <div class="flex items-center justify-between mb-2 pb-1 border-b border-slate-200">
          <span class="font-bold text-slate-800 text-sm">🍕 ${pizza.name}</span>
        </div>

        <div class="space-y-2">
          <!-- ピース -->
          <div class="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
            <div>
              <span class="font-bold text-slate-700">ピース</span>
              <span class="text-slate-500 ml-1">¥${pizza.piece_price}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <button type="button" onclick="changeQuantity('${pieceKey}', -1)" class="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center">-</button>
              <span class="w-5 text-center font-bold text-slate-800" id="qty_${pieceKey}">${pieceQty}</span>
              <button type="button" onclick="changeQuantity('${pieceKey}', 1)" class="w-6 h-6 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold flex items-center justify-center">+</button>
            </div>
          </div>

          <!-- ホール -->
          <div class="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
            <div>
              <span class="font-bold text-slate-700">ホール (1枚)</span>
              <span class="text-slate-500 ml-1">¥${pizza.whole_price}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <button type="button" onclick="changeQuantity('${wholeKey}', -1)" class="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 flex items-center justify-center">-</button>
              <span class="w-5 text-center font-bold text-slate-800" id="qty_${wholeKey}">${wholeQty}</span>
              <button type="button" onclick="changeQuantity('${wholeKey}', 1)" class="w-6 h-6 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold flex items-center justify-center">+</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function changeQuantity(key, delta) {
  const current = currentOrderSelection[key] || 0;
  const next = Math.max(0, current + delta);
  if (next === 0) {
    delete currentOrderSelection[key];
  } else {
    currentOrderSelection[key] = next;
  }
  const el = document.getElementById(`qty_${key}`);
  if (el) el.textContent = next;
  updateOrderTotalPreview();
}

function updateOrderTotalPreview() {
  let total = 0;
  appState.menu.forEach(pizza => {
    const pieceQty = currentOrderSelection[`${pizza.id}_piece`] || 0;
    const wholeQty = currentOrderSelection[`${pizza.id}_whole`] || 0;
    total += pieceQty * (pizza.piece_price || 0);
    total += wholeQty * (pizza.whole_price || 0);
  });
  document.getElementById('orderTotalPreview').textContent = `¥${total.toLocaleString()}`;
}

async function submitOrder() {
  const num = parseInt(document.getElementById('orderNumberInput').value, 10);
  if (!num || num <= 0) {
    alert('番号札の番号を正しく入力してください');
    return;
  }

  const items = [];
  appState.menu.forEach(pizza => {
    const pieceQty = currentOrderSelection[`${pizza.id}_piece`] || 0;
    if (pieceQty > 0) {
      items.push({
        pizza_id: pizza.id,
        pizza_name: pizza.name,
        size: 'piece',
        quantity: pieceQty,
        unit_price: pizza.piece_price
      });
    }

    const wholeQty = currentOrderSelection[`${pizza.id}_whole`] || 0;
    if (wholeQty > 0) {
      items.push({
        pizza_id: pizza.id,
        pizza_name: pizza.name,
        size: 'whole',
        quantity: wholeQty,
        unit_price: pizza.whole_price
      });
    }
  });

  if (items.length === 0) {
    alert('ピザを少なくとも1品選択してください');
    return;
  }

  const note = document.getElementById('orderNoteInput').value;

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        number: num,
        items: items,
        note: note
      })
    });
    if (res.status === 401) {
      alert('スタッフ認証が必要です');
      logoutStaff();
      return;
    }
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || '注文の登録に失敗しました');
    }
    closeOrderModal();
    fetchState();
  } catch (e) {
    alert(e.message);
  }
}

// --- メニュー・価格設定モーダル ---

function openMenuModal() {
  const container = document.getElementById('menuEditList');
  container.innerHTML = appState.menu.map((pizza, idx) => `
    <div class="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
      <div class="flex items-center justify-between">
        <span class="font-bold text-slate-800 text-sm">🍕 ${pizza.name}</span>
      </div>
      <div class="grid grid-cols-2 gap-3 text-xs">
        <div>
          <label class="block text-slate-600 font-semibold mb-1">ピース価格 (¥)</label>
          <input type="number" id="menu_piece_${idx}" value="${pizza.piece_price}" class="w-full border border-slate-300 rounded-lg p-2 font-bold text-slate-800 focus:border-amber-500 focus:outline-none">
        </div>
        <div>
          <label class="block text-slate-600 font-semibold mb-1">ホール価格 (¥)</label>
          <input type="number" id="menu_whole_${idx}" value="${pizza.whole_price}" class="w-full border border-slate-300 rounded-lg p-2 font-bold text-slate-800 focus:border-amber-500 focus:outline-none">
        </div>
      </div>
    </div>
  `).join('');

  document.getElementById('menuModal').classList.remove('hidden');
}

function closeMenuModal() {
  document.getElementById('menuModal').classList.add('hidden');
}

async function saveMenuSettings() {
  const updatedMenu = appState.menu.map((pizza, idx) => {
    const piecePrice = parseInt(document.getElementById(`menu_piece_${idx}`).value || '0', 10);
    const wholePrice = parseInt(document.getElementById(`menu_whole_${idx}`).value || '0', 10);
    return {
      ...pizza,
      piece_price: piecePrice,
      whole_price: wholePrice
    };
  });

  try {
    const res = await fetch('/api/menu', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ menu: updatedMenu })
    });
    if (res.status === 401) {
      alert('スタッフ認証が必要です');
      logoutStaff();
      return;
    }
    if (!res.ok) throw new Error('価格の保存に失敗しました');
    closeMenuModal();
    fetchState();
    alert('メニューと価格設定を保存しました！');
  } catch (e) {
    alert(e.message);
  }
}

async function confirmResetOrders() {
  if (!confirm('本日のすべての注文履歴を消去して0件にリセットしますか？（※元に戻せません）')) return;
  try {
    const res = await fetch('/api/reset_orders', {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (res.status === 401) {
      alert('スタッフ認証が必要です');
      logoutStaff();
      return;
    }
    if (!res.ok) throw new Error('リセットに失敗しました');
    closeMenuModal();
    fetchState();
    alert('注文履歴をリセットしました');
  } catch (e) {
    alert(e.message);
  }
}

function exportSalesCsv() {
  if (!currentStaffPin) {
    alert('スタッフ認証が必要です');
    logoutStaff();
    return;
  }
  // PIN付きでダウンロードリンクを開く
  window.location.href = `/api/export_csv?pin=${encodeURIComponent(currentStaffPin)}`;
}

// 初期実行
checkAuth();
connectWebSocket();
fetchState();
