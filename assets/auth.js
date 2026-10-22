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
          background: #0A0B0D;
          display: flex; align-items: center; justify-content: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          padding: 24px;
        }
        #auth-gate-overlay .auth-box {
          width: 400px; max-width: 100%;
          background: hsl(0 0% 6.5%); border: 1px solid hsl(0 0% 14.9%); border-radius: 14px;
          padding: 40px 36px; text-align: center;
          box-shadow: 0 20px 60px rgba(0,0,0,0.45);
        }
        #auth-gate-overlay .auth-icon {
          width: 48px; height: 48px; margin: 0 auto 20px;
          border-radius: 12px; background: rgba(91,155,248,0.14);
          display: flex; align-items: center; justify-content: center;
        }
        #auth-gate-overlay .auth-icon svg { width: 22px; height: 22px; color: #5B9BF8; }
        #auth-gate-overlay h1 {
          color: #F9FAFB; font-size: 19px; font-weight: 600; margin: 0 0 8px;
        }
        #auth-gate-overlay p.auth-sub {
          color: #9A9CA3; font-size: 13.5px; margin: 0 0 28px; line-height: 1.5;
        }
        #auth-gate-overlay .auth-field { text-align: left; margin-bottom: 18px; }
        #auth-gate-overlay label {
          display: block; font-size: 12.5px; color: #9A9CA3; margin-bottom: 8px;
        }
        #auth-gate-overlay input {
          width: 100%; box-sizing: border-box; padding: 12px 14px;
          border-radius: 8px; border: 1px solid hsl(0 0% 18%); background: #0f1116;
          color: #F9FAFB; font-size: 14.5px; outline: none;
        }
        #auth-gate-overlay input:focus { border-color: #5B9BF8; }
        #auth-gate-overlay button {
          width: 100%; padding: 12px 14px;
          border: none; border-radius: 8px; background: #F9FAFB;
          color: #0A0B0D; font-size: 14.5px; font-weight: 600; cursor: pointer;
        }
        #auth-gate-overlay button:hover { opacity: 0.88; }
        #auth-gate-overlay .auth-error {
          color: #F0883E; font-size: 12.5px; margin-top: 14px; min-height: 16px;
        }
      </style>
      <div class="auth-box">
        <div class="auth-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="10" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
        </div>
        <h1>AI Visibility Tracker</h1>
        <p class="auth-sub">Enter the shared password to view the dashboard.</p>
        <div class="auth-field">
          <label for="auth-gate-input">Password</label>
          <input type="password" id="auth-gate-input" placeholder="Enter password" autocomplete="current-password" />
        </div>
        <button id="auth-gate-submit">Sign in</button>
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
