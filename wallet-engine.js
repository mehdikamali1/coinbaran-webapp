/* webapp/wallet-engine.js (v85.0) */
const API_BASE = window.location.origin + "/api/webapp";
const tg = window.Telegram.WebApp;

// انیمیشن شمارش اعداد
function animateValue(obj, start, end, duration) {
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

// افکت ۳ بعدی پارالاکس بر اساس سنسور
function initParallax() {
    const card = document.querySelector('.asset-card');
    if (!card) return;

    window.addEventListener('deviceorientation', (event) => {
        const x = event.beta;  // -180 to 180
        const y = event.gamma; // -90 to 90
        
        if (x && y) {
            const rotX = (x - 45) / 2; // تنظیم برای حالت عمودی دست
            const rotY = y / 2;
            card.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
            
            // جابجایی درخشش روی کارت
            card.style.setProperty('--x', `${50 + y}%`);
            card.style.setProperty('--y', `${50 + (x-45)}%`);
        }
    });
}

// نمایش رسید تراکنش
function showReceipt(txIndex) {
    const tx = TX_DATA[txIndex];
    const sheet = document.getElementById('receipt-sheet');
    document.getElementById('rcp-title').innerText = tx.title;
    document.getElementById('rcp-amount').innerText = tx.display_amount;
    document.getElementById('rcp-date').innerText = tx.date;
    document.getElementById('rcp-status').innerText = tx.status || 'تایید شده';
    
    sheet.classList.add('active');
    tg.HapticFeedback.impactOccurred('medium');
}

function closeReceipt() {
    document.getElementById('receipt-sheet').classList.remove('active');
}

// وضعیت مخفی سازی موجودی
let isPrivate = false;
function togglePrivacy() {
    isPrivate = !isPrivate;
    const tomanEl = document.getElementById('balance-toman');
    const uusdEl = document.getElementById('balance-uusd');
    const icon = document.getElementById('privacy-icon');

    if (isPrivate) {
        tomanEl.dataset.real = tomanEl.innerText;
        uusdEl.dataset.real = uusdEl.innerText;
        tomanEl.innerText = "****";
        uusdEl.innerText = "****";
        icon.className = "fas fa-eye-slash";
    } else {
        tomanEl.innerText = tomanEl.dataset.real;
        uusdEl.innerText = uusdEl.dataset.real;
        icon.className = "fas fa-eye";
    }
}