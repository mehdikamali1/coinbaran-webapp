/* webapp/wallet-engine.js (v88.0 - Intelligent Integration) */
const API_BASE = window.location.origin + "/api/user";
const tg = window.Telegram.WebApp;
let TX_DATA = [];

// ۱. انیمیشن شمارش اعداد (Counter Effect)
function animateValue(obj, start, end, duration) {
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const current = Math.floor(progress * (end - start) + start);
        obj.innerHTML = current.toLocaleString();
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

// ۲. دریافت و مدیریت داده‌های کیف پول و کارت‌ها
async function fetchWalletData() {
    try {
        const res = await fetch(`${API_BASE}/get_user_data`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ initData: tg.initData })
        });
        const data = await res.json();
        
        if(data.status === 'success') {
            // آپدیت موجودی با انیمیشن
            const tomanEl = document.getElementById('balance-toman');
            const targetBalance = parseInt(data.toman_balance.replace(/,/g, '')) || 0;
            animateValue(tomanEl, 0, targetBalance, 1500);

            document.getElementById('balance-uusd').innerText = data.uusd_balance + " USDT";
            document.getElementById('balance-xp').innerText = data.xp_balance;
            
            // رندر کردن کارت‌های بانکی تایید شده کاربر
            renderApprovedCards(data.approved_cards || []);
            
            // رندر کردن لیست تراکنش‌ها
            TX_DATA = data.transactions || [];
            renderTransactionList(TX_DATA);
            
            hideLoader();
        }
    } catch(e) {
        console.error("Wallet Engine Error:", e);
        hideLoader();
    }
}

// ۳. رندر کردن کارت‌های بانکی تایید شده برای واریز هوشمند
function renderApprovedCards(cards) {
    const container = document.getElementById('approved-cards-container');
    if (!container) return;

    if (cards.length === 0) {
        container.innerHTML = `
            <div style="background:rgba(246,70,93,0.05); color:#f6465d; padding:15px; border-radius:12px; font-size:0.75rem; text-align:center; border:1px solid rgba(246,70,93,0.1);">
                ⚠️ شما هیچ کارت تایید شده‌ای ندارید. برای واریز هوشمند ابتدا باید کارت خود را در بخش پروفایل ثبت و تایید کنید.
            </div>`;
        return;
    }

    container.innerHTML = cards.map(card => `
        <div class="card-item">
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:32px; height:32px; background:rgba(240,185,11,0.1); border-radius:8px; display:flex; align-items:center; justify-content:center;">
                    <i class="fas fa-credit-card" style="color:#f0b90b; font-size:0.9rem;"></i>
                </div>
                <div>
                    <div style="font-size:0.8rem; font-weight:bold; color:#fff;">${card.bank_name}</div>
                    <div style="font-size:0.65rem; color:#666;">کارت تایید شده</div>
                </div>
            </div>
            <div style="font-family:'Roboto Mono'; font-weight:bold; font-size:0.85rem; letter-spacing:1px; color:#aaa;">
                ****${card.card_number.slice(-4)}
            </div>
        </div>
    `).join('');
}

// ۴. رندر کردن لیست تراکنش‌ها
function renderTransactionList(txs) {
    const list = document.getElementById('tx-list');
    if (!list) return;

    if (txs.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:40px; opacity:0.3; font-size:0.8rem;">تراکنشی یافت نشد</div>';
        return;
    }

    list.innerHTML = txs.map(tx => `
        <div class="tx-card">
            <div style="display:flex; align-items:center; gap:12px;">
                <div class="tx-icon-luxe ${tx.color === 'success' ? 'tx-up' : 'tx-down'}">
                    <i class="fas ${tx.color === 'success' ? 'fa-arrow-down' : 'fa-clock'}"></i>
                </div>
                <div>
                    <span style="font-size:0.85rem; font-weight:bold; display:block;">${tx.title}</span>
                    <span style="font-size:0.65rem; color:#555;">${tx.date}</span>
                </div>
            </div>
            <div style="font-family:'Roboto Mono'; font-weight:900; color:var(--${tx.color})">
                ${tx.display_amount}
            </div>
        </div>
    `).join('');
}

// ۵. مدیریت مودهای واریز (هوشمند / دستی)
window.setDepositMode = function(mode) {
    const btnAuto = document.getElementById('mode-auto');
    const btnManual = document.getElementById('mode-manual');
    const contentAuto = document.getElementById('content-auto');
    const contentManual = document.getElementById('content-manual');

    if (mode === 'auto') {
        btnAuto.classList.add('active');
        btnManual.classList.remove('active');
        contentAuto.style.display = 'block';
        contentManual.style.display = 'none';
    } else {
        btnManual.classList.add('active');
        btnAuto.classList.remove('active');
        contentManual.style.display = 'block';
        contentAuto.style.display = 'none';
    }
};

// ۶. ثبت واریز دستی (آپلود فیش)
window.submitManualDeposit = async function() {
    const amount = document.getElementById('manual-amount').value;
    const file = document.getElementById('receipt-file').files[0];

    if (!amount || amount < 10000) {
        tg.showAlert("لطفاً مبلغ معتبر (حداقل ۱۰,۰۰۰ تومان) وارد کنید.");
        return;
    }
    if (!file) {
        tg.showAlert("لطفاً تصویر فیش واریزی را انتخاب کنید.");
        return;
    }

    const formData = new FormData();
    formData.append('initData', tg.initData);
    formData.append('amount', amount);
    formData.append('receipt', file);

    const btn = document.querySelector('#content-manual .btn-confirm');
    btn.disabled = true;
    btn.innerText = "در حال ارسال...";

    try {
        const res = await fetch(`${API_BASE}/submit_manual_deposit`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        
        if (data.status === 'success') {
            tg.showAlert(data.message);
            location.reload();
        } else {
            tg.showAlert(data.message || "خطا در ثبت درخواست");
        }
    } catch (e) {
        tg.showAlert("خطای ارتباط با سرور");
    } finally {
        btn.disabled = false;
        btn.innerText = "ارسال فیش واریزی";
    }
};

// ۷. توابع کمکی UI
window.openDepositModal = () => document.getElementById('deposit-modal').classList.add('active');
window.closeDepositModal = () => document.getElementById('deposit-modal').classList.remove('active');

window.switchPane = (pane) => {
    document.getElementById('tab-toman').classList.toggle('active', pane === 'toman');
    document.getElementById('tab-usdt').classList.toggle('active', pane === 'usdt');
    document.getElementById('pane-toman').classList.toggle('active', pane === 'toman');
    document.getElementById('pane-usdt').classList.toggle('active', pane === 'usdt');
};

window.copyAdminCard = () => {
    const cardNum = "6219861987089975";
    navigator.clipboard.writeText(cardNum);
    tg.showAlert("شماره کارت مقصد کپی شد ✅");
};

window.updateFileLabel = () => {
    const file = document.getElementById('receipt-file').files[0];
    if (file) document.getElementById('file-label').innerText = "✅ " + file.name;
};

function hideLoader() {
    const loader = document.getElementById('loader');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
            document.getElementById('app-container').classList.add('fade-in-active');
        }, 600);
    }
}

// ۸. اجرای اولیه
window.onload = function() {
    tg.ready();
    tg.expand();
    fetchWalletData();
};