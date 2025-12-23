/* webapp/wallet-engine.js (v106.1 - FULL VERSION - SMART RIAL CONVERSION) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin + "/api/webapp"; 
    
    // کش کردن المان‌های UI
    const els = {
        tomanBalance: document.getElementById('balance-toman'),
        cardsContainer: document.getElementById('user-cards-container'),
        withdrawSelect: document.getElementById('withdraw-card-select'),
        manualAmount: document.getElementById('manual-amount-input'),
        receiptFile: document.getElementById('receipt-file'),
        withdrawAmount: document.getElementById('withdraw-amount-input'),
        adminCardNum: document.getElementById('admin-card'),
        // المان‌های بخش واریز هوشمند
        autoAmountInput: document.getElementById('auto-amount-input'),
        autoInputGroup: document.getElementById('auto-deposit-input-group'),
        smartDetails: document.getElementById('smart-payment-details'),
        smartTomanDisplay: document.getElementById('smart-toman-display'),
        smartRialValue: document.getElementById('smart-rial-value')
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

    // ۲. مقداردهی اولیه و دریافت داده‌ها از سرور
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
                animateValue(els.tomanBalance, 0, targetBal, 1200);

                if (data.admin_card && els.adminCardNum) {
                    els.adminCardNum.innerText = data.admin_card;
                }

                renderUserCards(data.approved_cards || []);
            } else {
                tg.showPopup({ message: "خطا در بارگذاری اطلاعات: " + data.message });
            }
        } catch (error) {
            console.error("Wallet Init Error:", error);
            tg.showAlert("ارتباط با سرور صرافی برقرار نشد.");
        }
    }

    // ۳. رندر داینامیک کارت‌های بانکی
    function renderUserCards(cards) {
        if (!els.cardsContainer || !els.withdrawSelect) return;

        if (cards.length === 0) {
            const noCardHtml = `
                <div style="text-align:center; padding:15px; background:rgba(246,70,93,0.05); border-radius:12px; color:#f6465d; font-size:0.75rem; border:1px solid rgba(246,70,93,0.1);">
                    <i class="fas fa-exclamation-circle"></i> هیچ کارت تایید شده‌ای ندارید.<br>
                    <small>ابتدا در بخش پروفایل کارت خود را ثبت کنید.</small>
                </div>`;
            els.cardsContainer.innerHTML = noCardHtml;
            els.withdrawSelect.innerHTML = '<option value="">کارت بانکی انتخاب نشده</option>';
            return;
        }

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

        els.withdrawSelect.innerHTML = '<option value="" disabled selected>انتخاب کارت مقصد</option>' + 
            cards.map(card => `
                <option value="${card.card_number}">${card.bank_name} - ${card.card_number.slice(-4)}</option>
            `).join('');
    }

    // ۴. منطق ایجاد کد پرداخت هوشمند (تبدیل تومان به ریال یکتا)
    window.generateSmartPayment = async function() {
        const amountToman = els.autoAmountInput.value;
        if (!amountToman || amountToman < 10000) {
            tg.showAlert("حداقل مبلغ واریز هوشمند ۱۰,۰۰۰ تومان است.");
            return;
        }

        const btn = document.querySelector('#auto-deposit-input-group .btn-action');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> در حال ایجاد شناسه...';

        try {
            // فراخوانی API برای رزرو مبلغ یکتا در دیتابیس
            const response = await fetch(`${API_BASE_URL}/wallet/deposit/auto/init`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    initData: tg.initData,
                    amount: parseFloat(amountToman)
                })
            });
            const result = await response.json();

            if (result.status === 'success') {
                const uniqueToman = parseFloat(result.unique_amount);
                const uniqueRial = Math.round(uniqueToman * 10); // تبدیل به ریال دقیق برای کپی

                // نمایش اطلاعات در پنل
                els.autoInputGroup.style.display = 'none';
                els.smartDetails.style.display = 'block';
                
                els.smartTomanDisplay.innerText = uniqueToman.toLocaleString() + " تومان";
                els.smartRialValue.innerText = uniqueRial.toLocaleString();
                
                tg.HapticFeedback.notificationOccurred('success');
            } else {
                tg.showAlert("خطا: " + result.message);
            }
        } catch (error) {
            tg.showAlert("خطا در سیستم واریز هوشمند. لطفاً دقایقی دیگر تلاش کنید.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>ایجاد کد پرداخت هوشمند</span><i class="fas fa-magic"></i>';
        }
    };

    // ۵. بازگشت از پنل هوشمند به فرم ورود مبلغ
    window.resetSmartPanel = function() {
        els.autoInputGroup.style.display = 'block';
        els.smartDetails.style.display = 'none';
        els.autoAmountInput.value = "";
    };

    // ۶. منطق ثبت واریز دستی (آپلود فیش)
    window.submitManualDeposit = async function() {
        const amount = els.manualAmount.value;
        const fileInput = els.receiptFile;
        const file = fileInput.files[0];

        if (!amount || amount < 10000) {
            tg.showAlert("حداقل مبلغ واریز ۱۰,۰۰۰ تومان است.");
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
        formData.append('amount', amount);
        formData.append('receipt', file);

        try {
            const response = await fetch(`${API_BASE_URL}/wallet/deposit/manual`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (result.status === 'success') {
                tg.showPopup({
                    title: "ثبت موفقیت‌آمیز",
                    message: "رسید شما دریافت شد. پس از تایید مدیریت، کیف پول شما شارژ می‌شود.",
                    buttons: [{type: "ok"}]
                });
                els.manualAmount.value = "";
                fileInput.value = "";
                document.getElementById('file-name-label').innerText = "انتخاب یا تصویربرداری از فیش";
            } else {
                tg.showAlert("خطا در ثبت: " + result.message);
            }
        } catch (error) {
            tg.showAlert("خطای فنی در آپلود رسید.");
        } finally {
            btn.disabled = false;
            btn.style.opacity = "1";
            btn.innerHTML = originalContent;
        }
    };

    // ۷. منطق درخواست برداشت وجه (تسویه)
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

        tg.showConfirm(`آیا از درخواست برداشت مبلغ ${parseInt(amount).toLocaleString()} تومان اطمینان دارید؟`, async (ok) => {
            if (!ok) return;

            const btn = document.querySelector('#panel-withdraw .btn-action');
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال ثبت درخواست...';

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
                    tg.showAlert("درخواست تسویه با موفقیت ثبت شد.");
                    location.reload();
                } else {
                    tg.showAlert("خطا: " + result.message);
                }
            } catch (e) {
                tg.showAlert("خطای غیرمنتظره در ثبت درخواست برداشت.");
            } finally {
                btn.disabled = false;
                btn.innerHTML = '<span>ثبت درخواست برداشت</span><i class="fas fa-check-circle"></i>';
            }
        });
    };

    // اجرای اولیه
    tg.ready();
    tg.expand();
    initWallet();

})();