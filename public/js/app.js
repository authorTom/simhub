const app = {
  currentView: 'dashboard',

  init() {
    // 1. Check Authentication on Load
    this.checkSession();

    // 2. Setup Login Form Handler
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    // 3. Setup Theme Sync
    this.syncThemeOnLoad();

    // 4. "/" focuses the scenario search from anywhere outside a field
    document.addEventListener('keydown', (e) => {
      if (e.key !== '/' || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      const search = document.getElementById('scenario-search');
      if (this.currentView === 'dashboard' && search) {
        e.preventDefault();
        search.focus();
      }
    });

    // 5. Close the user-chip dropdown on any click outside it, or on Escape
    document.addEventListener('click', (e) => {
      const menu = document.getElementById('user-menu');
      if (menu && !menu.contains(e.target)) this.closeUserMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeUserMenu();
    });
  },

  // --- USER CHIP DROPDOWN ---

  toggleUserMenu(event) {
    // Stop the click from reaching the document handler that closes the menu.
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('user-dropdown');
    if (!dropdown) return;
    const isOpen = dropdown.style.display === 'block';
    if (isOpen) this.closeUserMenu();
    else this.openUserMenu();
  },

  openUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    const chip = document.getElementById('user-chip');
    if (!dropdown) return;
    dropdown.style.display = 'block';
    if (chip) {
      chip.classList.add('open');
      chip.setAttribute('aria-expanded', 'true');
    }
  },

  closeUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    const chip = document.getElementById('user-chip');
    if (dropdown) dropdown.style.display = 'none';
    if (chip) {
      chip.classList.remove('open');
      chip.setAttribute('aria-expanded', 'false');
    }
  },

  openChangePassword() {
    this.closeUserMenu();
    components.openChangePasswordModal();
  },

  async checkSession() {
    try {
      const user = await api.checkAuth();
      if (user) {
        this.onLoginSuccess(user);
      } else {
        this.showLoginScreen();
      }
    } catch (err) {
      this.showLoginScreen();
    }
  },

  async handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const user = await api.login(email, password);
      this.onLoginSuccess(user);
      this.showToast(`Welcome back, ${user.name}!`, 'success');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  onLoginSuccess(user) {
    // Hide login screen
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-shell').style.display = 'grid';

    // Populate user details in Header
    document.getElementById('user-display-name').innerText = user.name;
    
    const badge = document.getElementById('user-display-badge');
    badge.innerText = user.role;
    if (user.role === 'Admin') {
      badge.className = 'badge badge-admin';
    } else {
      badge.className = 'badge badge-readonly';
    }

    // Apply role-based visibility restrictions across DOM
    this.applyRoleRestrictions();

    // Boot Components
    components.init();

    // Go to dashboard
    this.navigate('dashboard');
  },

  showLoginScreen() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('app-shell').style.display = 'none';
  },

  async logout() {
    try {
      await api.logout();
      this.showLoginScreen();
      this.showToast('You have been logged out.', 'success');
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  applyRoleRestrictions() {
    const isAdmin = api.isAdmin();
    const adminElements = document.querySelectorAll('.admin-only');
    
    adminElements.forEach(el => {
      if (isAdmin) {
        el.style.display = '';
        if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
          el.removeAttribute('disabled');
        }
      } else {
        el.style.display = 'none';
        if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
          el.setAttribute('disabled', 'true');
        }
      }
    });

    // Handle Quick actions sidebar panel specifically
    const sidebarAdmin = document.getElementById('sidebar-admin-panel');
    if (sidebarAdmin) {
      sidebarAdmin.style.display = isAdmin ? 'block' : 'none';
    }

    // New scenario navbar nav-button
    const newScenarioNav = document.getElementById('nav-btn-new-scenario');
    if (newScenarioNav) {
      newScenarioNav.style.display = isAdmin ? 'flex' : 'none';
    }

    // Admin users navbar nav-button
    const adminUsersNav = document.getElementById('nav-btn-admin-users');
    if (adminUsersNav) {
      adminUsersNav.style.display = isAdmin ? 'flex' : 'none';
    }
  },

  // --- SPA ROUTING ---
  
  navigate(viewId) {
    // Stop timers if navigating away from HUD or Debrief
    if (this.currentView === 'run-hud' && viewId !== 'run-hud') {
      components.pauseTimer();
    }
    if (this.currentView === 'debrief' && viewId !== 'debrief') {
      if (components.debriefState.timerInterval) clearInterval(components.debriefState.timerInterval);
    }

    this.currentView = viewId;

    // Remove active style from header links
    const navButtons = document.querySelectorAll('header nav button');
    navButtons.forEach(btn => btn.classList.remove('active'));

    // Highlight active link
    if (viewId === 'dashboard') {
      if (navButtons[0]) navButtons[0].classList.add('active');
    } else if (viewId === 'programmes') {
      if (navButtons[1]) navButtons[1].classList.add('active');
    } else if (viewId.startsWith('scenario-form')) {
      if (navButtons[2]) navButtons[2].classList.add('active');
    } else if (viewId === 'admin-users') {
      const usersBtn = document.getElementById('nav-btn-admin-users');
      if (usersBtn) usersBtn.classList.add('active');
    }

    // Toggle CSS views sections
    const sections = document.querySelectorAll('main > .view-section');
    sections.forEach(s => s.classList.remove('active'));

    if (viewId === 'scenario-form-new') {
      components.newScenarioForm();
      return;
    }

    const activeSec = document.getElementById(`view-${viewId}`);
    if (activeSec) {
      activeSec.classList.add('active');
    }

    // Load data specific to view
    if (viewId === 'dashboard') {
      components.selectProgramme(components.activeProgrammeId); // re-filter scenario library
    } else if (viewId === 'programmes') {
      components.renderProgrammesView();
    } else if (viewId === 'admin-users') {
      components.renderAdminUsersView();
    } else if (viewId === 'recycle-bin') {
      components.renderRecycleBinView();
    }
  },

  // --- THEME MANAGEMENT ---
  
  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('simhub_theme', newTheme);

    this.updateThemeIcons(newTheme);
    this.showToast(`Switched to ${newTheme} mode.`, 'success');
  },

  syncThemeOnLoad() {
    const savedTheme = localStorage.getItem('simhub_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    this.updateThemeIcons(savedTheme);
  },

  updateThemeIcons(theme) {
    const sunIcon = document.getElementById('theme-icon-sun');
    const moonIcon = document.getElementById('theme-icon-moon');
    if (!sunIcon || !moonIcon) return;

    if (theme === 'dark') {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    } else {
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    }
  },

  // --- TOAST NOTIFICATIONS ---

  // Stacked, animated toasts with an auto-dismiss progress bar. Each call
  // creates its own element so rapid successive messages never clobber
  // each other. Message is injected via textContent: it can contain
  // user-controlled data (e.g. the account name in "Welcome back, ...")
  // and must never be parsed as markup.
  showToast(message, type = 'success', duration = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = type === 'error' ? 'toast toast-error' : 'toast toast-success';
    toast.style.setProperty('--toast-duration', `${duration}ms`);

    const icon = document.createElement('i');
    icon.className = `fa-solid ${type === 'error' ? 'fa-circle-xmark' : 'fa-circle-check'}`;
    const text = document.createElement('span');
    text.textContent = message;
    toast.append(icon, text);
    container.appendChild(toast);

    // Keep the stack tidy if messages arrive in bursts.
    while (container.children.length > 4) container.firstElementChild.remove();

    setTimeout(() => {
      toast.classList.add('toast-leaving');
      toast.addEventListener('animationend', () => toast.remove(), { once: true });
      setTimeout(() => toast.remove(), 300); // fallback (reduced motion)
    }, duration);
  },

  // --- CONFIRMATION DIALOG ---

  // Styled replacement for window.confirm(). Returns a Promise<boolean>.
  // Title/message are injected via textContent because they can include
  // user-authored data (e.g. an account email in a delete prompt).
  confirm({ title = 'Are you sure?', message = '', confirmText = 'Confirm', cancelText = 'Cancel', danger = false } = {}) {
    return new Promise(resolve => {
      const modal = document.getElementById('modal-container');
      const card = document.getElementById('modal-card');
      if (!modal || !card) return resolve(window.confirm(message || title));

      card.innerHTML = `
        <div class="confirm-icon ${danger ? 'danger' : ''}">
          <i class="fa-solid ${danger ? 'fa-triangle-exclamation' : 'fa-circle-question'}"></i>
        </div>
        <h3 id="confirm-title" style="font-size: 1.15rem; margin-bottom: 8px;"></h3>
        <p id="confirm-message" style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.55;"></p>
        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 24px;">
          <button type="button" class="btn btn-secondary" id="confirm-cancel-btn"></button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" id="confirm-accept-btn"></button>
        </div>
      `;
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-message').textContent = message;
      document.getElementById('confirm-cancel-btn').textContent = cancelText;
      document.getElementById('confirm-accept-btn').textContent = confirmText;

      const close = (result) => {
        modal.style.display = 'none';
        modal.onclick = null;
        document.removeEventListener('keydown', onKey);
        resolve(result);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') close(false);
      };

      document.getElementById('confirm-cancel-btn').onclick = () => close(false);
      document.getElementById('confirm-accept-btn').onclick = () => close(true);
      modal.onclick = (e) => { if (e.target === modal) close(false); };
      document.addEventListener('keydown', onKey);

      modal.style.display = 'flex';
      document.getElementById('confirm-accept-btn').focus();
    });
  }
};

// Start application
window.onload = () => app.init();
