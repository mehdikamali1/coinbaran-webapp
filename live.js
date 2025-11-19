(function () {
    const tg = window.Telegram.WebApp;
    
    // ------------------------------------------------------------------------
    // ⚠️ قدم شما: مطمئن شوید این آدرس، آدرس فعال فعلی کلودفلر شماست
    // ------------------------------------------------------------------------
    const API_HOST = "https://creating-camp-educational-advised.trycloudflare.com"; // <-- ❗️❗️❗️ این آدرس باید فعال باشد
    const WS_BASE_URL = `wss://${API_HOST}`;
    const API_BASE_URL = `https://${API_HOST}`; // برای ارسال رای
    // ------------------------------------------------------------------------

    // --- عناصر DOM ---
    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    const matchTitleEl = document.getElementById('match-title');
    const matchStatusEl = document.getElementById('match-status');
    const homeTeamEl = document.getElementById('home-team-name');
    const awayTeamEl = document.getElementById('away-team-name');
    const scoreEl = document.getElementById('live-score');
    const pollsContainer = document.getElementById('polls-container');
    const noPollsMessage = document.getElementById('no-polls-message');
    const connectionStatusEl = document.getElementById('connection-status');

    let websocket = null;
    let matchDbId = null;
    let pollTimers = {}; // برای مدیریت تایمرهای شمارش معکوس

    /**
     * نمایش لودر
     */
    function showLoader(message = "در حال بارگذاری...") {
        loader.querySelector('p').textContent = message;
        loader.classList.remove('hidden');
        appContainer.classList.add('hidden');
    }

    /**
     * پنهان کردن لودر و نمایش برنامه
     */
    function hideLoader() {
        loader.classList.add('hidden');
        appContainer.classList.remove('hidden');
    }

    /**
     * به‌روزرسانی وضعیت اتصال در فوتر
     */
    function updateConnectionStatus(isConnected, message) {
        connectionStatusEl.textContent = message;
        if (isConnected) {
            connectionStatusEl.classList.remove('disconnected');
            connectionStatusEl.classList.add('connected');
        } else {
            connectionStatusEl.classList.remove('connected');
            connectionStatusEl.classList.add('disconnected');
        }
    }

    /**
     * استخراج پارامترها از URL
     */
    function getUrlParams() {
        const params = new URLSearchParams(window.location.search);
        return {
            match_id: params.get('match_id')
        };
    }

    /**
     * به‌روزرسانی اسکوربورد
     */
    function updateScoreboard(data) {
        matchTitleEl.textContent = `${data.home_team_fa} - ${data.away_team_fa}`;
        homeTeamEl.textContent = data.home_team_fa;
        awayTeamEl.textContent = data.away_team_fa;
        scoreEl.textContent = `${data.score_home} - ${data.score_away}`;
        matchStatusEl.textContent = `دقیقه ${data.elapsed}' | ${data.status_long}`;

        // حذف کلاس‌های loading
        [matchTitleEl, matchStatusEl, homeTeamEl, awayTeamEl, scoreEl].forEach(el => el.classList.remove('loading'));
    }

    /**
     * ایجاد یا به‌روزرسانی کارت نظرسنجی
     */
    function createOrUpdatePollCard(poll) {
        noPollsMessage.classList.add('hidden');
        
        let card = document.getElementById(`poll-${poll.poll_id}`);
        let isNew = false;
        if (!card) {
            card = document.createElement('div');
            card.className = 'poll-card new'; // افزودن کلاس new برای انیمیشن
            card.id = `poll-${poll.poll_id}`;
            isNew = true;
        }

        let optionsHtml = '';
        for (const [key, text] of Object.entries(poll.options)) {
            optionsHtml += `<button class="poll-btn" data-key="${key}">${text}</button>`;
        }

        card.innerHTML = `
            <div class="poll-header">
                <span class="poll-question">${poll.question}</span>
                <span class="poll-timer" id="timer-${poll.poll_id}"></span>
            </div>
            <div class="poll-options">
                ${optionsHtml}
            </div>
        `;

        if (isNew) {
            pollsContainer.prepend(card); // نظرسنجی جدید همیشه در بالا
            setTimeout(() => card.classList.remove('new'), 1500); // حذف انیمیشن
        }
        
        // افزودن event listener به دکمه‌ها
        card.querySelectorAll('.poll-btn').forEach(btn => {
            btn.addEventListener('click', () => handlePollVote(poll.poll_id, btn));
        });
        
        // راه‌اندازی تایمر
        startPollTimer(poll.poll_id, poll.seconds_left);
    }

    /**
     * مدیریت تایمر شمارش معکوس
     */
    function startPollTimer(pollId, secondsLeft) {
        if (pollTimers[pollId]) {
            clearInterval(pollTimers[pollId]);
        }
        
        const timerEl = document.getElementById(`timer-${pollId}`);
        if (!timerEl) return;

        let remaining = secondsLeft;
        
        const updateTimer = () => {
            if (remaining <= 0) {
                clearInterval(pollTimers[pollId]);
                timerEl.textContent = "بسته شد";
                document.getElementById(`poll-${pollId}`).classList.add('closed');
            } else {
                timerEl.textContent = `⏱ ${remaining} ثانیه`;
                remaining--;
            }
        };
        
        updateTimer(); // اجرای فوری
        pollTimers[pollId] = setInterval(updateTimer, 1000);
    }

    /**
     * بستن یک نظرسنجی (وقتی سرور اعلام می‌کند)
     */
    function closePoll(pollId) {
        if (pollTimers[pollId]) {
            clearInterval(pollTimers[pollId]);
        }
        const timerEl = document.getElementById(`timer-${pollId}`);
        if (timerEl) {
            timerEl.textContent = "بسته شد";
        }
        const card = document.getElementById(`poll-${pollId}`);
        if (card) {
            card.classList.add('closed');
        }
    }

    /**
     * ارسال رای کاربر به سرور
     */
    async function handlePollVote(pollId, selectedButton) {
        const pollKey = selectedButton.dataset.key;
        const card = document.getElementById(`poll-${pollId}`);

        // غیرفعال کردن همه دکمه‌های این کارت
        card.querySelectorAll('.poll-btn').forEach(btn => {
            btn.disabled = true;
        });
        selectedButton.classList.add('selected'); // انتخاب شده را سبز کن

        try {
            const response = await fetch(`${API_BASE_URL}/webapp/submit_live_guess`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    initData: tg.initData,
                    poll_id: pollId,
                    guess: pollKey
                })
            });

            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || "خطای سرور");
            }
            
            tg.HapticFeedback.notificationOccurred('success');
            // سرور موفقیت را تایید کرد، همه چیز خوب است
        
        } catch (error) {
            tg.HapticFeedback.notificationOccurred('error');
            tg.showAlert(`خطا در ثبت رای: ${error.message}`);
            // بازگرداندن دکمه‌ها به حالت اولیه در صورت خطا
            card.querySelectorAll('.poll-btn').forEach(btn => {
                btn.disabled = false;
                btn.classList.remove('selected');
            });
        }
    }

    /**
     * اتصال به WebSocket
     */
    function connectWebSocket() {
        const wsUrl = `${WS_BASE_URL}/ws/live_game/${matchDbId}?initData=${encodeURIComponent(tg.initData)}`;
        
        websocket = new WebSocket(wsUrl);

        websocket.onopen = () => {
            console.log("WebSocket connection established.");
            updateConnectionStatus(true, "✅ اتصال برقرار شد (زنده)");
            hideLoader();
        };

        websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log("Received data from WebSocket:", data);

            switch(data.type) {
                case 'initial_state':
                    // بارگذاری اطلاعات اولیه بازی
                    updateScoreboard(data.scoreboard);
                    // بارگذاری نظرسنجی‌های فعال موجود
                    if (data.active_polls && data.active_polls.length > 0) {
                        data.active_polls.forEach(createOrUpdatePollCard);
                    }
                    break;
                case 'scoreboard_update':
                    updateScoreboard(data.scoreboard);
                    break;
                case 'new_poll':
                    tg.HapticFeedback.notificationOccurred('success');
                    createOrUpdatePollCard(data.poll);
                    break;
                case 'poll_closed':
                    tg.HapticFeedback.notificationOccurred('warning');
                    closePoll(data.poll_id);
                    break;
            }
        };

        websocket.onclose = (event) => {
            console.warn(`WebSocket closed. Code: ${event.code}, Reason: ${event.reason}`);
            updateConnectionStatus(false, "❌ اتصال قطع شد. در حال تلاش مجدد...");
            tg.HapticFeedback.notificationOccurred('error');
            // تلاش مجدد برای اتصال پس از 3 ثانیه
            setTimeout(connectWebSocket, 3000);
        };

        websocket.onerror = (error) => {
            console.error("WebSocket error:", error);
            updateConnectionStatus(false, "❌ خطای اتصال به سرور.");
        };
    }

    /**
     * راه‌اندازی اولیه برنامه
     */
    function init() {
        initTelegram();
        showLoader("در حال اعتبارسنجی...");
        
        const params = getUrlParams();
        matchDbId = params.match_id;

        if (!matchDbId) {
            showLoader("خطا: شناسه بازی یافت نشد.");
            updateConnectionStatus(false, "خطا: شناسه بازی (match_id) در URL وجود ندارد.");
            return;
        }
        
        if (!tg.initData) {
            showLoader("خطا: اطلاعات تلگرام یافت نشد.");
            updateConnectionStatus(false, "لطفاً این صفحه را فقط از داخل تلگرام باز کنید.");
            return;
        }
        
        connectWebSocket();
    }

    // --- Entry Point ---
    document.addEventListener("DOMContentLoaded", init);

})();