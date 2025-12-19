/* webapp/wallet-engine.js (v98.0 - FULL INTEGRATED VERSION) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin + "/api/webapp"; 
    
    // المان‌های صفحه
    const els = {
        tomanBalance: document.getElementById('balance-toman'),
        cardsContainer: document.getElementById('user-cards-container'),
        withdrawSelect: document.getElementById('withdraw-card-select'),
        manualAmount: document.getElementById('manual-amount-input'),
        receiptFile: document.getElementById('receipt-file'),
        withdrawAmount: document.getElementById('withdraw-amount-input')
    };

    // ۱. انیمیشن شمارش اعداد برای موجودی
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

    // ۲. دریافت داده‌های کیف پول و کارت‌ها از سرور
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
                animateValue(els.tomanBalance, 0, targetBal, 1500);

                // رندر کارت‌های بانکی
                renderUserCards(data.approved_cards || []);
            } else {
                tg.showAlert("خطا در دریافت اطلاعات: " + data.message);
            }
        } catch (error) {
            console.error("Wallet Init Error:", error);
            tg.showAlert("عدم اتصال به سرور.");
        }
    }

    // ۳. رندر کردن لیست کارت‌های تایید شده در پنل هوشمند و سلکت‌باکس برداشت
    function renderUserCards(cards) {
        if (!els.cardsContainer || !els.withdrawSelect) return;

        if (cards.length === 0) {
            els.cardsContainer.innerHTML = `
                <div style="text-align:center; padding:15px; background:rgba(246,70,93,0.05); border-radius:12px; color:#f6465d; font-size:0.7rem; border:1px solid rgba(246,70,93,0.1);">
                    <i class="fas fa-exclamation-triangle"></i> هیچ کارت تایید شده‌ای یافت نشد. ابتدا در بخش پروفایل کارت خود را ثبت کنید.
                </div>`;
            els.withdrawSelect.innerHTML = '<option value="">کارتی یافت نشد</option>';
            return;
        }

        // رندر لیست کارت‌ها برای بخش واریز هوشمند
        els.cardsContainer.innerHTML = cards.map(card => `
            <div class="user-card-item">
                <div style="display:flex; align-items:center; gap:10px;">
                    <i class="fas fa-credit-card" style="color:#f0b90b;"></i>
                    <span class="bank-name">${card.bank_name || 'بانک نامشخص'}</span>
                </div>
                <span class="masked-num">**** ${card.card_number.slice(-4)}</span>
            </div>
        `).join('');

        // پر کردن لیست کشویی برای بخش برداشت
        els.withdrawSelect.innerHTML = cards.map(card => `
            <option value="${card.card_number}">${card.bank_name} - ${card.card_number.slice(-4)}</option>
        `).join('');
    }

    // ۴. ثبت واریز دستی (آپلود فیش)
    window.submitManualDeposit = async function() {
        const amount = els.manualAmount.value;
        const file = els.receiptFile.files[0];

        if (!amount || amount < 10000) {
            tg.showAlert("لطفاً مبلغ معتبری وارد کنید (حداقل ۱۰,۰۰۰ تومان)");
            return;
        }
        if (!file) {
            tg.showAlert("لطفاً تصویر فیش واریزی را انتخاب کنید.");
            return;
        }

        const btn = document.querySelector('#panel-manual .btn-action');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> در حال ارسال...';

        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('amount', amount);
        formData.append('receipt', file);

        try {
            const response = await fetch(`${API_BASE_URL}/submit_manual_deposit`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (result.status === 'success') {
                tg.showAlert("فیش شما با موفقیت ثبت شد و پس از تایید مدیریت، حساب شما شارژ می‌گردد.");
                location.reload();
            } else {
                tg.showAlert("خطا: " + result.message);
            }
        } catch (error) {
            tg.showAlert("خطای ارتباط با سرور در هنگام آپلود فیش.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };

    // ۵. ثبت درخواست برداشت وجه
    window.requestWithdrawal = async function() {
        const amount = els.withdrawAmount.value;
        const cardNum = els.withdrawSelect.value;

        if (!amount || amount < 100000) {
            tg.showAlert("حداقل مبلغ برداشت ۱۰۰,۰۰۰ تومان می‌باشد.");
            return;
        }
        if (!cardNum) {
            tg.showAlert("لطفاً کارت مقصد را انتخاب کنید.");
            return;
        }

        tg.showConfirm(`آیا از درخواست برداشت مبلغ ${parseInt(amount).toLocaleString()} تومان به کارت منتهی به ${cardNum.slice(-4)} اطمینان دارید؟`, async (ok) => {
            if (ok) {
                try {
                    const response = await fetch(`${API_BASE_URL}/request_withdrawal`, {
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
                        tg.showAlert("درخواست برداشت شما با موفقیت ثبت شد و در سیکل پایا واریز خواهد شد.");
                        location.reload();
                    } else {
                        tg.showAlert(result.message || "خطا در ثبت درخواست.");
                    }
                } catch (e) {
                    tg.showAlert("خطای سیستمی در ثبت برداشت.");
                }
            }
        });
    };

    // اجرای اولیه
    tg.ready();
    initWallet();

})();