/* webapp/script.js (v100.0 - Final Production - Smart Deposit Logic) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // تنظیمات
    let MIN_SPLASH_TIME = 3500; 
    let pollingInterval = null; // برای رادار واریز

    // المنت‌های اصلی
    const els = {
        balanceToman: document.getElementById('balance-toman'),
        balanceUusd: document.getElementById('balance-uusd'),
        txList: document.getElementById('tx-list')
    };

    // ==========================================
    // 1. INITIALIZATION
    // ==========================================
    window.onload = async function() {
        try {
            tg.ready();
            tg.expand();
            
            // تنظیم رنگ هدر برای زیبایی
            tg.setHeaderColor('#050505');
            tg.setBackgroundColor('#050505');

            if (!tg.initData) {
                console.warn("Test Mode Active");
                tg.initData = "query_id=TEST_DEV_MODE"; 
            }

            // لود اولیه دیتا
            await fetchWalletData();

            // مخفی کردن لودر بعد از اتمام کار
            setTimeout(hideLoader, 1000);

        } catch (error) {
            console.error("Init Error:", error);
            hideLoader();
        }
    };

    function hideLoader() {
        const loader = document.getElementById('loader');
        const app = document.getElementById('app-container');
        if(loader) {
            loader.style.opacity = '0';
            loader.style.pointerEvents = 'none'; // کلیک رد شود
            setTimeout(() => {
                loader.style.display = 'none';
                app.classList.remove('hidden-content');
                app.classList.add('fade-in-active');
            }, 800);
        }
    }

    // ==========================================
    // 2. DATA FETCHING
    // ==========================================
    async function fetchWalletData() {
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/get_wallet_data`, {
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await res.json();
            
            if (data.status === 'success') {
                // آپدیت موجودی‌ها
                if(els.balanceToman) els.balanceToman.innerText = data.balances.toman;
                if(els.balanceUusd) els.balanceUusd.innerText = `${data.balances.uusd} $`;
                
                // رندر لیست تراکنش‌ها
                renderTransactions(data.transactions);
            }
        } catch (e) {
            console.error("Fetch Error:", e);
        }
    }

    function renderTransactions(txs) {
        if (!els.txList) return;
        els.txList.innerHTML = '';
        
        if (!txs || txs.length === 0) { 
            els.txList.innerHTML = '<div style="text-align:center;padding:30px;color:#666;font-size:0.8rem">تراکنشی یافت نشد</div>'; 
            return; 
        }

        txs.forEach((tx, index) => {
            const div = document.createElement('div');
            div.className = 'tx-card ripple-btn';
            
            // تعیین رنگ و آیکون بر اساس وضعیت
            let colorClass = '#fff';
            let icon = '';
            
            if(tx.color === 'success') { 
                colorClass = 'var(--gold-primary)'; // طلایی برای موفق
                icon = '<i class="fas fa-arrow-down" style="color:var(--gold-primary)"></i>'; 
            } else if(tx.color === 'danger') { 
                colorClass = '#F6465D'; // قرمز برای برداشت
                icon = '<i class="fas fa-arrow-up" style="color:#F6465D"></i>'; 
            } else { 
                colorClass = '#F0B90B'; 
                icon = '<i class="fas fa-clock" style="color:#F0B90B"></i>'; 
            }

            div.innerHTML = `
                <div class="tx-left">
                    <div class="tx-icon-box">${icon}</div>
                    <div class="tx-details">
                        <span class="tx-title">${tx.title}</span>
                        <span class="tx-date">${tx.date}</span>
                    </div>
                </div>
                <div class="tx-amount" style="color:${colorClass}">${tx.display_amount}</div>
            `;
            els.txList.appendChild(div);
        });
    }

    // ==========================================
    // 3. SMART DEPOSIT FUNCTIONS
    // ==========================================
    
    // باز و بسته کردن مدال
    window.openSmartDepositModal = function() { 
        document.getElementById('deposit-modal').classList.add('active'); 
        tg.HapticFeedback.impactOccurred('medium');
    };
    window.closeDepositModal = function() { 
        document.getElementById('deposit-modal').classList.remove('active'); 
        stopSmartCheck(); // اگر رادار روشن است، خاموش شود
    };

    // کپی شماره کارت
    window.copyCardNumber = function() {
        // شماره کارت تستی (می‌توانی از کانفیگ بگیری اگر داینامیک کردی)
        const cardNumber = "6219861987089975"; 
        navigator.clipboard.writeText(cardNumber).then(() => {
            tg.showAlert("✅ شماره کارت کپی شد!");
            tg.HapticFeedback.notificationOccurred('success');
        });
    };

    // فرمت دهی مبلغ (سه رقم سه رقم)
    window.formatAmountInput = function(input) {
        let val = input.value.replace(/[^0-9]/g, ''); // حذف غیر عدد
        if (!val) { input.value = ''; return; }
        input.value = parseInt(val).toLocaleString(); // افزودن ویرگول
    };

    // شروع پروسه هوشمند (رادار)
    window.startSmartCheck = function() {
        const input = document.getElementById('deposit-amount');
        const rawAmount = input.value.replace(/,/g, '');
        const amount = parseInt(rawAmount);

        if (!amount || amount < 10000) {
            tg.showAlert("لطفاً مبلغ صحیح را وارد کنید (حداقل ۱۰,۰۰۰ تومان)");
            return;
        }

        // نمایش رادار و مخفی کردن دکمه و اینپوت
        document.getElementById('radar-area').style.display = 'block';
        document.getElementById('btn-confirm-dep').style.display = 'none';
        input.disabled = true;
        document.getElementById('manual-upload-section').style.display = 'block'; // نمایش گزینه آپلود دستی اگر خودکار کار نکرد

        tg.HapticFeedback.notificationOccurred('warning'); // ویبره شروع جستجو

        // ثبت درخواست در سرور (تا سرور بداند منتظر چه مبلغی باشد)
        // نکته: اینجا فیش نداریم، پس فقط "اعلام انتظار" می‌کنیم.
        // اما چون لاجیک سرور ما بر اساس "تطبیق مبلغ" است، ما نیاز داریم 
        // یک رکورد Pending در دیتابیس ایجاد کنیم.
        // برای سادگی، فعلاً یک درخواست "دستی بدون عکس" می‌سازیم که سرور بفهمد.
        createPendingRequest(amount);
    };

    // ایجاد درخواست انتظار در سرور
    async function createPendingRequest(amount) {
        // یک عکس خالی یا پیش‌فرض برای این مرحله می‌فرستیم (چون کاربر هنوز فیش نداده)
        // یا بهتر: سرور را طوری تنظیم کردیم که اگر فیش نبود هم قبول کند؟ 
        // در کد فعلی سرور (v115) آپلود فایل اجباری است. 
        // راه حل هوشمندانه: یک فایل متنی خالی به عنوان فیش موقت می‌فرستیم.
        
        const blob = new Blob(["waiting_for_sms"], { type: "text/plain" });
        const file = new File([blob], "auto_wait.txt");

        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('amount', amount);
        formData.append('receipt', file);

        try {
            // ارسال به سرور برای ثبت وضعیت "در انتظار"
            await fetch(`${API_BASE_URL}/webapp/submit_deposit`, { 
                method: 'POST', body: formData 
            });
            
            // شروع پولینگ (چک کردن مداوم وضعیت)
            pollingInterval = setInterval(() => checkTransactionStatus(amount), 5000); // هر ۵ ثانیه چک کن

        } catch (e) {
            console.error("Pending Req Error:", e);
        }
    }

    // چک کردن اینکه آیا واریز تایید شد؟
    async function checkTransactionStatus(amount) {
        // دریافت دوباره اطلاعات کیف پول
        const res = await fetch(`${API_BASE_URL}/webapp/get_wallet_data`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData: tg.initData })
        });
        const data = await res.json();

        if (data.status === 'success') {
            // بررسی می‌کنیم آیا تراکنشی با این مبلغ "Approved" شده است؟
            // (ساده‌ترین راه: چک کردن تغییر موجودی یا لیست تراکنش‌ها)
            // اما چون لیست تراکنش‌ها را داریم، آخرین تراکنش را چک می‌کنیم.
            const lastTx = data.transactions[0]; // اولین آیتم جدیدترین است
            
            // تبدیل مبلغ نمایشی (مثلا "+50,000 T") به عدد
            const txAmount = parseInt(lastTx.display_amount.replace(/[^0-9]/g, ''));
            
            // اگر مبلغ یکی بود و رنگش سبز (موفق) بود
            if (lastTx.color === 'success' && Math.abs(txAmount - amount) < 1000) { 
                // تایید شد!
                stopSmartCheck();
                document.getElementById('radar-area').innerHTML = `
                    <div style="color:#0ECB81; font-size:3rem; margin-bottom:10px;"><i class="fas fa-check-circle"></i></div>
                    <h3 style="color:#fff; margin:0;">واریز تایید شد!</h3>
                    <p style="color:#888;">مبلغ به کیف پول شما اضافه گردید.</p>
                `;
                tg.HapticFeedback.notificationOccurred('success');
                fetchWalletData(); // آپدیت نهایی UI
                
                // بستن مودال بعد از ۳ ثانیه
                setTimeout(closeDepositModal, 3000);
            }
        }
    }

    window.stopSmartCheck = function() {
        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = null;
        // ریست کردن UI مودال برای دفعه بعد
        const radar = document.getElementById('radar-area');
        if(radar) {
            radar.style.display = 'none';
            // بازگرداندن متن اصلی رادار اگر تغییر کرده بود
            if (radar.innerHTML.includes('fa-check-circle')) {
                radar.innerHTML = `
                    <div class="radar-container"><div class="radar-core"></div><div class="radar-wave"></div><div class="radar-wave"></div></div>
                    <p style="font-size:0.85rem; color:#0ECB81; margin-top:10px;">سیستم هوشمند در حال جستجوی واریز شماست...</p>
                    <p style="font-size:0.75rem; color:#666;">لطفاً پس از واریز، ۱ تا ۲ دقیقه در این صفحه بمانید.</p>
                `;
            }
        }
        document.getElementById('btn-confirm-dep').style.display = 'block';
        const input = document.getElementById('deposit-amount');
        if(input) { input.disabled = false; input.value = ''; }
        document.getElementById('manual-upload-section').style.display = 'none';
        document.getElementById('btn-manual-submit').style.display = 'none';
    };

    // ==========================================
    // 4. MANUAL DEPOSIT (Fallback)
    // ==========================================
    window.handleFileSelect = function(input) {
        const label = document.getElementById('file-label');
        const icon = document.getElementById('up-icon');
        const btn = document.getElementById('btn-manual-submit');
        
        if (input.files && input.files.length > 0) {
            label.innerText = "تصویر انتخاب شد: " + input.files[0].name;
            label.style.color = "#0ECB81";
            icon.className = "fas fa-check-circle upload-icon";
            icon.style.color = "#0ECB81";
            btn.style.display = 'block'; // نمایش دکمه ارسال فیش
        }
    };

    window.submitManualDeposit = async function() {
        const input = document.getElementById('deposit-amount');
        const fileInput = document.getElementById('receipt-file');
        const rawAmount = input.value.replace(/,/g, '');
        const amount = parseInt(rawAmount);

        if (!amount || fileInput.files.length === 0) {
            tg.showAlert("لطفاً فیش واریز را انتخاب کنید.");
            return;
        }

        const btn = document.getElementById('btn-manual-submit');
        btn.disabled = true; btn.innerText = "در حال آپلود...";

        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('amount', amount);
        formData.append('receipt', fileInput.files[0]);

        try {
            const res = await fetch(`${API_BASE_URL}/webapp/submit_deposit`, { 
                method: 'POST', body: formData 
            });
            const result = await res.json();
            
            if (res.ok && result.status === 'success') {
                tg.showAlert("✅ فیش ارسال شد. منتظر تایید ادمین باشید.");
                closeDepositModal();
            } else {
                tg.showAlert("خطا: " + result.message);
            }
        } catch (e) {
            tg.showAlert("خطای شبکه.");
        } finally {
            btn.disabled = false; btn.innerText = "ارسال فیش";
        }
    };

})();