/* webapp/wallet-engine.js (v111.0 - FINAL FULL VERSION - NO SUMMARIZATION) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    // تشخیص خودکار آدرس API بر اساس دامنه فعلی
    const API_BASE_URL = window.location.origin + "/api/webapp"; 
    
    // ۱. کش کردن المان‌های رابط کاربری
    const els = {
        tomanBalance: document.getElementById('balance-toman'),
        cardsContainer: document.getElementById('user-cards-container'),
        withdrawSelect: document.getElementById('withdraw-card-select'),
        manualAmount: document.getElementById('manual-amount-input'),
        receiptFile: document.getElementById('receipt-file'),
        withdrawAmount: document.getElementById('withdraw-amount-input'),
        adminCardNum: document.getElementById('admin-card'),
        autoAmountInput: document.getElementById('auto-amount-input'),
        autoInputGroup: document.getElementById('auto-deposit-input-group'),
        smartDetails: document.getElementById('smart-payment-details'),
        smartTomanDisplay: document.getElementById('smart-toman-display'),
        smartRialValue: document.getElementById('smart-rial-value')
    };

    // ۲. تابع فرمت ۳ رقم ۳ رقم اعداد
    function numberWithCommas(x) {
        if (!x) return "0";
        let parts = x.toString().split(".");
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return parts.join(".");
    }

    // ۳. سیستم جداکننده هوشمند (اصلاح شده برای جلوگیری از تداخل با محاسبات)
    function applyInputFormatting(input) {
        if (!input) return;
        input.addEventListener('input', function(e) {
            // حذف تمام کاراکترهای غیر عددی برای پردازش
            let rawValue = e.target.value.replace(/[^0-9]/g, '');
            if (rawValue) {
                // نمایش عدد با کاما در فیلد ورودی برای تجربه کاربری بهتر
                e.target.value = rawValue.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
                // ذخیره مقدار خالص بدون کاما در dataset برای استفاده در API
                e.target.dataset.raw = rawValue;
            } else {
                e.target.dataset.raw = "";
            }
        });
    }

    // اعمال فرمت روی اینپوت‌های مبلغ
    applyInputFormatting(els.autoAmountInput);
    applyInputFormatting(els.manualAmount);
    applyInputFormatting(els.withdrawAmount);

    // ۴. انیمیشن شماره‌انداز موجودی
    function animateValue(obj, start, end, duration) {
        if (!obj) return;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const current = Math.floor(progress * (end - start) + start);
            obj.innerHTML = numberWithCommas(current);
            if (progress < 1) {
                window.requestAnimationFrame(step);
            }
        };
        window.requestAnimationFrame(step);
    }

    // ۵. دریافت اطلاعات اولیه و موجودی
    async function initWallet() {
        try {
            const response = await fetch(`${API_BASE_URL}/get_user_data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await response.json();

            if (data.status === 'success') {
                const rawBal = data.toman_balance.replace(/,/g, '');
                const targetBal = parseInt(rawBal) || 0;
                animateValue(els.tomanBalance, 0, targetBal, 1000);

                if (data.admin_card && els.adminCardNum) {
                    els.adminCardNum.innerText = data.admin_card;
                }

                renderUserCards(data.approved_cards || []);
            } else {
                console.error("Server message:", data.message);
            }
        } catch (error) {
            console.error("Wallet Init Error:", error);
        }
    }

    // ۶. رندر کارت‌های بانکی در لیست برداشت
    function renderUserCards(cards) {
        if (!els.withdrawSelect) return;
        if (cards.length === 0) {
            els.withdrawSelect.innerHTML = '<option value="" disabled selected>کارت تایید شده‌ای ندارید</option>';
            return;
        }
        els.withdrawSelect.innerHTML = '<option value="" disabled selected>انتخاب کارت بانکی مقصد</option>' + 
            cards.map(card => `<option value="${card.card_number}">${card.bank_name} - ${card.card_number.slice(-4)}</option>`).join('');
    }

    // ۷. منطق دکمه ایجاد کد پرداخت (هسته اصلی حل مشکل)
    window.generateSmartPayment = async function() {
        // استفاده از مقدار خالص ذخیره شده در dataset به جای value (برای دور زدن کاماها)
        const amountValue = els.autoAmountInput.dataset.raw;
        
        if (!amountValue || parseFloat(amountValue) < 10000) {
            tg.showAlert("حداقل مبلغ جهت واریز هوشمند ۱۰,۰۰۰ تومان است.");
            return;
        }

        const btn = document.querySelector('#auto-deposit-input-group .btn-action');
        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> در حال ایجاد...';

        try {
            const response = await fetch(`${API_BASE_URL}/wallet/deposit/auto/init`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    initData: tg.initData,
                    amount: parseFloat(amountValue)
                })
            });
            const result = await response.json();

            if (result.status === 'success') {
                const uniqueToman = parseFloat(result.unique_amount);
                // تبدیل دقیق تومان به ریال (ضرب در ۱۰)
                const uniqueRial = Math.floor(uniqueToman * 10);

                // مدیریت نمایش پنل‌ها
                els.autoInputGroup.style.display = 'none';
                els.smartDetails.style.display = 'block';
                
                // نمایش مبالغ در فیلدهای مربوطه
                els.smartTomanDisplay.innerText = numberWithCommas(uniqueToman.toFixed(0)) + " تومان";
                els.smartRialValue.innerText = numberWithCommas(uniqueRial);
                
                tg.HapticFeedback.notificationOccurred('success');
            } else {
                tg.showAlert("خطا: " + result.message);
            }
        } catch (error) {
            console.error("Smart Payment Error:", error);
            tg.showAlert("ارتباط با سرور برقرار نشد. لطفاً اینترنت خود را چک کنید.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    };

    // ۸. بازگشت به حالت انتخاب مبلغ
    window.resetSmartPanel = function() {
        els.autoInputGroup.style.display = 'block';
        els.smartDetails.style.display = 'none';
        els.autoAmountInput.value = "";
        els.autoAmountInput.dataset.raw = "";
    };

    // ۹. ارسال فیش واریز دستی
    window.submitManualDeposit = async function() {
        const rawAmount = els.manualAmount.dataset.raw;
        const file = els.receiptFile.files[0];

        if (!rawAmount || !file) {
            tg.showAlert("لطفاً مبلغ و تصویر فیش را وارد کنید.");
            return;
        }

        const btn = document.querySelector('#panel-manual .btn-action');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> در حال ارسال...';

        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('amount', rawAmount);
        formData.append('receipt', file);

        try {
            const response = await fetch(`${API_BASE_URL}/wallet/deposit/manual`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (result.status === 'success') {
                tg.showAlert("فیش شما ثبت شد و پس از تایید حساب شما شارژ می‌شود.");
                els.manualAmount.value = "";
                els.manualAmount.dataset.raw = "";
                els.receiptFile.value = "";
                document.getElementById('file-name-label').innerText = "انتخاب یا تصویربرداری از فیش";
            } else {
                tg.showAlert(result.message);
            }
        } catch (e) {
            tg.showAlert("خطا در آپلود فیش.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };

    // ۱۰. درخواست برداشت وجه
    window.requestWithdrawal = async function() {
        const rawAmount = els.withdrawAmount.dataset.raw;
        const cardNum = els.withdrawSelect.value;

        if (!rawAmount || !cardNum) {
            tg.showAlert("مبلغ و کارت مقصد را انتخاب کنید.");
            return;
        }

        tg.showConfirm(`آیا از درخواست برداشت مبلغ ${numberWithCommas(rawAmount)} تومان اطمینان دارید؟`, async (ok) => {
            if (!ok) return;

            const btn = document.querySelector('#panel-withdraw .btn-action');
            btn.disabled = true;
            try {
                const response = await fetch(`${API_BASE_URL}/wallet/withdraw/request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initData: tg.initData, amount: rawAmount, card_number: cardNum })
                });
                const result = await response.json();
                if (result.status === 'success') {
                    tg.showAlert("درخواست برداشت شما با موفقیت ثبت شد.");
                    setTimeout(() => location.reload(), 2000);
                } else {
                    tg.showAlert(result.message);
                }
            } catch (e) {
                tg.showAlert("خطا در ثبت درخواست برداشت.");
            } finally {
                btn.disabled = false;
            }
        });
    };

    // مقداردهی اولیه
    tg.ready();
    initWallet();
})();