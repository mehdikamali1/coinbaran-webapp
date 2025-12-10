/* webapp/usdt.js (v2.0 - UPGRADE: XP Discount Integration) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // Global state variables for rates and exchange addresses
    let WALLETS = { 'TRC20': '', 'BEP20': '' }; 
    // rates.buy is the rate Admin BUYS from User (User Sells); rates.sell is the rate Admin SELLS to User (User Buys).
    let rates = { base_buy: 0, base_sell: 0, discounted_buy: 0, discounted_sell: 0 }; 
    let userData = { xp_balance: 0, xp_cost: 0, discount_rate_percent: 0 };

    // --- Initialization ---

    window.onload = function() {
        tg.ready(); 
        tg.expand(); 
        tg.setHeaderColor('#000000');
        
        // Use test data if not in Telegram environment
        if (!tg.initData) tg.initData = "query_id=TEST&user=%7B%22id%22%3A111111111%7D&auth_date=1700000000&hash=fake";
        
        fetchRates();
        setupXpListeners();
    };

    // --- Tab Switching Logic ---

    window.setMode = function(mode) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active', 'buy-mode', 'sell-mode'));
        document.querySelectorAll('.form-section').forEach(f => f.classList.remove('active'));
        
        if(mode === 'buy') { 
            document.querySelector('.tab-btn:nth-child(1)').classList.add('active', 'buy-mode'); 
            document.getElementById('buy-form').classList.add('active'); 
        } else { 
            document.querySelector('.tab-btn:nth-child(2)').classList.add('active', 'sell-mode'); 
            document.getElementById('sell-form').classList.add('active'); 
        }
        
        // Recalculate price whenever tab switches to update the total
        calc(mode);
    };

    // --- Data Fetching ---

    async function fetchRates() {
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/usdt/rates`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ initData: tg.initData }) 
            });
            const data = await res.json();
            
            if(data.status === 'success') {
                // Store all rate data, including discounted rates and base rates
                rates.base_buy = data.buy; 
                rates.base_sell = data.sell;
                rates.discounted_buy = data.discounted_buy;
                rates.discounted_sell = data.discounted_sell;
                
                // Store User XP Data
                userData.xp_balance = data.user_xp_balance;
                userData.xp_cost = data.xp_cost_for_discount;
                userData.discount_rate_percent = data.discount_rate_percent;
                
                if (data.wallets) { 
                    WALLETS = data.wallets; 
                    updateWalletAddress(); 
                }
                
                updateRateDisplay();
                updateXpUI();
                setMode('buy');
                
            } else {
                console.error("Failed to fetch rates:", data.message);
                tg.showAlert("❌ خطا در دریافت نرخ‌های لحظه‌ای.");
            }
        } catch(e) {
             console.error("Network error during rates fetch:", e);
        }
    }

    function updateRateDisplay() {
        // Displaying the base rates on the ticker card
        document.getElementById('rate-sell').innerText = parseInt(rates.base_buy).toLocaleString();
        document.getElementById('rate-buy').innerText = parseInt(rates.base_sell).toLocaleString();
        
        // Display XP Discount benefits
        const rateDifferenceSell = rates.base_sell - rates.discounted_sell; // Benefit for User BUY
        const rateDifferenceBuy = rates.discounted_buy - rates.base_buy;    // Benefit for User SELL
        
        if (document.getElementById('xp-discount-buy-diff')) {
            document.getElementById('xp-discount-buy-diff').innerText = `(${rateDifferenceSell.toFixed(0)} T less per USDT)`;
            document.getElementById('xp-discount-sell-diff').innerText = `(${rateDifferenceBuy.toFixed(0)} T more per USDT)`;
        }
    }

    // --- XP Discount Logic ---

    function updateXpUI() {
        const xpBox = document.getElementById('xp-discount-box');
        if (!xpBox) return;

        const xpBalance = userData.xp_balance;
        const xpCost = userData.xp_cost;
        const discountPercent = userData.discount_rate_percent;
        const isEligible = xpBalance >= xpCost && discountPercent > 0;

        if (isEligible) {
            xpBox.classList.remove('disabled');
            document.getElementById('xp-balance-display').innerText = xpBalance.toLocaleString();
            document.getElementById('xp-cost-display').innerText = xpCost.toLocaleString();
            document.getElementById('discount-percent-display').innerText = discountPercent.toFixed(1);
            document.getElementById('xp-tooltip-text').innerHTML = 
                `با پرداخت ${xpCost} XP، از ${discountPercent.toFixed(1)}% تخفیف کارمزد بهره‌مند شوید.`;
        } else {
            xpBox.classList.add('disabled');
            document.getElementById('xp-tooltip-text').innerHTML = 
                `XP کافی ندارید یا سطح KYC شما برای تخفیف ${discountPercent.toFixed(1)}% مجاز نیست. (نیاز به ${xpCost} XP)`;
            // Ensure checkbox is unchecked if ineligible
            document.getElementById('xp-discount-toggle').checked = false;
        }
        
        // Recalculate based on initial eligibility state
        calc(document.getElementById('buy-form').classList.contains('active') ? 'buy' : 'sell');
    }

    function setupXpListeners() {
        const toggle = document.getElementById('xp-discount-toggle');
        if (toggle) {
            toggle.addEventListener('change', function() {
                // Check eligibility again on change
                const xpBox = document.getElementById('xp-discount-box');
                if (xpBox.classList.contains('disabled') && this.checked) {
                    this.checked = false;
                    tg.showAlert("XP کافی ندارید یا مجاز نیستید.");
                }
                calc(document.getElementById('buy-form').classList.contains('active') ? 'buy' : 'sell');
                tg.HapticFeedback.selectionChanged();
            });
        }
    }

    // --- Utility Functions ---

    window.updateWalletAddress = function() { 
        const net = document.getElementById('sell-network').value;
        const addr = WALLETS[net];
        document.getElementById('admin-wallet-address').innerText = (addr && addr.length > 5) ? addr : "تنظیم نشده"; 
    };
    
    window.copyAddress = function() { 
        navigator.clipboard.writeText(document.getElementById('admin-wallet-address').innerText); 
        tg.showAlert("✅ آدرس کپی شد!"); 
        tg.HapticFeedback.notificationOccurred('success');
    };

    window.calc = function(mode) {
        const amountEl = document.getElementById(mode + '-amount');
        if (!amountEl) return; 

        const amount = parseFloat(amountEl.value);
        const displayEl = document.getElementById(mode + '-total');
        const useDiscount = document.getElementById('xp-discount-toggle').checked;
        
        if (isNaN(amount) || amount <= 0) { 
            displayEl.innerHTML = `0 <span style="font-size:0.7rem">تومان</span>`; 
            return; 
        }
        
        let price;
        if (mode === 'buy') {
            // User buys (Admin sells) - Discount lowers the rate
            price = useDiscount ? rates.discounted_sell : rates.base_sell;
        } else {
            // User sells (Admin buys) - Discount raises the rate
            price = useDiscount ? rates.discounted_buy : rates.base_buy;
        }
        
        if (price === 0) {
            displayEl.innerHTML = `... <span style="font-size:0.7rem">تومان</span>`;
            return;
        }

        // Calculate and format the Toman amount
        const total = amount * price;
        displayEl.innerHTML = `${parseInt(total).toLocaleString()} <span style="font-size:0.7rem">تومان</span>`;
    };

    function openStatusModal() {
        document.getElementById('status-modal').classList.add('active');
    }

    function closeStatusModal() {
        document.getElementById('status-modal').classList.remove('active');
    }

    // --- Submission Handlers (UPGRADED to include XP discount flag) ---

    window.submitBuy = async function() {
        const amount = parseFloat(document.getElementById('buy-amount').value);
        const address = document.getElementById('buy-address').value;
        const network = document.getElementById('buy-network').value;
        const use_xp_discount = document.getElementById('xp-discount-toggle').checked;
        
        if(!amount || amount < 2) { 
            tg.showAlert("حداقل خرید ۲ تتر."); return; 
        }
        if(address.length < 10) { 
            tg.showAlert("آدرس نامعتبر."); return; 
        }
        
        openStatusModal();
        
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/usdt/buy`, {
                method: 'POST', 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData, amount: amount, address: address, network: network, use_xp_discount: use_xp_discount })
            });
            const data = await res.json();
            
            if (data.status === 'success') { 
                tg.showAlert("✅ درخواست خرید ثبت شد. لطفاً مبلغ را پرداخت کنید."); 
                tg.HapticFeedback.notificationOccurred('success');
                location.reload(); 
            } else { 
                tg.showAlert("❌ " + (data.message || "خطا در ثبت خرید.")); 
                tg.HapticFeedback.notificationOccurred('error');
                closeStatusModal(); 
            }
        } catch (e) { 
            tg.showAlert("خطای شبکه در هنگام خرید."); 
            closeStatusModal(); 
        }
    };

    window.submitSell = async function() {
        const amount = parseFloat(document.getElementById('sell-amount').value);
        const txid = document.getElementById('sell-txid').value;
        const network = document.getElementById('sell-network').value;
        const use_xp_discount = document.getElementById('xp-discount-toggle').checked;
        
        if(!amount || amount < 2) { 
            tg.showAlert("حداقل فروش ۲ تتر."); return; 
        }
        if(txid.length < 10) { 
            tg.showAlert("TxID نامعتبر."); return; 
        }
        
        openStatusModal();
        
        try {
            const res = await fetch(`${API_BASE_URL}/webapp/usdt/sell`, {
                method: 'POST', 
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ initData: tg.initData, amount: amount, txid: txid, network: network, use_xp_discount: use_xp_discount })
            });
            const data = await res.json();
            
            if (data.status === 'success') { 
                tg.showAlert("✅ ثبت فروش موفق. منتظر واریز تومان باشید."); 
                tg.HapticFeedback.notificationOccurred('success');
                location.reload();
            } else { 
                tg.showAlert("❌ " + (data.message || "خطا در ثبت فروش.")); 
                tg.HapticFeedback.notificationOccurred('error');
                closeStatusModal(); 
            }
        } catch (e) { 
            tg.showAlert("خطای شبکه در هنگام فروش."); 
            closeStatusModal(); 
        }
    };
    
})();