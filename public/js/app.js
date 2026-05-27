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
      navButtons[0].classList.add('active');
    } else if (viewId === 'programmes') {
      navButtons[1].classList.add('active');
    } else if (viewId.startsWith('scenario-form')) {
      if (navButtons[2]) navButtons[2].classList.add('active');
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
  
  showToast(message, type = 'success') {
    const toast = document.getElementById('toast-message');
    const text = document.getElementById('toast-text');
    if (!toast || !text) return;

    text.innerText = message;
    
    if (type === 'error') {
      toast.className = 'toast toast-error';
      toast.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${message}`;
    } else {
      toast.className = 'toast toast-success';
      toast.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${message}`;
    }

    toast.style.display = 'block';
    
    // Clear after 3.5 seconds
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      toast.style.display = 'none';
    }, 3500);
  }
};

// Start application
window.onload = () => app.init();
