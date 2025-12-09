/* webapp/script.js (v113.0 - FINAL BALANCE DISPLAY FIX & Luxury UI Complete) */
(function () {
    'use strict';

    // --- GLOBAL VARIABLES & CONFIG ---
    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    let MIN_SPLASH_TIME = 1500; // کاهش زمان لودینگ به 1.5 ثانیه

    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    
    const isDashboard = !!document.getElementById('toman-balance');
    const isSupportPage = !!document.getElementById('messages-container');
    
    let chatPollInterval = null;
    let lastMessageCount = 0;
    let isSending = false;
    let currentTomanBalance = 0; // برای استفاده در منطق شرط‌بندی/سواپ

    // المنت‌های اصلی داشبورد
    const els = {
        welcomeName: document.getElementById('welcome-name'),
        tomanBalance: document.getElementById('toman-balance'),
        uusdBalance: document.getElementById('uusd-balance'),
        xpBalance: document.getElementById('xp-balance'),
        avatar: document.querySelector('.avatar-img'),
        supportNotif: document.getElementById('support-notif'),
        ticker: document.getElementById('price-ticker'),
        xpFill: document.getElementById('xp-progress-fill'),
        levelBadge: document.getElementById('level-badge'),
        nextLevelText: document.getElementById('next-level-text'),
        premiumCard: document.querySelector('.premium-card'),
        mainContent: document.querySelector('.main-content')
    };

    // المنت‌های صفحه چت
    const chatEls = {
        container: document.getElementById('messages-container'),
        input: document.getElementById('message-input'),
        sendBtn: document.getElementById('send-btn'),
        optionsBtn: document.getElementById('chat-options-btn'),
        fileInput: document.getElementById('file-input'),
        attachBtn: document.getElementById('attach-btn')
    };

    // --- LOGO MAPPING (برای بهینه سازی تیکر) ---
    const logoMap = {
        'USDT': { icon: '<i class="fas fa-dollar-sign"></i>', color: '#0ECB81' },
        'BTC': { icon: '<i class="fab fa-btc"></i>', color: '#F7931A' },
        'ETH': { icon: '<i class="fab fa-ethereum"></i>', color: '#627EEA' },
        'TON': { icon: '💎', color: '#0098EA' },
        'NOT': { icon: '⭐', color: '#FFCC00' },
        'DEFAULT': { icon: '', color: '#fff' }
    };

    // ==========================================
    // 1. GLOBAL FIX: BFCache Handler 
    // ==========================================
    window.addEventListener('pageshow', function(event) {
        if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
            console.log("Restored from cache - Forcing loader hide");
            forceHideLoader();
            document.body.style.overflow = 'auto';
        }
    });
    
    // --- UTILITIES ---

    /**
     * فرمت دهی صحیح اعداد برای نمایش
     * تضمین می‌کند که کاماها حذف شده و اعداد به درستی به فرمت محلی تبدیل شوند.
     * @param {*} num - مقدار ورودی (می‌تواند رشته‌ای با کاما یا عدد باشد)
     * @param {number} decimals - تعداد ارقام اعشار
     */
    function formatNumber(num, decimals) {
        if (num === null || num === undefined) return '0';
        
        // 1. حذف کاماها و تبدیل به رشته
        let numStr = String(num);
        numStr = numStr.replace(/,/g, ''); 
        
        // 2. تبدیل به عدد ممیز شناور
        const numFloat = parseFloat(numStr);

        if (isNaN(numFloat)) return '0';
        
        // 3. فرمت دهی با جداکننده هزارگان
        const formatted = numFloat.toLocaleString('en-US', { 
            minimumFractionDigits: decimals, 
            maximumFractionDigits: decimals 
        });

        return formatted;
    }
    
    // ==========================================
    // 2. MAIN INITIALIZATION
    // ==========================================
    window.onload = async function() {
        try {
            tg.ready();
            tg.expand();
            setupTelegramUI();

            if (!tg.initData) tg.initData = "query_id=TEST_DEV_MODE"; 
            const hasSeenSplash = sessionStorage.getItem('splash_shown');

            if (isDashboard) {
                if (hasSeenSplash) {
                    loadFromCache();
                    forceHideLoader(); 
                    initDashboardEffects();
                    // آپدیت دیتا در پس‌زمینه
                    fetchDashboardData().then(data => { if(data) updateDashboardUI(data); });
                    fetchMarketRates().then(handleMarketData);
                    checkUnreadSupportMessages();
                } else {
                    sessionStorage.setItem('splash_shown', 'true');
                    const splashTimer = new Promise(resolve => setTimeout(resolve, MIN_SPLASH_TIME));
                    const dataFetch = fetchDashboardData();
                    const ratesFetch = fetchMarketRates(); 

                    // مطمئن می‌شویم که هم لودینگ کامل شود و هم APIها پاسخ دهند
                    const [dataResult, ratesResult] = await Promise.allSettled([dataFetch, ratesFetch, splashTimer]); 
                    
                    updateDashboardUI(dataResult.value);
                    handleMarketData(ratesResult.value);
                    
                    // CRITICAL FIX: لودر باید با انیمیشن پنهان شود تا UI نمایش داده شود
                    hideLoaderWithAnimation();
                    setTimeout(initDashboardEffects, 800); 

                }
            } else if (isSupportPage) {
                forceHideLoader(); 
                setupChatListeners();
                await loadChatHistory(true); 
                startChatPolling();
                initHapticFeedback();
            } else {
                forceHideLoader();
                initHapticFeedback();
            }

        } catch (error) {
            console.error("Critical Init Error:", error);
            // FAIL-SAFE: اگر خطایی در Init رخ داد، محتوا را نمایش بده تا کاربر گیر نکند.
            forceHideLoader(); 
        }
    };
    
    function setupTelegramUI() {
        tg.setHeaderColor('#050505');
        tg.setBackgroundColor('#000000');
        
        if (isDashboard) {
            tg.BackButton.hide();
        } else {
            tg.BackButton.show();
            tg.BackButton.onClick(function() {
                window.location.href = 'dashboard.html';
            });
        }
    }

    function initDashboardEffects() {
        if(els.premiumCard) init3DCardEffect();
        initHapticFeedback();
    }
    
    function handleMarketData(ratesResult) {
        if(ratesResult && ratesResult.status === 'success') {
            updateTickerUI(ratesResult.rates);
            const usdt = ratesResult.rates.find(r => r.symbol === 'USDT');
            if(usdt) renderSmartChart(usdt.change);
        } else {
            renderSmartChart(0);
        }
    }

    // ==========================================
    // 3. Loader Functions (Critical Fix applied here)
    // ==========================================
    function forceHideLoader() {
        document.body.classList.remove('loading-active'); 
        if (loader) {
            loader.style.display = 'none';
        }
        if (appContainer) {
            appContainer.classList.remove('hidden-content');
            appContainer.classList.add('fade-in-active'); 
            appContainer.style.opacity = '1';
            appContainer.style.transform = 'translateY(0)';
        }
    }

    function hideLoaderWithAnimation() {
        document.body.classList.remove('loading-active');
        if (loader) {
            loader.style.opacity = '0';
            loader.style.pointerEvents = 'none';
            setTimeout(() => {
                loader.style.display = 'none';
                if (appContainer) {
                    appContainer.classList.remove('hidden-content');
                    appContainer.classList.add('fade-in-active');
                }
            }, 500); 
        }
    }

    // ==========================================
    // 4. Data Fetching
    // ==========================================
    async function fetchDashboardData() {
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' },
                body: JSON.stringify({ initData: tg.initData })
            });
            if (!response.ok) throw new Error("Server Error");
            const data = await response.json();
            if(data.status === 'success') saveToCache(data);
            return data;
        } catch (error) { 
            console.error("fetchDashboardData failed:", error);
            return null; 
        }
    }

    async function fetchMarketRates() {
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/market/rates`, {
                headers: { 'ngrok-skip-browser-warning': 'true' }
            });
            if (!response.ok) return null;
            return await response.json();
        } catch (e) { return null; }
    }

    // ==========================================
    // 5. UI Updaters (Refined)
    // ==========================================
    function updateDashboardUI(data, saveCache = true) {
        if (!data || data.status === 'error') {
             if (els.welcomeName) els.welcomeName.innerText = "کاربر عزیز";
             return; 
        }

        if(saveCache) saveToCache(data);

        // --- Balances ---
        const tomanStr = data.toman_balance || 0;
        const uusdStr = data.uusd_balance || 0;
        const xpStr = data.xp_balance || 0;

        currentTomanBalance = parseFloat(String(tomanStr).replace(/,/g, '') || 0);

        if (els.welcomeName) els.welcomeName.innerText = data.first_name || "کاربر گرامی";
        
        if (els.tomanBalance) {
            // موجودی تومان را بدون اعشار و با کاما نمایش می‌دهیم
            els.tomanBalance.innerText = formatNumber(tomanStr, 0); 
        }

        if (els.uusdBalance) {
            // موجودی دلار را با ۲ رقم اعشار نمایش می‌دهیم
            els.uusdBalance.innerHTML = `${formatNumber(uusdStr, 2)} <small>$</small>`;
        }
        
        if (els.xpBalance) {
            // موجودی XP را بدون اعشار نمایش می‌دهیم
            els.xpBalance.innerHTML = `${formatNumber(xpStr, 0)} <small>XP</small>`;
        }

        updateLevelProgress(parseFloat(String(xpStr).replace(/,/g, '') || 0));

        if (tg.initDataUnsafe?.user?.photo_url && els.avatar) {
            els.avatar.src = tg.initDataUnsafe.user.photo_url;
        }
    }

    function updateLevelProgress(xp) {
        if (!els.xpFill || !els.levelBadge) return;
        const levels = [0, 500, 1500, 3500, 7000, 15000, 30000]; 
        const levelNames = ["GUEST", "BRONZE", "SILVER", "GOLD", "PLATINUM", "DIAMOND", "LEGEND"];

        let currentLevelIndex = 0; 
        for (let i = 0; i < levels.length; i++) {
            if (xp >= levels[i]) { currentLevelIndex = i; } else { break; }
        }

        const currentThreshold = levels[currentLevelIndex];
        const nextThreshold = levels[currentLevelIndex + 1];
        
        let percentage = 0;
        if (nextThreshold) {
            percentage = ((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100;
        } else {
            percentage = 100;
        }

        percentage = Math.min(100, Math.max(0, percentage));

        els.xpFill.style.width = `${percentage}%`;
        els.levelBadge.innerText = `VIP ${currentLevelIndex + 1}`; 
        
        if (els.nextLevelText) {
            if (nextThreshold) {
                 els.nextLevelText.innerText = `NEXT: ${levelNames[currentLevelIndex + 1]} (${Math.ceil(nextThreshold - xp).toLocaleString()} XP)`;
            } else {
                els.nextLevelText.innerText = "MAX LEVEL";
            }
        }
    }

    function updateTickerUI(rates) {
        if (!els.ticker || !rates || rates.length === 0) return;
        
        let html = '';
        const loopRates = [...rates, ...rates, ...rates, ...rates]; 
        loopRates.forEach(rate => {
            const change = parseFloat(rate.change);
            const changeClass = change >= 0 ? 'up' : 'down';
            const arrow = change > 0 ? '▲' : (change < 0 ? '▼' : '');
            const colorClass = change === 0 ? '' : changeClass;
            const assetInfo = logoMap[rate.symbol] || logoMap['DEFAULT'];
            const icon = assetInfo.icon;
            
            html += `<div class="ticker-item">${rate.symbol} ${icon} <span class="${colorClass}">${rate.price} ${arrow} <small>(${rate.change}%)</small></span></div>`;
        });
        els.ticker.innerHTML = html;
        // ریست انیمیشن
        els.ticker.style.animation = 'none';
        void els.ticker.offsetWidth;
        els.ticker.style.animation = 'ticker 25s linear infinite';
    }

    function renderSmartChart(changePercent) {
        const svg = document.getElementById('sparkline-svg');
        if (!svg) return;
        const existingPaths = svg.querySelectorAll('path');
        existingPaths.forEach(p => p.remove());
        const width = 300; const height = 50; const pointsCount = 20; 
        const points = []; const trendFactor = changePercent * 2; 
        
        for (let i = 0; i <= pointsCount; i++) {
            const x = (i / pointsCount) * width;
            const noise = (Math.random() - 0.5) * 15;
            const trend = (i / pointsCount) * -trendFactor; 
            let y = (height / 2) + trend + noise;
            y = Math.max(5, Math.min(height - 5, y));
            points.push({x, y});
        }
        
        let d = `M ${points[0].x},${points[0].y}`;
        for (let i = 1; i < points.length; i++) { d += ` L ${points[i].x},${points[i].y}`; }
        
        let strokeColor = '#FFCC00'; let fillUrl = 'url(#gradNeutral)';
        if (changePercent > 0) { strokeColor = '#0ECB81'; fillUrl = 'url(#gradUp)'; } 
        else if (changePercent < 0) { strokeColor = '#F6465D'; fillUrl = 'url(#gradDown)'; }
        
        const pathLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathLine.setAttribute("d", d); pathLine.setAttribute("fill", "none"); pathLine.setAttribute("stroke", strokeColor); pathLine.setAttribute("stroke-width", "2"); pathLine.setAttribute("stroke-linecap", "round"); pathLine.setAttribute("stroke-linejoin", "round");
        
        const dFill = d + ` V ${height} H 0 Z`;
        const pathFill = document.createElementNS("http://www.w3.org/2000/svg", "path");
        pathFill.setAttribute("d", dFill); pathFill.setAttribute("fill", fillUrl); pathFill.setAttribute("stroke", "none"); pathFill.style.opacity = "0.5";
        
        svg.appendChild(pathFill); svg.appendChild(pathLine);
    }

    // ==========================================
    // 6. Effects & Interactions (Parallax)
    // ==========================================
    function init3DCardEffect() {
        const card = els.premiumCard;
        const container = els.mainContent;
        const cardShine = document.querySelector('.card-shine');

        if (!card || !container) return;

        function handleMove(e) {
            const rect = card.getBoundingClientRect();
            const clientX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : undefined);
            const clientY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : undefined);

            if (clientX === undefined || clientY === undefined) return;

            const cardCenterX = rect.left + rect.width / 2;
            const cardCenterY = rect.top + rect.height / 2;
            
            const mouseX = clientX - cardCenterX;
            const mouseY = clientY - cardCenterY;
            
            const rotateX = (mouseY / rect.height) * -8;
            const rotateY = (mouseX / rect.width) * 8;
            
            const shineX = (mouseX / rect.width * 50) + 50;
            const shineY = (mouseY / rect.height * 50) + 50;

            card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
            if (cardShine) {
                cardShine.style.setProperty('--shine-x', `${shineX}%`);
                cardShine.style.setProperty('--shine-y', `${shineY}%`);
            }
        }

        function handleLeave() { 
            card.style.transform = `rotateX(0deg) rotateY(0deg)`; 
            if (cardShine) {
                cardShine.style.setProperty('--shine-x', `50%`);
                cardShine.style.setProperty('--shine-y', `50%`);
            }
        }

        container.addEventListener('mousemove', handleMove);
        container.addEventListener('mouseleave', handleLeave);
        container.addEventListener('touchmove', handleMove, {passive: true});
        container.addEventListener('touchend', handleLeave);
    }

    function initHapticFeedback() {
        const interactives = document.querySelectorAll('.ripple-btn, .glass-btn, .service-card, .game-banner, .action-icon-btn');
        interactives.forEach(el => {
            el.addEventListener('touchstart', () => { 
                try { tg.HapticFeedback.impactOccurred('light'); } catch(e){} 
            }, {passive: true});
        });
    }

    // --- Caching ---
    function saveToCache(data) {
        try { localStorage.setItem('dashboard_cache', JSON.stringify(data)); } catch (e) {}
    }

    function loadFromCache() {
        try {
            const cached = localStorage.getItem('dashboard_cache');
            if (cached) {
                const data = JSON.parse(cached);
                updateDashboardUI(data, false);
            }
        } catch (e) {}
    }
    
    // --- Unread Support Check ---
    async function checkUnreadSupportMessages() {
        if (!els.supportNotif) return;
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/support/check_unread`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await response.json();
            if (data.has_unread) els.supportNotif.style.display = 'block';
        } catch (e) {}
    }
    
    // --- Chat Functions (برای کامل بودن فایل) ---
    // ... (توابع چت: loadChatHistory, setupChatListeners, renderMessage و ...)
    // این توابع برای حفظ حجم پیام در چت اصلی حذف می‌شوند، اما باید در فایل واقعی شما وجود داشته باشند.
    
})();