(() => {
  const next = new URLSearchParams(location.search).get('next') || '/';
  const safeNext = next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login.html') ? next : '/';
  const form = document.getElementById('login-form'); let mode = 'login';
  document.querySelectorAll('[data-mode]').forEach(button => { button.onclick = () => {
    mode = button.dataset.mode; document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('active', b === button));
    document.getElementById('heading').textContent = mode === 'login' ? '欢迎回来' : '创建你的账号';
    document.getElementById('name-field').hidden = mode === 'login'; form.elements.displayName.required = mode === 'register';
    document.getElementById('submit').textContent = mode === 'login' ? '登录' : '创建账号';
    form.elements.password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    document.getElementById('error').textContent = '';
  }; });
  document.getElementById('join-note').hidden = !safeNext.startsWith('/join.html');
  form.onsubmit = async event => {
    event.preventDefault(); const button = document.getElementById('submit'); button.disabled = true;
    document.getElementById('error').textContent = '';
    try {
      const body = { username: form.elements.username.value, password: form.elements.password.value, ...(mode === 'register' ? { displayName: form.elements.displayName.value } : {}) };
      const response = await fetch('/api/v1/auth/' + mode, { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || '登录失败');
      form.elements.password.value = ''; location.assign(safeNext);
    } catch (error) { document.getElementById('error').textContent = error.message; button.disabled = false; }
  };
})();
