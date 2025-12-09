/* webapp/history.js (v1.0 - History Viewer Logic) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    const els = {
        listContainer: document.getElementById('history-list'),
        tabXp: document.getElementById('tab-xp'),
        tabGame: document.getElementById('tab-game')
    };

    let currentTab = 'xp';

    window.onload = function() {
        tg.ready();
        tg.expand();
        // Assume global.css sets base colors, but for TG App safety:
        tg.setHeaderColor('#050505');
        tg.setBackgroundColor('#050505');
        
        if (!tg.initData) tg.initData = "query_id=TEST_DEV_MODE";
        
        // Initial data fetch
        fetchHistoryData();
    };

    // --- Tab Switching ---

    window.switchTab = function(tab) {
        currentTab = tab;
        els.tabXp.classList.remove('active');
        els.tabGame.classList.remove('active');
        
        if (tab === 'xp') {
            els.tabXp.classList.add('active');
        } else {
            els.tabGame.classList.add('active');
        }
        
        fetchHistoryData();
        tg.HapticFeedback.selectionChanged();
    };

    // --- Data Fetching ---

    window.fetchHistoryData = async function() {
        if (!els.listContainer) return;
        
        els.listContainer.innerHTML = `<div style="text-align:center; padding:50px; color:var(--text-muted); font-size:0.9rem;">
                                       <i class="fas fa-circle-notch fa-spin"></i> در حال بارگذاری تاریخچه...
                                     </div>`;
        
        const endpoint = currentTab === 'xp' ? '/webapp/history/xp' : '/webapp/history/game';
        
        try {
            const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await res.json();

            if (data.status === 'success' && data.history) {
                renderHistoryList(data.history, currentTab);
            } else {
                els.listContainer.innerHTML = `<div style="text-align:center; padding:50px; color:var(--accent-red); font-size:0.9rem;">❌ خطا: ${data.message || "بارگذاری تاریخچه با شکست مواجه شد."}</div>`;
            }
        } catch (e) {
            els.listContainer.innerHTML = `<div style="text-align:center; padding:50px; color:var(--accent-red); font-size:0.9rem;">❌ خطای شبکه.</div>`;
            console.error("History fetch error:", e);
        }
    };

    // --- Rendering Logic ---

    function renderHistoryList(history, type) {
        els.listContainer.innerHTML = '';
        if (history.length === 0) {
            els.listContainer.innerHTML = `<div style="text-align:center; padding:50px; color:var(--text-muted); font-size:0.9rem;">
                                            هیچ ${type === 'xp' ? 'امتیاز' : 'شرط‌بندی'} ثبت نشده است.
                                          </div>`;
            return;
        }

        history.forEach(item => {
            const card = document.createElement('div');
            card.className = 'history-card ripple-btn';

            if (type === 'xp') {
                const amount = parseFloat(item.amount || 0);
                const isAdd = amount >= 0;
                const title = item.reason || 'تراکنش XP';
                const colorClass = isAdd ? 'color-xp-add' : 'color-xp-deduct';
                const displayAmount = (isAdd ? '+' : '') + amount.toFixed(0);

                card.innerHTML = `
                    <div class="card-left">
                        <span class="card-title">${title}</span>
                        <span class="card-meta">شناسه مرجع: #${item.reference_id || 'N/A'}</span>
                    </div>
                    <div class="card-right ${colorClass}">
                        ${displayAmount} XP
                    </div>
                `;
            } else if (type === 'game') {
                // Game Bet History Rendering
                const winStatus = item.result === 'WIN';
                const title = `راند #${item.round_id || 'N/A'} - پیش‌بینی: ${item.prediction === 'UP' ? 'صعود (▲)' : 'نزول (▼)'}`;
                const entryPrice = parseFloat(item.entry_price || 0).toFixed(2);
                const closePrice = parseFloat(item.close_price || 0).toFixed(2);
                const amountBet = parseFloat(item.amount_bet || 0).toFixed(2);
                const payout = parseFloat(item.payout || 0).toFixed(2);

                const colorClass = winStatus ? 'color-bet-win' : 'color-bet-loss';
                const resultText = winStatus ? `برد: +$${(payout - amountBet).toFixed(2)}` : `باخت: -$${amountBet}`;

                card.innerHTML = `
                    <div class="card-left">
                        <span class="card-title">${title}</span>
                        <span class="card-meta color-bet-entry">ورودی: $${entryPrice} / پایانی: $${closePrice}</span>
                        <span class="card-date">${formatDate(item.timestamp)}</span>
                    </div>
                    <div class="card-right ${colorClass}">
                        ${resultText}
                    </div>
                `;
            }
            els.listContainer.appendChild(card);
        });
    }

    function formatDate(timestamp) {
        if (!timestamp) return '-';
        // Assuming timestamp is a standard JS date string/object
        const date = new Date(timestamp);
        return date.toLocaleTimeString('fa-IR', {hour: '2-digit', minute: '2-digit'}) + ' | ' + 
               date.toLocaleDateString('fa-IR', {year: 'numeric', month: '2-digit', day: '2-digit'});
    }

})();