/* webapp/script.js (v88.1 - Luxury Support Integrated) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    const API_BASE_URL = window.location.origin;
    
    // حداقل زمان نمایش لودینگ فقط برای داشبورد
    const MIN_SPLASH_TIME = 9000; 

    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    
    // تشخیص اینکه در کدام صفحه هستیم
    const isDashboard = !!document.getElementById('toman-balance');
    const isSupportPage = !!document.getElementById('messages-container');

    // عناصر صفحه داشبورد
    const els = {
        welcomeName: document.getElementById('welcome-name'),
        tomanBalance: document.getElementById('toman-balance'),
        uusdBalance: document.getElementById('uusd-balance'),
        xpBalance: document.getElementById('xp-balance'),
        kycText: document.getElementById('kyc-text'),
        avatar: document.querySelector('.avatar-img'),
        supportNotif: document.getElementById('support-notif') // نقطه قرمز
    };

    // عناصر صفحه پشتیبانی
    const chatEls = {
        container: document.getElementById('messages-container'),
        input: document.getElementById('message-input'),
        sendBtn: document.getElementById('send-btn'),
        optionsBtn: document.getElementById('chat-options-btn')
    };

    window.onload = async function() {
        try {
            tg.ready();
            tg.expand();
            
            // تنظیم رنگ هدر برای شروع
            tg.setHeaderColor('#000000'); 
            tg.setBackgroundColor('#000000');

            if (!tg.initData) {
                console.warn("Using Test Data");
                tg.initData = "query_id=TEST_DEV_MODE"; 
            }

            // --- سناریوی ۱: صفحه داشبورد ---
            if (isDashboard) {
                const splashTimer = new Promise(resolve => setTimeout(resolve, MIN_SPLASH_TIME));
                const dataFetch = fetchDashboardData();
                
                // صبر برای تایمر و دیتا
                const [dataResult] = await Promise.all([dataFetch, splashTimer]);

                if (dataResult) {
                    updateDashboardUI(dataResult);
                    // چک کردن پیام‌های نخوانده برای نقطه قرمز
                    checkUnreadSupportMessages(); 
                    hideLoader();
                    tg.setHeaderColor('#050505');
                    tg.setBackgroundColor('#050505');
                }
            }
            
            // --- سناریوی ۲: صفحه پشتیبانی ---
            else if (isSupportPage) {
                // در صفحه چت نیاز به ۹ ثانیه صبر نیست، سریع لود می‌کنیم
                await loadChatHistory();
                setupChatListeners();
                
                // مخفی کردن لودر با سرعت
                setTimeout(() => hideLoader(), 500);
                tg.setHeaderColor('#1a1a1a'); // رنگ هدر چت
                tg.setBackgroundColor('#000000');
            }

        } catch (error) {
            console.error("Critical Init Error:", error);
            showError("خطا در راه‌اندازی برنامه.");
        }
    };

    // ==========================================
    // بخش توابع داشبورد (Dashboard Logic)
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
            
            if (data.status === 'error') {
                tg.showAlert(data.message);
                return null;
            }
            return data;
        } catch (error) {
            console.error(error);
            showError("عدم اتصال به سرور");
            return null;
        }
    }

    function updateDashboardUI(data) {
        if (els.welcomeName) els.welcomeName.innerText = data.first_name || "کاربر گرامی";
        if (els.tomanBalance) els.tomanBalance.innerText = data.toman_balance; 
        if (els.uusdBalance) els.uusdBalance.innerHTML = `${data.uusd_balance} <small>دلار</small>`;
        if (els.xpBalance) els.xpBalance.innerHTML = `${data.xp_balance} <small>XP</small>`;

        if (tg.initDataUnsafe?.user?.photo_url && els.avatar) {
            els.avatar.src = tg.initDataUnsafe.user.photo_url;
        }
        updateKycBadge(data.kyc_status_code);
    }

    function updateKycBadge(status) {
        if (!els.kycText) return;
        let text = "سطح برنزی";
        let color = "#848E9C";
        let bg = "rgba(255,255,255,0.05)";
        let border = "rgba(255,255,255,0.1)";

        switch (status) {
            case 'verified':
                text = "کاربر تایید شده ✅"; color = "#0ECB81"; bg = "rgba(14, 203, 129, 0.1)"; border = "rgba(14, 203, 129, 0.3)"; break;
            case 'pending':
                text = "در حال بررسی ⏳"; color = "#F0B90B"; bg = "rgba(240, 185, 11, 0.1)"; border = "rgba(240, 185, 11, 0.3)"; break;
            case 'rejected':
                text = "نیاز به اصلاح ❌"; color = "#F6465D"; bg = "rgba(246, 70, 93, 0.1)"; border = "rgba(246, 70, 93, 0.3)"; break;
        }
        els.kycText.innerText = text; els.kycText.style.color = color; els.kycText.style.background = bg; els.kycText.style.borderColor = border;
    }

    // تابع جدید: چک کردن پیام نخوانده برای داشبورد
    async function checkUnreadSupportMessages() {
        if (!els.supportNotif) return;
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/support/check_unread`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            const data = await response.json();
            if (data.has_unread) {
                els.supportNotif.style.display = 'block'; // روشن کردن نقطه قرمز
            }
        } catch (e) {
            console.log("Failed to check unread msgs", e);
        }
    }

    // ==========================================
    // بخش توابع چت پشتیبانی (Support Chat Logic)
    // ==========================================
    async function loadChatHistory() {
        if (!chatEls.container) return;
        
        // پاک کردن پیام‌های نمونه (Dummy)
        chatEls.container.innerHTML = '<div class="date-separator">تاریخچه گفتگو</div>';

        try {
            const response = await fetch(`${API_BASE_URL}/webapp/support/get_history`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: tg.initData })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.messages && data.messages.length > 0) {
                    data.messages.forEach(msg => renderMessage(msg));
                } else {
                    renderSystemMessage("هنوز پیامی رد و بدل نشده است. اولین پیام خود را بنویسید.");
                }
                scrollToBottom();
            }
        } catch (e) {
            renderSystemMessage("خطا در بارگذاری تاریخچه چت.");
        }
    }

    function setupChatListeners() {
        if (!chatEls.sendBtn || !chatEls.input) return;

        // دکمه ارسال
        chatEls.sendBtn.addEventListener('click', sendMessage);

        // دکمه اینتر
        chatEls.input.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') sendMessage();
        });

        // دکمه آپشن‌ها (بستن تیکت)
        if (chatEls.optionsBtn) {
            chatEls.optionsBtn.addEventListener('click', () => {
                tg.showPopup({
                    title: 'مدیریت تیکت',
                    message: 'آیا مشکل شما حل شده و می‌خواهید این گفتگو را ببندید؟',
                    buttons: [
                        {id: 'close_ticket', type: 'destructive', text: 'بله، بستن تیکت'},
                        {type: 'cancel'}
                    ]
                }, async (btnId) => {
                    if (btnId === 'close_ticket') {
                        // کال کردن API بستن تیکت (باید در بک‌اند هندل شود)
                        // فعلاً فقط پیام نمایشی
                        tg.close(); 
                    }
                });
            });
        }
    }

    async function sendMessage() {
        const text = chatEls.input.value.trim();
        if (!text) return;

        // 1. نمایش آنی پیام در سمت کاربر (Optimistic UI)
        renderMessage({
            sender: 'user',
            text: text,
            timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
            status: 'sending' 
        });
        
        chatEls.input.value = '';
        scrollToBottom();

        // 2. ارسال به سرور
        try {
            const response = await fetch(`${API_BASE_URL}/webapp/support/send_message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    initData: tg.initData,
                    message: text,
                    type: 'text'
                })
            });

            if (!response.ok) throw new Error("Send failed");
            
            // اگر موفق بود، وضعیت تیک دوم را آپدیت می‌کنیم (اینجا ساده شده)
            // در نسخه واقعی باید آیدی پیام را بگیریم و تیک را آپدیت کنیم
            
        } catch (e) {
            tg.showAlert("خطا در ارسال پیام. لطفاً اتصال خود را بررسی کنید.");
        }
    }

    function renderMessage(msg) {
        // تشخیص نوع پیام (ادمین یا کاربر)
        // فرض بر این است که بک‌اند فیلد is_admin یا sender را می‌فرستد
        const isUser = msg.sender === 'user' || msg.is_me; 
        const wrapperClass = isUser ? 'msg-user' : 'msg-admin';
        const checkIcon = isUser ? '<i class="fas fa-check msg-status-icon"></i>' : ''; // تیک ساده برای شروع

        const html = `
            <div class="message-wrapper ${wrapperClass}">
                <div class="bubble">
                    ${escapeHtml(msg.text)}
                </div>
                <div class="msg-meta">
                    <span>${msg.timestamp || 'Now'}</span>
                    ${checkIcon}
                </div>
            </div>
        `;
        
        chatEls.container.insertAdjacentHTML('beforeend', html);
    }

    function renderSystemMessage(text) {
        const html = `
            <div style="text-align:center; font-size:0.8rem; color:#888; margin:10px 0;">
                ${text}
            </div>
        `;
        chatEls.container.insertAdjacentHTML('beforeend', html);
    }

    function scrollToBottom() {
        if (chatEls.container) {
            chatEls.container.scrollTop = chatEls.container.scrollHeight;
        }
    }

    function escapeHtml(text) {
        if (!text) return "";
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // ==========================================
    // توابع عمومی (Common)
    // ==========================================
    function hideLoader() {
        if (loader) {
            loader.style.opacity = '0';
            loader.style.pointerEvents = 'none';
            setTimeout(() => {
                loader.style.display = 'none';
                if (appContainer) {
                    appContainer.classList.remove('hidden-content');
                    appContainer.classList.add('fade-in-active');
                }
            }, 1000); 
        }
    }

    function showError(msg) {
        if (loader) {
            loader.style.opacity = '1';
            loader.style.display = 'flex';
            loader.innerHTML = `
                <div class="loader-content" style="z-index:999;">
                    <p style="color:#F6465D; margin-bottom:20px; font-weight:bold; font-family:'Vazirmatn'">${msg}</p>
                    <button onclick="window.location.reload()" 
                        style="background:rgba(255,255,255,0.1); color:white; border:1px solid rgba(255,255,255,0.2); padding:10px 20px; border-radius:10px; cursor:pointer; font-family:'Vazirmatn';">
                        تلاش مجدد
                    </button>
                </div>
            `;
        }
    }
})();