/* webapp/utopia.js (v1.0 - Utopia Exchange Logic Module) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // Global state variable for rates
    let rates = { buy: 0, sell: 0 }; // rates.buy: User BUYS from Exchange (Admin Sells); rates.sell: User SELLS to Exchange (Admin Buys).

    // --- Initialization ---

    window.onload = function() {
        tg.ready(); 
        tg.expand(); 
        tg.setHeaderColor('#000000');
        
        if (!tg.initData) tg.initData = "query_id=TEST&user=%7B%22id%22%3A111111111%7D&auth_date=1700000000&hash=fake";
        
        fetchRates();
    };

    // --- Tab Switching Logic ---

    window.switchTab = function(tab) {
        document.querySelectorAll('.u-tab').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.section-box').forEach(s => s.classList.remove('active'));
        
        if(tab === 'buy') {
            document.querySelector('.u-tab:nth-child(1)').classList.add('active');
            document.getElementById('buy-section').classList.add('active');
        } else {
            document.querySelector('.u-tab:nth-child(2)').classList.add('active');
            document.getElementById('sell-section').classList.add('active');
        }
        
        // Ensure price calculation runs on tab switch
        if (tab === 'buy') calcPrice();
        
        tg.HapticFeedback.selectionChanged();
    };

    // --- Data Fetching (Rates) ---

    async function fetchRates() {
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/utopia/rates`, {
                method: 'POST', 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await res.json();
            
            if(data.status === 'success') {
                // The API structure used here is: data.buy is the exchange BUY rate (User sells to exchange).
                // data.sell is the exchange SELL rate (User buys from exchange).
                rates.buy = data.sell; // User Buy Price
                rates.sell = data.buy; // User Sell Price
                
                // Displaying the rates on the ticker card
                // C-SELL (Pink) is the price the user PAYS to BUY from exchange (rates.buy)
                // C-BUY (Green) is the price the user GETS when they SELL to exchange (rates.sell)
                document.getElementById('rate-buy').innerText = parseInt(rates.sell).toLocaleString();
                document.getElementById('rate-sell').innerText = parseInt(rates.buy).toLocaleString();

                calcPrice(); // Run initial calculation
            }
        } catch(e) {
             console.error("Network error during Utopia rates fetch:", e);
             tg.showAlert("❌ خطا در دریافت نرخ یوتوپیا.");
        }
    }

    // --- Calculation ---

    window.calcPrice = function() {
        const val = parseFloat(document.getElementById('buy-amount').value);
        const buyRate = rates.buy; // Rate user PAYS to buy
        
        const displayEl = document.getElementById('buy-total');
        
        if (val > 0 && buyRate > 0) {
            // Calculation is: Amount_USD * User_Buy_Rate_Toman
            const total = val * buyRate;
            displayEl.innerText = parseInt(total).toLocaleString() + " تومان";
        } else {
            displayEl.innerText = "0";
        }
    };

    // --- Submission Handlers ---

    window.doBuy = async function() {
        const amount = parseFloat(document.getElementById('buy-amount').value);
        const btn = document.getElementById('btn-do-buy');
        
        // 1. Client-side Validation (Critical)
        if(!amount || amount < 1) { 
            tg.showAlert("حداقل خرید ۱ دلار است."); 
            return; 
        }

        btn.disabled = true; 
        btn.innerText = 'پردازش...';
        document.getElementById('buy-result').style.display = 'none';

        try {
            // 2. API Call (Automated Buy)
            const res = await fetch(`${API_BASE_URL}/webapp/utopia/buy`, {
                method: 'POST', 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData, amount_usd: amount })
            });
            const data = await res.json();

            // 3. Handle Response
            if(data.status === 'success') {
                tg.HapticFeedback.notificationOccurred('success');
                document.getElementById('new-voucher-code').innerText = data.voucher_code;
                document.getElementById('buy-result').style.display = 'block';
                tg.showAlert("✅ خرید موفقیت آمیز بود");
            } else {
                tg.HapticFeedback.notificationOccurred('error');
                tg.showAlert("❌ " + (data.message || "خطا در خرید ووچر."));
            }
        } catch(e) { 
            console.error("Utopia Buy Network Error:", e);
            tg.showAlert("خطای شبکه."); 
        }
        
        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-shopping-cart"></i> خرید آنی';
    };

    window.doSell = async function() {
        const code = document.getElementById('sell-code').value.trim();
        const btn = document.getElementById('btn-do-sell');
        
        // 1. Client-side Validation (Critical)
        if(code.length < 10) { 
            tg.showAlert("کد نامعتبر است."); 
            return; 
        }

        btn.disabled = true; 
        btn.innerText = 'در حال استعلام...';

        try {
            // 2. API Call (Automated Sell/Redemption)
            const res = await fetch(`${API_BASE_URL}/webapp/utopia/sell`, {
                method: 'POST', 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData, voucher_code: code })
            });
            const data = await res.json();

            // 3. Handle Response
            if(data.status === 'success') {
                tg.HapticFeedback.notificationOccurred('success');
                // The server should return amount_toman for confirmation
                tg.showAlert(`✅ فروخته شد!\nمبلغ ${parseInt(data.amount_toman).toLocaleString()} تومان واریز شد.`);
                document.getElementById('sell-code').value = "";
                // Note: The UI is expected to refresh upon successful sale, potentially requiring a manual page refresh 
                // or a re-fetch of the dashboard data upon return.
            } else {
                tg.HapticFeedback.notificationOccurred('error');
                tg.showAlert("❌ " + (data.message || "خطا در نقد کردن ووچر."));
            }
        } catch(e) { 
            console.error("Utopia Sell Network Error:", e);
            tg.showAlert("خطای شبکه."); 
        }

        btn.disabled = false; 
        btn.innerHTML = '<i class="fas fa-exchange-alt"></i> نقد کردن';
    };

    // --- UX Helpers ---

    window.copyCode = function() {
        const code = document.getElementById('new-voucher-code').innerText;
        navigator.clipboard.writeText(code);
        tg.showAlert("کد کپی شد!");
        tg.HapticFeedback.notificationOccurred('success');
    };
    
})();