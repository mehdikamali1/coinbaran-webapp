/* webapp/usdt.js (v1.0 - USDT Exchange Logic Module) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // Global state variables for rates and exchange addresses
    let WALLETS = { 'TRC20': '', 'BEP20': '' }; 
    let rates = { buy: 0, sell: 0 }; // rates.buy is the rate Admin BUYS from User (User Sells); rates.sell is the rate Admin SELLS to User (User Buys).

    // --- Initialization ---

    window.onload = function() {
        tg.ready(); 
        tg.expand(); 
        tg.setHeaderColor('#000000');
        
        // Use test data if not in Telegram environment
        if (!tg.initData) tg.initData = "query_id=TEST&user=%7B%22id%22%3A111111111%7D&auth_date=1700000000&hash=fake";
        
        fetchRates();
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
            // Note: This endpoint is expected to return both pricing (buy/sell) and wallet addresses.
            const res = await fetch(`${API_BASE_URL}/webapp/usdt/rates`, { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ initData: tg.initData }) 
            });
            const data = await res.json();
            
            if(data.status === 'success') {
                // IMPORTANT: The API returns rates based on the Exchange's perspective (Admin).
                // rates.buy (Admin buys from User) is used for the user's SELL calculation.
                // rates.sell (Admin sells to User) is used for the user's BUY calculation.
                rates.buy = data.sell; 
                rates.sell = data.buy; 
                
                if (data.wallets) { 
                    WALLETS = data.wallets; 
                    updateWalletAddress(); 
                }
                
                // Displaying the rates on the ticker card
                document.getElementById('rate-sell').innerText = parseInt(rates.buy).toLocaleString();
                document.getElementById('rate-buy').innerText = parseInt(rates.sell).toLocaleString();
                
                // Set initial tab mode after rates are loaded
                setMode('buy');

            } else {
                console.error("Failed to fetch rates:", data.message);
                tg.showAlert("❌ خطا در دریافت نرخ‌های لحظه‌ای.");
            }
        } catch(e) {
             console.error("Network error during rates fetch:", e);
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
        
        if (isNaN(amount) || amount <= 0) { 
            displayEl.innerHTML = `0 <span style="font-size:0.7rem">تومان</span>`; 
            return; 
        }
        
        // Use the correct rate based on the mode
        let price = (mode === 'buy') ? rates.buy : rates.sell;
        
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

    // --- Submission Handlers ---

    window.submitBuy = async function() {
        const amount = parseFloat(document.getElementById('buy-amount').value);
        const address = document.getElementById('buy-address').value;
        const network = document.getElementById('buy-network').value;
        
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
                body: JSON.stringify({ initData: tg.initData, amount: amount, address: address, network: network })
            });
            const data = await res.json();
            
            if (data.status === 'success') { 
                tg.showAlert("✅ درخواست خرید ثبت شد. لطفاً مبلغ را پرداخت کنید."); 
                tg.HapticFeedback.notificationOccurred('success');
                // Reload page to clear form and update balance next time dashboard is loaded
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
                body: JSON.stringify({ initData: tg.initData, amount: amount, txid: txid, network: network })
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