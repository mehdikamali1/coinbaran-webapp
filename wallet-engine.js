/* webapp/wallet-engine.js (v109.1 - ULTIMATE FULL VERSION - NO SUMMARIZATION) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin + "/api/webapp"; 
    
    // ۱. کش کردن کامل تمام المان‌های UI برای دسترسی سریع و بهینه
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

    // ۲. تابع کمکی برای جدا کردن ۳ رقم اعداد (Thousand Separator)
    function numberWithCommas(x) {
        if (!x) return "";
        return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }

    // ۳. سیستم جداکننده ۳ رقم هوشمند موقع تایپ کردن (Formatter)
    function applyNumberFormatting(input) {
        if (!input) return;
        input.addEventListener('input', function(e) {
            // حذف تمام کاراکترهای غیر عددی
            let value = e.target.value.replace(/[^0-9]/g, '');
            if (value === "") {
                e.target.value = "";
                return;
            }
            // فرمت کردن و نمایش مجدد در فیلد
            e.target.value = numberWithCommas(value);
        });
    }

    // اعمال فیلتر روی هر سه فیلد مبلغ پروژه
    applyNumberFormatting(els.autoAmountInput);
    applyNumberFormatting(els.manualAmount);
    applyNumberFormatting(els.withdrawAmount);

    // ۴. انیمیشن لوکس و روان شمارش اعداد موجودی کیف پول
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

    // ۵. مقداردهی اولیه و دریافت زنده داده‌های کاربر از سرور
    async function initWallet() {
        try {
            const response = await fetch(`${API_BASE_URL}/get_user_data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await response.json();

            if (data.status === 'success') {
                // تبدیل متن موجودی به عدد خالص برای انیمیشن
                const targetBal = parseInt(data.toman_balance.replace(/,/g, '')) || 0;
                animateValue(els.tomanBalance, 0, targetBal, 1000);

                // نمایش شماره کارت مقصد ادمین
                if (data.admin_card && els.adminCardNum) {
                    els.adminCardNum.innerText = data.admin_card;
                }

                // رندر کردن لیست کارت‌های تایید شده
                renderUserCards(data.approved_cards || []);
            } else {
                tg.showPopup({ message: "خطا در دریافت موجودی: " + data.message });
            }
        } catch (error) {
            console.error("Wallet Init Error:", error);
            tg.showAlert("ارتباط با سرور صرافی قطع می‌باشد.");
        }
    }

    // ۶. رندر داینامیک کارت‌های بانکی تایید شده در سیستم
    function renderUserCards(cards) {
        if (!els.cardsContainer || !els.withdrawSelect) return;

        if (cards.length === 0) {
            const noCardHtml = `
                <div style="text-align:center; padding:15px; color:#f6465d; font-size:0.75rem;">
                    <i class="fas fa-exclamation-circle"></i> هیچ کارت بانکی تایید شده‌ای ندارید.
                </div>`;
            els.cardsContainer.innerHTML = noCardHtml;
            els.withdrawSelect.innerHTML = '<option value="">کارت بانکی یافت نشد</option>';
            return;
        }

        // نمایش لیست کارت‌ها در پنل واریز
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

        // افزودن کارت‌ها به منوی انتخابی برداشت
        els.withdrawSelect.innerHTML = '<option value="" disabled selected>انتخاب کارت مقصد</option>' + 
            cards.map(card => `
                <option value="${card.card_number}">${card.bank_name} - ${card.card_number.slice(-4)}</option>
            `).join('');
    }

    // ۷. منطق ایجاد کد پرداخت هوشمند (تبدیل به ریال یکتا)
    window.generateSmartPayment = async function() {
        // پاکسازی کاماها قبل از ارسال عدد به سرور
        const cleanAmount = els.autoAmountInput.value.replace(/,/g, '');
        
        if (!cleanAmount || parseFloat(cleanAmount) < 10000) {
            tg.showAlert("حداقل مبلغ واریز هوشمند ۱۰,۰۰۰ تومان است.");
            return;
        }

        const btn = document.querySelector('#auto-deposit-input-group .btn-action');
        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> ایجاد شناسه...';

        try {
            const response = await fetch(`${API_BASE_URL}/wallet/deposit/auto/init`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    initData: tg.initData,
                    amount: parseFloat(cleanAmount)
                })
            });
            const result = await response.json();

            if (result.status === 'success') {
                const uniqueToman = parseFloat(result.unique_amount);
                // تبدیل دقیق تومان به ریال جهت واریز در موبایل‌بانک
                const uniqueRial = Math.round(uniqueToman * 10); 

                // تغییر وضعیت نمایش پنل
                els.autoInputGroup.style.display = 'none';
                els.smartDetails.style.display = 'block';
                
                // نمایش مبالغ فرمت شده
                els.smartTomanDisplay.innerText = numberWithCommas(uniqueToman) + " تومان";
                els.smartRialValue.innerText = numberWithCommas(uniqueRial);
                
                tg.HapticFeedback.notificationOccurred('success');
            } else {
                tg.showAlert("خطا: " + result.message);
            }
        } catch (error) {
            tg.showAlert("خطای سیستمی در بخش واریز هوشمند.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    };

    // ۸. بازنشانی پنل واریز هوشمند به فرم اولیه
    window.resetSmartPanel = function() {
        els.autoInputGroup.style.display = 'block';
        els.smartDetails.style.display = 'none';
        els.autoAmountInput.value = "";
        tg.HapticFeedback.impactOccurred('light');
    };

    // ۹. ارسال فیش واریز دستی (آپلود تصویر)
    window.submitManualDeposit = async function() {
        const cleanAmount = els.manualAmount.value.replace(/,/g, '');
        const file = els.receiptFile.files[0];

        if (!cleanAmount || parseFloat(cleanAmount) < 10000 || !file) {
            tg.showAlert("لطفاً مبلغ و تصویر فیش را وارد نمایید.");
            return;
        }

        const btn = document.querySelector('#panel-manual .btn-action');
        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ارسال...';

        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('amount', cleanAmount);
        formData.append('receipt', file);

        try {
            const response = await fetch(`${API_BASE_URL}/wallet/deposit/manual`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (result.status === 'success') {
                tg.showAlert("فیش واریزی با موفقیت ارسال شد و در نوبت بررسی قرار گرفت.");
                els.manualAmount.value = "";
                els.receiptFile.value = "";
                document.getElementById('file-name-label').innerText = "انتخاب فیش";
            } else {
                tg.showAlert("خطا: " + result.message);
            }
        } catch (error) {
            tg.showAlert("خطا در آپلود فیش.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    };

    // ۱۰. ثبت درخواست نهایی تسویه حساب (برداشت)
    window.requestWithdrawal = async function() {
        const cleanAmount = els.withdrawAmount.value.replace(/,/g, '');
        const cardNum = els.withdrawSelect.value;

        if (!cleanAmount || parseFloat(cleanAmount) < 100000 || !cardNum) {
            tg.showAlert("مبلغ و کارت مقصد الزامی است.");
            return;
        }

        tg.showConfirm(`آیا واریز ${numberWithCommas(cleanAmount)} تومان به کارت انتخابی تایید می‌شود؟`, async (ok) => {
            if (!ok) return;

            const btn = document.querySelector('#panel-withdraw .btn-action');
            btn.disabled = true;
            try {
                const response = await fetch(`${API_BASE_URL}/wallet/withdraw/request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        initData: tg.initData,
                        amount: parseFloat(cleanAmount),
                        card_number: cardNum
                    })
                });
                const result = await response.json();

                if (result.status === 'success') {
                    tg.showAlert("درخواست تسویه ثبت گردید.");
                    location.reload(); 
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

    // ۱۱. اجرای اولیه موتور کیف پول
    tg.ready();
    tg.expand();
    initWallet();

})();