const api = {
  token: localStorage.getItem('simhub_token') || null,
  user: JSON.parse(localStorage.getItem('simhub_user')) || null,

  async request(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(url, { ...options, headers });
    
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errorMsg = errData.error || `HTTP error! status: ${response.status}`;
      throw new Error(errorMsg);
    }
    
    // Express returns 204 or empty sometimes
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  },

  async login(email, password) {
    try {
      const data = await this.request('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      
      this.token = data.token;
      this.user = data.user;
      
      localStorage.setItem('simhub_token', this.token);
      localStorage.setItem('simhub_user', JSON.stringify(this.user));
      
      return data.user;
    } catch (err) {
      console.error('Login error:', err);
      throw err;
    }
  },

  async logout() {
    try {
      if (this.token) {
        await this.request('/api/logout', { method: 'POST' }).catch(() => {});
      }
    } finally {
      this.token = null;
      this.user = null;
      localStorage.removeItem('simhub_token');
      localStorage.removeItem('simhub_user');
    }
  },

  async checkAuth() {
    if (!this.token) return null;
    try {
      const data = await this.request('/api/me');
      this.user = data.user;
      localStorage.setItem('simhub_user', JSON.stringify(this.user));
      return this.user;
    } catch (err) {
      console.warn('Token expired or invalid');
      await this.logout();
      return null;
    }
  },

  isAdmin() {
    return this.user && this.user.role === 'Admin';
  },

  // --- Scenarios API ---
  async getScenarios() {
    return this.request('/api/scenarios');
  },

  async getScenario(id) {
    return this.request(`/api/scenarios/${id}`);
  },

  async createScenario(scenario) {
    return this.request('/api/scenarios', {
      method: 'POST',
      body: JSON.stringify(scenario)
    });
  },

  async updateScenario(id, scenario) {
    return this.request(`/api/scenarios/${id}`, {
      method: 'PUT',
      body: JSON.stringify(scenario)
    });
  },

  async deleteScenario(id) {
    return this.request(`/api/scenarios/${id}`, {
      method: 'DELETE'
    });
  },

  // --- Programmes API ---
  async getProgrammes() {
    return this.request('/api/programmes');
  },

  async createProgramme(prog) {
    return this.request('/api/programmes', {
      method: 'POST',
      body: JSON.stringify(prog)
    });
  },

  async updateProgramme(id, prog) {
    return this.request(`/api/programmes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(prog)
    });
  },

  async deleteProgramme(id) {
    return this.request(`/api/programmes/${id}`, {
      method: 'DELETE'
    });
  },

  // --- User Administration API ---
  async getUsers() {
    return this.request('/api/users');
  },

  async createUser(user) {
    return this.request('/api/users', {
      method: 'POST',
      body: JSON.stringify(user)
    });
  },

  async updateUser(email, user) {
    return this.request(`/api/users/${email}`, {
      method: 'PUT',
      body: JSON.stringify(user)
    });
  },

  async deleteUser(email) {
    return this.request(`/api/users/${email}`, {
      method: 'DELETE'
    });
  },

  async bulkUserAction(action, emails, role = null) {
    return this.request('/api/users/bulk', {
      method: 'POST',
      body: JSON.stringify({ action, emails, role })
    });
  },

  async bulkCreateUsers(users) {
    return this.request('/api/users/bulk-create', {
      method: 'POST',
      body: JSON.stringify({ users })
    });
  },

  // --- Recycle Bin API ---
  async getRecycleBin() {
    return this.request('/api/recycle-bin');
  },

  async restoreScenario(id) {
    return this.request(`/api/recycle-bin/${id}/restore`, {
      method: 'POST'
    });
  },

  async permanentlyDeleteScenario(id) {
    return this.request(`/api/recycle-bin/${id}`, {
      method: 'DELETE'
    });
  },

  // --- Backup API ---
  async exportBackup() {
    const response = await fetch('/api/backup/export', {
      headers: {
        'Authorization': `Bearer ${this.token}`
      }
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const errorMsg = errData.error || `HTTP error! status: ${response.status}`;
      throw new Error(errorMsg);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simhub_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },

  async importBackup(backupData) {
    return this.request('/api/backup/import', {
      method: 'POST',
      body: JSON.stringify(backupData)
    });
  }
};
