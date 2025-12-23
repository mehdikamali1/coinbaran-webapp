/* webapp/wallet-engine.js (v110.1 - FINAL STABLE RIAL VERSION - NO SUMMARIZATION) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin + "/api/webapp"; 
    
    // ۱. کش کردن کامل تمام المان‌های UI برای دسترسی سریع و جلوگیری از کراش
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

    // ۲. تابع کمکی برای فرمت ۳ رقم ۳ رقم اعداد
    function numberWithCommas(x) {
        if (!x) return "0";
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    // ۳. سیستم جداکننده ۳ رقم هوشمند موقع تایپ کاربر
    function applyInputFormatting(input) {
        if (!input) return;
        input.addEventListener('input', function(e) {
            let value = e.target.value.replace(/[^0-9]/g, '');
            if (value) {
                // نمایش عدد با کاما در فیلد ورودی
                e.target.dataset.raw = value; // ذخیره عدد خالص برای محاسبات
            } else {
                e.target.dataset.raw = "";
            }
        });
    }

    // اعمال روی اینپوت‌های اصلی
    applyInputFormatting(els.autoAmountInput);
    applyInputFormatting(els.manualAmount);
    applyInputFormatting(els.withdrawAmount);

    // ۴. انیمیشن لوکس شماره‌انداز برای موجودی تومانی
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

    // ۵. دریافت اطلاعات اولیه و موجودی از سرور صرافی
    async function initWallet() {
        try {
            const response = await fetch(`${API_BASE_URL}/get_user_data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await response.json();

            if (data.status === 'success') {
                const targetBal = parseInt(data.toman_balance.replace(/,/g, '')) || 0;
                animateValue(els.tomanBalance, 0, targetBal, 1000);

                if (data.admin_card && els.adminCardNum) {
                    els.adminCardNum.innerText = data.admin_card;
                }

                renderUserCards(data.approved_cards || []);
            } else {
                tg.showPopup({ message: "خطا در بارگذاری: " + data.message });
            }
        } catch (error) {
            console.error("Wallet Init Error:", error);
            tg.showAlert("ارتباط با سرور برقرار نشد.");
        }
    }

    // ۶. رندر کارت‌های بانکی تایید شده کاربر
    function renderUserCards(cards) {
        if (!els.cardsContainer || !els.withdrawSelect) return;

        if (cards.length === 0) {
            els.cardsContainer.innerHTML = '<div style="text-align:center; padding:15px; color:#f6465d; font-size:0.8rem;">کارت تایید شده‌ای یافت نشد.</div>';
            return;
        }

        els.cardsContainer.innerHTML = cards.map(card => `
            <div class="user-card-item">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="icon-box icon-gold" style="width:30px; height:30px; font-size:0.8rem;"><i class="fas fa-credit-card"></i></div>
                    <span class="bank-name">${card.bank_name}</span>
                </div>
                <span class="masked-num" style="direction:ltr;">**** ${card.card_number.slice(-4)}</span>
            </div>
        `).join('');

        els.withdrawSelect.innerHTML = '<option value="" disabled selected>انتخاب کارت بانکی مقصد</option>' + 
            cards.map(card => `
                <option value="${card.card_number}">${card.bank_name} - ${card.card_number.slice(-4)}</option>
            `).join('');
    }

    // ۷. منطق اصلی دکمه ایجاد کد پرداخت (نسخه پایدار + تبدیل ریال)
    window.generateSmartPayment = async function() {
        const amountValue = els.autoAmountInput.value; // استفاده از مقدار فیلد (پایدارترین حالت)
        
        if (!amountValue || parseFloat(amountValue) < 10000) {
            tg.showAlert("حداقل مبلغ واریز هوشمند ۱۰,۰۰۰ تومان است.");
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
                const uniqueRial = Math.round(uniqueToman * 10); // تبدیل دقیق به ریال

                // سوئیچ پنل‌ها
                els.autoInputGroup.style.display = 'none';
                els.smartDetails.style.display = 'block';
                
                // نمایش مبالغ تفکیک شده
                els.smartTomanDisplay.innerText = numberWithCommas(uniqueToman) + " تومان";
                els.smartRialValue.innerText = numberWithCommas(uniqueRial);
                
                tg.HapticFeedback.notificationOccurred('success');
            } else {
                tg.showAlert("خطا: " + result.message);
            }
        } catch (error) {
            tg.showAlert("خطا در سیستم واریز هوشمند.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    };

    // ۸. بازنشانی فرم واریز
    window.resetSmartPanel = function() {
        els.autoInputGroup.style.display = 'block';
        els.smartDetails.style.display = 'none';
        els.autoAmountInput.value = "";
    };

    // ۹. ارسال فیش واریز دستی
    window.submitManualDeposit = async function() {
        const amount = els.manualAmount.value;
        const file = els.receiptFile.files[0];

        if (!amount || !file) {
            tg.showAlert("لطفاً مبلغ و تصویر فیش را وارد کنید.");
            return;
        }

        const btn = document.querySelector('#panel-manual .btn-action');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> ارسال...';

        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('amount', amount);
        formData.append('receipt', file);

        try {
            const response = await fetch(`${API_BASE_URL}/wallet/deposit/manual`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (result.status === 'success') {
                tg.showAlert("فیش شما ثبت شد و در صف تایید قرار گرفت.");
                els.manualAmount.value = "";
                els.receiptFile.value = "";
            } else {
                tg.showAlert(result.message);
            }
        } catch (e) {
            tg.showAlert("خطا در آپلود.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>ارسال فیش جهت تایید</span><i class="fas fa-paper-plane"></i>';
        }
    };

    // ۱۰. درخواست برداشت وجه
    window.requestWithdrawal = async function() {
        const amount = els.withdrawAmount.value;
        const cardNum = els.withdrawSelect.value;

        if (!amount || !cardNum) {
            tg.showAlert("مبلغ و کارت مقصد را انتخاب کنید.");
            return;
        }

        tg.showConfirm(`آیا از برداشت ${numberWithCommas(amount)} تومان اطمینان دارید؟`, async (ok) => {
            if (!ok) return;

            const btn = document.querySelector('#panel-withdraw .btn-action');
            btn.disabled = true;
            try {
                const response = await fetch(`${API_BASE_URL}/wallet/withdraw/request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ initData: tg.initData, amount: amount, card_number: cardNum })
                });
                const result = await response.json();
                if (result.status === 'success') {
                    tg.showAlert("درخواست برداشت ثبت شد.");
                    location.reload();
                } else {
                    tg.showAlert(result.message);
                }
            } catch (e) {
                tg.showAlert("خطا در ثبت درخواست.");
            } finally {
                btn.disabled = false;
            }
        });
    };

    // اجرای نهایی
    tg.ready();
    initWallet();
})();