/* webapp/game.js (TEST SCRIPT v1.0 - Connection Failure Detector) */

console.log("TEST-01: Script start.");

// ------------------------------------------------
// --- ⚠️ CRITICAL: REPLACE THE NGROK URL BELOW ⚠️ ---
// ------------------------------------------------
const WS_BASE_URL = "wss://unviolable-naillike-juana.ngrok-free.dev"; 
const ws_url = WS_BASE_URL + "/ws/game/state";
// ------------------------------------------------

try {
    console.log("TEST-02: Attempting WebSocket connection to:", ws_url);
    
    // Create WebSocket instance immediately
    const ws = new WebSocket(ws_url);

    ws.onopen = () => {
        console.log("TEST-03: SUCCESS - WebSocket Connected!");
        document.getElementById('game-status-text').innerText = "✅ اتصال موفق! (مرحله ۰۳)";
    };

    ws.onmessage = (event) => {
        console.log("TEST-04: Message Received.");
    };

    ws.onclose = () => {
        console.warn("TEST-05: WebSocket Closed. Reconnecting...");
        document.getElementById('game-status-text').innerText = "❌ اتصال قطع شد (مرحله ۰۵)";
    };

    ws.onerror = (err) => {
        console.error("TEST-06: WebSocket Error.", err);
        document.getElementById('game-status-text').innerText = "🛑 خطای اتصال (مرحله ۰۶)";
    };

    console.log("TEST-07: WebSocket instance created successfully.");

} catch (e) {
    console.error("TEST-99: CRASH - Script failed before connection attempt.", e);
    document.getElementById('game-status-text').innerText = "💥 خطای بحرانی در اسکریپت (مرحله ۹۹)";
}

console.log("TEST-10: Script finished its execution flow.");
// End of file should contain the actual script tag execution point