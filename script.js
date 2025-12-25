/* webapp/script.js (v110.0 - IRAN TIME & PRO FEATURES) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin + "/api/webapp"; 
    
    let MIN_SPLASH_TIME = 3000;

    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    
    const isDashboard = !!document.getElementById('toman-balance');
    const isSupportPage = !!document.getElementById('messages-container');

    let chatPollInterval = null;
    let lastMessageCount = 0;
    let isSending = false;

    const els = {
        welcomeName: document.getElementById('welcome-name'),
        tomanBalance: document.getElementById('toman-balance'),
        uusdBalance: document.getElementById('uusd-balance'),
        xpBalance: document.getElementById('xp-balance'),
        kycText: document.getElementById('kyc-text'),
        avatar: document.querySelector('.avatar-img'),
        supportNotif: document.getElementById('support-notif'),
        ticker: document.getElementById('price-ticker'),
        xpFill: document.getElementById('xp-progress-fill'),
        levelBadge: document.getElementById('level-badge')
    };

    const chatEls = {
        container: document.getElementById('messages-container'),
        input: document.getElementById('message-input'),
        sendBtn: document.getElementById('send-btn'),
        fileInput: document.getElementById('file-input'),
        attachBtn: document.getElementById('attach-btn')
    };

    window.addEventListener('pageshow', function(event) {
        if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
            forceHideLoader();
        }
    });

    window.onload = async function() {
        try {
            tg.ready();
            tg.expand();
            
            if (isDashboard) {
                tg.setHeaderColor('#080E13'); 
                tg.setBackgroundColor('#080E13');
                tg.BackButton.hide();
            } else {
                tg.setHeaderColor('#080E13');
                tg.setBackgroundColor('#080E13');
                tg.BackButton.show();
                tg.BackButton.onClick(() => window.location.href = 'dashboard.html');
            }

            if (!tg.initData) tg.initData = "query_id=TEST_DEV_MODE"; 

            const hasSeenSplash = sessionStorage.getItem('splash_shown');

            if (isDashboard) {
                if (hasSeenSplash) {
                    loadFromCache();
                    forceHideLoader();
                    initHapticFeedback();
                    
                    fetchDashboardData().then(data => { if(data) updateDashboardUI(data); });
                    fetchMarketRates().then(res => {
                        if(res && res.status === 'success') {
                            updateTickerUI(res.rates);
                            const usdt = res.rates.find(r => r.symbol === 'USDT');
                            if(usdt) renderSmartChart(usdt.change);
                        }
                    });
                    checkUnreadSupportMessages();

                } else {
                    sessionStorage.setItem('splash_shown', 'true');
                    const splashTimer = new Promise(resolve => setTimeout(resolve, MIN_SPLASH_TIME));
                    const dataFetch = fetchDashboardData();
                    const ratesFetch = fetchMarketRates(); 

                    const [dataResult, ratesResult] = await Promise.all([dataFetch, ratesFetch, splashTimer]);

                    if (dataResult) {
                        updateDashboardUI(dataResult);
                        checkUnreadSupportMessages();
                        
                        if (ratesResult && ratesResult.status === 'success') {
                            updateTickerUI(ratesResult.rates);
                            const usdt = ratesResult.rates.find(r => r.symbol === 'USDT');
                            if(usdt) renderSmartChart(usdt.change);
                        } else {
                            renderSmartChart(0);
                        }
                        
                        hideLoaderWithAnimation();
                        setTimeout(() => initHapticFeedback(), 100);
                    } else {
                        forceHideLoader();
                    }
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
            console.error("Init Error:", error);
            forceHideLoader();
        }
    };

    // ==========================================
    // Core Functions
    // ==========================================
    function saveToCache(data) { try { localStorage.setItem('dashboard_cache', JSON.stringify(data)); } catch (e) {} }
    function loadFromCache() { try { const cached = localStorage.getItem('dashboard_cache'); if (cached) updateDashboardUI(JSON.parse(cached), false); } catch (e) {} }

    function forceHideLoader() {
        document.body.classList.remove('loading-active');
        if (loader) { loader.style.display = 'none'; loader.style.opacity = '0'; }
        if (appContainer) { appContainer.classList.remove('hidden-content'); appContainer.style.opacity = '1'; }
    }

    function hideLoaderWithAnimation() {
        document.body.classList.remove('loading-active');
        if (loader) {
            loader.style.opacity = '0'; loader.style.pointerEvents = 'none';
            setTimeout(() => {
                loader.style.display = 'none';
                if (appContainer) {
                    appContainer.classList.remove('hidden-content');
                    appContainer.style.animation = "fadeInUp 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards";
                }
            }, 600); 
        }
    }

    async function fetchDashboardData() {
        try {
            const response = await fetch(`${API_BASE_URL}/get_user_data`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: tg.initData })
            });
            const data = await response.json();
            if(data.status === 'success') saveToCache(data);
            return data;
        } catch (error) { return null; }
    }

    async function fetchMarketRates() {
        try { const response = await fetch(`${API_BASE_URL}/market/rates`); return await response.json(); } catch (e) { return null; }
    }

    // ==========================================
    // UI Updates (Iran Time Greeting & Animations)
    // ==========================================
    
    // تابع محاسبه زمان ایران
    function getIranTimeGreeting() {
        try {
            // دریافت زمان فعلی تهران
            const tehranTime = new Date().toLocaleTimeString('en-US', { timeZone: 'Asia/Tehran', hour12: false });
            const hour = parseInt(tehranTime.split(':')[0]);
            
            if (hour >= 5 && hour < 11) return "صبح بخیر";
            if (hour >= 11 && hour < 16) return "ظهر بخیر";
            if (hour >= 16 && hour < 20) return "عصر بخیر";
            return "شب بخیر";
        } catch (e) {
            return "وقت بخیر";
        }
    }

    function updateDashboardUI(data, saveCache = true) {
        if (!data || data.status === 'error') return;
        if(saveCache) saveToCache(data);

        // اعمال خوش‌آمدگویی هوشمند
        if (els.welcomeName) {
            const greeting = getIranTimeGreeting();
            const userName = data.first_name || "کاربر";
            // مثلاً: "شب بخیر، مهدی"
            els.welcomeName.innerHTML = `${greeting}، <span style="color:#fff;">${userName}</span>`;
        }
        
        if (els.tomanBalance) {
            const finalAmount = parseInt(data.toman_balance.replace(/,/g, '')) || 0;
            if (els.tomanBalance.innerText === '---' || els.tomanBalance.innerText === '0') {
                animateValue(els.tomanBalance, 0, finalAmount, 1500);
            } else {
                els.tomanBalance.innerText = finalAmount.toLocaleString();
            }
        }

        if (els.uusdBalance) els.uusdBalance.innerHTML = `${data.uusd_balance} <small>$</small>`;
        if (els.xpBalance) els.xpBalance.innerHTML = `${data.xp_balance} <small>XP</small>`;

        updateLevelProgress(parseInt((data.xp_balance || "0").replace(/,/g, '')) || 0);

        if (tg.initDataUnsafe?.user?.photo_url && els.avatar) {
            els.avatar.src = tg.initDataUnsafe.user.photo_url;
        }
        updateKycBadge(data.kyc_status_code);
    }

    function animateValue(obj, start, end, duration) {
        if (start === end) return;
        let startTimestamp = null;
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
            const currentVal = Math.floor(easeProgress * (end - start) + start);
            obj.innerText = currentVal.toLocaleString();
            if (progress < 1) window.requestAnimationFrame(step);
            else obj.innerText = end.toLocaleString();
        };
        window.requestAnimationFrame(step);
    }

    function updateLevelProgress(xp) {
        if (!els.xpFill || !els.levelBadge) return;
        const levels = [0, 500, 1500, 3500, 7000, 15000, 30000]; 
        let currentLevel = 1; let prevThreshold = 0; let nextThreshold = 500;
        for (let i = 0; i < levels.length; i++) {
            if (xp >= levels[i]) { currentLevel = i + 1; prevThreshold = levels[i]; nextThreshold = levels[i+1] || (levels[i] * 2); } else { break; }
        }
        let percentage = 0;
        if (nextThreshold > prevThreshold) percentage = ((xp - prevThreshold) / (nextThreshold - prevThreshold)) * 100;
        percentage = Math.min(100, Math.max(0, percentage));
        els.xpFill.style.width = `${percentage}%`;
        els.levelBadge.innerText = `LVL ${currentLevel}`;
    }

    // آیکون‌های ارزها
    const coinIcons = {
        'BTC': 'fa-bitcoin',
        'ETH': 'fa-ethereum',
        'USDT': 'fa-dollar-sign', // برای تتر دلار
        'TON': 'fa-gem',
        'TRX': 'fa-caret-up'
    };

    function updateTickerUI(rates) {
        if (!els.ticker || !rates || rates.length === 0) return;
        let html = '';
        const loopRates = [...rates, ...rates, ...rates]; 
        loopRates.forEach(rate => {
            const isUp = rate.change >= 0;
            const colorClass = isUp ? 'up-color' : 'down-color';
            const arrow = isUp ? '▲' : '▼';
            // انتخاب آیکون مناسب یا پیش‌فرض
            const iconClass = coinIcons[rate.symbol] || 'fa-coins';
            
            html += `
                <div class="ticker-item">
                    <i class="fab ${iconClass}" style="color: #8E9AAF; margin-left:5px; font-size:0.9rem;"></i>
                    <span style="color:#fff; font-weight:bold;">${rate.symbol}</span> 
                    <span style="color:#8E9AAF; margin:0 5px;">${rate.price}</span>
                    <span class="${colorClass}">${arrow} ${rate.display_change}</span>
                </div>`;
        });
        els.ticker.innerHTML = html;
    }

    // نمودار Area Chart
    function renderSmartChart(changePercent) {
        const svg = document.getElementById('sparkline-svg');
        const areaPath = document.getElementById('sparkline-area');
        const linePath = document.getElementById('sparkline-path');
        if (!svg || !areaPath || !linePath) return;
        
        const width = 300; const height = 50; const pointsCount = 25; 
        const points = []; const trendFactor = changePercent * 2.5; 
        
        for (let i = 0; i <= pointsCount; i++) {
            const x = (i / pointsCount) * width;
            const noise = (Math.random() - 0.5) * 10;
            const trend = (i / pointsCount) * -trendFactor; 
            let y = (height / 2) + trend + noise;
            y = Math.max(2, Math.min(height - 2, y)); 
            points.push({x, y});
        }
        
        // رسم خط
        let d = `M ${points[0].x},${points[0].y}`;
        for (let i = 1; i < points.length; i++) { d += ` L ${points[i].x},${points[i].y}`; }
        linePath.setAttribute("d", d);
        
        // رسم ناحیه پر شده (Area)
        let areaD = d + ` L ${width},${height} L 0,${height} Z`;
        areaPath.setAttribute("d", areaD);

        const strokeColor = changePercent >= 0 ? '#00F5D4' : '#FF4757';
        linePath.setAttribute("stroke", strokeColor);
        
        // تنظیم رنگ گرادینت بر اساس مثبت/منفی بودن
        // اینجا ساده نگه می‌داریم، همیشه فیروزه‌ای محو
    }

    function initHapticFeedback() {
        const interactives = document.querySelectorAll('.ripple-btn, .nav-item, .privacy-toggle, .tab-item');
        interactives.forEach(el => {
            el.addEventListener('click', () => { if(tg.HapticFeedback) tg.HapticFeedback.impactOccurred('light'); });
        });
    }

    function updateKycBadge(status) {
        if (!els.kycText) return;
        let text = "Guest", color = "#8E9AAF";
        if (status === 'verified') { text = "Verified"; color = "#00F5D4"; }
        else if (status === 'pending') { text = "Pending"; color = "#F0B90B"; }
        els.kycText.innerText = text; els.kycText.style.color = color;
    }

    async function checkUnreadSupportMessages() {
        if (!els.supportNotif) return;
        try {
            const response = await fetch(`${API_BASE_URL}/support/check_unread`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: tg.initData })
            });
            const data = await response.json();
            els.supportNotif.style.display = data.has_unread ? 'block' : 'none';
        } catch (e) {}
    }

    // ==========================================
    // Support Chat
    // ==========================================
    function startChatPolling() {
        if (chatPollInterval) clearInterval(chatPollInterval);
        chatPollInterval = setInterval(() => loadChatHistory(false), 3000);
    }
    
    async function loadChatHistory(isFirstLoad = false) {
        if (!chatEls.container) return;
        try {
            const response = await fetch(`${API_BASE_URL}/support/get_history`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: tg.initData })
            });
            if (response.ok) {
                const data = await response.json();
                const messages = data.messages || [];
                if (isFirstLoad || messages.length > lastMessageCount) {
                    if (isFirstLoad) chatEls.container.innerHTML = '';
                    const newMessages = messages.slice(isFirstLoad ? 0 : lastMessageCount);
                    newMessages.forEach(msg => renderMessage(msg));
                    lastMessageCount = messages.length;
                    scrollToBottom();
                }
            }
        } catch (e) { console.error("Chat Load Error", e); }
    }

    function setupChatListeners() {
        if (!chatEls.sendBtn || !chatEls.input) return;
        chatEls.sendBtn.onclick = sendMessage;
        chatEls.input.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(); };
        if (chatEls.attachBtn && chatEls.fileInput) {
            chatEls.attachBtn.onclick = () => chatEls.fileInput.click();
            chatEls.fileInput.onchange = handleFileUpload;
        }
    }

    async function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('file', file);
        try {
            const response = await fetch(`${API_BASE_URL}/support/upload_file`, { method: 'POST', body: formData });
            if (response.ok) loadChatHistory(false);
        } catch (e) { tg.showAlert("خطا در آپلود"); }
    }

    async function sendMessage() {
        if (isSending) return;
        const text = chatEls.input.value.trim();
        if (!text) return;
        isSending = true;
        try {
            const response = await fetch(`${API_BASE_URL}/support/send_message`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ initData: tg.initData, message: text })
            });
            if (response.ok) { chatEls.input.value = ''; loadChatHistory(false); }
        } catch (e) { tg.showAlert("خطا در ارسال"); }
        finally { isSending = false; }
    }

    function renderMessage(msg) {
        const isUser = msg.sender === 'user';
        const html = `
            <div class="message-wrapper ${isUser ? 'msg-user' : 'msg-admin'}">
                <div class="bubble">${msg.type === 'photo' ? `<img src="${msg.file_url}" style="width:100%; border-radius:10px;">` : msg.text}</div>
                <div class="msg-meta">${msg.timestamp}</div>
            </div>`;
        chatEls.container.insertAdjacentHTML('beforeend', html);
    }

    function scrollToBottom() { if (chatEls.container) chatEls.container.scrollTop = chatEls.container.scrollHeight; }

})();