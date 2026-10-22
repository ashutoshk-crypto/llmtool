// Simple client-side password gate. Not real security — just keeps casual visitors out.
// Change the password by editing AUTH_PASSWORD below.
(function () {
  const AUTH_PASSWORD = 'coinswitch2026';
  const SESSION_KEY = 'llm-tracker-auth';

  if (sessionStorage.getItem(SESSION_KEY) === 'ok') return;

  document.documentElement.style.visibility = 'hidden';

  function showGate() {
    document.documentElement.style.visibility = '';
    const overlay = document.createElement('div');
    overlay.id = 'auth-gate-overlay';
    overlay.innerHTML = `
      <style>
        #auth-gate-overlay {
          position: fixed; inset: 0; z-index: 99999;
          background: #0b0d12;
          display: flex; align-items: center; justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        #auth-gate-overlay .auth-box {
          width: 320px; max-width: 90vw;
          background: #15181f; border: 1px solid #262b35; border-radius: 10px;
          padding: 28px 24px; text-align: center;
        }
        #auth-gate-overlay h1 {
          color: #f1f3f6; font-size: 16px; margin: 0 0 18px;
        }
        #auth-gate-overlay input {
          width: 100%; box-sizing: border-box; padding: 10px 12px;
          border-radius: 6px; border: 1px solid #333945; background: #0f1116;
          color: #f1f3f6; font-size: 14px; outline: none;
        }
        #auth-gate-overlay input:focus { border-color: #5b8dee; }
        #auth-gate-overlay button {
          margin-top: 12px; width: 100%; padding: 10px 12px;
          border: none; border-radius: 6px; background: #5b8dee;
          color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
        }
        #auth-gate-overlay button:hover { background: #4a7adb; }
        #auth-gate-overlay .auth-error {
          color: #ef5a5a; font-size: 12px; margin-top: 10px; min-height: 14px;
        }
      </style>
      <div class="auth-box">
        <h1>AI Visibility Tracker — Sign in</h1>
        <input type="password" id="auth-gate-input" placeholder="Password" autocomplete="current-password" />
        <button id="auth-gate-submit">Enter</button>
        <div class="auth-error" id="auth-gate-error"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#auth-gate-input');
    const error = overlay.querySelector('#auth-gate-error');
    input.focus();

    function tryLogin() {
      if (input.value === AUTH_PASSWORD) {
        sessionStorage.setItem(SESSION_KEY, 'ok');
        overlay.remove();
      } else {
        error.textContent = 'Incorrect password.';
        input.value = '';
        input.focus();
      }
    }

    overlay.querySelector('#auth-gate-submit').addEventListener('click', tryLogin);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin(); });
  }

  if (document.body) {
    showGate();
  } else {
    document.addEventListener('DOMContentLoaded', showGate);
  }
})();
