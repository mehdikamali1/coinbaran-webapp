/* webapp/wallet-engine.js (v105.0 - FINAL OPERATIONAL VERSION) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin + "/api/webapp"; 
    
    // کش کردن المان‌های UI برای سرعت بیشتر
    const els = {
        tomanBalance: document.getElementById('balance-toman'),
        cardsContainer: document.getElementById('user-cards-container'),
        withdrawSelect: document.getElementById('withdraw-card-select'),
        manualAmount: document.getElementById('manual-amount-input'),
        receiptFile: document.getElementById('receipt-file'),
        withdrawAmount: document.getElementById('withdraw-amount-input'),
        adminCardNum: document.getElementById('admin-card')
    };

    // ۱. انیمیشن لوکس شمارش اعداد
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

    // ۲. مقداردهی اولیه و دریافت زنده داده‌ها
    async function initWallet() {
        try {
            const response = await fetch(`${API_BASE_URL}/get_user_data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await response.json();

            if (data.status === 'success') {
                // آپدیت موجودی با انیمیشن
                const targetBal = parseInt(data.toman_balance.replace(/,/g, '')) || 0;
                animateValue(els.tomanBalance, 0, targetBal, 1200);

                // نمایش شماره کارت ادمین (در صورت ارسال از سمت سرور)
                if (data.admin_card && els.adminCardNum) {
                    els.adminCardNum.innerText = data.admin_card;
                }

                // رندر کارت‌های بانکی تایید شده کاربر
                renderUserCards(data.approved_cards || []);
            } else {
                tg.showPopup({ message: "خطا در بارگذاری: " + data.message });
            }
        } catch (error) {
            console.error("Wallet Init Error:", error);
            tg.showAlert("ارتباط با سرور برقرار نشد.");
        }
    }

    // ۳. رندر داینامیک کارت‌ها برای واریز هوشمند و برداشت
    function renderUserCards(cards) {
        if (!els.cardsContainer || !els.withdrawSelect) return;

        if (cards.length === 0) {
            const noCardHtml = `
                <div style="text-align:center; padding:15px; background:rgba(246,70,93,0.05); border-radius:12px; color:#f6465d; font-size:0.75rem; border:1px solid rgba(246,70,93,0.1);">
                    <i class="fas fa-exclamation-circle"></i> هیچ کارت تایید شده‌ای ندارید.<br>
                    <small>ابتدا در پروفایل کارت خود را ثبت کنید.</small>
                </div>`;
            els.cardsContainer.innerHTML = noCardHtml;
            els.withdrawSelect.innerHTML = '<option value="">کارت بانکی انتخاب نشده</option>';
            return;
        }

        // بخش واریز هوشمند: نمایش کارت‌هایی که کاربر اجازه دارد از آن‌ها واریز کند
        els.cardsContainer.innerHTML = cards.map(card => `
            <div class="user-card-item">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="icon-box icon-gold" style="width:30px; height:30px; font-size:0.8rem;">
                        <i class="fas fa-credit-card"></i>
                    </div>
                    <span class="bank-name">${card.bank_name}</span>
                </div>
                <span class="masked-num" style="direction:ltr; color:#0ecb81;">**** ${card.card_number.slice(-4)}</span>
            </div>
        `).join('');

        // بخش برداشت: پر کردن منوی انتخابی
        els.withdrawSelect.innerHTML = '<option value="" disabled selected>انتخاب کارت مقصد</option>' + 
            cards.map(card => `
                <option value="${card.card_number}">${card.bank_name} - ${card.card_number.slice(-4)}</option>
            `).join('');
    }

    // ۴. منطق ثبت واریز دستی (آپلود فیش)
    window.submitManualDeposit = async function() {
        const amount = els.manualAmount.value;
        const fileInput = els.receiptFile;
        const file = fileInput.files[0];

        if (!amount || amount < 10000) {
            tg.showAlert("حداقل مبلغ واریز ۱۰,۰۰۰ تومان است.");
            return;
        }
        if (!file) {
            tg.showAlert("لطفاً تصویر فیش واریزی را بارگذاری کنید.");
            return;
        }

        const btn = document.querySelector('#panel-manual .btn-action');
        const originalContent = btn.innerHTML;
        
        btn.disabled = true;
        btn.style.opacity = "0.7";
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> در حال ارسال فایل...';

        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('amount', amount);
        formData.append('receipt', file);

        try {
            const response = await fetch(`${API_BASE_URL}/wallet/deposit/manual`, {
                method: 'POST',
                body: formData
                // توجه: در FormData هدر Content-Type نباید دستی ست شود
            });
            const result = await response.json();

            if (result.status === 'success') {
                tg.showPopup({
                    title: "ارسال موفق",
                    message: "فیش شما ثبت شد. پس از تایید توسط حسابداری، موجودی شما شارژ می‌شود.",
                    buttons: [{type: "ok"}]
                });
                // پاکسازی فرم
                els.manualAmount.value = "";
                fileInput.value = "";
                document.getElementById('file-name-label').innerText = "انتخاب یا تصویربرداری از فیش";
            } else {
                tg.showAlert("خطا: " + result.message);
            }
        } catch (error) {
            tg.showAlert("خطا در آپلود. حجم فایل را بررسی کنید.");
        } finally {
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.innerHTML = originalContent;
        }
    };

    // ۵. منطق نهایی درخواست برداشت (Settlement)
    window.requestWithdrawal = async function() {
        const amount = els.withdrawAmount.value;
        const cardNum = els.withdrawSelect.value;

        if (!amount || amount < 100000) {
            tg.showAlert("حداقل مبلغ قابل برداشت ۱۰۰,۰۰۰ تومان است.");
            return;
        }
        if (!cardNum) {
            tg.showAlert("لطفاً کارت بانکی مقصد را انتخاب کنید.");
            return;
        }

        // تاییدیه نهایی از کاربر قبل از کسر موجودی
        tg.showConfirm(`مبلغ ${parseInt(amount).toLocaleString()} تومان به کارت منتهی به ${cardNum.slice(-4)} واریز شود؟`, async (ok) => {
            if (!ok) return;

            const btn = document.querySelector('#panel-withdraw .btn-action');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال ثبت...';

            try {
                const response = await fetch(`${API_BASE_URL}/wallet/withdraw/request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        initData: tg.initData,
                        amount: amount,
                        card_number: cardNum
                    })
                });
                const result = await response.json();

                if (result.status === 'success') {
                    tg.showAlert("درخواست برداشت با موفقیت ثبت شد و در صف واریز پایا قرار گرفت.");
                    location.reload(); // برای آپدیت لحظه‌ای موجودی کسر شده
                } else {
                    tg.showAlert("❌ " + result.message);
                }
            } catch (e) {
                tg.showAlert("خطای سیستمی. لطفا به پشتیبانی اطلاع دهید.");
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>ثبت درخواست برداشت</span><i class="fas fa-check-circle"></i>';
            }
        });
    };

    // شروع به کار موتور
    tg.ready();
    initWallet();

})();