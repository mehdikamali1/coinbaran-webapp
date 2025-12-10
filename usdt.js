/* webapp/usdt.js (v2.1 - UPGRADE: XP Discount Client Prep) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // Global state variables for rates and exchange addresses
    let WALLETS = { 'TRC20': '', 'BEP20': '' }; 
    // rates holds the simple Toman per USDT price
    let rates = { buy: 0, sell: 0 }; 
    
    // UPGRADE: New state for detailed XP/Fee information
    let xpDiscount = {
        base_fee: 1.0, 
        discounted_fee: 1.0, 
        discount_applied: 0,
        final_sell_rate: 0, // User final BUY price
        final_buy_rate: 0   // User final SELL price
    }; 
    

    // --- Initialization ---

    window.onload = function() {
        tg.ready(); 
        tg.expand(); 
        tg.setHeaderColor('#000000');
        
        if (!tg.initData) tg.initData = "query_id=TEST&user=%7B%22id%22%3A111111111%7D&auth_date=1700000000&hash=fake";
        
        fetchRates();
    };

    // --- Tab Switching Logic (Unchanged) ---

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
        
        calc(mode);
    };

    // --- Data Fetching (Rates & XP Discount) ---

    async function fetchRates() {
        try {
            // UPGRADE: Endpoint to fetch the detailed exchange info (including fees/XP data)
            const res = await fetch(`${API_BASE_URL}/webapp/usdt/rates`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ initData: tg.initData }) 
            });
            const data = await res.json();
            
            if(data.status === 'success') {
                
                // UPGRADE: Store detailed data from get_full_tether_exchange_info
                xpDiscount.base_fee = data.base_fee_percent;
                xpDiscount.discounted_fee = data.discounted_fee_percent;
                xpDiscount.discount_applied = data.discount_applied_percent;
                xpDiscount.final_sell_rate = data.final_sell_rate; // User BUY price (Admin Sells)
                xpDiscount.final_buy_rate = data.final_buy_rate;   // User SELL price (Admin Buys)
                
                // Set simple rates for display (using the base rates if available, otherwise discounted)
                rates.buy = data.final_sell_rate; 
                rates.sell = data.final_buy_rate; 
                
                if (data.wallets) { 
                    WALLETS = data.wallets; 
                    updateWalletAddress(); 
                }
                
                // Displaying the base exchange ticker rates on the ticker card
                // Display Admin's Buy rate (User Sells)
                document.getElementById('rate-sell').innerText = parseInt(data.base_buy || rates.sell).toLocaleString();
                // Display Admin's Sell rate (User Buys)
                document.getElementById('rate-buy').innerText = parseInt(data.base_sell || rates.buy).toLocaleString(); 
                
                // Set initial tab mode after rates are loaded
                setMode('buy');

                // UPGRADE: Update XP/Fee display (Requires corresponding HTML update)
                // document.getElementById('fee-display-base').innerText = `${xpDiscount.base_fee.toFixed(2)}%`;
                // document.getElementById('fee-display-final').innerText = `${xpDiscount.discounted_fee.toFixed(2)}%`;
                
            } else {
                console.error("Failed to fetch rates:", data.message);
                tg.showAlert("❌ خطا در دریافت نرخ‌های لحظه‌ای.");
            }
        } catch(e) {
            console.error("Network error during rates fetch:", e);
        }
    }

    // --- Utility Functions (Updated to use XP discounted rates) ---

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
        
        if (isNaN(amount) || amount <= 0) { 
            displayEl.innerHTML = `0 <span style="font-size:0.7rem">تومان</span>`; 
            return; 
        }
        
        // UPGRADE: Use the final discounted rate
        let finalRate = (mode === 'buy') ? xpDiscount.final_sell_rate : xpDiscount.final_buy_rate; 
        
        if (finalRate === 0) {
            displayEl.innerHTML = `... <span style="font-size:0.7rem">تومان</span>`;
            return;
        }

        // Calculate and format the Toman amount
        const total = amount * finalRate;
        displayEl.innerHTML = `${parseInt(total).toLocaleString()} <span style="font-size:0.7rem">تومان</span>`;
    };

    function openStatusModal() {
        document.getElementById('status-modal').classList.add('active');
    }

    function closeStatusModal() {
        document.getElementById('status-modal').classList.remove('active');
    }

    // --- Submission Handlers (Unchanged API calls, but prepared for future XP payload) ---

    window.submitBuy = async function() {
        const amount = parseFloat(document.getElementById('buy-amount').value);
        const address = document.getElementById('buy-address').value;
        const network = document.getElementById('buy-network').value;
        // UPGRADE NOTE: Add XP usage to payload later

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
                body: JSON.stringify({ 
                    initData: tg.initData, 
                    amount: amount, 
                    address: address, 
                    network: network 
                })
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
        // UPGRADE NOTE: Add XP usage to payload later
        
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
                body: JSON.stringify({ 
                    initData: tg.initData, 
                    amount: amount, 
                    txid: txid, 
                    network: network 
                })
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