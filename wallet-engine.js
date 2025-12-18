/* webapp/wallet-engine.js (v86.0 - Luxury Wallet Engine) */
const API_BASE = window.location.origin + "/api/webapp";
const tg = window.Telegram.WebApp;
let TX_DATA = []; // ذخیره محلی تراکنش‌ها برای نمایش در رسید

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

// ۲. افکت ۳ بعدی پارالاکس بر اساس سنسور (Gyroscope)
function initParallax() {
    const card = document.getElementById('parallax-card');
    if (!card) return;

    window.addEventListener('deviceorientation', (event) => {
        // beta: حرکت جلو و عقب (Tilt) | gamma: حرکت چپ و راست
        let x = event.beta;  
        let y = event.gamma; 
        
        if (x && y) {
            // تنظیم زاویه برای حس طبیعی در دست (معمولاً گوشی با زاویه ۴۵ درجه نگه داشته می‌شود)
            const rotX = (x - 45) / 4; 
            const rotY = y / 4;
            card.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
            
            // جابجایی نقطه درخشش (Shine) روی کارت
            const shineX = 50 + (y * 2);
            const shineY = 50 + ((x - 45) * 2);
            card.style.setProperty('--x', `${shineX}%`);
            card.style.setProperty('--y', `${shineY}%`);
        }
    });
}

// ۳. دریافت و مدیریت داده‌های کیف پول
async function fetchWalletData() {
    try {
        const res = await fetch(`${API_BASE}/get_user_data`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true'},
            body: JSON.stringify({ initData: tg.initData })
        });
        const data = await res.json();
        
        if(data.status === 'success') {
            // اجرای انیمیشن اعداد برای موجودی تومانی
            const tomanEl = document.getElementById('balance-toman');
            const targetBalance = parseInt(data.toman_balance.replace(/,/g, '')) || 0;
            animateValue(tomanEl, 0, targetBalance, 1500);

            // آپدیت سایر مقادیر
            document.getElementById('balance-uusd').innerText = data.uusd_balance + " USDT";
            
            // مدیریت تراکنش‌ها
            TX_DATA = data.transactions || [];
            renderTransactionList(TX_DATA);
            
            // فعال‌سازی افکت‌های بصری و حذف لودر
            hideLoader();
            initParallax();
        }
    } catch(e) {
        console.error("Wallet Engine Error:", e);
        hideLoader(); // جلوگیری از گیر کردن لودر در صورت خطا
    }
}

// ۴. رندر کردن لیست تراکنش‌ها با استایل شیک
function renderTransactionList(txs) {
    const list = document.getElementById('tx-list');
    if (!list) return;

    if (txs.length === 0) {
        list.innerHTML = '<div style="text-align:center; padding:40px; opacity:0.3; font-size:0.8rem;">تراکنشی ثبت نشده است</div>';
        return;
    }

    list.innerHTML = txs.map((tx, index) => `
        <div class="tx-card" onclick="showReceipt(${index})">
            <div class="tx-left">
                <div class="tx-icon-box">
                    <i class="fas ${tx.color === 'success' ? 'fa-arrow-down' : 'fa-arrow-up'}" 
                       style="color:var(--accent-${tx.color === 'success' ? 'green' : 'red'})"></i>
                </div>
                <div class="tx-details">
                    <span class="tx-title">${tx.title}</span>
                    <span class="tx-date">${tx.date}</span>
                </div>
            </div>
            <div class="tx-amount" style="color:var(--accent-${tx.color === 'success' ? 'green' : 'red'})">
                ${tx.display_amount}
            </div>
        </div>
    `).join('');
}

// ۵. نمایش رسید دیجیتالی (Digital Receipt)
window.showReceipt = function(index) {
    const tx = TX_DATA[index];
    if (!tx) return;

    const modal = document.getElementById('detail-modal');
    const content = document.getElementById('detail-content');
    
    if (!modal || !content) return;

    let statusColor = tx.color === 'success' ? 'var(--accent-green)' : 'var(--accent-red)';
    
    content.innerHTML = `
        <div style="text-align:center; margin-bottom:20px;">
            <div style="font-size:0.8rem; color:#666;">مبلغ تراکنش</div>
            <div style="font-size:1.8rem; font-weight:900; font-family:'Roboto Mono'; margin:5px 0;">${tx.display_amount}</div>
            <div style="display:inline-block; padding:4px 12px; border-radius:8px; background:rgba(255,255,255,0.05); font-size:0.7rem; color:${statusColor}; border:1px solid ${statusColor}">
                ${tx.status || 'تکمیل شده'}
            </div>
        </div>
        <div style="border-top:1px dashed #333; padding-top:15px;">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="color:#666; font-size:0.8rem;">نوع تراکنش:</span>
                <span style="font-weight:bold; font-size:0.85rem;">${tx.title}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span style="color:#666; font-size:0.8rem;">تاریخ و ساعت:</span>
                <span style="font-size:0.8rem;">${tx.date}</span>
            </div>
        </div>
    `;

    modal.classList.add('active');
    tg.HapticFeedback.impactOccurred('medium');
};

// ۶. مدیریت حریم خصوصی (Privacy Mode)
let isPrivate = false;
window.togglePrivacy = function() {
    isPrivate = !isPrivate;
    const tomanEl = document.getElementById('balance-toman');
    const uusdEl = document.getElementById('balance-uusd');
    const icon = document.querySelector('.privacy-btn i');

    if (isPrivate) {
        tomanEl.dataset.real = tomanEl.innerText;
        uusdEl.dataset.real = uusdEl.innerText;
        tomanEl.innerText = "****";
        uusdEl.innerText = "****";
        if(icon) icon.className = "fas fa-eye-slash";
    } else {
        tomanEl.innerText = tomanEl.dataset.real || "0";
        uusdEl.innerText = uusdEl.dataset.real || "0.00 USDT";
        if(icon) icon.className = "fas fa-eye";
    }
    tg.HapticFeedback.selectionChanged();
};

// اجرای اولیه
window.onload = function() {
    tg.ready();
    tg.expand();
    fetchWalletData();
};