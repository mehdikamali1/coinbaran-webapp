/* webapp/script.js (v105.0 - Final Production - Dynamic Card & Smart Radar) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // متغیرهای گلوبال
    let checkInterval = null; // برای رادار
    let activeCardNumber = ""; // شماره کارت فعال (از سرور گرفته می‌شود)

    // ==========================================
    // 1. INITIALIZATION & SETUP
    // ==========================================
    window.onload = async function() {
        try {
            tg.ready();
            tg.expand();
            
            // تم مشکی خالص برای لاکچری بودن
            tg.setHeaderColor('#000000');
            tg.setBackgroundColor('#000000');

            if (!tg.initData) {
                console.warn("Dev Mode");
                tg.initData = "query_id=TEST_DEV_MODE"; 
            }

            // 1. دریافت اطلاعات کیف پول
            await fetchWalletData();
            
            // 2. دریافت اطلاعات کارت بانکی فعال (جدید)
            await fetchActiveCardData();

            // حذف لودر با انیمیشن نرم
            const loader = document.getElementById('loader');
            const app = document.getElementById('app-container');
            if(loader && app) {
                loader.style.opacity = '0';
                loader.style.pointerEvents = 'none';
                setTimeout(() => {
                    loader.style.display = 'none';
                    app.style.opacity = '1';
                }, 600);
            }

        } catch (error) {
            console.error("Init Error:", error);
        }
    };

    // ==========================================
    // 2. DATA FETCHING (Wallet & Card)
    // ==========================================
    
    // دریافت موجودی و تراکنش‌ها
    async function fetchWalletData() {
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/get_wallet_data`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await res.json();
            
            if (data.status === 'success') {
                document.getElementById('balance-toman').innerText = data.balances.toman;
                document.getElementById('balance-uusd').innerText = data.balances.uusd; // $ در CSS هندل شده یا دستی اضافه شود
                renderTransactions(data.transactions);
            }
        } catch (e) { console.error(e); }
    }

    // دریافت کارت بانکی فعال از سرور (NEW)
    async function fetchActiveCardData() {
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/get_active_card`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await res.json();

            if (data.status === 'success') {
                activeCardNumber = data.card_number; // ذخیره برای کپی
                
                // آپدیت نام بانک در بالای کارت
                const bankLogo = document.querySelector('.bank-card-visual div[style*="absolute"]'); // پیدا کردن المنت نام بانک
                if(bankLogo) bankLogo.innerText = data.bank_name;

                // آپدیت نام صاحب حساب
                const holderName = document.querySelector('.card-holder');
                if(holderName) holderName.innerText = data.owner_name;

                // آپدیت شماره کارت (جدا کردن ۴ رقم ۴ رقم)
                const numContainer = document.querySelector('.card-number');
                if(numContainer) {
                    numContainer.innerHTML = ''; // پاک کردن قبلی
                    const chunks = data.card_number.match(/.{1,4}/g) || [data.card_number];
                    chunks.forEach(chunk => {
                        const span = document.createElement('span');
                        span.innerText = chunk;
                        numContainer.appendChild(span);
                    });
                }
            }
        } catch (e) {
            console.error("Card Fetch Error:", e);
            // در صورت خطا، یک مقدار پیش‌فرض ست می‌شود (که در HTML هست)
            activeCardNumber = "6219861987089975"; 
        }
    }

    // رندر لیست تراکنش‌ها
    function renderTransactions(txs) {
        const list = document.getElementById('tx-list');
        if (!list) return;
        list.innerHTML = '';
        
        if (!txs || txs.length === 0) { 
            list.innerHTML = '<div style="text-align:center;padding:30px;color:#666;font-size:0.8rem">هنوز تراکنشی ندارید</div>'; 
            return; 
        }

        txs.forEach(tx => {
            // تعیین رنگ و آیکون
            let color = '#FFD700'; // زرد (پیش‌فرض/در انتظار)
            let iconClass = 'fa-clock';
            
            if(tx.color === 'success') { 
                color = '#0ECB81'; // سبز
                iconClass = 'fa-arrow-down'; 
            } else if(tx.color === 'danger') { 
                color = '#F6465D'; // قرمز
                iconClass = 'fa-arrow-up'; 
            }

            const html = `
                <div class="tx-item">
                    <div style="display:flex; align-items:center; gap:15px;">
                        <div class="tx-icon"><i class="fas ${iconClass}" style="color:${color}"></i></div>
                        <div>
                            <div style="color:#fff; font-size:0.9rem; font-weight:bold;">${tx.title}</div>
                            <div style="color:#666; font-size:0.75rem;">${tx.date}</div>
                        </div>
                    </div>
                    <div style="color:${color}; font-family:'Roboto Mono'; font-weight:bold;">${tx.display_amount}</div>
                </div>
            `;
            list.insertAdjacentHTML('beforeend', html);
        });
    }

    // ==========================================
    // 3. UI INTERACTIONS (Modal & Input)
    // ==========================================
    
    window.openDepositModal = function() { 
        document.getElementById('deposit-modal').classList.add('active'); 
        tg.HapticFeedback.impactOccurred('medium');
    };
    
    window.closeDepositModal = function() { 
        document.getElementById('deposit-modal').classList.remove('active'); 
        stopAutoCheck(); // خاموش کردن رادار
    };

    window.copyCardNumber = function() {
        if(!activeCardNumber) activeCardNumber = "6219861987089975"; // Fallback
        navigator.clipboard.writeText(activeCardNumber).then(() => {
            tg.showAlert("✅ شماره کارت کپی شد!");
            tg.HapticFeedback.notificationOccurred('success');
        });
    };

    // فرمت دهی مبلغ (سه رقم سه رقم)
    window.formatAmount = function(input) {
        let val = input.value.replace(/[^0-9]/g, '');
        if (!val) { input.value = ''; return; }
        input.value = parseInt(val).toLocaleString();
    };

    window.toggleManualUpload = function() {
        const area = document.getElementById('manual-upload-area');
        if(area.style.display === 'none') {
            area.style.display = 'block';
            // اسکرول به پایین برای دیده شدن
            area.scrollIntoView({behavior: "smooth"});
        } else {
            area.style.display = 'none';
        }
    };

    // ==========================================
    // 4. SMART CHECK LOGIC (Radar System)
    // ==========================================

    window.startAutoCheck = function() {
        const input = document.getElementById('deposit-amount');
        const rawAmount = input.value.replace(/,/g, '');
        const amount = parseInt(rawAmount);

        if (!amount || amount < 10000) {
            tg.showAlert("لطفاً مبلغ را صحیح وارد کنید (حداقل ۱۰,۰۰۰ تومان)");
            return;
        }

        // 1. تغییر ظاهر به حالت رادار
        document.getElementById('radar-section').style.display = 'block';
        document.getElementById('btn-confirm').style.display = 'none';
        input.disabled = true; // قفل کردن اینپوت
        
        tg.HapticFeedback.notificationOccurred('warning');

        // 2. ایجاد درخواست "در انتظار" در سرور
        createPendingRequest(amount);
    };

    async function createPendingRequest(amount) {
        // ساخت یک فایل مجازی برای فریب دادن API (چون عکس اجباری است)
        const blob = new Blob(["waiting_for_sms_auto"], { type: "text/plain" });
        const file = new File([blob], "auto_wait.txt");

        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('amount', amount);
        formData.append('receipt', file);

        try {
            await fetch(`${API_BASE_URL}/webapp/submit_deposit`, { method: 'POST', body: formData });
            
            // 3. شروع چک کردن مداوم (Polling) هر 5 ثانیه
            checkInterval = setInterval(() => checkTransactionStatus(amount), 5000);

        } catch (e) {
            tg.showAlert("خطا در اتصال به سرور.");
            stopAutoCheck();
        }
    }

    async function checkTransactionStatus(amount) {
        // دریافت مجدد اطلاعات برای دیدن تغییرات
        const res = await fetch(`${API_BASE_URL}/webapp/get_wallet_data`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg.initData })
        });
        const data = await res.json();

        if (data.status === 'success' && data.transactions.length > 0) {
            const lastTx = data.transactions[0];
            // حذف کاراکترهای غیر عددی از مبلغ نمایشی (مثلا "+ 50,000 T")
            const txAmount = parseInt(lastTx.display_amount.replace(/[^0-9]/g, ''));
            
            // شرط موفقیت: رنگ سبز باشد و مبلغ دقیقاً یکی باشد (با تلورانس کم)
            if (lastTx.color === 'success' && Math.abs(txAmount - amount) < 500) { 
                
                // === SUCCESS STATE ===
                clearInterval(checkInterval);
                checkInterval = null;

                const radarBox = document.getElementById('radar-section');
                radarBox.innerHTML = `
                    <div style="font-size:3.5rem; color:#0ECB81; margin-bottom:15px; animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                        <i class="fas fa-check-circle"></i>
                    </div>
                    <h3 style="color:#fff; margin:0; font-size:1.2rem;">واریز تایید شد!</h3>
                    <p style="color:#888; font-size:0.8rem;">مبلغ به حساب شما افزوده شد.</p>
                `;
                
                tg.HapticFeedback.notificationOccurred('success');
                
                // آپدیت موجودی در صفحه اصلی
                fetchWalletData(); 

                // بستن مودال بعد از 3 ثانیه
                setTimeout(() => {
                    closeDepositModal();
                    // ریست کردن رادار برای دفعه بعد
                    setTimeout(() => {
                        radarBox.innerHTML = `
                            <div class="radar-spinner"></div>
                            <h4 style="margin:10px 0 5px; color:#0ECB81;">در حال انتظار واریز...</h4>
                            <p style="font-size:0.75rem; color:#888; margin:0;">سیستم به طور خودکار واریز شما را شناسایی می‌کند.</p>
                        `;
                    }, 500);
                }, 3000);
            }
        }
    }

    window.stopAutoCheck = function() {
        if (checkInterval) clearInterval(checkInterval);
        checkInterval = null;
        
        // بازگرداندن UI به حالت اول
        document.getElementById('radar-section').style.display = 'none';
        document.getElementById('btn-confirm').style.display = 'block';
        
        const input = document.getElementById('deposit-amount');
        if(input) {
            input.disabled = false;
            input.value = '';
        }
        document.getElementById('manual-upload-area').style.display = 'none';
    };

    window.submitManual = async function() {
        const input = document.getElementById('deposit-amount');
        const fileInput = document.getElementById('receipt-file');
        const rawAmount = input.value.replace(/,/g, '');
        const amount = parseInt(rawAmount);

        if (!amount || fileInput.files.length === 0) {
            tg.showAlert("لطفاً هم مبلغ و هم تصویر فیش را وارد کنید.");
            return;
        }

        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('amount', amount);
        formData.append('receipt', fileInput.files[0]);

        try {
            const res = await fetch(`${API_BASE_URL}/webapp/submit_deposit`, { method: 'POST', body: formData });
            const d = await res.json();
            
            if (res.ok && d.status === 'success') {
                tg.showAlert("✅ فیش ارسال شد. منتظر بررسی ادمین باشید.");
                closeDepositModal();
            } else {
                tg.showAlert("خطا: " + (d.message || "نامشخص"));
            }
        } catch (e) { tg.showAlert("خطای شبکه"); }
    };

})();