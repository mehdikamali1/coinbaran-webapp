/* webapp/live.js (v52.0 - Final Production Engine) */
(function () {
    'use strict';

    const tg = window.Telegram.WebApp;
    // تشخیص آدرس سرور برای اتصال سوکت (تبدیل http به ws و https به wss)
    const HOST = window.location.host;
    const PROTOCOL = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const WS_BASE_URL = `${PROTOCOL}//${HOST}`;
    const API_BASE_URL = window.location.origin;

    // شناسه بازی پیش‌فرض (در نسخه پیشرفته می‌تواند از URL خوانده شود)
    const MATCH_ID = "current_live_match";

    // عناصر DOM
    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    const els = {
        matchTitle: document.getElementById('match-title'),
        matchStatus: document.getElementById('match-status'),
        homeTeam: document.getElementById('home-team-name'),
        awayTeam: document.getElementById('away-team-name'),
        score: document.getElementById('live-score'),
        pollsContainer: document.getElementById('polls-container'),
        connectionStatus: document.getElementById('connection-status'),
        noPollsMsg: document.getElementById('no-polls-message')
    };

    let socket = null;
    let pollTimers = {}; // ذخیره تایمرهای فعال برای جلوگیری از تداخل

    // --- نقطه شروع ---
    window.onload = function() {
        tg.ready();
        tg.expand();
        tg.setHeaderColor('#050505');
        
        if (!tg.initData) {
            // حالت تست
            console.warn("initData Missing. Using Test Data.");
            tg.initData = "query_id=TEST&user=%7B%22id%22%3A111111111%2C%22first_name%22%3A%22Guest%22%7D";
        }

        connectWebSocket();
    };

    // --- مدیریت اتصال WebSocket ---
    function connectWebSocket() {
        updateConnectionStatus("connecting", "در حال برقراری ارتباط...");

        // ساخت آدرس سوکت همراه با initData برای احراز هویت
        const wsUrl = `${WS_BASE_URL}/ws/live_game/${MATCH_ID}?initData=${encodeURIComponent(tg.initData)}`;
        
        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            console.log("WS Connected");
            updateConnectionStatus("connected", "🟢 متصل به استادیوم");
            hideLoader();
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleServerMessage(data);
            } catch (e) {
                console.error("Parse Error:", e);
            }
        };

        socket.onclose = (event) => {
            console.warn("WS Closed:", event.code);
            updateConnectionStatus("disconnected", "🔴 قطع شد. تلاش مجدد...");
            // تلاش برای اتصال مجدد بعد از 3 ثانیه
            setTimeout(connectWebSocket, 3000);
        };

        socket.onerror = (error) => {
            console.error("WS Error:", error);
            updateConnectionStatus("disconnected", "⚠️ خطای شبکه");
        };
    }

    // --- پردازش پیام‌های سرور ---
    function handleServerMessage(data) {
        switch (data.type) {
            case 'initial_state':
                // بارگذاری کامل وضعیت بازی
                updateScoreboard(data.scoreboard);
                if (data.active_polls && data.active_polls.length > 0) {
                    renderPolls(data.active_polls);
                } else {
                    showNoPollsMessage(true);
                }
                break;

            case 'scoreboard_update':
                // آپدیت فقط اسکوربورد (مثلاً وقتی گل زده میشه)
                updateScoreboard(data.scoreboard);
                tg.HapticFeedback.notificationOccurred('success'); // ویبره برای گل
                break;

            case 'new_poll':
                // نظرسنجی جدید
                addSinglePoll(data.poll);
                showNoPollsMessage(false);
                tg.HapticFeedback.impactOccurred('medium');
                break;

            case 'poll_closed':
                // بسته شدن نظرسنجی
                closePollUI(data.poll_id);
                break;
        }
    }

    // --- آپدیت UI اسکوربورد ---
    function updateScoreboard(data) {
        if (!data) return;
        els.homeTeam.innerText = data.home_team_fa;
        els.awayTeam.innerText = data.away_team_fa;
        els.score.innerText = `${data.score_home} - ${data.score_away}`;
        els.matchTitle.innerText = `${data.home_team_fa} vs ${data.away_team_fa}`;
        
        // وضعیت بازی (دقیقه یا وضعیت کلی)
        const timeText = data.elapsed > 0 ? `دقیقه ${data.elapsed}` : data.status_long;
        els.matchStatus.innerText = timeText;
        
        // تغییر رنگ وضعیت اگر بازی زنده است
        if (data.status_long === "زنده" || data.elapsed > 0) {
            els.matchStatus.style.color = "#10B981"; // سبز
            els.matchStatus.classList.add("blink"); // کلاس چشمک‌زن (باید در CSS باشد)
        } else {
            els.matchStatus.style.color = "#888";
            els.matchStatus.classList.remove("blink");
        }
    }

    // --- مدیریت نظرسنجی‌ها ---
    function addSinglePoll(poll) {
        // جلوگیری از تکرار
        if (document.getElementById(`poll-${poll.id}`)) return;

        const pollCard = document.createElement('div');
        pollCard.className = 'poll-card new'; // کلاس new برای انیمیشن ورود
        pollCard.id = `poll-${poll.id}`;

        // ساخت دکمه‌ها
        let buttonsHtml = '';
        poll.options.forEach(opt => {
            buttonsHtml += `<button class="poll-btn" onclick="submitVote('${poll.id}', '${opt.key}', this)">${opt.text}</button>`;
        });

        pollCard.innerHTML = `
            <div class="poll-header">
                <span>${poll.question}</span>
                <span class="poll-timer" id="timer-${poll.id}">--</span>
            </div>
            <div class="poll-options">
                ${buttonsHtml}
            </div>
        `;

        // اضافه کردن به بالای لیست
        els.pollsContainer.prepend(pollCard);
        
        // شروع تایمر معکوس
        startPollTimer(poll.id, poll.seconds_left);

        // حذف کلاس انیمیشن بعد از چند ثانیه
        setTimeout(() => pollCard.classList.remove('new'), 2000);
    }

    function renderPolls(polls) {
        els.pollsContainer.innerHTML = ''; // پاک کردن قبلی‌ها
        polls.forEach(addSinglePoll);
    }

    function startPollTimer(pollId, seconds) {
        // پاک کردن تایمر قبلی اگر وجود دارد
        if (pollTimers[pollId]) clearInterval(pollTimers[pollId]);

        const timerEl = document.getElementById(`timer-${pollId}`);
        if (!timerEl) return;

        let left = seconds;
        
        const tick = () => {
            if (left <= 0) {
                clearInterval(pollTimers[pollId]);
                timerEl.innerText = "بسته شد";
                timerEl.style.color = "#EF4444";
                // غیرفعال کردن دکمه‌ها
                const card = document.getElementById(`poll-${pollId}`);
                if (card) {
                    card.classList.add('closed');
                    const btns = card.querySelectorAll('.poll-btn');
                    btns.forEach(b => b.disabled = true);
                }
            } else {
                const m = Math.floor(left / 60);
                const s = left % 60;
                timerEl.innerText = `${m}:${s < 10 ? '0'+s : s}`;
                
                if (left <= 10) timerEl.style.color = "#FFD700"; // هشدار زرد
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
            if (timer) {
                timer.innerText = "پایان مهلت";
                timer.style.color = "#EF4444";
            }
            const btns = card.querySelectorAll('.poll-btn');
            btns.forEach(b => b.disabled = true);
        }
    }

    // --- ارسال رای (Global Function) ---
    window.submitVote = async function(pollId, guessKey, btnElement) {
        // تغییر ظاهر دکمه
        const card = document.getElementById(`poll-${pollId}`);
        const allBtns = card.querySelectorAll('.poll-btn');
        allBtns.forEach(b => b.disabled = true); // غیرفعال کردن همه
        btnElement.classList.add('selected'); // هایلایت انتخاب شده
        
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
                tg.showAlert("✅ رای شما ثبت شد");
            } else {
                tg.showAlert("❌ " + result.message);
                // بازگرداندن دکمه‌ها در صورت خطا
                allBtns.forEach(b => b.disabled = false);
                btnElement.classList.remove('selected');
            }
        } catch (e) {
            tg.showAlert("خطای اتصال");
            allBtns.forEach(b => b.disabled = false);
            btnElement.classList.remove('selected');
        }
    };

    // --- توابع کمکی ---
    function updateConnectionStatus(state, msg) {
        if (els.connectionStatus) {
            els.connectionStatus.innerHTML = `<i class="fas fa-circle" style="font-size:0.6rem; margin-left:5px;"></i> ${msg}`;
            els.connectionStatus.className = ""; // پاک کردن کلاس‌ها
            els.connectionStatus.classList.add(state); // connected / disconnected
        }
    }

    function showNoPollsMessage(show) {
        if (!els.noPollsMsg) {
            // اگر پیام در HTML نبود، می‌سازیم
            if (show) {
                const msgDiv = document.createElement('div');
                msgDiv.id = 'no-polls-message';
                msgDiv.style.textAlign = 'center';
                msgDiv.style.color = '#888';
                msgDiv.style.marginTop = '20px';
                msgDiv.innerText = "منتظر نظرسنجی‌های جدید باشید...";
                els.pollsContainer.appendChild(msgDiv);
            }
        } else {
            els.noPollsMsg.style.display = show ? 'block' : 'none';
        }
    }

    function hideLoader() {
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => {
                loader.style.display = 'none';
                appContainer.classList.remove('hidden');
            }, 500);
        }
    }

})();