/* webapp/script.js (v111.0 - Luxury UI & Parallax Enabled) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // تنظیم زمان اسپلش اسکرین (کاهش داده شد برای لود سریع‌تر)
    let MIN_SPLASH_TIME = 2000; 

    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    
    const isDashboard = !!document.getElementById('toman-balance');
    const isSupportPage = !!document.getElementById('messages-container');

    let chatPollInterval = null;
    let lastMessageCount = 0;
    let isSending = false;

    // المنت‌های اصلی داشبورد
    const els = {
        welcomeName: document.getElementById('welcome-name'),
        tomanBalance: document.getElementById('toman-balance'),
        uusdBalance: document.getElementById('uusd-balance'),
        xpBalance: document.getElementById('xp-balance'),
        // kycText: document.getElementById('kyc-text'), // در داشبورد حذف شد
        avatar: document.querySelector('.avatar-img'),
        supportNotif: document.getElementById('support-notif'),
        ticker: document.getElementById('price-ticker'),
        xpFill: document.getElementById('xp-progress-fill'),
        levelBadge: document.getElementById('level-badge'),
        nextLevelText: document.getElementById('next-level-text')
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

    // ==========================================
    // 1. GLOBAL FIX: BFCache Handler (The Magic Fix)
    // ==========================================
    window.addEventListener('pageshow', function(event) {
        if (event.persisted || (window.performance && window.performance.navigation.type === 2)) {
            console.log("Restored from cache - Forcing loader hide");
            forceHideLoader();
            document.body.style.overflow = 'auto';
        }
    });

    // ==========================================
    // 2. MAIN INITIALIZATION
    // ==========================================
    window.onload = async function() {
        try {
            tg.ready();
            tg.expand();
            
            // تنظیمات BackButton و رنگ تم
            setupTelegramUI();

            if (!tg.initData) {
                console.warn("Using Test Data");
                tg.initData = "query_id=TEST_DEV_MODE"; 
            }

            const hasSeenSplash = sessionStorage.getItem('splash_shown');

            // --- منطق لودینگ داشبورد ---
            if (isDashboard) {
                if (hasSeenSplash) {
                    // بازگشت مجدد به داشبورد (سریع)
                    loadFromCache();
                    forceHideLoader();
                    
                    initDashboardEffects();

                    fetchDashboardData().then(data => { if(data) updateDashboardUI(data); });
                    fetchMarketRates().then(handleMarketData);
                    checkUnreadSupportMessages();

                } else {
                    // ورود اول (با انیمیشن)
                    sessionStorage.setItem('splash_shown', 'true');
                    
                    const splashTimer = new Promise(resolve => setTimeout(resolve, MIN_SPLASH_TIME));
                    const dataFetch = fetchDashboardData();
                    const ratesFetch = fetchMarketRates(); 

                    const [dataResult, ratesResult] = await Promise.all([dataFetch, ratesFetch, splashTimer]);

                    if (dataResult) {
                        updateDashboardUI(dataResult);
                        handleMarketData(ratesResult);
                        checkUnreadSupportMessages();
                        
                        hideLoaderWithAnimation();
                        
                        // اطمینان از فعال‌سازی افکت‌ها بعد از نمایش UI
                        setTimeout(initDashboardEffects, 800); 
                    } else {
                        forceHideLoader(); // fail-safe
                    }
                }
            } else if (isSupportPage) {
                // --- منطق صفحه پشتیبانی ---
                forceHideLoader(); 
                setupChatListeners();
                await loadChatHistory(true); 
                startChatPolling();
                initHapticFeedback();
            } else {
                // --- سایر صفحات ---
                forceHideLoader();
                initHapticFeedback();
            }

        } catch (error) {
            console.error("Critical Init Error:", error);
            forceHideLoader(); 
        }
    };
    
    function setupTelegramUI() {
        if (isDashboard) {
            tg.setHeaderColor('#050505'); 
            tg.setBackgroundColor('#050505');
            tg.BackButton.hide();
        } else {
            tg.setHeaderColor('#050505');
            tg.setBackgroundColor('#000000');
            tg.BackButton.show();
            tg.BackButton.onClick(function() {
                window.location.href = 'dashboard.html';
            });
        }
    }

    function initDashboardEffects() {
        init3DCardEffect();
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
    // Caching Logic
    // ==========================================
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

    // ==========================================
    // Loader Functions (Optimized)
    // ==========================================
    function forceHideLoader() {
        document.body.classList.remove('loading-active'); 
        if (loader) {
            loader.style.display = 'none';
            loader.style.opacity = '0';
        }
        if (appContainer) {
            appContainer.classList.remove('hidden-content');
            appContainer.style.opacity = '1';
            appContainer.style.transform = 'translateY(0)';
        }
    }

    function hideLoaderWithAnimation() {
        document.body.classList.remove('loading-active');
        if (loader) {
            loader.style.opacity = '0';
            loader.style.pointerEvents = 'none';
            // زمان بندی انیمیشن‌ها را با زمان CSS هماهنگ می‌کنیم
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
    // Data Fetching
    // ==========================================
    async function fetchDashboardData() {
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/get_user_data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            if (!response.ok) throw new Error("Server Error");
            const data = await response.json();
            if(data.status === 'success') saveToCache(data);
            return data;
        } catch (error) { return null; }
    }

    async function fetchMarketRates() {
        try {
            // اضافه کردن هدر برای ngrok
            const response = await fetch(`${API_BASE_URL}/webapp/market/rates`, {
                headers: { 'ngrok-skip-browser-warning': 'true' }
            });
            if (!response.ok) return null;
            return await response.json();
        } catch (e) { return null; }
    }

    // ==========================================
    // UI Updaters
    // ==========================================
    function updateDashboardUI(data, saveCache = true) {
        if (!data || data.status === 'error') return;
        if(saveCache) saveToCache(data);

        if (els.welcomeName) els.welcomeName.innerText = data.first_name || "کاربر گرامی";
        // استفاده از toLocaleString برای نمایش تومان
        if (els.tomanBalance) els.tomanBalance.innerText = data.toman_balance.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        if (els.uusdBalance) els.uusdBalance.innerHTML = `${data.uusd_balance} <small>$</small>`;
        if (els.xpBalance) els.xpBalance.innerHTML = `${data.xp_balance} <small>XP</small>`;

        // مقدار xp_balance ممکن است با کاما باشد، آن را پاک می‌کنیم
        const rawXp = parseInt((data.xp_balance || "0").replace(/,/g, '')) || 0;
        updateLevelProgress(rawXp);

        if (tg.initDataUnsafe?.user?.photo_url && els.avatar) {
            els.avatar.src = tg.initDataUnsafe.user.photo_url;
        }
        // updateKycBadge(data.kyc_status_code); // در داشبورد حذف شد
    }

    function updateLevelProgress(xp) {
        if (!els.xpFill || !els.levelBadge) return;
        // تعریف سطوح با توجه به config.py
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
            percentage = 100; // بالاترین سطح
        }

        percentage = Math.min(100, Math.max(0, percentage));

        els.xpFill.style.width = `${percentage}%`;
        els.levelBadge.innerText = `VIP ${currentLevelIndex + 1}`; 
        
        if (els.nextLevelText) {
            if (nextThreshold) {
                 els.nextLevelText.innerText = `NEXT: ${levelNames[currentLevelIndex + 1]} (${Math.ceil(nextThreshold - xp)} XP)`;
            } else {
                els.nextLevelText.innerText = "MAX LEVEL";
            }
        }
    }

    function updateTickerUI(rates) {
        if (!els.ticker || !rates || rates.length === 0) return;
        // افزایش تعداد آیتم‌های تکراری برای ایجاد حرکت روان‌تر
        let html = '';
        const loopRates = [...rates, ...rates, ...rates, ...rates]; 
        loopRates.forEach(rate => {
            const changeClass = rate.change >= 0 ? 'up' : 'down';
            const arrow = rate.change > 0 ? '▲' : (rate.change < 0 ? '▼' : '');
            const colorClass = rate.change === 0 ? '' : changeClass;
            // نمایش آیکون در کنار قیمت
            const icon = rate.symbol === 'USDT' ? '<i class="fas fa-dollar-sign"></i>' : (rate.symbol === 'BTC' ? '<i class="fab fa-btc"></i>' : (rate.symbol === 'ETH' ? '<i class="fab fa-ethereum"></i>' : (rate.symbol === 'TON' ? '💎' : '')));
            
            html += `<div class="ticker-item">${rate.symbol} ${icon} <span class="${colorClass}">${rate.price} ${arrow} <small>(${rate.change}%)</small></span></div>`;
        });
        els.ticker.innerHTML = html;
        // شروع دوباره انیمیشن با تنظیم مجدد
        els.ticker.style.animation = 'none';
        void els.ticker.offsetWidth; // Force reflow
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
    // Effects & Interactions (Parallax)
    // ==========================================
    function init3DCardEffect() {
        const card = document.querySelector('.premium-card');
        const container = document.querySelector('.main-content');
        const cardShine = document.querySelector('.card-shine');

        if (!card || !container) return;

        function handleMove(e) {
            const rect = card.getBoundingClientRect();
            // محاسبه موقعیت ماوس نسبت به مرکز کارت
            const clientX = e.clientX || e.touches[0].clientX;
            const clientY = e.clientY || e.touches[0].clientY;

            const cardCenterX = rect.left + rect.width / 2;
            const cardCenterY = rect.top + rect.height / 2;
            
            const mouseX = clientX - cardCenterX;
            const mouseY = clientY - cardCenterY;
            
            // تعیین درجه چرخش (کمتر برای نرمی بیشتر)
            const rotateX = (mouseY / rect.height) * -8;
            const rotateY = (mouseX / rect.width) * 8;
            
            // حرکت Shine Effect
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

        // Mouse Events for Desktop/WebApp Dev
        container.addEventListener('mousemove', handleMove);
        container.addEventListener('mouseleave', handleLeave);

        // Touch Events for Mobile
        container.addEventListener('touchstart', (e) => { 
            handleMove(e); 
            e.stopPropagation();
        }, {passive: true});
        container.addEventListener('touchmove', (e) => { 
            handleMove(e); 
            e.stopPropagation();
        }, {passive: true});
        container.addEventListener('touchend', handleLeave);

        // Device Orientation (اختیاری)
        if (window.DeviceOrientationEvent) {
            let tiltActive = false;
            window.addEventListener("deviceorientation", (event) => {
                if (window.innerWidth < 600) return; // فقط برای دستگاه‌های بزرگتر یا دسکتاپ

                let rotateY = event.gamma; 
                let rotateX = event.beta; 
                
                if (rotateY > 20 || rotateY < -20 || rotateX > 50 || rotateX < 20) {
                    // اگر چرخش زیاد بود یا در حالت عمودی نبود، غیرفعال کن
                    handleLeave();
                    tiltActive = false;
                    return;
                }
                
                tiltActive = true;
                const maxAngle = 10;
                
                // مقیاس‌بندی چرخش‌ها
                rotateX = (rotateX - 35) * -1; // نرمال‌سازی برای نگه داشتن موبایل
                rotateY = rotateY * -1;
                
                // محدود کردن
                rotateX = Math.max(-maxAngle, Math.min(maxAngle, rotateX * 0.5)); 
                rotateY = Math.max(-maxAngle, Math.min(maxAngle, rotateY * 0.5)); 

                card.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;

            }, false);
            
            // اگر سنسور غیرفعال شد، به حالت عادی برگردان
            window.addEventListener('orientationchange', handleLeave);

        }
    }

    function initHapticFeedback() {
        const interactives = document.querySelectorAll('.ripple-btn, .glass-btn, .service-card, .game-banner, .action-icon-btn, .attach-btn, .send-btn');
        interactives.forEach(el => {
            el.addEventListener('touchstart', () => { 
                try { tg.HapticFeedback.impactOccurred('light'); } catch(e){} 
            }, {passive: true});
            el.addEventListener('click', () => { 
                // برای جلوگیری از فیدبک مضاعف در دستگاه‌های تاچ، فقط در دسکتاپ یا هنگام کلیک واقعی اجرا شود
                if(tg.platform === 'tdesktop' || tg.platform === 'macos') { 
                    try { tg.HapticFeedback.impactOccurred('light'); } catch(e){} 
                } 
            });
        });
    }

    // --- توابع پشتیبانی (Chat Functions) ---
    // این توابع بدون تغییر و برای حفظ عملکرد کپی شده‌اند

    function startChatPolling() {
        if (chatPollInterval) clearInterval(chatPollInterval);
        chatPollInterval = setInterval(() => loadChatHistory(false), 3000);
    }
    
    async function loadChatHistory(isFirstLoad = false) {
        if (!chatEls.container) return;
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/support/get_history`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            if (response.ok) {
                const data = await response.json();
                if (isFirstLoad) {
                    chatEls.container.innerHTML = '<div class="date-separator">گفتگوی امن</div>';
                    lastMessageCount = 0;
                }
                const messages = data.messages || [];
                if (messages.length > lastMessageCount) {
                    const newMessages = messages.slice(lastMessageCount);
                    newMessages.forEach(msg => renderMessage(msg));
                    lastMessageCount = messages.length;
                    scrollToBottom();
                } else if (messages.length === 0 && isFirstLoad) {
                    renderSystemMessage("هنوز پیامی ندارید. اولین پیام را ارسال کنید.");
                }
            }
        } catch (e) {
            if (isFirstLoad) renderSystemMessage("خطا در بارگذاری تاریخچه.");
        }
    }

    function setupChatListeners() {
        if (!chatEls.sendBtn || !chatEls.input) return;
        const newSendBtn = chatEls.sendBtn.cloneNode(true);
        chatEls.sendBtn.parentNode.replaceChild(newSendBtn, chatEls.sendBtn);
        chatEls.sendBtn = newSendBtn;
        chatEls.sendBtn.addEventListener('click', sendMessage);
        chatEls.input.addEventListener('keypress', function (e) { if (e.key === 'Enter') sendMessage(); });
        if (chatEls.attachBtn && chatEls.fileInput) {
            chatEls.attachBtn.addEventListener('click', () => { chatEls.fileInput.click(); });
            chatEls.fileInput.addEventListener('change', handleFileUpload);
        }
        if (chatEls.optionsBtn) {
            chatEls.optionsBtn.addEventListener('click', () => {
                tg.showPopup({ title: 'پشتیبانی', message: 'آیا می‌خواهید تیکت را ببندید؟', buttons: [{id: 'close', type: 'destructive', text: 'بله'}, {type: 'cancel'}] }, (btnId) => { if (btnId === 'close') tg.close(); });
            });
        }
    }

    async function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { tg.showAlert("حجم فایل نباید بیشتر از ۵ مگابایت باشد."); chatEls.fileInput.value = ''; return; }
        renderMessage({ sender: 'user', text: '📷 در حال آپلود تصویر...', is_me: true, type: 'text' });
        scrollToBottom();
        const formData = new FormData();
        formData.append('initData', tg.initData);
        formData.append('file', file);
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/support/upload_file`, { method: 'POST', body: formData });
            const result = await response.json();
            if (response.ok && result.status === 'success') { chatEls.fileInput.value = ''; await loadChatHistory(false); } 
            else { tg.showAlert("خطا در آپلود: " + (result.message || "نامشخص")); chatEls.fileInput.value = ''; }
        } catch (e) { tg.showAlert("عدم اتصال به سرور."); chatEls.fileInput.value = ''; }
    }

    async function sendMessage() {
        if (isSending) return;
        const text = chatEls.input.value.trim();
        if (!text) return;
        isSending = true;
        chatEls.sendBtn.style.opacity = '0.5';
        renderMessage({ sender: 'user', text: text, timestamp: '...', is_me: true });
        lastMessageCount++;
        chatEls.input.value = '';
        scrollToBottom();
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/support/send_message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData, message: text, type: 'text' })
            });
            const result = await response.json();
            if (!response.ok || result.status !== 'success') throw new Error(result.message || "خطا");
            await loadChatHistory(false);
        } catch (e) {
            tg.showAlert("خطا در ارسال پیام.");
            chatEls.input.value = text;
            lastMessageCount--;
            const bubbles = document.querySelectorAll('.message-wrapper');
            if(bubbles.length > 0) bubbles[bubbles.length - 1].remove();
        } finally {
            isSending = false;
            chatEls.sendBtn.style.opacity = '1';
            chatEls.input.focus();
        }
    }

    function renderMessage(msg) {
        const isUser = msg.sender === 'user' || msg.is_me; 
        const wrapperClass = isUser ? 'msg-user' : 'msg-admin';
        const checkIcon = isUser ? '<i class="fas fa-check msg-status-icon"></i>' : '';
        let contentHtml = '';
        if (msg.type === 'photo' && msg.file_url) { contentHtml = `<img src="${msg.file_url}" style="max-width: 100%; border-radius: 12px; margin-bottom: 5px; display: block;" alt="Photo">`; if (msg.text) contentHtml += `<span>${escapeHtml(msg.text)}</span>`; } 
        else { contentHtml = escapeHtml(msg.text); }
        const html = `<div class="message-wrapper ${wrapperClass}"><div class="bubble">${contentHtml}</div><div class="msg-meta"><span>${msg.timestamp || ''}</span>${checkIcon}</div></div>`;
        chatEls.container.insertAdjacentHTML('beforeend', html);
    }

    function renderSystemMessage(text) {
        const html = `<div style="text-align:center; font-size:0.75rem; color:#666; margin:15px 0; background:rgba(255,255,255,0.05); padding:5px; border-radius:10px; display:inline-block; margin-left:auto; margin-right:auto;">${text}</div>`;
        const wrapper = document.createElement('div');
        wrapper.style.textAlign = 'center';
        wrapper.innerHTML = html;
        chatEls.container.appendChild(wrapper);
    }

    function scrollToBottom() { if (chatEls.container) chatEls.container.scrollTop = chatEls.container.scrollHeight; }
    function escapeHtml(text) { if (!text) return ""; return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    // --- پایان توابع پشتیبانی ---

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
    
    // توابع show/hide error حذف شدند زیرا از tg.showAlert استفاده می‌شود

})();