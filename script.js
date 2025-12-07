/* webapp/script.js (v115.0 - Final Fix: Ignore Old Transactions) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    let checkInterval = null;
    let activeCardNumber = ""; 
    let lastKnownTxId = 0; // برای ذخیره ID آخرین تراکنش

    // تشخیص صفحه
    const isDashboard = !!document.getElementById('toman-balance');
    const isWallet = !!document.getElementById('balance-toman');

    // ==========================================
    // 1. INITIALIZATION
    // ==========================================
    window.onload = async function() {
        try {
            tg.ready(); tg.expand();
            tg.setHeaderColor('#000000'); tg.setBackgroundColor('#000000');
            if (!tg.initData) tg.initData = "query_id=TEST_DEV_MODE";

            if (isDashboard) {
                await fetchDashboardData();
                await fetchMarketRates();
                setTimeout(() => { init3DCardEffect(); }, 500);
            } 
            else if (isWallet) {
                await fetchWalletData(); // این تابع lastKnownTxId را هم آپدیت می‌کند
                await fetchActiveCardData();
            }

            const loader = document.getElementById('loader');
            const app = document.getElementById('app-container');
            if(loader && app) {
                loader.style.opacity = '0';
                loader.style.pointerEvents = 'none';
                setTimeout(() => {
                    loader.style.display = 'none';
                    app.classList.remove('hidden-content');
                    app.style.opacity = '1';
                    if(app.classList.contains('main-content')) app.classList.add('fade-in-active');
                }, 600);
            }
        } catch (error) { console.error("Init Error:", error); }
    };

    // ==========================================
    // 2. CORE FUNCTIONS
    // ==========================================
    async function fetchDashboardData() {
        // ... (کد قبلی داشبورد بدون تغییر) ...
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: tg.initData })
            });
            const data = await res.json();
            if (data.status === 'success') {
                const elName = document.getElementById('welcome-name');
                const elToman = document.getElementById('toman-balance');
                const elUusd = document.getElementById('uusd-balance');
                const elXp = document.getElementById('xp-balance');
                const elKyc = document.getElementById('kyc-text');
                const elAvatar = document.querySelector('.avatar-img');
                if(elName) elName.innerText = data.first_name;
                if(elToman) elToman.innerText = data.toman_balance;
                if(elUusd) elUusd.innerHTML = `${data.uusd_balance} <small>$</small>`;
                if(elXp) elXp.innerHTML = `${data.xp_balance} <small>XP</small>`;
                updateLevelProgress(parseInt((data.xp_balance || "0").replace(/,/g, '')));
                if (tg.initDataUnsafe?.user?.photo_url && elAvatar) elAvatar.src = tg.initDataUnsafe.user.photo_url;
                if(elKyc) updateKycBadge(elKyc, data.kyc_status_code);
            }
        } catch (e) {}
    }

    async function fetchMarketRates() {
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/market/rates`);
            const data = await res.json();
            if(data.status === 'success') updateTickerUI(data.rates);
        } catch (e) {}
    }

    function updateTickerUI(rates) {
        const ticker = document.getElementById('price-ticker');
        if (!ticker || !rates) return;
        let html = '';
        const loopRates = [...rates, ...rates];
        loopRates.forEach(rate => {
            const colorClass = rate.change >= 0 ? 'up' : 'down';
            const arrow = rate.change > 0 ? '▲' : (rate.change < 0 ? '▼' : '');
            html += `<div class="ticker-item">${rate.symbol} <span class="${colorClass}">${rate.price} ${arrow} <small>(${rate.change}%)</small></span></div>`;
        });
        ticker.innerHTML = html;
        const usdt = rates.find(r => r.symbol === 'USDT');
        if(usdt) renderSmartChart(usdt.change);
    }

    // --- WALLET FUNCTIONS (UPDATED) ---
    async function fetchWalletData() {
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/get_wallet_data`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: tg.initData })
            });
            const data = await res.json();
            if (data.status === 'success') {
                const elBalToman = document.getElementById('balance-toman');
                const elBalUusd = document.getElementById('balance-uusd');
                if(elBalToman) elBalToman.innerText = data.balances.toman;
                if(elBalUusd) elBalUusd.innerText = `${data.balances.uusd} $`;
                
                // *** ذخیره ID آخرین تراکنش برای مقایسه بعدی ***
                if (data.transactions && data.transactions.length > 0) {
                    // فرض می‌کنیم ref_id عددی است یا قابل مقایسه
                    lastKnownTxId = parseInt(data.transactions[0].ref_id) || 0;
                }

                renderTransactions(data.transactions);
            }
        } catch (e) {}
    }

    async function fetchActiveCardData() {
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/get_active_card`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: tg.initData })
            });
            const data = await res.json();
            if (data.status === 'success') {
                activeCardNumber = data.card_number;
                const bankEl = document.getElementById('card-bank-name');
                const ownerEl = document.getElementById('card-owner-name');
                const numBox = document.getElementById('card-number-box');
                if(bankEl) bankEl.innerText = data.bank_name;
                if(ownerEl) ownerEl.innerText = data.owner_name;
                if(numBox) {
                    numBox.innerHTML = '';
                    const chunks = data.card_number.match(/.{1,4}/g) || [data.card_number];
                    chunks.forEach(chunk => {
                        const span = document.createElement('span'); span.innerText = chunk; numBox.appendChild(span);
                    });
                }
            }
        } catch (e) {}
    }

    function renderTransactions(txs) {
        const list = document.getElementById('tx-list');
        if (!list) return;
        list.innerHTML = '';
        if (!txs || txs.length === 0) { list.innerHTML = '<div style="text-align:center;padding:30px;color:#666;font-size:0.8rem">تراکنشی یافت نشد</div>'; return; }
        txs.forEach(tx => {
            let color = '#FFD700'; let iconClass = 'fa-clock';
            if(tx.color === 'success') { color = '#0ECB81'; iconClass = 'fa-arrow-down'; } 
            else if(tx.color === 'danger') { color = '#F6465D'; iconClass = 'fa-arrow-up'; }
            const html = `
                <div class="tx-item" style="display:flex; justify-content:space-between; align-items:center; padding:15px; background:rgba(255,255,255,0.02); border-radius:14px; margin-bottom:10px;">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <div style="width:40px; height:40px; background:rgba(255,255,255,0.05); border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:1.1rem;">
                            <i class="fas ${iconClass}" style="color:${color}"></i>
                        </div>
                        <div><div style="color:#fff; font-size:0.9rem; font-weight:bold;">${tx.title}</div><div style="color:#666; font-size:0.75rem;">${tx.date}</div></div>
                    </div>
                    <div style="color:${color}; font-family:'Roboto Mono'; font-weight:bold;">${tx.display_amount}</div>
                </div>`;
            list.insertAdjacentHTML('beforeend', html);
        });
    }

    // ==========================================
    // 3. SMART DEPOSIT (UPDATED LOGIC)
    // ==========================================
    window.openDepositModal = function() { document.getElementById('deposit-modal').classList.add('active'); tg.HapticFeedback.impactOccurred('medium'); };
    window.closeDepositModal = function() { document.getElementById('deposit-modal').classList.remove('active'); stopAutoCheck(); };
    window.copyCardNumber = function() {
        if(!activeCardNumber) return;
        navigator.clipboard.writeText(activeCardNumber).then(() => { tg.showAlert("✅ شماره کارت کپی شد!"); tg.HapticFeedback.notificationOccurred('success'); });
    };
    window.formatAmount = function(input) {
        let val = input.value.replace(/[^0-9]/g, '');
        if (!val) { input.value = ''; return; }
        input.value = parseInt(val).toLocaleString();
    };
    window.toggleManualUpload = function() {
        const area = document.getElementById('manual-upload-area');
        area.style.display = area.style.display === 'none' ? 'block' : 'none';
        if(area.style.display === 'block') area.scrollIntoView({behavior: "smooth"});
    };

    // --- شروع پروسه هوشمند ---
    window.startAutoCheck = function() {
        const input = document.getElementById('deposit-amount');
        const amount = parseInt(input.value.replace(/,/g, ''));
        if (!amount || amount < 10000) { tg.showAlert("حداقل مبلغ ۱۰,۰۰۰ تومان است"); return; }

        // ذخیره ID آخرین تراکنش قبل از شروع پروسه (خیلی مهم)
        // اگر تراکنشی وجود نداشته باشد، 0 است.
        // ما این کار را در fetchWalletData انجام دادیم، اما برای اطمینان دوباره می‌گیریم
        // البته به دلیل Async بودن شاید بهتر باشد به همان مقدار گلوبال اعتماد کنیم یا یک فچ سریع بزنیم.
        // اینجا به مقدار گلوبال lastKnownTxId که در لود اولیه پر شده اعتماد می‌کنیم.

        document.getElementById('radar-section').style.display = 'block';
        document.getElementById('btn-confirm').style.display = 'none';
        input.disabled = true;
        tg.HapticFeedback.notificationOccurred('warning');
        createPendingRequest(amount);
    };

    async function createPendingRequest(amount) {
        const blob = new Blob(["waiting"], { type: "text/plain" });
        const file = new File([blob], "auto_wait.txt");
        const formData = new FormData();
        formData.append('initData', tg.initData); formData.append('amount', amount); formData.append('receipt', file);

        try {
            await fetch(`${API_BASE_URL}/webapp/submit_deposit`, { method: 'POST', body: formData });
            // شروع چک کردن
            checkInterval = setInterval(() => checkTransactionStatus(amount), 5000);
        } catch (e) { tg.showAlert("خطا در اتصال"); stopAutoCheck(); }
    }

    async function checkTransactionStatus(amount) {
        const res = await fetch(`${API_BASE_URL}/webapp/get_wallet_data`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: tg.initData })
        });
        const data = await res.json();
        
        if (data.status === 'success' && data.transactions.length > 0) {
            const latestTx = data.transactions[0];
            const txAmt = parseInt(latestTx.display_amount.replace(/[^0-9]/g, ''));
            const txId = parseInt(latestTx.ref_id);

            // شرط موفقیت اصلاح شده:
            // 1. رنگ سبز باشد (موفق)
            // 2. مبلغ یکی باشد
            // 3. شناسه تراکنش (ID) بزرگتر از آخرین شناسه شناخته شده باشد (یعنی تراکنش جدید است)
            if (latestTx.color === 'success' && Math.abs(txAmt - amount) < 500 && txId > lastKnownTxId) {
                
                clearInterval(checkInterval); checkInterval = null;
                lastKnownTxId = txId; // آپدیت ID برای دفعات بعدی

                const radarBox = document.getElementById('radar-section');
                radarBox.innerHTML = `<div style="font-size:3.5rem; color:#0ECB81; margin-bottom:15px;"><i class="fas fa-check-circle"></i></div><h3 style="color:#fff;">واریز تایید شد!</h3>`;
                tg.HapticFeedback.notificationOccurred('success');
                
                fetchWalletData(); // آپدیت موجودی
                setTimeout(() => { 
                    closeDepositModal(); 
                    // ریست متن رادار برای دفعه بعد
                    setTimeout(() => { 
                        radarBox.innerHTML = '<div class="radar-spinner"></div><h4 style="margin:10px 0 5px; color:#0ECB81;">در حال انتظار واریز...</h4><p style="font-size:0.75rem; color:#888; margin:0;">سیستم به طور خودکار واریز شما را شناسایی می‌کند.</p>'; 
                    }, 500); 
                }, 3000);
            }
        }
    }

    window.stopAutoCheck = function() {
        if (checkInterval) clearInterval(checkInterval); checkInterval = null;
        document.getElementById('radar-section').style.display = 'none';
        document.getElementById('btn-confirm').style.display = 'block';
        const input = document.getElementById('deposit-amount');
        if(input) { input.disabled = false; input.value = ''; }
        document.getElementById('manual-upload-area').style.display = 'none';
    };

    window.submitManual = async function() {
        const amount = parseInt(document.getElementById('deposit-amount').value.replace(/,/g, ''));
        const fileInp = document.getElementById('receipt-file');
        if (!amount || fileInp.files.length === 0) { tg.showAlert("لطفاً هم مبلغ و هم تصویر را وارد کنید"); return; }
        const formData = new FormData();
        formData.append('initData', tg.initData); formData.append('amount', amount); formData.append('receipt', fileInp.files[0]);
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/submit_deposit`, { method: 'POST', body: formData });
            const d = await res.json();
            if (res.ok && d.status === 'success') { tg.showAlert("✅ فیش ارسال شد"); closeDepositModal(); } else { tg.showAlert(d.message); }
        } catch (e) { tg.showAlert("خطای شبکه"); }
    };

    // --- Helpers ---
    function updateLevelProgress(xp) {
        const xpFill = document.getElementById('xp-progress-fill');
        const lvlBadge = document.getElementById('level-badge');
        if (!xpFill || !lvlBadge) return;
        const levels = [0, 500, 1500, 3500, 7000];
        let currentLevel = 1;
        for (let i = 0; i < levels.length; i++) { if (xp >= levels[i]) currentLevel = i + 1; else break; }
        let pct = Math.min(100, (xp / (levels[currentLevel] || xp * 2)) * 100);
        xpFill.style.width = `${pct}%`;
        lvlBadge.innerText = `LVL ${currentLevel}`;
    }
    function updateKycBadge(el, status) {
        let text="Guest", color="#888", bg="rgba(255,255,255,0.1)";
        if(status==='verified'){text="Verified ✅";color="#0ECB81";bg="rgba(14,203,129,0.1)";}
        else if(status==='pending'){text="Pending ⏳";color="#F0B90B";bg="rgba(240,185,11,0.1)";}
        el.innerText=text; el.style.color=color; el.style.background=bg;
    }
    function init3DCardEffect() {
        const card = document.querySelector('.premium-card');
        const container = document.querySelector('.main-content');
        if(!card || !container) return;
        container.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - (rect.left + rect.width/2);
            const y = e.clientY - (rect.top + rect.height/2);
            card.style.transform = `rotateY(${x/20}deg) rotateX(${-y/20}deg)`;
        });
        container.addEventListener('mouseleave', () => { card.style.transform = 'rotateY(0) rotateX(0)'; });
    }
    function renderSmartChart(change) {
        const svg = document.getElementById('sparkline-svg');
        if(!svg) return;
        // رسم چارت ساده (اختیاری)
    }
})();