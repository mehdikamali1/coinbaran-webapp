/* webapp/wallet-engine.js (v107.1 - ULTIMATE FULL VERSION - NO SUMMARIZATION) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin + "/api/webapp"; 
    
    // ۱. کش کردن کامل تمام المان‌های UI برای دسترسی سریع
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

    // ۲. سیستم جداکننده ۳ رقم هوشمند (موقع تایپ کردن)
    function formatInputNumber(e) {
        let value = e.target.value.replace(/\D/g, ''); // حذف هر چیزی غیر از عدد
        if (value) {
            e.target.value = parseInt(value).toLocaleString(); // جدا کردن ۳ رقم
        }
    }

    if (els.autoAmountInput) {
        els.autoAmountInput.addEventListener('input', formatInputNumber);
    }

    if (els.manualAmount) {
        els.manualAmount.addEventListener('input', formatInputNumber);
    }

    if (els.withdrawAmount) {
        els.withdrawAmount.addEventListener('input', formatInputNumber);
    }

    // ۳. انیمیشن لوکس و روان شمارش اعداد موجودی
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

    // ۴. مقداردهی اولیه و دریافت زنده داده‌های کیف پول از سرور
    async function initWallet() {
        try {
            const response = await fetch(`${API_BASE_URL}/get_user_data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await response.json();

            if (data.status === 'success') {
                // آپدیت موجودی تومانی با انیمیشن ۱.۲ ثانیه‌ای
                const targetBal = parseInt(data.toman_balance.replace(/,/g, '')) || 0;
                animateValue(els.tomanBalance, 0, targetBal, 1200);

                // نمایش شماره کارت ادمین برای واریز هوشمند
                if (data.admin_card && els.adminCardNum) {
                    els.adminCardNum.innerText = data.admin_card;
                }

                // رندر کردن لیست کارت‌های تایید شده کاربر
                renderUserCards(data.approved_cards || []);
            } else {
                tg.showPopup({ message: "خطا در دریافت اطلاعات: " + data.message });
            }
        } catch (error) {
            console.error("Wallet Init Error:", error);
            tg.showAlert("ارتباط با سرور صرافی برقرار نشد.");
        }
    }

    // ۵. رندر داینامیک کارت‌های بانکی در لیست و منوی انتخابی
    function renderUserCards(cards) {
        if (!els.cardsContainer || !els.withdrawSelect) return;

        if (cards.length === 0) {
            const noCardHtml = `
                <div style="text-align:center; padding:15px; background:rgba(246,70,93,0.05); border-radius:12px; color:#f6465d; font-size:0.75rem; border:1px solid rgba(246,70,93,0.1);">
                    <i class="fas fa-exclamation-circle"></i> هیچ کارت تایید شده‌ای ندارید.<br>
                    <small>ابتدا در بخش پروفایل کارت خود را ثبت کنید.</small>
                </div>`;
            els.cardsContainer.innerHTML = noCardHtml;
            els.withdrawSelect.innerHTML = '<option value="">کارت بانکی تایید شده یافت نشد</option>';
            return;
        }

        // رندر لیست کارت‌ها برای واریز هوشمند
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

        // رندر منوی انتخابی برای برداشت وجه
        els.withdrawSelect.innerHTML = '<option value="" disabled selected>انتخاب کارت مقصد</option>' + 
            cards.map(card => `
                <option value="${card.card_number}">${card.bank_name} - ${card.card_number.slice(-4)}</option>
            `).join('');
    }

    // ۶. منطق ایجاد کد پرداخت هوشمند (تبدیل تومان به ریال یکتا و نمایش)
    window.generateSmartPayment = async function() {
        // حذف کاماها برای تبدیل به عدد واقعی
        const cleanAmount = els.autoAmountInput.value.replace(/,/g, '');
        
        if (!cleanAmount || parseFloat(cleanAmount) < 10000) {
            tg.showAlert("حداقل مبلغ واریز هوشمند ۱۰,۰۰۰ تومان است.");
            return;
        }

        const btn = document.querySelector('#auto-deposit-input-group .btn-action');
        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> در حال ایجاد شناسه...';

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
                const uniqueRial = Math.round(uniqueToman * 10); // تبدیل به ریال دقیق

                // سوئیچ پنل نمایش
                els.autoInputGroup.style.display = 'none';
                els.smartDetails.style.display = 'block';
                
                // نمایش مبالغ تفکیک شده
                els.smartTomanDisplay.innerText = uniqueToman.toLocaleString() + " تومان";
                els.smartRialValue.innerText = uniqueRial.toLocaleString();
                
                tg.HapticFeedback.notificationOccurred('success');
            } else {
                tg.showAlert("خطا: " + result.message);
            }
        } catch (error) {
            console.error("Smart Deposit Error:", error);
            tg.showAlert("خطا در سیستم واریز هوشمند.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
        }
    };

    // ۷. بازگشت از پنل نمایش مبلغ به فرم ورود مبلغ
    window.resetSmartPanel = function() {
        els.autoInputGroup.style.display = 'block';
        els.smartDetails.style.display = 'none';
        els.autoAmountInput.value = "";
        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
    };

    // ۸. منطق ارسال فیش واریز دستی (آپلود فایل)
    window.submitManualDeposit = async function() {
        const cleanAmount = els.manualAmount.value.replace(/,/g, '');
        const file = els.receiptFile.files[0];

        if (!cleanAmount || parseFloat(cleanAmount) < 10000) {
            tg.showAlert("لطفاً مبلغ واریزی را صحیح وارد کنید.");
            return;
        }
        if (!file) {
            tg.showAlert("لطفاً تصویر فیش واریزی را انتخاب کنید.");
            return;
        }

        const btn = document.querySelector('#panel-manual .btn-action');
        const originalContent = btn.innerHTML;
        
        btn.disabled = true;
        btn.style.opacity = "0.7";
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> در حال آپلود...';

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
                tg.showPopup({
                    title: "ثبت شد",
                    message: "فیش واریزی برای بررسی ارسال گردید.",
                    buttons: [{type: "ok"}]
                });
                els.manualAmount.value = "";
                els.receiptFile.value = "";
                document.getElementById('file-name-label').innerText = "انتخاب یا تصویربرداری از فیش";
            } else {
                tg.showAlert("خطا: " + result.message);
            }
        } catch (error) {
            tg.showAlert("خطا در آپلود رسید.");
        } finally {
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.innerHTML = originalContent;
        }
    };

    // ۹. منطق نهایی درخواست تسویه حساب (برداشت وجه)
    window.requestWithdrawal = async function() {
        const cleanAmount = els.withdrawAmount.value.replace(/,/g, '');
        const cardNum = els.withdrawSelect.value;

        if (!cleanAmount || parseFloat(cleanAmount) < 100000) {
            tg.showAlert("حداقل مبلغ برداشت ۱۰۰,۰۰۰ تومان است.");
            return;
        }
        if (!cardNum) {
            tg.showAlert("لطفاً کارت بانکی مقصد را انتخاب کنید.");
            return;
        }

        tg.showConfirm(`آیا از واریز ${parseInt(cleanAmount).toLocaleString()} تومان به کارت ${cardNum.slice(-4)} اطمینان دارید؟`, async (ok) => {
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
                        amount: parseFloat(cleanAmount),
                        card_number: cardNum
                    })
                });
                const result = await response.json();

                if (result.status === 'success') {
                    tg.showAlert("درخواست تسویه با موفقیت ثبت شد.");
                    location.reload();
                } else {
                    tg.showAlert("خطا: " + result.message);
                }
            } catch (e) {
                tg.showAlert("خطا در ثبت درخواست.");
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>ثبت درخواست برداشت</span><i class="fas fa-check-circle"></i>';
            }
        });
    };

    // ۱۰. آماده‌سازی و اجرای اولیه موتور
    tg.ready();
    tg.expand();
    initWallet();

})();