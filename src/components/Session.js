import { authRequest, cancelRequests } from '../services/http.js';

export async function startSession(onAuthenticated) {
  const app = document.getElementById('app');
  const panel = document.getElementById('sessionPanel');
  let mode = 'login';
  async function checkSession() {
    try {
      const fragment = new URLSearchParams(location.hash.slice(1));
      if (fragment.has('access_token')) {
        history.replaceState(null, '', location.pathname + location.search);
        await authRequest('recover-session', { access_token: fragment.get('access_token'), refresh_token: fragment.get('refresh_token') });
        mode = 'password';
      }
      const session = await authRequest('session');
      if (session.authenticated) {
        panel.hidden = true;
        app.hidden = false;
        await onAuthenticated(session);
        return;
      }
      if (session.recovery) mode = 'password';
      render();
    } catch (error) { render(error.message); }
  }
  function render(message = '') {
    app.hidden = true;
    panel.hidden = false;
    const recovery = mode === 'forgot';
    const password = mode === 'password';
    panel.innerHTML = `<section class="auth-card" aria-labelledby="authTitle">
      <a class="auth-brand" href="/" aria-label="Puzoto Life"><img src="/images/PuzotoLife.png" alt="" width="44" height="44">Puzoto <span>Life</span></a>
      <p class="eyebrow">SEU ESPAÇO PESSOAL</p>
      <h1 id="authTitle">${password ? 'Uma nova senha.' : recovery ? 'Vamos recuperar seu acesso.' : 'Bom ter você aqui.'}</h1>
      <p class="auth-description">${password ? 'Use uma senha única com pelo menos 12 caracteres.' : recovery ? 'Enviaremos um link para o e-mail da sua conta.' : 'Entre para cuidar do seu trabalho e das suas finanças.'}</p>
      <form id="authForm">
        ${password ? '' : '<label for="authEmail">E-mail</label><input id="authEmail" name="email" type="email" autocomplete="username" placeholder="voce@exemplo.com" maxlength="254" required>'}
        ${recovery ? '' : `<label for="authPassword">${password ? 'Nova senha' : 'Senha'}</label><div class="password-field"><input id="authPassword" name="password" type="password" autocomplete="${password ? 'new-password' : 'current-password'}" ${password ? 'minlength="12"' : ''} maxlength="128" required><button id="togglePassword" type="button" aria-label="Mostrar senha">Mostrar</button></div>`}
        <p id="authMessage" class="auth-message" role="status" aria-live="polite"></p>
        <button class="btn btn--primary auth-submit" type="submit">${password ? 'Salvar nova senha' : recovery ? 'Enviar link de recuperação' : 'Entrar na minha conta'}<span aria-hidden="true">→</span></button>
        <button class="auth-switch" type="button" id="authSwitch">${mode === 'login' ? 'Esqueci minha senha' : 'Voltar para entrar'}</button>
      </form><p class="auth-footnote">Seu trabalho. Suas finanças. Tudo no seu ritmo.</p>
    </section>`;
    panel.querySelector('#authMessage').textContent = message;
    panel.querySelector('#authSwitch').addEventListener('click', () => { mode = mode === 'login' ? 'forgot' : 'login'; render(); });
    panel.querySelector('#togglePassword')?.addEventListener('click', (event) => {
      const input = panel.querySelector('#authPassword');
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      event.currentTarget.textContent = reveal ? 'Ocultar' : 'Mostrar';
      event.currentTarget.setAttribute('aria-label', reveal ? 'Ocultar senha' : 'Mostrar senha');
    });
    panel.querySelector('#authForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (form.dataset.busy) return;
      form.dataset.busy = 'true';
      const values = Object.fromEntries(new FormData(form));
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      submit.setAttribute('aria-busy', 'true');
      const feedback = form.querySelector('#authMessage');
      feedback.textContent = 'Aguarde um instante…';
      try {
        const result = await authRequest(password ? 'password' : recovery ? 'forgot-password' : 'login', values);
        if (recovery) feedback.textContent = result.message;
        else if (password) { mode = 'login'; render('Senha atualizada. Entre com sua nova senha.'); }
        else await checkSession();
      } catch (error) { feedback.textContent = error.message; }
      finally { delete form.dataset.busy; submit.disabled = false; submit.removeAttribute('aria-busy'); }
    });
  }
  window.addEventListener('session-expired', () => {
    cancelRequests();
    document.getElementById('pageContent').replaceChildren();
    mode = 'login'; render('Sua sessão expirou. Entre novamente.');
  });
  window.addEventListener('puzoto-logout', async () => {
    try {
      await authRequest('logout', {});
      cancelRequests();
      location.replace('/');
    } catch { window.dispatchEvent(new CustomEvent('puzoto-notice', { detail: 'Não foi possível sair. Tente novamente.' })); }
  });
  await checkSession();
}
