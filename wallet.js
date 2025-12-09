/* webapp/wallet.js (v1.0 - Wallet Logic Module) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    let transactionsData = [];
    
    // --- UI/UX Helper Functions ---
    
    function hideLoader() {
        const loader = document.getElementById('loader');
        const app = document.getElementById('app-container');
        if(loader) {
            loader.style.opacity = '0';
            loader.style.pointerEvents = 'none';
            setTimeout(() => {
                loader.style.display = 'none';
                if(app) {
                    app.classList.remove('hidden-content');
                    app.classList.add('fade-in-active');
                }
            }, 500);
        }
    }

    window.openDepositModal = function() { 
        document.getElementById('deposit-modal').classList.add('active'); 
        tg.HapticFeedback.impactOccurred('light');
    };
    
    window.closeDepositModal = function() { 
        document.getElementById('deposit-modal').classList.remove('active'); 
    };
    
    window.updateFileLabel = function(input) {
        const label = document.getElementById('file-label');
        const icon = document.getElementById('up-icon');
        const accentGreen = 'var(--accent-green)'; // Use global CSS variable
        
        if (input.files && input.files.length > 0) {
            label.innerText = "✅ تصویر انتخاب شد: " + input.files[0].name;
            label.style.color = accentGreen;
            icon.style.color = accentGreen;
            icon.className = "fas fa-check-circle upload-icon";
            tg.HapticFeedback.notificationOccurred('success');
        } else {
            label.innerText = "برای انتخاب تصویر فیش کلیک کنید";
            label.style.color = 'var(--text-muted)';
            icon.style.color = 'var(--text-muted)';
            icon.className = "fas fa-cloud-upload-alt upload-icon";
        }
    };

    // --- Data Fetching and Initialization ---

    window.onload = function() {
        tg.ready(); 
        tg.expand(); 
        // Setting colors here is redundant if done in script.js/global.css, but kept for TG app safety
        tg.setHeaderColor('#050505');
        tg.setBackgroundColor('#050505');
        
        if (!tg.initData) tg.initData = "query_id=TEST_DEV";
        fetchWalletData();
    };

    window.fetchWalletData = async function() {
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/get_wallet_data`, {
                method: 'POST', 
                headers: {
                    'Content-Type': 'application/json',
                    'ngrok-skip-browser-warning': 'true'
                },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await res.json();
            if (data.status === 'success') {
                // Update Balance UI
                document.getElementById('balance-toman').innerText = parseInt(data.balances.toman.replace(/,/g, '')).toLocaleString();
                document.getElementById('balance-uusd').innerText = `${data.balances.uusd} $`;
                
                transactionsData = data.transactions;
                renderTx(data.transactions);
                hideLoader(); 
            } else {
                 console.error("Wallet Data Fetch Error:", data.message);
                 hideLoader();
            }
        } catch (e) { 
            console.error("Network Error fetching wallet data:", e); 
            hideLoader(); 
            tg.showAlert("خطای ارتباط با سرور. اطلاعات کیف پول بارگذاری نشد.");
        }
    };
    
    // --- Transaction Rendering ---

    function renderTx(txs) {
        const list = document.getElementById('tx-list');
        list.innerHTML = '';
        const primaryGold = 'var(--gold-primary)';
        const accentGreen = 'var(--accent-green)';
        const accentRed = 'var(--accent-red)';
        
        if (txs.length === 0) { 
            list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:0.8rem">هنوز تراکنشی ثبت نشده است</div>'; 
            return; 
        }

        txs.forEach((tx, index) => {
            const div = document.createElement('div');
            div.className = 'tx-card ripple-btn';
            div.onclick = () => { showDetail(index); tg.HapticFeedback.selectionChanged(); };
            
            let colorClass = primaryGold;
            let iconHtml = '';
            
            // Determine Color and Icon based on transaction type/status
            if(tx.color === 'success') { 
                colorClass = accentGreen; 
                iconHtml = `<i class="fas fa-arrow-down" style="color:${accentGreen}"></i>`; 
            }
            else if(tx.color === 'danger') { 
                colorClass = accentRed; 
                iconHtml = `<i class="fas fa-arrow-up" style="color:${accentRed}"></i>`; 
            }
            else { 
                colorClass = primaryGold; 
                iconHtml = `<i class="fas fa-exchange-alt" style="color:${primaryGold}"></i>`; 
            }

            div.innerHTML = `
                <div class="tx-left">
                    <div class="tx-icon-box">${iconHtml}</div>
                    <div class="tx-details">
                        <span class="tx-title">${tx.title}</span>
                        <span class="tx-date">${tx.date}</span>
                    </div>
                </div>
                <div class="tx-amount" style="color:${colorClass}">${tx.display_amount}</div>
            `;
            list.appendChild(div);
        });
    }

    // --- Modal Logic ---
    
    window.showDetail = function(index) {
        const tx = transactionsData[index];
        const container = document.getElementById('detail-content');
        
        const primaryGold = 'var(--gold-primary)';
        const accentGreen = 'var(--accent-green)';
        const accentRed = 'var(--accent-red)';
        
        let statusColor = tx.color === 'success' ? accentGreen : (tx.color === 'danger' ? accentRed : primaryGold);

        let html = `
            <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:12px;">
                <span style="color:var(--text-muted); font-size:0.9rem">نوع تراکنش</span>
                <span style="color:var(--text-main); font-weight:700">${tx.title}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:12px;">
                <span style="color:var(--text-muted); font-size:0.9rem">مبلغ</span>
                <span style="color:var(--text-main); font-weight:700; font-family:'Roboto Mono'; direction:ltr">${tx.display_amount}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:12px;">
                <span style="color:var(--text-muted); font-size:0.9rem">تاریخ</span>
                <span style="color:var(--text-main); font-size:0.9rem; font-family:'Roboto Mono'">${tx.date}</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:12px;">
                <span style="color:var(--text-muted); font-size:0.9rem">وضعیت</span>
                <span style="color:${statusColor}; font-weight:bold">${tx.status}</span>
            </div>
        `;

        if (tx.type === 'UTOPIA_BUY' && tx.detail) {
            html += `
                <div class="voucher-display">
                    <div style="color:var(--text-muted); font-size:0.8rem; margin-bottom:8px;">کد ووچر خریداری شده:</div>
                    <div class="v-code">${tx.detail}</div>
                    <div class="ripple-btn" style="color:var(--accent-blue); font-size:0.85rem; margin-top:12px; cursor:pointer; padding:5px;" 
                        onclick="navigator.clipboard.writeText('${tx.detail}'); tg.showAlert('کد کپی شد!'); tg.HapticFeedback.notificationOccurred('success');">
                        <i class="fas fa-copy"></i> کپی کردن کد
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
        document.getElementById('detail-modal').classList.add('active');
    };

    // --- Deposit Submission Logic ---
    
    window.submitDeposit = async function() {
        const amountInput = document.getElementById('deposit-amount');
        const fileInput = document.getElementById('receipt-file');
        const btn = document.getElementById('btn-submit-dep');
        const amount = parseInt(amountInput.value);

        if(!amount || amount < 50000) { tg.showAlert("حداقل مبلغ واریز ۵۰,۰۰۰ تومان است."); return; }
        if(fileInput.files.length === 0) { tg.showAlert("لطفاً تصویر فیش واریزی را انتخاب کنید."); return; }

        btn.disabled = true; 
        btn.innerText = "در حال آپلود...";
        tg.HapticFeedback.impactOccurred('light');

        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('amount', amount);
        formData.append('receipt', fileInput.files[0]);

        try {
            // Note: The /webapp/submit_deposit endpoint was implicitly used here.
            const res = await fetch(`${API_BASE_URL}/webapp/submit_deposit`, { 
                method: 'POST', 
                body: formData,
                headers: {
                    // Retaining Ngrok header as observed in original code
                    'ngrok-skip-browser-warning': 'true'
                }
            });
            
            let result;
            try { result = await res.json(); } catch { throw new Error("پاسخ سرور نامعتبر است"); }

            if (res.ok && result.status === 'success') {
                tg.showAlert("✅ " + result.message);
                closeDepositModal();
                amountInput.value = ""; 
                fileInput.value = "";
                updateFileLabel(fileInput);
                fetchWalletData(); 
                tg.HapticFeedback.notificationOccurred('success');
            } else {
                tg.showAlert(`❌ خطا: ${result.message || "ناشناخته"}`);
                tg.HapticFeedback.notificationOccurred('error');
            }
        } catch (e) { 
            tg.showAlert("خطای ارتباط: " + e.message); 
        } finally { 
            btn.disabled = false; 
            btn.innerText = "ارسال درخواست"; 
        }
    };
    
})();