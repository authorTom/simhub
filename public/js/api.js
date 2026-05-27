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
  }
};
