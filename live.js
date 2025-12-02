/* webapp/live.js (v74.0 - Persian Real-time Engine) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    // تشخیص خودکار پروتکل (ws برای http و wss برای https)
    const HOST = window.location.host;
    const PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const WS_BASE_URL = `${PROTOCOL}//${HOST}`;
    const API_BASE_URL = window.location.origin;

    const MATCH_ID = "current_live_match";

    // کش کردن عناصر صفحه
    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    const els = {
        matchTitle: document.getElementById('match-title'),
        matchStatus: document.getElementById('match-status'),
        homeTeam: document.getElementById('home-team-name'),
        awayTeam: document.getElementById('away-team-name'),
        score: document.getElementById('live-score'),
        pollsContainer: document.getElementById('polls-container'),
        connStatus: document.getElementById('connection-status'),
        connText: document.getElementById('conn-text'),
        connDot: document.querySelector('.status-dot'),
        noPollsMsg: document.getElementById('no-polls-message')
    };

    let socket = null;
    let pollTimers = {};

    // --- شروع برنامه ---
    window.onload = function() {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#050505');
        tg.setBackgroundColor('#050505');
        
        // حالت تست (اگر داخل تلگرام نباشد)
        if (!tg.initData) {
            console.warn("Dev Mode: Using Mock Data");
            tg.initData = "query_id=TEST_DEV";
        }

        connectWebSocket();
    };

    // --- مدیریت اتصال وب‌سوکت ---
    function connectWebSocket() {
        updateConnectionStatus("connecting", "در حال اتصال...");
        
        // ساخت آدرس سوکت با احراز هویت
        const wsUrl = `${WS_BASE_URL}/ws/live_game/${MATCH_ID}?initData=${encodeURIComponent(tg.initData)}`;
        
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log("WS Connected");
            updateConnectionStatus("connected", "متصل به استادیوم");
            hideLoader();
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleServerMessage(data);
            } catch (e) { console.error("Parse Error:", e); }
        };

        socket.onclose = () => {
            updateConnectionStatus("disconnected", "قطع شد. تلاش مجدد...");
            // تلاش برای اتصال مجدد بعد از ۳ ثانیه
            setTimeout(connectWebSocket, 3000);
        };

        socket.onerror = () => updateConnectionStatus("disconnected", "خطای شبکه");
    }

    // --- پردازش پیام‌های دریافتی ---
    function handleServerMessage(data) {
        switch (data.type) {
            case 'initial_state':
                // بارگذاری اولیه
                updateScoreboard(data.scoreboard);
                if (data.active_polls && data.active_polls.length > 0) {
                    renderPolls(data.active_polls);
                } else {
                    showNoPollsMessage(true);
                }
                break;

            case 'scoreboard_update':
                // آپدیت نتیجه (گل یا تغییر زمان)
                updateScoreboard(data.scoreboard);
                tg.HapticFeedback.notificationOccurred('success');
                break;

            case 'new_poll':
                // نظرسنجی جدید
                addSinglePoll(data.poll);
                showNoPollsMessage(false);
                tg.HapticFeedback.impactOccurred('heavy');
                break;

            case 'poll_closed':
                // بسته شدن نظرسنجی
                closePollUI(data.poll_id);
                break;
        }
    }

    // --- آپدیت اسکوربورد ---
    function updateScoreboard(data) {
        if (!data) return;
        
        els.homeTeam.innerText = data.home_team_fa || "میزبان";
        els.awayTeam.innerText = data.away_team_fa || "میهمان";
        els.score.innerText = `${data.score_home} - ${data.score_away}`;
        els.matchTitle.innerText = `${data.home_team_fa} در برابر ${data.away_team_fa}`;
        
        // فرمت زمان بازی
        const timeText = data.elapsed > 0 ? `دقیقه ${data.elapsed}` : (data.status_long || "نامشخص");
        els.matchStatus.innerText = timeText;
        
        // تغییر رنگ وضعیت اگر زنده است
        if (data.status_long === "زنده" || data.elapsed > 0) {
            els.matchStatus.style.color = "var(--accent-green)";
            els.matchStatus.classList.add("blink");
        } else {
            els.matchStatus.style.color = "var(--text-muted)";
            els.matchStatus.classList.remove("blink");
        }
    }

    // --- رندر کردن نظرسنجی‌ها ---
    function addSinglePoll(poll) {
        if (document.getElementById(`poll-${poll.id}`)) return; // جلوگیری از تکرار

        const pollCard = document.createElement('div');
        pollCard.className = 'poll-card new'; // کلاس انیمیشن ورود
        pollCard.id = `poll-${poll.id}`;

        let buttonsHtml = '';
        poll.options.forEach(opt => {
            buttonsHtml += `<button class="poll-btn ripple-effect" onclick="submitVote('${poll.id}', '${opt.key}', this)">${opt.text}</button>`;
        });

        pollCard.innerHTML = `
            <div class="poll-header">
                <span class="poll-question">${poll.question}</span>
                <span class="poll-timer" id="timer-${poll.id}">--</span>
            </div>
            <div class="poll-options">
                ${buttonsHtml}
            </div>
        `;

        els.pollsContainer.prepend(pollCard);
        
        // شروع تایمر معکوس
        startPollTimer(poll.id, poll.seconds_left);
        
        // حذف کلاس انیمیشن بعد از اجرا
        setTimeout(() => pollCard.classList.remove('new'), 2000);
    }

    function renderPolls(polls) {
        els.pollsContainer.innerHTML = '';
        polls.forEach(addSinglePoll);
    }

    // --- تایمر معکوس نظرسنجی ---
    function startPollTimer(pollId, seconds) {
        if (pollTimers[pollId]) clearInterval(pollTimers[pollId]);
        const timerEl = document.getElementById(`timer-${pollId}`);
        if (!timerEl) return;

        let left = seconds;
        const tick = () => {
            if (left <= 0) {
                clearInterval(pollTimers[pollId]);
                timerEl.innerText = "بسته شد";
                timerEl.style.color = "var(--accent-red)";
                
                // غیرفعال کردن کارت
                const card = document.getElementById(`poll-${pollId}`);
                if(card) {
                    card.classList.add('closed');
                    card.querySelectorAll('.poll-btn').forEach(b => b.disabled = true);
                }
            } else {
                const m = Math.floor(left / 60);
                const s = left % 60;
                timerEl.innerText = `${m}:${s < 10 ? '0'+s : s}`;
                
                // هشدار رنگی در ۱۰ ثانیه آخر
                if (left <= 10) timerEl.style.color = "var(--primary-gold)";
                left--;
            }
        };
        tick();
        pollTimers[pollId] = setInterval(tick, 1000);
    }

    function closePollUI(pollId) {
        if (pollTimers[pollId]) clearInterval(pollTimers[pollId]);
        const card = document.getElementById(`poll-${pollId}`);
        if (card) {
            card.classList.add('closed');
            const timer = card.querySelector('.poll-timer');
            if(timer) { 
                timer.innerText = "پایان مهلت"; 
                timer.style.color = "var(--accent-red)"; 
            }
            card.querySelectorAll('.poll-btn').forEach(b => b.disabled = true);
        }
    }

    // --- ثبت رای کاربر (Global) ---
    window.submitVote = async function(pollId, guessKey, btnElement) {
        const card = document.getElementById(`poll-${pollId}`);
        const allBtns = card.querySelectorAll('.poll-btn');
        
        // غیرفعال کردن موقت دکمه‌ها
        allBtns.forEach(b => b.disabled = true);
        btnElement.classList.add('selected');
        
        tg.HapticFeedback.selectionChanged();

        try {
            const res = await fetch(`${API_BASE_URL}/webapp/submit_live_guess`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ 
                    initData: tg.initData, 
                    poll_id: pollId, 
                    guess: guessKey 
                })
            });
            
            const result = await res.json();
            
            if (result.status === 'success') {
                tg.showAlert("✅ رای شما با موفقیت ثبت شد");
                tg.HapticFeedback.notificationOccurred('success');
            } else {
                tg.showAlert("❌ " + result.message);
                // بازگرداندن دکمه‌ها در صورت خطا
                allBtns.forEach(b => b.disabled = false);
                btnElement.classList.remove('selected');
            }
        } catch (e) {
            tg.showAlert("خطای اتصال به سرور");
            allBtns.forEach(b => b.disabled = false);
            btnElement.classList.remove('selected');
        }
    };

    // --- توابع کمکی UI ---
    function updateConnectionStatus(state, msg) {
        if (els.connStatus) {
            els.connText.innerText = msg;
            els.connStatus.classList.add('visible');
            
            if(state === 'connected') {
                els.connDot.classList.add('active');
                // مخفی کردن پیام بعد از ۳ ثانیه
                setTimeout(() => els.connStatus.classList.remove('visible'), 3000);
            } else {
                els.connDot.classList.remove('active');
            }
        }
    }

    function showNoPollsMessage(show) {
        if (els.noPollsMsg) els.noPollsMsg.style.display = show ? 'block' : 'none';
    }

    function hideLoader() {
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
                if(appContainer) {
                    appContainer.classList.remove('hidden-content');
                    appContainer.classList.add('fade-in-active');
                }
            }, 500);
        }
    }
})();