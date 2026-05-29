const components = {
  activeProgrammeId: null,
  allScenarios: [],
  allProgrammes: [],
  currentFormTab: 'tab-general',
  
  // Interactive Run State
  runState: {
    scenario: null,
    activePhaseIndex: 0,
    startTime: null,
    elapsedSeconds: 0,
    timerInterval: null,
    timerRunning: false,
    completedActions: new Set()
  },

  // Interactive Debrief State
  debriefState: {
    scenario: null,
    currentStep: 'reactions', // 'reactions', 'description', 'analysis', 'summary'
    elapsedSeconds: 0,
    timerInterval: null,
    timerRunning: false
  },

  // Initialize and load data
  async init() {
    try {
      this.allScenarios = await api.getScenarios();
      this.allProgrammes = await api.getProgrammes();
      this.renderSidebarProgrammes();
      this.renderScenariosList();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  // --- 1. RENDER DASHBOARD / LIBRARY ---
  
  renderSidebarProgrammes() {
    const list = document.getElementById('sidebar-programme-list');
    if (!list) return;

    let html = `
      <li class="programme-item-nav ${!this.activeProgrammeId ? 'active' : ''}" onclick="components.selectProgramme(null)">
        <span><i class="fa-solid fa-layer-group"></i> All Scenarios</span>
        <span class="count-badge">${this.allScenarios.length}</span>
      </li>
    `;

    this.allProgrammes.forEach(prog => {
      const count = this.allScenarios.filter(s => prog.scenarioIds && prog.scenarioIds.includes(s.id)).length;
      const isActive = this.activeProgrammeId === prog.id;
      html += `
        <li class="programme-item-nav ${isActive ? 'active' : ''}" onclick="components.selectProgramme('${prog.id}')">
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 170px;">
            <i class="fa-solid fa-graduation-cap"></i> ${prog.name}
          </span>
          <span class="count-badge">${count}</span>
        </li>
      `;
    });

    list.innerHTML = html;
  },

  selectProgramme(id) {
    this.activeProgrammeId = id;
    const desc = document.getElementById('catalog-description');
    const title = document.getElementById('catalog-title');
    
    if (id) {
      const prog = this.allProgrammes.find(p => p.id === id);
      title.innerText = prog.name;
      desc.innerText = prog.description || 'Simulations aligned to this programme.';
    } else {
      title.innerText = 'Scenario Library';
      desc.innerText = 'Browse all registered clinical simulation scenarios.';
    }

    this.renderSidebarProgrammes();
    this.renderScenariosList();
  },

  renderScenariosList() {
    const container = document.getElementById('scenarios-list');
    if (!container) return;

    let filtered = this.allScenarios;
    if (this.activeProgrammeId) {
      const prog = this.allProgrammes.find(p => p.id === this.activeProgrammeId);
      filtered = this.allScenarios.filter(s => prog.scenarioIds && prog.scenarioIds.includes(s.id));
    }

    const searchQuery = document.getElementById('scenario-search')?.value.toLowerCase() || '';
    if (searchQuery) {
      filtered = filtered.filter(s => 
        s.title.toLowerCase().includes(searchQuery) ||
        s.code.toLowerCase().includes(searchQuery) ||
        s.summary.toLowerCase().includes(searchQuery) ||
        s.targetLearners.toLowerCase().includes(searchQuery)
      );
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="glass-panel" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary);">
          <i class="fa-solid fa-heart-crack" style="font-size: 2.5rem; margin-bottom: 12px; color: var(--text-muted);"></i>
          <p>No scenarios found matching current filters.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(s => `
      <div class="glass-panel scenario-card">
        <div>
          <div class="scenario-card-header">
            <span class="scenario-code">${s.code}</span>
            <span class="badge ${s.modality.includes('manikin') || s.modality.includes('High') ? 'badge-admin' : 'badge-readonly'}" style="font-size: 0.65rem;">
              ${s.modality}
            </span>
          </div>
          <h3>${s.title}</h3>
          <p class="scenario-summary-text">${s.summary || 'No summary description provided.'}</p>
        </div>
        
        <div>
          <div class="scenario-meta-row">
            <div class="scenario-meta-item">
              <i class="fa-solid fa-users"></i> ${s.targetLearners || 'Not specified'}
            </div>
            <div class="scenario-meta-item">
              <i class="fa-solid fa-clock"></i> ${s.duration} min
            </div>
            <div class="scenario-meta-item">
              <i class="fa-solid fa-calendar-day"></i> Reviewed: ${s.lastReviewed}
            </div>
          </div>
          
          <div class="scenario-actions">
            <button class="btn btn-secondary" onclick="components.viewScenarioDetail('${s.id}')" style="flex: 1; padding: 8px;">
              <i class="fa-solid fa-eye"></i> View Detail
            </button>
            <button class="btn btn-primary" onclick="components.startRunHUD('${s.id}')" style="padding: 8px 12px;">
              <i class="fa-solid fa-play"></i> Run
            </button>
          </div>
        </div>
      </div>
    `).join('');
  },

  filterScenarios() {
    this.renderScenariosList();
  },


  // --- 2. RENDER PROGRAMMES VIEW ---
  
  async renderProgrammesView() {
    const grid = document.getElementById('programmes-grid');
    if (!grid) return;

    this.allProgrammes = await api.getProgrammes();
    this.allScenarios = await api.getScenarios();

    if (this.allProgrammes.length === 0) {
      grid.innerHTML = `
        <div class="glass-panel" style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-secondary);">
          <i class="fa-solid fa-graduation-cap" style="font-size: 2.5rem; margin-bottom: 12px;"></i>
          <p>No training programmes created yet. Click "New Programme" to create one.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = this.allProgrammes.map(p => {
      const pScenarios = this.allScenarios.filter(s => p.scenarioIds && p.scenarioIds.includes(s.id));
      
      let scenariosListHtml = pScenarios.map(s => `
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem; border-bottom:1px solid rgba(255,255,255,0.03); padding: 6px 0;">
          <span style="color:var(--text-primary); font-weight:500;">
            <span class="scenario-code" style="font-size:0.65rem; padding: 1px 4px; margin-right:4px;">${s.code}</span> ${s.title}
          </span>
          <span style="color:var(--text-muted); font-size:0.75rem;">${s.duration} min</span>
        </div>
      `).join('');

      if (pScenarios.length === 0) {
        scenariosListHtml = '<p style="font-size:0.85rem; color:var(--text-muted); font-style:italic;">No scenarios assigned to this programme.</p>';
      }

      return `
        <div class="glass-panel" style="display:flex; flex-direction:column; justify-content:space-between;">
          <div>
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
              <h3 style="color:var(--text-primary); font-size:1.2rem;">${p.name}</h3>
              <span class="badge badge-admin" style="font-size: 0.7rem;">${pScenarios.length} Scenarios</span>
            </div>
            <p style="color:var(--text-secondary); font-size:0.85rem; margin-bottom:16px; min-height: 40px;">${p.description || 'No description provided.'}</p>
            
            <div style="margin-bottom: 20px;">
              <h5 style="font-size:0.75rem; text-transform:uppercase; color:var(--accent-blue); margin-bottom:8px;">Curriculum Scenarios</h5>
              <div style="max-height: 150px; overflow-y:auto; padding-right:4px;">
                ${scenariosListHtml}
              </div>
            </div>
          </div>

          <div style="display:flex; gap:10px; border-top: 1px solid var(--glass-border); padding-top:14px;">
            <button class="btn btn-secondary" onclick="components.selectProgramme('${p.id}'); app.navigate('dashboard');" style="flex:1; padding: 8px;">
              <i class="fa-solid fa-eye"></i> View in Library
            </button>
            <button class="btn btn-secondary admin-only" onclick="components.openProgrammeModal('${p.id}')" style="padding:8px 12px; display: ${api.isAdmin() ? 'inline-flex' : 'none'};">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-danger admin-only" onclick="components.deleteProgramme('${p.id}')" style="padding:8px 12px; display: ${api.isAdmin() ? 'inline-flex' : 'none'};">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    }).join('');
  },

  async deleteProgramme(id) {
    if (!confirm('Are you sure you want to delete this programme? Scenarios will not be deleted.')) return;
    try {
      await api.deleteProgramme(id);
      app.showToast('Programme deleted successfully.', 'success');
      this.renderProgrammesView();
      this.renderSidebarProgrammes();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  openProgrammeModal(progId = null) {
    const modal = document.getElementById('modal-container');
    const modalContent = document.getElementById('modal-card');
    if (!modal || !modalContent) return;

    const existing = progId ? this.allProgrammes.find(p => p.id === progId) : null;
    const activeIds = existing?.scenarioIds || [];

    const scenariosCheckboxes = this.allScenarios.map(s => `
      <label class="programme-scenario-option">
        <input type="checkbox" value="${s.id}" ${activeIds.includes(s.id) ? 'checked' : ''}>
        <span><strong>${s.code}</strong> - ${s.title}</span>
      </label>
    `).join('');

    modalContent.innerHTML = `
      <div class="flex-between m-b-20" style="margin-bottom: 20px;">
        <h3 style="font-size:1.3rem; color: var(--accent-blue);">
          <i class="fa-solid fa-folder-plus"></i> ${existing ? 'Edit Programme' : 'New Curricular Programme'}
        </h3>
        <button onclick="components.closeModal()" style="background:transparent; border:none; color:var(--text-secondary); cursor:pointer; font-size:1.2rem;">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <form id="programme-modal-form" onsubmit="components.saveProgramme(event, ${existing ? `'${existing.id}'` : 'null'})">
        <div class="form-group">
          <label for="prog-name">Programme Name</label>
          <input type="text" id="prog-name" required value="${existing ? existing.name : ''}" placeholder="e.g. Foundation Year 1 Induction">
        </div>
        <div class="form-group">
          <label for="prog-desc">Description</label>
          <textarea id="prog-desc" rows="3" placeholder="Brief summary of educational cohort..." style="resize:none;">${existing ? existing.description || '' : ''}</textarea>
        </div>
        <div class="form-group">
          <label>Assign Scenarios</label>
          <div class="programme-scenarios-select">
            ${scenariosCheckboxes || '<p style="font-size:0.85rem; color:var(--text-muted);">No scenarios available. Please create a scenario first.</p>'}
          </div>
        </div>
        
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:24px;">
          <button type="button" class="btn btn-secondary" onclick="components.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-emerald">
            <i class="fa-solid fa-floppy-disk"></i> Save Programme
          </button>
        </div>
      </form>
    `;

    modal.style.display = 'flex';
  },

  closeModal() {
    document.getElementById('modal-container').style.display = 'none';
  },

  async saveProgramme(e, id) {
    e.preventDefault();
    const name = document.getElementById('prog-name').value;
    const description = document.getElementById('prog-desc').value;
    
    const checkboxes = document.querySelectorAll('.programme-scenarios-select input[type="checkbox"]:checked');
    const scenarioIds = Array.from(checkboxes).map(cb => cb.value);

    const progData = { name, description, scenarioIds };

    try {
      if (id) {
        await api.updateProgramme(id, progData);
        app.showToast('Programme updated successfully.', 'success');
      } else {
        await api.createProgramme(progData);
        app.showToast('Programme created successfully.', 'success');
      }
      this.closeModal();
      this.renderProgrammesView();
      this.renderSidebarProgrammes();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },


  // --- 3. RENDER SCENARIO DETAILED REPORT SHEET ---
  
  async viewScenarioDetail(id) {
    try {
      const scenario = await api.getScenario(id);
      const container = document.getElementById('scenario-detail-content');
      if (!container) return;

      // Bind HUD and Edit trigger parameters
      document.getElementById('btn-run-scenario-hud').onclick = () => this.startRunHUD(id);
      
      const pdfBtn = document.getElementById('btn-export-pdf');
      if (pdfBtn) pdfBtn.onclick = () => this.exportScenarioToPDF(id);

      const editBtn = document.getElementById('btn-edit-scenario');
      if (editBtn) editBtn.onclick = () => this.editScenarioForm(id);
      
      const deleteBtn = document.getElementById('btn-delete-scenario');
      if (deleteBtn) deleteBtn.onclick = () => this.deleteScenario(id);

      // Map dynamic lists
      const techOutcomes = scenario.learningOutcomes?.technical || [];
      const nonTechOutcomes = scenario.learningOutcomes?.nonTechnical || [];
      const handovers = scenario.handover || [];
      const facilitators = scenario.faculty?.facilitators || [];
      const SPs = scenario.faculty?.inScenarioRoles || [];
      const equipment = scenario.environment?.equipment || [];
      const medications = scenario.environment?.medications || [];
      const progression = scenario.progression || [];
      const versionHistory = scenario.versionHistory || [];

      let html = `
        <div class="glass-panel" style="margin-bottom: 24px;">
          <!-- Governance Header -->
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 20px;">
            <div>
              <span class="scenario-code">${scenario.code}</span>
              <h1 style="font-size:2.2rem; font-weight:700; margin-top:8px;">${scenario.title}</h1>
              <p style="color:var(--text-secondary); font-size:1.1rem; margin-top: 4px;">Scenario Master Document</p>
            </div>
            
            <table style="font-size:0.8rem; border-collapse:collapse; background:rgba(0,0,0,0.1); border-radius:var(--border-radius-sm); overflow:hidden;">
              <tr style="border-bottom:1px solid var(--glass-border);">
                <th style="padding:6px 12px; text-align:left; color:var(--text-secondary);">Version</th>
                <td style="padding:6px 12px; font-weight:500;">${scenario.version}</td>
              </tr>
              <tr style="border-bottom:1px solid var(--glass-border);">
                <th style="padding:6px 12px; text-align:left; color:var(--text-secondary);">Last Reviewed</th>
                <td style="padding:6px 12px;">${scenario.lastReviewed}</td>
              </tr>
              <tr>
                <th style="padding:6px 12px; text-align:left; color:var(--text-secondary);">Review Due</th>
                <td style="padding:6px 12px;">${scenario.nextReviewDue}</td>
              </tr>
            </table>
          </div>

          <table class="meta-table">
            <tr>
              <th>Author(s)</th>
              <td>${scenario.authors || 'Not specified'}</td>
            </tr>
            <tr>
              <th>Clinical Reviewer</th>
              <td>${scenario.clinicalReviewer || 'Not signed off'}</td>
            </tr>
            <tr>
              <th>Educational Reviewer</th>
              <td>${scenario.educationalReviewer || 'Not signed off'}</td>
            </tr>
            <tr>
              <th>Based on a real case?</th>
              <td>
                ${scenario.basedOnRealCase ? '<span class="badge badge-admin"><i class="fa-solid fa-check"></i> Yes</span>' : '<span class="badge badge-readonly">No</span>'}
                ${scenario.realCaseNotes ? `<p style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">${scenario.realCaseNotes}</p>` : ''}
              </td>
            </tr>
          </table>

          <!-- 1. OVERVIEW -->
          <div class="detail-section-header">
            <i class="fa-solid fa-eye"></i> <h2>1. Scenario Overview</h2>
          </div>
          <table class="meta-table">
            <tr>
              <th>Scenario summary</th>
              <td style="font-weight: 500;">${scenario.overview?.summary || 'Not provided'}</td>
            </tr>
            <tr>
              <th>Target learners</th>
              <td>${scenario.overview?.targetLearners || 'Not specified'}</td>
            </tr>
            <tr>
              <th>Pre-requisites</th>
              <td>${scenario.overview?.prerequisites || 'None'}</td>
            </tr>
            <tr>
              <th>Modality</th>
              <td><span class="badge badge-readonly">${scenario.overview?.modality || 'Not specified'}</span></td>
            </tr>
            <tr>
              <th>Location</th>
              <td>${scenario.overview?.location || 'Not specified'}</td>
            </tr>
            <tr>
              <th>Scenario duration</th>
              <td>${scenario.overview?.duration} minutes</td>
            </tr>
            <tr>
              <th>Debrief duration</th>
              <td>${scenario.overview?.debriefDuration} minutes</td>
            </tr>
            <tr>
              <th>Total session time</th>
              <td>${scenario.overview?.totalSessionTime} minutes (including prebrief)</td>
            </tr>
          </table>

          <!-- 2. LEARNING OUTCOMES -->
          <div class="detail-section-header">
            <i class="fa-solid fa-graduation-cap"></i> <h2>2. Learning Outcomes</h2>
          </div>
          
          <div class="outcomes-grid">
            <div class="glass-card">
              <h4 style="margin-bottom:12px; color:var(--accent-emerald);"><i class="fa-solid fa-circle-nodes"></i> Technical / Clinical Outcomes</h4>
              <ul class="outcome-list">
                ${techOutcomes.map((o, index) => `
                  <li class="outcome-item">
                    <strong>#${index + 1}:</strong> ${o.outcome}
                    ${o.mapping ? `<br><span class="outcome-mapping">${o.mapping}</span>` : ''}
                  </li>
                `).join('') || '<p style="color:var(--text-muted); font-style:italic;">No technical outcomes entered.</p>'}
              </ul>
            </div>
            
            <div class="glass-card">
              <h4 style="margin-bottom:12px; color:var(--accent-blue);"><i class="fa-solid fa-people-arrows"></i> Non-Technical / Behavioural Outcomes</h4>
              <ul class="outcome-list">
                ${nonTechOutcomes.map((o, index) => `
                  <li class="outcome-item">
                    <strong>#${index + 1}:</strong> ${o.outcome}
                    ${o.mapping ? `<br><span class="outcome-mapping">${o.mapping}</span>` : ''}
                  </li>
                `).join('') || '<p style="color:var(--text-muted); font-style:italic;">No non-technical outcomes entered.</p>'}
              </ul>
            </div>
          </div>

          <!-- 3. PATIENT INFORMATION -->
          <div class="detail-section-header">
            <i class="fa-solid fa-hospital-user"></i> <h2>3. Patient Information</h2>
          </div>
          
          <h4 style="margin-bottom:8px; color:var(--text-secondary);">Demographics</h4>
          <table class="meta-table" style="margin-bottom:24px;">
            <thead>
              <tr style="background:rgba(255,255,255,0.02);">
                <th>Name</th>
                <th>Age</th>
                <th>Sex</th>
                <th>Weight</th>
                <th>Identifier (MRN/NHS)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="font-weight:600;">${scenario.patientInfo?.demographics?.name || 'Sam Phillips'}</td>
                <td>${scenario.patientInfo?.demographics?.age || ''}</td>
                <td>${scenario.patientInfo?.demographics?.sex || ''}</td>
                <td>${scenario.patientInfo?.demographics?.weight || ''}</td>
                <td style="font-family:var(--font-mono); font-size:0.85rem;">${scenario.patientInfo?.demographics?.identifier || 'Not provided'}</td>
              </tr>
            </tbody>
          </table>

          <h4 style="margin-bottom:8px; color:var(--text-secondary);">Clinical Background</h4>
          <table class="meta-table">
            <tr>
              <th>Presenting complaint</th>
              <td><strong>"${scenario.patientInfo?.background?.presentingComplaint || ''}"</strong></td>
            </tr>
            <tr>
              <th>History of presenting complaint</th>
              <td>${scenario.patientInfo?.background?.history || ''}</td>
            </tr>
            <tr>
              <th>Past medical history</th>
              <td>${scenario.patientInfo?.background?.pastMedicalHistory || ''}</td>
            </tr>
            <tr>
              <th>Current medications</th>
              <td>${scenario.patientInfo?.background?.currentMedications || ''}</td>
            </tr>
            <tr>
              <th>Allergies</th>
              <td><span style="color:var(--accent-red); font-weight:500;">${scenario.patientInfo?.background?.allergies || 'No known allergies'}</span></td>
            </tr>
            <tr>
              <th>Social / family history</th>
              <td>${scenario.patientInfo?.background?.socialHistory || ''}</td>
            </tr>
            <tr>
              <th>Ideas, concerns, expectations</th>
              <td>${scenario.patientInfo?.background?.ice || ''}</td>
            </tr>
          </table>

          <!-- 4. HANDOVER -->
          <div class="detail-section-header">
            <i class="fa-solid fa-volume-high"></i> <h2>4. Learner Handover (SBAR)</h2>
          </div>
          ${handovers.map(h => `
            <div class="glass-card" style="margin-bottom:14px;">
              <h4 style="margin-bottom:10px; color:var(--accent-blue);"><i class="fa-solid fa-user-tag"></i> Role receiving: ${h.role}</h4>
              <div class="sbar-container">
                <div class="sbar-item">
                  <span class="sbar-letter">S</span>
                  <div><strong>Situation:</strong> ${h.situation}</div>
                </div>
                <div class="sbar-item">
                  <span class="sbar-letter">B</span>
                  <div><strong>Background:</strong> ${h.background}</div>
                </div>
                <div class="sbar-item">
                  <span class="sbar-letter">A</span>
                  <div><strong>Assessment:</strong> ${h.assessment}</div>
                </div>
                <div class="sbar-item">
                  <span class="sbar-letter">R</span>
                  <div><strong>Recommendation:</strong> ${h.recommendation}</div>
                </div>
              </div>
            </div>
          `).join('') || '<p style="color:var(--text-muted); font-style:italic;">No handovers entered.</p>'}

          <!-- 5. FACULTY & ROLES -->
          <div class="detail-section-header">
            <i class="fa-solid fa-users-gear"></i> <h2>5. Faculty & Roles</h2>
          </div>
          
          <h4 style="margin-bottom:8px; color:var(--text-secondary);">Facilitator Team</h4>
          <table class="meta-table" style="margin-bottom:24px;">
            <thead>
              <tr style="background:rgba(255,255,255,0.02);">
                <th style="width:200px;">Role</th>
                <th>Responsibilities</th>
                <th style="width:120px;">Required?</th>
              </tr>
            </thead>
            <tbody>
              ${facilitators.map(f => `
                <tr>
                  <td style="font-weight:600;">${f.role}</td>
                  <td>${f.responsibilities}</td>
                  <td><span class="badge ${f.required === 'Essential' ? 'badge-admin' : 'badge-readonly'}">${f.required}</span></td>
                </tr>
              `).join('') || '<tr><td colspan="3">No facilitators entered.</td></tr>'}
            </tbody>
          </table>

          <h4 style="margin-bottom:8px; color:var(--text-secondary);">In-Scenario Roles (Confederates / Simulated Participants)</h4>
          <table class="meta-table">
            <thead>
              <tr style="background:rgba(255,255,255,0.02);">
                <th style="width:200px;">Role</th>
                <th>Purpose in Scenario</th>
                <th>Key Script / Behaviours</th>
              </tr>
            </thead>
            <tbody>
              ${SPs.map(sp => `
                <tr>
                  <td style="font-weight:600;">${sp.role}</td>
                  <td>${sp.purpose}</td>
                  <td style="font-style:italic; border-left: 3px solid var(--accent-amber);">${sp.script}</td>
                </tr>
              `).join('') || '<tr><td colspan="3">No simulated participant roles entered.</td></tr>'}
            </tbody>
          </table>

          <!-- 6. ENVIRONMENT & EQUIPMENT -->
          <div class="detail-section-header">
            <i class="fa-solid fa-toolbox"></i> <h2>6. Environment & Equipment</h2>
          </div>
          
          <h4 style="margin-bottom:8px; color:var(--text-secondary);">Setup at Scenario Start</h4>
          <table class="meta-table" style="margin-bottom:24px;">
            <tr>
              <th>Location / setting</th>
              <td>${scenario.environment?.setup?.location || ''}</td>
            </tr>
            <tr>
              <th>Simulator</th>
              <td>${scenario.environment?.setup?.simulator || ''}</td>
            </tr>
            <tr>
              <th>Patient position</th>
              <td>${scenario.environment?.setup?.position || ''}</td>
            </tr>
            <tr>
              <th>Monitor setup</th>
              <td>${scenario.environment?.setup?.monitorSetup || ''}</td>
            </tr>
            <tr>
              <th>Vascular access</th>
              <td>${scenario.environment?.setup?.vascularAccess || ''}</td>
            </tr>
            <tr>
              <th>Oxygen at start</th>
              <td>${scenario.environment?.setup?.oxygenAtStart || ''}</td>
            </tr>
            <tr>
              <th>Fluids running</th>
              <td>${scenario.environment?.setup?.fluidsRunning || ''}</td>
            </tr>
            <tr>
              <th>Moulage</th>
              <td style="color:var(--accent-red);">${scenario.environment?.setup?.moulage || ''}</td>
            </tr>
          </table>

          <div class="outcomes-grid">
            <div class="glass-card">
              <h4 style="margin-bottom:12px; color:var(--text-secondary);"><i class="fa-solid fa-list-check"></i> Equipment Checklist</h4>
              <ul class="outcome-list">
                ${equipment.map(e => `
                  <li class="outcome-item" style="display:flex; justify-content:space-between;">
                    <span><i class="fa-regular fa-square"></i> ${e.item} <span style="color:var(--text-muted); font-size:0.8rem;">(${e.category})</span></span>
                    <span style="font-weight:500;">Qty: ${e.qty}</span>
                  </li>
                `).join('') || '<p style="color:var(--text-muted); font-style:italic;">No equipment checklist entered.</p>'}
              </ul>
            </div>

            <div class="glass-card">
              <h4 style="margin-bottom:12px; color:var(--text-secondary);"><i class="fa-solid fa-pills"></i> Medications Available</h4>
              <ul class="outcome-list">
                ${medications.map(m => `
                  <li class="outcome-item">
                    <strong style="color:var(--accent-blue);">${m.drug}</strong> - ${m.route} (${m.strength})
                    ${m.notes ? `<p style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Notes: ${m.notes}</p>` : ''}
                  </li>
                `).join('') || '<p style="color:var(--text-muted); font-style:italic;">No medications specified.</p>'}
              </ul>
            </div>
          </div>

          <!-- 7. SCENARIO PROGRESSION PHASES -->
          <div class="detail-section-header">
            <i class="fa-solid fa-arrow-down-short-wide"></i> <h2>7. Scenario Progression</h2>
          </div>
          
          <div style="display:flex; flex-direction:column; gap:20px;">
            ${progression.map((p, index) => `
              <div class="glass-card" style="border-top: 4px solid var(--accent-blue);">
                <div class="flex-between m-b-20" style="margin-bottom:14px;">
                  <h3 style="color:var(--accent-blue); font-size:1.2rem;">Phase ${index + 1} — ${p.phaseName}</h3>
                  <span class="badge badge-readonly"><i class="fa-solid fa-clock"></i> ${p.duration}</span>
                </div>
                
                <table class="meta-table" style="margin-bottom:14px; font-size:0.85rem;">
                  <tr>
                    <th style="width:160px;">Phase trigger</th>
                    <td><strong>${p.trigger}</strong></td>
                  </tr>
                </table>

                <h4 style="font-size:0.8rem; text-transform:uppercase; color:var(--text-secondary); margin-bottom:6px;">Target Vital Signs</h4>
                <div class="grid-3 m-b-20" style="display:grid; grid-template-columns: repeat(6, 1fr); gap:10px; margin-bottom:16px;">
                  <div style="background:#000; border-radius:4px; padding:6px 10px; border:1px solid #111; text-align:center;">
                    <div style="font-size:0.6rem; color:#10b981; font-weight:bold;">HR</div>
                    <div style="font-size:1.3rem; font-weight:700; color:#10b981; font-family:var(--font-mono);">${p.vitals?.hr || '—'}</div>
                  </div>
                  <div style="background:#000; border-radius:4px; padding:6px 10px; border:1px solid #111; text-align:center;">
                    <div style="font-size:0.6rem; color:#3b82f6; font-weight:bold;">RR</div>
                    <div style="font-size:1.3rem; font-weight:700; color:#3b82f6; font-family:var(--font-mono);">${p.vitals?.rr || '—'}</div>
                  </div>
                  <div style="background:#000; border-radius:4px; padding:6px 10px; border:1px solid #111; text-align:center;">
                    <div style="font-size:0.6rem; color:#eab308; font-weight:bold;">SpO₂</div>
                    <div style="font-size:1.3rem; font-weight:700; color:#eab308; font-family:var(--font-mono);">${p.vitals?.spo2 || '—'}%</div>
                  </div>
                  <div style="background:#000; border-radius:4px; padding:6px 10px; border:1px solid #111; text-align:center;">
                    <div style="font-size:0.6rem; color:#ef4444; font-weight:bold;">BP</div>
                    <div style="font-size:1.3rem; font-weight:700; color:#ef4444; font-family:var(--font-mono);">${p.vitals?.bp || '—'}</div>
                  </div>
                  <div style="background:#000; border-radius:4px; padding:6px 10px; border:1px solid #111; text-align:center;">
                    <div style="font-size:0.6rem; color:#f43f5e; font-weight:bold;">Temp</div>
                    <div style="font-size:1.3rem; font-weight:700; color:#f43f5e; font-family:var(--font-mono);">${p.vitals?.temp || '—'}°C</div>
                  </div>
                  <div style="background:#000; border-radius:4px; padding:6px 10px; border:1px solid #111; text-align:center;">
                    <div style="font-size:0.6rem; color:#a855f7; font-weight:bold;">GCS</div>
                    <div style="font-size:1.3rem; font-weight:700; color:#a855f7; font-family:var(--font-mono);">${p.vitals?.gcs || '—'}</div>
                  </div>
                </div>

                <div class="grid-2 m-b-20" style="margin-bottom:14px;">
                  <div class="glass-card" style="padding:12px;">
                    <h5 style="color:var(--text-secondary); margin-bottom:6px; font-size:0.8rem;">Patient Presentation & Dialogue</h5>
                    <p style="font-size:0.85rem; margin-bottom:4px;"><strong>Look:</strong> ${p.patientPresentation?.appearance || '—'}</p>
                    <p style="font-size:0.85rem; margin-bottom:6px;"><strong>Mood:</strong> ${p.patientPresentation?.mood || '—'}</p>
                    <p style="font-size:0.85rem; font-style:italic; color:var(--accent-amber); border-left:2px solid var(--accent-amber); padding-left:8px;">
                      " ${p.patientPresentation?.keyLines || '—'} "
                    </p>
                  </div>
                  
                  <div class="glass-card" style="padding:12px;">
                    <h5 style="color:var(--text-secondary); margin-bottom:6px; font-size:0.8rem;">Investigations Available</h5>
                    ${p.investigations?.map(i => `
                      <div style="font-size:0.8rem; border-bottom:1px solid rgba(255,255,255,0.03); padding:4px 0;">
                        <strong>${i.name}:</strong> ${i.result}
                      </div>
                    `).join('') || '<p style="color:var(--text-muted); font-size:0.8rem;">None in this phase.</p>'}
                  </div>
                </div>

                <div class="grid-2">
                  <div class="glass-card" style="padding:12px;">
                    <h5 style="color:var(--accent-emerald); margin-bottom:6px; font-size:0.8rem;"><i class="fa-solid fa-check-double"></i> Expected Learner Actions</h5>
                    <ul style="padding-left:14px; font-size:0.8rem; color:var(--text-secondary);">
                      ${p.expectedActions?.map(a => `<li><strong>${a.role}:</strong> ${a.action}</li>`).join('') || '<li>None</li>'}
                    </ul>
                  </div>

                  <div class="glass-card" style="padding:12px;">
                    <h5 style="color:var(--accent-amber); margin-bottom:6px; font-size:0.8rem;"><i class="fa-solid fa-triangle-exclamation"></i> Cues & Rescue Prompts</h5>
                    <ul style="padding-left:14px; font-size:0.8rem; color:var(--text-secondary);">
                      ${p.cues?.map(c => `<li>If <em>${c.condition}</em>: <strong style="color:var(--text-primary); font-weight:500;">${c.cue}</strong></li>`).join('') || '<li>None</li>'}
                    </ul>
                  </div>
                </div>

              </div>
            `).join('')}
          </div>

          <!-- 8. PREBRIEF -->
          <div class="detail-section-header">
            <i class="fa-solid fa-clipboard-list"></i> <h2>8. Prebrief</h2>
          </div>
          <table class="meta-table">
            <tr>
              <th>Prebrief lead</th>
              <td>${scenario.prebrief?.lead || 'Not specified'}</td>
            </tr>
            <tr>
              <th>Estimated duration</th>
              <td>${scenario.prebrief?.duration || '10'} minutes</td>
            </tr>
            <tr>
              <th>Local variations / notes</th>
              <td>${scenario.prebrief?.notes || 'None'}</td>
            </tr>
            <tr>
              <th>ASPiH / Safety Checklist</th>
              <td>
                <ul style="padding-left:20px; font-size:0.85rem; color:var(--text-secondary);">
                  ${scenario.prebrief?.checklist?.map(c => `
                    <li style="margin-bottom:4px;"><i class="fa-regular fa-square-check" style="color:var(--accent-emerald);"></i> ${c}</li>
                  `).join('') || '<li>No checklist items saved.</li>'}
                </ul>
              </td>
            </tr>
          </table>

          <!-- 9. DEBRIEF PLAN (PEARLS) -->
          <div class="detail-section-header">
            <i class="fa-solid fa-comments"></i> <h2>9. Debrief Plan (PEARLS)</h2>
          </div>
          
          <div class="debrief-guidance">
            <h4 style="color:var(--accent-purple); margin-bottom:10px;"><i class="fa-solid fa-graduation-cap"></i> Promoting Excellence and Reflective Learning in Simulation</h4>
            <p style="font-size:0.9rem; color:var(--text-secondary);">Using the blended debriefing framework by Eppich & Cheng (2015). Focus on clinical reasoning, communication, and crisis resource management.</p>
          </div>

          <div style="display:flex; flex-direction:column; gap:16px;">
            <div class="glass-card">
              <h5 style="color:var(--accent-purple); font-size:0.95rem; margin-bottom:6px;">Phase 1 — Reactions (≈ ${scenario.debrief?.reactions?.duration || '3'} min)</h5>
              <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:6px;">Surfaces feelings and vents emotions in a psychologically safe space.</p>
              <p style="font-size:0.95rem; font-style:italic; font-weight:500;">" ${scenario.debrief?.reactions?.question || ''} "</p>
            </div>

            <div class="glass-card">
              <h5 style="color:var(--accent-purple); font-size:0.95rem; margin-bottom:6px;">Phase 2 — Description (≈ ${scenario.debrief?.description?.duration || '3'} min)</h5>
              <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:6px;">Establish a shared clinical baseline of what happened in the scenario.</p>
              <p style="font-size:0.95rem; font-style:italic; font-weight:500;">" ${scenario.debrief?.description?.question || ''} "</p>
            </div>

            <div class="glass-card">
              <h5 style="color:var(--accent-purple); font-size:0.95rem; margin-bottom:6px;">Phase 3 — Analysis (≈ 20 min)</h5>
              <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:10px;">Deep dive into key learning objectives matching strategy to topic.</p>
              
              <table class="meta-table" style="font-size:0.85rem; margin-bottom:0;">
                <thead>
                  <tr style="background:rgba(255,255,255,0.01);">
                    <th>Learning Point</th>
                    <th style="width:160px;">Strategy</th>
                    <th>Suggested Question / Script</th>
                  </tr>
                </thead>
                <tbody>
                  ${scenario.debrief?.analysis?.map(a => `
                    <tr>
                      <td style="font-weight:600;">${a.point}</td>
                      <td><span class="badge badge-readonly">${a.strategy}</span></td>
                      <td style="font-style:italic; border-left:3px solid var(--accent-purple);">${a.question}</td>
                    </tr>
                  `).join('') || '<tr><td colspan="3">No analysis points created.</td></tr>'}
                </tbody>
              </table>
            </div>

            <div class="glass-card">
              <h5 style="color:var(--accent-purple); font-size:0.95rem; margin-bottom:6px;">Phase 4 — Summary (≈ ${scenario.debrief?.summary?.duration || '4'} min)</h5>
              <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:10px;">Consolidate takeaways and lessons learned.</p>
              <p style="font-size:0.95rem; font-style:italic; font-weight:500; margin-bottom:12px;">" ${scenario.debrief?.summary?.question || ''} "</p>
              
              <h5 style="font-size:0.8rem; text-transform:uppercase; color:var(--text-secondary); margin-bottom:6px;">Faculty Take-Home Points</h5>
              <ul style="padding-left:16px; font-size:0.85rem; color:var(--text-secondary);">
                ${scenario.debrief?.summary?.points?.map(p => `<li>${p}</li>`).join('') || '<li>None</li>'}
              </ul>
            </div>
          </div>

          <!-- 10. ASPIH STANDARDS -->
          <div class="detail-section-header">
            <i class="fa-solid fa-certificate"></i> <h2>10. ASPiH Standards 2023 Mapping</h2>
          </div>
          <table class="meta-table">
            <thead>
              <tr style="background:rgba(255,255,255,0.02);">
                <th>ASPiH Standard Domain</th>
                <th>How Covered in Scenario</th>
                <th style="width:100px; text-align:center;">Status</th>
              </tr>
            </thead>
            <tbody>
              ${scenario.aspihMapping?.map(m => `
                <tr>
                  <td style="font-weight:500; font-size:0.85rem;">${m.domain}</td>
                  <td style="font-size:0.85rem; color:var(--text-secondary);">${m.coveredBy}</td>
                  <td style="text-align:center;">
                    ${m.status ? '<span class="badge badge-admin"><i class="fa-solid fa-check"></i> Standard Met</span>' : '<span class="badge badge-danger">Not Met</span>'}
                  </td>
                </tr>
              `).join('') || '<tr><td colspan="3">No ASPiH mapping exists.</td></tr>'}
            </tbody>
          </table>

          <!-- 11. REFERENCES & HISTORY -->
          <div class="detail-section-header">
            <i class="fa-solid fa-book-bookmark"></i> <h2>11. Supporting Materials & Version History</h2>
          </div>
          
          <table class="meta-table" style="margin-bottom:24px;">
            <tr>
              <th style="width:220px;">Clinical guidelines</th>
              <td>${scenario.references?.guidelines || 'None'}</td>
            </tr>
            <tr>
              <th>Evidence base / papers</th>
              <td>${scenario.references?.evidenceBase || 'None'}</td>
            </tr>
            <tr>
              <th>Pre-learning links</th>
              <td>${scenario.references?.preLearning || 'None'}</td>
            </tr>
            <tr>
              <th>Related scenarios</th>
              <td>${scenario.references?.relatedScenarios || 'None'}</td>
            </tr>
          </table>

          <h4 style="margin-bottom:8px; color:var(--text-secondary);">Scenario Version History</h4>
          <table class="meta-table" style="margin-bottom:0;">
            <thead>
              <tr style="background:rgba(255,255,255,0.02);">
                <th style="width:100px;">Version</th>
                <th style="width:140px;">Date</th>
                <th style="width:180px;">Author</th>
                <th>Summary of Change</th>
              </tr>
            </thead>
            <tbody>
              ${versionHistory.map(v => `
                <tr>
                  <td style="font-family:var(--font-mono); font-weight:600;">${v.version}</td>
                  <td>${v.date}</td>
                  <td>${v.author}</td>
                  <td style="color:var(--text-secondary);">${v.change}</td>
                </tr>
              `).join('') || '<tr><td colspan="4">No version history recorded.</td></tr>'}
            </tbody>
          </table>

        </div>
      `;

      container.innerHTML = html;
      app.navigate('scenario-detail');
      
      // Auto-toggle admin only controls on details sheet
      app.applyRoleRestrictions();
    } catch (err) {
      app.showToast('Failed to load scenario details: ' + err.message, 'error');
    }
  },

  async deleteScenario(id) {
    if (!confirm('Are you sure you want to delete this scenario permanently? This cannot be undone.')) return;
    try {
      await api.deleteScenario(id);
      app.showToast('Scenario deleted successfully.', 'success');
      await this.init(); // reload lists
      app.navigate('dashboard');
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },


  // --- 4. SCENARIO EDITOR FORM (DYNAMIC BUILDER & WIZARD) ---

  cancelForm() {
    if (confirm('Discard all unsaved edits?')) {
      app.navigate('dashboard');
    }
  },

  switchEditorTab(tabId) {
    this.currentFormTab = tabId;
    
    // Toggle active tabs buttons style
    const tabs = document.querySelectorAll('#editor-tabs-container .editor-tab');
    tabs.forEach(tab => {
      if (tab.getAttribute('onclick').includes(tabId)) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });

    // Toggle forms display
    const groups = document.querySelectorAll('.form-tab-group');
    groups.forEach(g => {
      if (g.id === tabId) {
        g.style.display = 'block';
      } else {
        g.style.display = 'none';
      }
    });

    // Update wizard button displays
    const prevBtn = document.getElementById('btn-prev-tab');
    const nextBtn = document.getElementById('btn-next-tab');
    
    const tabList = ['tab-general', 'tab-outcomes', 'tab-patient', 'tab-setup', 'tab-progression', 'tab-debrief', 'tab-aspih'];
    const idx = tabList.indexOf(tabId);

    if (idx === 0) {
      prevBtn.style.visibility = 'hidden';
    } else {
      prevBtn.style.visibility = 'visible';
    }

    if (idx === tabList.length - 1) {
      nextBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Scenario';
      nextBtn.onclick = () => this.saveScenario();
    } else {
      nextBtn.innerHTML = 'Next Tab <i class="fa-solid fa-angle-right"></i>';
      nextBtn.onclick = () => this.nextEditorTab();
    }
  },

  nextEditorTab() {
    const tabList = ['tab-general', 'tab-outcomes', 'tab-patient', 'tab-setup', 'tab-progression', 'tab-debrief', 'tab-aspih'];
    const idx = tabList.indexOf(this.currentFormTab);
    if (idx < tabList.length - 1) {
      this.switchEditorTab(tabList[idx + 1]);
    }
  },

  prevEditorTab() {
    const tabList = ['tab-general', 'tab-outcomes', 'tab-patient', 'tab-setup', 'tab-progression', 'tab-debrief', 'tab-aspih'];
    const idx = tabList.indexOf(this.currentFormTab);
    if (idx > 0) {
      this.switchEditorTab(tabList[idx - 1]);
    }
  },

  // Dynamic Repeaters management
  addTechOutcomeRow(outcome = '', mapping = '') {
    const container = document.getElementById('tech-outcomes-repeater');
    const row = document.createElement('div');
    row.className = 'repeater-card form-row-2';
    row.innerHTML = `
      <button type="button" class="repeater-remove" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
      <div class="form-group" style="margin-bottom:0;">
        <label>Outcome Description</label>
        <input type="text" class="tech-outcome-desc" required value="${outcome}" placeholder="e.g. Recognise acute PE">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label>Curriculum Mapping</label>
        <input type="text" class="tech-outcome-map" value="${mapping}" placeholder="e.g. MBChB Y5 Acute Care">
      </div>
    `;
    container.appendChild(row);
  },

  addNonTechOutcomeRow(outcome = '', mapping = '') {
    const container = document.getElementById('nontech-outcomes-repeater');
    const row = document.createElement('div');
    row.className = 'repeater-card form-row-2';
    row.innerHTML = `
      <button type="button" class="repeater-remove" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
      <div class="form-group" style="margin-bottom:0;">
        <label>Outcome Description</label>
        <input type="text" class="nontech-outcome-desc" required value="${outcome}" placeholder="e.g. Deliver SBAR handover">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label>Framework / Domain</label>
        <input type="text" class="nontech-outcome-map" value="${mapping}" placeholder="e.g. ANTS - Communication">
      </div>
    `;
    container.appendChild(row);
  },

  addSbarRow(role = '', situation = '', background = '', assessment = '', recommendation = '') {
    const container = document.getElementById('sbar-repeater');
    const row = document.createElement('div');
    row.className = 'repeater-card';
    row.innerHTML = `
      <button type="button" class="repeater-remove" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
      <div class="form-group">
        <label>Role Receiving Handover</label>
        <input type="text" class="sbar-role" required value="${role}" placeholder="e.g. FY1 Doctor">
      </div>
      <div class="form-row-2">
        <div class="form-group">
          <label>S - Situation</label>
          <textarea class="sbar-s" rows="2" required placeholder="Who/what/where...">${situation}</textarea>
        </div>
        <div class="form-group">
          <label>B - Background</label>
          <textarea class="sbar-b" rows="2" required placeholder="History/context...">${background}</textarea>
        </div>
      </div>
      <div class="form-row-2" style="margin-bottom:0;">
        <div class="form-group" style="margin-bottom:0;">
          <label>A - Assessment</label>
          <textarea class="sbar-a" rows="2" required placeholder="Active concerns...">${assessment}</textarea>
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>R - Recommendation</label>
          <textarea class="sbar-r" rows="2" required placeholder="What is needed...">${recommendation}</textarea>
        </div>
      </div>
    `;
    container.appendChild(row);
  },

  addFacilitatorRow(role = '', responsibilities = '', required = 'Essential') {
    const container = document.getElementById('facilitators-repeater');
    const row = document.createElement('div');
    row.className = 'repeater-card form-row-3';
    row.innerHTML = `
      <button type="button" class="repeater-remove" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
      <div class="form-group" style="margin-bottom:0;">
        <label>Faculty Role</label>
        <input type="text" class="fac-role" required value="${role}" placeholder="e.g. Control room tech">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label>Responsibilities</label>
        <input type="text" class="fac-resp" required value="${responsibilities}" placeholder="What they do before/during...">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label>Required?</label>
        <select class="fac-req">
          <option value="Essential" ${required === 'Essential' ? 'selected' : ''}>Essential</option>
          <option value="Desirable" ${required === 'Desirable' ? 'selected' : ''}>Desirable</option>
        </select>
      </div>
    `;
    container.appendChild(row);
  },

  addActorRow(role = '', purpose = '', script = '') {
    const container = document.getElementById('actors-repeater');
    const row = document.createElement('div');
    row.className = 'repeater-card form-row-2';
    row.innerHTML = `
      <button type="button" class="repeater-remove" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
      <div class="form-group">
        <label>Confederate Role Name</label>
        <input type="text" class="actor-role" required value="${role}" placeholder="e.g. Ward nurse, Relative">
      </div>
      <div class="form-group">
        <label>Purpose in Scenario</label>
        <input type="text" class="actor-purpose" required value="${purpose}" placeholder="e.g. Provide rescue prompt if PE missed">
      </div>
      <div class="form-group" style="grid-column:1 / -1; margin-bottom:0;">
        <label>Key Script / Behaviours / Prompt Cues</label>
        <textarea class="actor-script" rows="2" required placeholder="What lines they deliver...">${script}</textarea>
      </div>
    `;
    container.appendChild(row);
  },

  addEquipmentRow(category = 'Airway / Breathing', item = '', qty = '1') {
    const container = document.getElementById('equipment-repeater');
    const row = document.createElement('div');
    row.className = 'repeater-card form-row-3';
    row.innerHTML = `
      <button type="button" class="repeater-remove" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
      <div class="form-group" style="margin-bottom:0;">
        <label>Category</label>
        <select class="equip-cat">
          <option value="Airway / Breathing" ${category === 'Airway / Breathing' ? 'selected' : ''}>Airway / Breathing</option>
          <option value="Circulation" ${category === 'Circulation' ? 'selected' : ''}>Circulation</option>
          <option value="Diagnostics" ${category === 'Diagnostics' ? 'selected' : ''}>Diagnostics</option>
          <option value="Personal Protective Equipment" ${category === 'Personal Protective Equipment' ? 'selected' : ''}>PPE</option>
          <option value="Other / Misc" ${category === 'Other / Misc' ? 'selected' : ''}>Other / Misc</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label>Item Name</label>
        <input type="text" class="equip-item" required value="${item}" placeholder="e.g. 15L Non-rebreathe mask">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label>Qty / Notes</label>
        <input type="text" class="equip-qty" required value="${qty}" placeholder="e.g. 1, reservoir intact">
      </div>
    `;
    container.appendChild(row);
  },

  addMedicationRow(drug = '', route = 'SC', strength = '', notes = '') {
    const container = document.getElementById('medications-repeater');
    const row = document.createElement('div');
    row.className = 'repeater-card form-row-2';
    row.innerHTML = `
      <button type="button" class="repeater-remove" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
      <div class="form-group">
        <label>Drug Name</label>
        <input type="text" class="med-drug" required value="${drug}" placeholder="e.g. Enoxaparin">
      </div>
      <div class="form-group">
        <label>Route</label>
        <input type="text" class="med-route" required value="${route}" placeholder="e.g. SC, IV bolus, PO">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label>Strength Presented</label>
        <input type="text" class="med-strength" required value="${strength}" placeholder="e.g. 40 mg / 0.4 mL">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label>Clinical Notes</label>
        <input type="text" class="med-notes" value="${notes}" placeholder="e.g. Check weight and allergies first">
      </div>
    `;
    container.appendChild(row);
  },

  addDebriefAnalysisRow(point = '', strategy = 'Advocacy-Inquiry', question = '') {
    const container = document.getElementById('debrief-analysis-repeater');
    const row = document.createElement('div');
    row.className = 'repeater-card';
    row.innerHTML = `
      <button type="button" class="repeater-remove" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
      <div class="form-row-2">
        <div class="form-group">
          <label>Learning Point / Outcome Link</label>
          <input type="text" class="debrief-analysis-point" required value="${point}" placeholder="e.g. Early recognition of VTE">
        </div>
        <div class="form-group">
          <label>Debrief Strategy</label>
          <select class="debrief-analysis-strategy">
            <option value="Advocacy-Inquiry" ${strategy === 'Advocacy-Inquiry' ? 'selected' : ''}>Advocacy-Inquiry (Blended)</option>
            <option value="Plus-Delta" ${strategy === 'Plus-Delta' ? 'selected' : ''}>Plus-Delta (Action focused)</option>
            <option value="Directive Feedback" ${strategy === 'Directive Feedback' ? 'selected' : ''}>Directive Feedback (Lecture/Review)</option>
          </select>
        </div>
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label>Suggested Question / Scenario Script Prompt</label>
        <textarea class="debrief-analysis-question" rows="2" required placeholder="I noticed that... I am curious what you were weighing up?">${question}</textarea>
      </div>
    `;
    container.appendChild(row);
  },

  addVersionRow(version = '', date = '', author = '', change = '') {
    const container = document.getElementById('history-repeater');
    const row = document.createElement('div');
    row.className = 'repeater-card form-row-2';
    row.innerHTML = `
      <button type="button" class="repeater-remove" onclick="this.parentElement.remove()"><i class="fa-solid fa-trash"></i></button>
      <div class="form-group">
        <label>Version</label>
        <input type="text" class="hist-ver" required value="${version}" placeholder="e.g. 1.0">
      </div>
      <div class="form-group">
        <label>Date (DD/MM/YYYY)</label>
        <input type="text" class="hist-date" required value="${date}" placeholder="e.g. 27/05/2026">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label>Author</label>
        <input type="text" class="hist-auth" required value="${author}" placeholder="e.g. Dr. Smith">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label>Summary of Changes</label>
        <input type="text" class="hist-change" required value="${change}" placeholder="e.g. Initial creation">
      </div>
    `;
    container.appendChild(row);
  },

  // Progression phases repeater is more nested, lets build a custom card
  addPhaseRow(phaseData = null) {
    const container = document.getElementById('phases-repeater');
    const phaseIndex = container.children.length;
    const p = phaseData || {
      phaseName: `Phase ${phaseIndex + 1} - Active Run`,
      trigger: '',
      duration: '3-5 minutes',
      vitals: { hr: '', rr: '', spo2: '', bp: '', temp: '', gcs: '' },
      patientPresentation: { appearance: '', mood: '', communication: '', keyLines: '' },
      expectedActions: [],
      cues: [],
      investigations: []
    };

    const card = document.createElement('div');
    card.className = 'repeater-card';
    card.style.borderTop = '4px solid var(--accent-blue)';
    card.style.marginTop = '20px';
    card.innerHTML = `
      <button type="button" class="repeater-remove" onclick="this.parentElement.remove()" style="top:15px; right:15px;"><i class="fa-solid fa-trash"></i> Delete Phase</button>
      
      <div class="form-row-2">
        <div class="form-group">
          <label>Phase Name</label>
          <input type="text" class="phase-name-input" required value="${p.phaseName}" placeholder="e.g. Baseline, Deterioration, Resolution">
        </div>
        <div class="form-group">
          <label>Expected Phase Duration</label>
          <input type="text" class="phase-duration-input" required value="${p.duration}" placeholder="e.g. 3 - 5 minutes">
        </div>
      </div>
      
      <div class="form-group">
        <label>Phase Entrance Trigger</label>
        <input type="text" class="phase-trigger-input" required value="${p.trigger}" placeholder="What event triggers entry? e.g. oxygen applied, scenario starts">
      </div>

      <!-- Vitals block inside editor -->
      <h5 style="margin-bottom:8px; color:var(--accent-blue); font-size:0.85rem;"><i class="fa-solid fa-heart-pulse"></i> Target Vitals for Simulator</h5>
      <div class="form-row-3" style="display:grid; grid-template-columns: repeat(6, 1fr); gap:10px; margin-bottom:16px;">
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-size:0.75rem; color:#10b981;">HR (bpm)</label>
          <input type="text" class="phase-vital-hr" required value="${p.vitals?.hr || ''}" placeholder="100">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-size:0.75rem; color:#3b82f6;">RR (min)</label>
          <input type="text" class="phase-vital-rr" required value="${p.vitals?.rr || ''}" placeholder="24">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-size:0.75rem; color:#eab308;">SpO2 (%)</label>
          <input type="text" class="phase-vital-spo2" required value="${p.vitals?.spo2 || ''}" placeholder="91">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-size:0.75rem; color:#ef4444;">BP (mmHg)</label>
          <input type="text" class="phase-vital-bp" required value="${p.vitals?.bp || ''}" placeholder="120/80">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-size:0.75rem; color:#f43f5e;">Temp (°C)</label>
          <input type="text" class="phase-vital-temp" required value="${p.vitals?.temp || ''}" placeholder="37.2">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label style="font-size:0.75rem; color:#a855f7;">GCS / AVPU</label>
          <input type="text" class="phase-vital-gcs" required value="${p.vitals?.gcs || ''}" placeholder="A/15">
        </div>
      </div>

      <div class="form-row-2">
        <!-- Presentation -->
        <div class="glass-card" style="padding:14px; margin-bottom:16px;">
          <h6 style="color:var(--text-secondary); margin-bottom:10px;">Patient Presentation</h6>
          <div class="form-group">
            <label style="font-size:0.8rem;">Appearance & Body Language</label>
            <input type="text" class="phase-pres-appearance" required value="${p.patientPresentation?.appearance || ''}" placeholder="e.g. clutch chest, diaphoretic">
          </div>
          <div class="form-row-2" style="margin-bottom:10px;">
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:0.8rem;">Mood / Affect</label>
              <input type="text" class="phase-pres-mood" required value="${p.patientPresentation?.mood || ''}" placeholder="e.g. anxious, cooperative">
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:0.8rem;">Communication</label>
              <input type="text" class="phase-pres-comm" required value="${p.patientPresentation?.communication || ''}" placeholder="e.g. short sentences, gasping">
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:0.8rem;">Scripted Patient Lines</label>
            <textarea class="phase-pres-lines" rows="2" required placeholder="What the patient says: 'It hurts so bad...'">${p.patientPresentation?.keyLines || ''}</textarea>
          </div>
        </div>

        <!-- Investigations -->
        <div class="glass-card" style="padding:14px; margin-bottom:16px; display:flex; flex-direction:column; justify-content:space-between;">
          <div>
            <h6 style="color:var(--text-secondary); margin-bottom:10px;">Investigations Available</h6>
            <div class="phase-investigations-repeater" style="margin-bottom:10px;">
              ${(p.investigations || []).map(inv => `
                <div style="display:flex; gap:8px; margin-bottom:6px;">
                  <input type="text" class="inv-name" required value="${inv.name}" placeholder="e.g. 12-lead ECG" style="flex:1; padding:4px 8px; font-size:0.8rem;">
                  <input type="text" class="inv-result" required value="${inv.result}" placeholder="e.g. Sinus tachy" style="flex:1.5; padding:4px 8px; font-size:0.8rem;">
                  <button type="button" onclick="this.parentElement.remove()" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
                </div>
              `).join('')}
            </div>
          </div>
          <button type="button" class="btn btn-secondary" onclick="components.addPhaseInvestigationRow(this)" style="padding:4px 8px; font-size:0.8rem; align-self:flex-start;">
            <i class="fa-solid fa-plus"></i> Add Investigation
          </button>
        </div>
      </div>

      <div class="form-row-2" style="margin-bottom:0;">
        <!-- Expected actions -->
        <div class="glass-card" style="padding:14px; display:flex; flex-direction:column; justify-content:space-between;">
          <div>
            <h6 style="color:var(--accent-emerald); margin-bottom:10px;"><i class="fa-solid fa-check"></i> Expected Learner Actions</h6>
            <div class="phase-actions-repeater" style="margin-bottom:10px;">
              ${(p.expectedActions || []).map(act => `
                <div style="display:flex; gap:8px; margin-bottom:6px;">
                  <input type="text" class="act-role" required value="${act.role}" placeholder="e.g. Lead, Team" style="flex:1; padding:4px 8px; font-size:0.8rem;">
                  <input type="text" class="act-desc" required value="${act.action}" placeholder="e.g. Start 15L O2" style="flex:2.5; padding:4px 8px; font-size:0.8rem;">
                  <button type="button" onclick="this.parentElement.remove()" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
                </div>
              `).join('')}
            </div>
          </div>
          <button type="button" class="btn btn-secondary" onclick="components.addPhaseExpectedActionRow(this)" style="padding:4px 8px; font-size:0.8rem; align-self:flex-start;">
            <i class="fa-solid fa-plus"></i> Add Expected Action
          </button>
        </div>

        <!-- Cues -->
        <div class="glass-card" style="padding:14px; display:flex; flex-direction:column; justify-content:space-between;">
          <div>
            <h6 style="color:var(--accent-amber); margin-bottom:10px;"><i class="fa-solid fa-triangle-exclamation"></i> Rescue Prompts & Cues</h6>
            <div class="phase-cues-repeater" style="margin-bottom:10px;">
              ${(p.cues || []).map(cue => `
                <div style="display:flex; gap:8px; margin-bottom:6px;">
                  <input type="text" class="cue-cond" required value="${cue.condition}" placeholder="e.g. If no action after 5 min" style="flex:1.5; padding:4px 8px; font-size:0.8rem;">
                  <input type="text" class="cue-prompt" required value="${cue.cue}" placeholder="e.g. SP complains of calf pain" style="flex:2.5; padding:4px 8px; font-size:0.8rem;">
                  <button type="button" onclick="this.parentElement.remove()" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
                </div>
              `).join('')}
            </div>
          </div>
          <button type="button" class="btn btn-secondary" onclick="components.addPhaseCueRow(this)" style="padding:4px 8px; font-size:0.8rem; align-self:flex-start;">
            <i class="fa-solid fa-plus"></i> Add Rescue Prompt
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  },

  addPhaseInvestigationRow(btn) {
    const container = btn.parentElement.querySelector('.phase-investigations-repeater');
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.marginBottom = '6px';
    row.innerHTML = `
      <input type="text" class="inv-name" required placeholder="e.g. ABG, ECG" style="flex:1; padding:4px 8px; font-size:0.8rem;">
      <input type="text" class="inv-result" required placeholder="e.g. Result description" style="flex:1.5; padding:4px 8px; font-size:0.8rem;">
      <button type="button" onclick="this.parentElement.remove()" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
    `;
    container.appendChild(row);
  },

  addPhaseExpectedActionRow(btn) {
    const container = btn.parentElement.querySelector('.phase-actions-repeater');
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.marginBottom = '6px';
    row.innerHTML = `
      <input type="text" class="act-role" required placeholder="e.g. Lead, Team" style="flex:1; padding:4px 8px; font-size:0.8rem;">
      <input type="text" class="act-desc" required placeholder="e.g. Perform A-E assessment" style="flex:2.5; padding:4px 8px; font-size:0.8rem;">
      <button type="button" onclick="this.parentElement.remove()" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
    `;
    container.appendChild(row);
  },

  addPhaseCueRow(btn) {
    const container = btn.parentElement.querySelector('.phase-cues-repeater');
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.marginBottom = '6px';
    row.innerHTML = `
      <input type="text" class="cue-cond" required placeholder="e.g. If PE missed at 5m" style="flex:1.5; padding:4px 8px; font-size:0.8rem;">
      <input type="text" class="cue-prompt" required placeholder="e.g. SP nurse prompts: leg swollen?" style="flex:2.5; padding:4px 8px; font-size:0.8rem;">
      <button type="button" onclick="this.parentElement.remove()" style="background:transparent; border:none; color:var(--text-muted); cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
    `;
    container.appendChild(row);
  },

  // Build the Wizard markup dynamically
  buildScenarioWizardForm(existingData = null) {
    const content = document.getElementById('form-tabs-content');
    if (!content) return;

    // Reset tabs
    this.currentFormTab = 'tab-general';

    // Templates prefilled or blank
    const s = existingData || {
      id: '', code: '', title: '', version: '1.0', lastReviewed: '', nextReviewDue: '',
      authors: '', clinicalReviewer: '', educationalReviewer: '', basedOnRealCase: false, realCaseNotes: '',
      overview: { summary: '', targetLearners: '', prerequisites: '', modality: '', location: '', duration: 15, debriefDuration: 30, totalSessionTime: 60 },
      patientInfo: { demographics: { name: '', age: '', sex: '', weight: '', identifier: '' }, background: { presentingComplaint: '', history: '', pastMedicalHistory: '', currentMedications: '', allergies: '', socialHistory: '', ice: '' } },
      prebrief: { lead: '', duration: 10, notes: '', checklist: [] },
      debrief: { reactions: { question: '', duration: 3 }, description: { question: '', duration: 3 }, analysis: [], summary: { question: '', points: [], duration: 4 } },
      references: { guidelines: '', evidenceBase: '', preLearning: '', relatedScenarios: '' }
    };

    content.innerHTML = `
      <!-- TAB 1: GENERAL & GOVERNANCE -->
      <div id="tab-general" class="form-tab-group">
        <h3 style="margin-bottom:16px; color:var(--accent-blue);"><i class="fa-solid fa-circle-info"></i> Scenario Governance & Identification</h3>
        <div class="form-row-3">
          <div class="form-group">
            <label for="form-code">Scenario Code</label>
            <input type="text" id="form-code" required value="${s.code}" placeholder="e.g. UHB-UG-PE-01">
          </div>
          <div class="form-group">
            <label for="form-title">Scenario Title</label>
            <input type="text" id="form-title" required value="${s.title}" placeholder="e.g. Acute Pulmonary Embolism">
          </div>
          <div class="form-group">
            <label for="form-version">Version</label>
            <input type="text" id="form-version" required value="${s.version}" placeholder="e.g. 1.0">
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label for="form-lastReviewed">Last Reviewed Date</label>
            <input type="text" id="form-lastReviewed" required value="${s.lastReviewed}" placeholder="DD/MM/YYYY">
          </div>
          <div class="form-group">
            <label for="form-nextReviewDue">Next Review Due Date</label>
            <input type="text" id="form-nextReviewDue" required value="${s.nextReviewDue}" placeholder="DD/MM/YYYY">
          </div>
        </div>

        <div class="form-group">
          <label for="form-authors">Author(s)</label>
          <input type="text" id="form-authors" required value="${s.authors}" placeholder="Names, roles, institutions">
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label for="form-clinicalReviewer">Clinical Sign-Off Reviewer</label>
            <input type="text" id="form-clinicalReviewer" required value="${s.clinicalReviewer}" placeholder="Name, role, date signed off">
          </div>
          <div class="form-group">
            <label for="form-educationalReviewer">Educational Sign-Off Reviewer</label>
            <input type="text" id="form-educationalReviewer" required value="${s.educationalReviewer}" placeholder="Name, role, date signed off">
          </div>
        </div>

        <div class="glass-card" style="margin-top:20px; padding:16px;">
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-weight:500;">
            <input type="checkbox" id="form-basedOnRealCase" ${s.basedOnRealCase ? 'checked' : ''} onchange="document.getElementById('real-case-notes-wrapper').style.display = this.checked ? 'block' : 'none'">
            <span>Based on a real clinical case?</span>
          </label>
          <div id="real-case-notes-wrapper" class="form-group" style="margin-top:14px; display: ${s.basedOnRealCase ? 'block' : 'none'};">
            <label for="form-realCaseNotes">Anonymisation / Sourcing Notes</label>
            <textarea id="form-realCaseNotes" rows="2" placeholder="e.g. Case anonymised from emergency admission at UHB.">${s.realCaseNotes || ''}</textarea>
          </div>
        </div>

        <h3 style="margin-top:30px; margin-bottom:16px; color:var(--accent-blue);"><i class="fa-solid fa-eye"></i> Scenario Summary Overview</h3>
        <div class="form-group">
          <label for="form-summary">Scenario Summary (At-A-Glance)</label>
          <textarea id="form-summary" rows="3" required placeholder="2-3 sentences. Summarise what happens and what is being tested.">${s.overview?.summary || ''}</textarea>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label for="form-targetLearners">Target Learners</label>
            <input type="text" id="form-targetLearners" required value="${s.overview?.targetLearners || ''}" placeholder="e.g. Final Year Medical Students, FY1s">
          </div>
          <div class="form-group">
            <label for="form-prerequisites">Pre-requisites</label>
            <input type="text" id="form-prerequisites" value="${s.overview?.prerequisites || ''}" placeholder="e.g. E-learning Module 4, A-E prebriefing pack">
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label for="form-modality">Modality</label>
            <select id="form-modality">
              <option value="High-fidelity manikin" ${s.overview?.modality === 'High-fidelity manikin' ? 'selected' : ''}>High-fidelity manikin</option>
              <option value="Simulated participant / Actor" ${s.overview?.modality === 'Simulated participant / Actor' ? 'selected' : ''}>Simulated participant / Actor</option>
              <option value="Hybrid (Manikin + Actor)" ${s.overview?.modality === 'Hybrid (Manikin + Actor)' ? 'selected' : ''}>Hybrid (Manikin + Actor)</option>
              <option value="Low-fidelity task trainer" ${s.overview?.modality === 'Low-fidelity task trainer' ? 'selected' : ''}>Low-fidelity task trainer</option>
            </select>
          </div>
          <div class="form-group">
            <label for="form-location">Physical Location</label>
            <input type="text" id="form-location" required value="${s.overview?.location || ''}" placeholder="e.g. Sim Ward, Bed 2, ED Cubicle">
          </div>
        </div>

        <div class="form-row-3">
          <div class="form-group">
            <label for="form-duration">Scenario Run Time (min)</label>
            <input type="number" id="form-duration" required value="${s.overview?.duration || 15}">
          </div>
          <div class="form-group">
            <label for="form-debriefDuration">Debrief Run Time (min)</label>
            <input type="number" id="form-debriefDuration" required value="${s.overview?.debriefDuration || 30}">
          </div>
          <div class="form-group">
            <label for="form-totalSessionTime">Total Session Time (min)</label>
            <input type="number" id="form-totalSessionTime" required value="${s.overview?.totalSessionTime || 60}">
          </div>
        </div>
      </div>

      <!-- TAB 2: LEARNING OUTCOMES -->
      <div id="tab-outcomes" class="form-tab-group" style="display:none;">
        <div class="flex-between m-b-20" style="margin-bottom:12px;">
          <h3 style="color:var(--accent-emerald);"><i class="fa-solid fa-circle-nodes"></i> Technical / Clinical Learning Outcomes</h3>
          <button type="button" class="btn btn-secondary" onclick="components.addTechOutcomeRow()" style="padding:6px 12px; font-size:0.8rem;">
            <i class="fa-solid fa-plus"></i> Add Tech Outcome
          </button>
        </div>
        <div id="tech-outcomes-repeater">
          <!-- Populated dynamically -->
        </div>

        <div class="flex-between m-b-20" style="margin-top:30px; margin-bottom:12px;">
          <h3 style="color:var(--accent-blue);"><i class="fa-solid fa-people-arrows"></i> Non-Technical / Behavioural Outcomes</h3>
          <button type="button" class="btn btn-secondary" onclick="components.addNonTechOutcomeRow()" style="padding:6px 12px; font-size:0.8rem;">
            <i class="fa-solid fa-plus"></i> Add Non-Tech Outcome
          </button>
        </div>
        <div id="nontech-outcomes-repeater">
          <!-- Populated dynamically -->
        </div>
      </div>

      <!-- TAB 3: PATIENT INFO & SBAR -->
      <div id="tab-patient" class="form-tab-group" style="display:none;">
        <h3 style="margin-bottom:16px; color:var(--accent-blue);"><i class="fa-solid fa-hospital-user"></i> Patient Demographics</h3>
        <div class="form-row-3">
          <div class="form-group">
            <label for="form-patName">Patient Name</label>
            <input type="text" id="form-patName" required value="${s.patientInfo?.demographics?.name || ''}" placeholder="e.g. Sam Phillips">
          </div>
          <div class="form-group">
            <label for="form-patAge">Age</label>
            <input type="text" id="form-patAge" required value="${s.patientInfo?.demographics?.age || ''}" placeholder="e.g. 42 yrs">
          </div>
          <div class="form-group">
            <label for="form-patSex">Sex</label>
            <input type="text" id="form-patSex" required value="${s.patientInfo?.demographics?.sex || ''}" placeholder="e.g. M / F / Unisex">
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label for="form-patWeight">Weight (kg)</label>
            <input type="text" id="form-patWeight" required value="${s.patientInfo?.demographics?.weight || ''}" placeholder="e.g. 87 kg">
          </div>
          <div class="form-group">
            <label for="form-patIdentifier">Patient MRN / NHS Number</label>
            <input type="text" id="form-patIdentifier" value="${s.patientInfo?.demographics?.identifier || ''}" placeholder="Optional identifier">
          </div>
        </div>

        <h3 style="margin-top:30px; margin-bottom:16px; color:var(--accent-blue);"><i class="fa-solid fa-file-medical"></i> Clinical Background</h3>
        <div class="form-group">
          <label for="form-patPC">Presenting Complaint (Lay Words)</label>
          <input type="text" id="form-patPC" required value="${s.patientInfo?.background?.presentingComplaint || ''}" placeholder="What the patient complains of...">
        </div>
        <div class="form-group">
          <label for="form-patHistory">History of Presenting Complaint</label>
          <textarea id="form-patHistory" rows="3" required placeholder="Detailed clinical timeline...">${s.patientInfo?.background?.history || ''}</textarea>
        </div>
        <div class="form-group">
          <label for="form-patPMH">Past Medical History</label>
          <textarea id="form-patPMH" rows="2" placeholder="List any previous conditions/surgeries...">${s.patientInfo?.background?.pastMedicalHistory || ''}</textarea>
        </div>
        <div class="form-group">
          <label for="form-patMeds">Current Medications</label>
          <textarea id="form-patMeds" rows="2" placeholder="Drugs, doses, frequencies...">${s.patientInfo?.background?.currentMedications || ''}</textarea>
        </div>
        <div class="form-group">
          <label for="form-patAllergies">Allergies & Reactions</label>
          <input type="text" id="form-patAllergies" required value="${s.patientInfo?.background?.allergies || ''}" placeholder="e.g. Penicillin (anaphylaxis)">
        </div>
        <div class="form-group">
          <label for="form-patSocial">Social & Family History</label>
          <textarea id="form-patSocial" rows="2" placeholder="Smoking, alcohol, support, occupation...">${s.patientInfo?.background?.socialHistory || ''}</textarea>
        </div>
        <div class="form-group">
          <label for="form-patICE">Ideas, Concerns, Expectations (ICE)</label>
          <textarea id="form-patICE" rows="2" placeholder="Optional. Highly useful for communication briefs...">${s.patientInfo?.background?.ice || ''}</textarea>
        </div>

        <div class="flex-between m-b-20" style="margin-top:30px; margin-bottom:12px;">
          <h3 style="color:var(--accent-blue);"><i class="fa-solid fa-volume-high"></i> Learner Handovers (SBAR)</h3>
          <button type="button" class="btn btn-secondary" onclick="components.addSbarRow()" style="padding:6px 12px; font-size:0.8rem;">
            <i class="fa-solid fa-plus"></i> Add Handover Block
          </button>
        </div>
        <div id="sbar-repeater">
          <!-- Populated dynamically -->
        </div>
      </div>

      <!-- TAB 4: FACULTY & SETUP -->
      <div id="tab-setup" class="form-tab-group" style="display:none;">
        <div class="flex-between m-b-20" style="margin-bottom:12px;">
          <h3 style="color:var(--text-secondary);"><i class="fa-solid fa-users-gear"></i> Facilitator Team</h3>
          <button type="button" class="btn btn-secondary" onclick="components.addFacilitatorRow()" style="padding:6px 12px; font-size:0.8rem;">
            <i class="fa-solid fa-plus"></i> Add Facilitator
          </button>
        </div>
        <div id="facilitators-repeater">
          <!-- Populated dynamically -->
        </div>

        <div class="flex-between m-b-20" style="margin-top:30px; margin-bottom:12px;">
          <h3 style="color:var(--accent-amber);"><i class="fa-solid fa-theater-masks"></i> In-Scenario Confederate / SP Roles</h3>
          <button type="button" class="btn btn-secondary" onclick="components.addActorRow()" style="padding:6px 12px; font-size:0.8rem;">
            <i class="fa-solid fa-plus"></i> Add SP Role
          </button>
        </div>
        <div id="actors-repeater">
          <!-- Populated dynamically -->
        </div>

        <h3 style="margin-top:30px; margin-bottom:16px; color:var(--text-secondary);"><i class="fa-solid fa-sliders"></i> Environment Setup at Start</h3>
        <div class="form-row-2">
          <div class="form-group">
            <label for="form-setup-location">Location / Setting</label>
            <input type="text" id="form-setup-location" required value="${s.environment?.setup?.location || ''}" placeholder="e.g. Simulation Ward - Bay 2, curtains closed">
          </div>
          <div class="form-group">
            <label for="form-setup-simulator">Simulator Model</label>
            <input type="text" id="form-setup-simulator" required value="${s.environment?.setup?.simulator || ''}" placeholder="e.g. SimMan 3G / Actor with moulage">
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label for="form-setup-position">Patient Position</label>
            <input type="text" id="form-setup-position" required value="${s.environment?.setup?.position || ''}" placeholder="e.g. Semi-upright in bed, fully clothed">
          </div>
          <div class="form-group">
            <label for="form-setup-monitor">Monitor Setup</label>
            <input type="text" id="form-setup-monitor" required value="${s.environment?.setup?.monitorSetup || ''}" placeholder="e.g. Blank vitals monitor active">
          </div>
        </div>

        <div class="form-row-3">
          <div class="form-group">
            <label for="form-setup-access">Vascular Access</label>
            <input type="text" id="form-setup-access" required value="${s.environment?.setup?.vascularAccess || ''}" placeholder="e.g. 20G right ACF cannula patent">
          </div>
          <div class="form-group">
            <label for="form-setup-oxygen">Oxygen at Start</label>
            <input type="text" id="form-setup-oxygen" required value="${s.environment?.setup?.oxygenAtStart || ''}" placeholder="e.g. 2L/min via nasal cannula">
          </div>
          <div class="form-group">
            <label for="form-setup-fluids">Fluids Running</label>
            <input type="text" id="form-setup-fluids" required value="${s.environment?.setup?.fluidsRunning || ''}" placeholder="e.g. None / Normal saline running">
          </div>
        </div>

        <div class="form-group">
          <label for="form-setup-moulage">Moulage & Cosmetics Details</label>
          <input type="text" id="form-setup-moulage" value="${s.environment?.setup?.moulage || ''}" placeholder="e.g. Swelling and redness on left calf, sweat on forehead">
        </div>

        <div class="flex-between m-b-20" style="margin-top:30px; margin-bottom:12px;">
          <h3 style="color:var(--text-secondary);"><i class="fa-solid fa-list-check"></i> Equipment Checklist</h3>
          <button type="button" class="btn btn-secondary" onclick="components.addEquipmentRow()" style="padding:6px 12px; font-size:0.8rem;">
            <i class="fa-solid fa-plus"></i> Add Equipment Item
          </button>
        </div>
        <div id="equipment-repeater">
          <!-- Populated dynamically -->
        </div>

        <div class="flex-between m-b-20" style="margin-top:30px; margin-bottom:12px;">
          <h3 style="color:var(--accent-blue);"><i class="fa-solid fa-pills"></i> Medications Available</h3>
          <button type="button" class="btn btn-secondary" onclick="components.addMedicationRow()" style="padding:6px 12px; font-size:0.8rem;">
            <i class="fa-solid fa-plus"></i> Add Medication
          </button>
        </div>
        <div id="medications-repeater">
          <!-- Populated dynamically -->
        </div>
      </div>

      <!-- TAB 5: PROGRESSION -->
      <div id="tab-progression" class="form-tab-group" style="display:none;">
        <div class="flex-between m-b-20" style="margin-bottom:12px;">
          <div>
            <h3 style="color:var(--accent-blue);"><i class="fa-solid fa-arrow-down-short-wide"></i> Scenario Progression Phases</h3>
            <p style="color:var(--text-secondary); font-size:0.8rem;">Create progression steps (e.g. Baseline -> Deterioration -> Resolution). Triggers update target vitals automatically.</p>
          </div>
          <button type="button" class="btn btn-emerald" onclick="components.addPhaseRow()" style="padding:10px 16px; font-size:0.85rem;">
            <i class="fa-solid fa-plus"></i> Add New Phase
          </button>
        </div>
        
        <div id="phases-repeater">
          <!-- Populated dynamically -->
        </div>
      </div>

      <!-- TAB 6: PREBRIEF & DEBRIEF -->
      <div id="tab-debrief" class="form-tab-group" style="display:none;">
        <h3 style="margin-bottom:16px; color:var(--text-secondary);"><i class="fa-solid fa-clipboard-list"></i> Prebrief Settings</h3>
        <div class="form-row-2">
          <div class="form-group">
            <label for="form-prebrief-lead">Prebrief Lead Facilitator</label>
            <input type="text" id="form-prebrief-lead" required value="${s.prebrief?.lead || ''}" placeholder="e.g. Lead Facilitator">
          </div>
          <div class="form-group">
            <label for="form-prebrief-duration">Prebrief Duration (min)</label>
            <input type="number" id="form-prebrief-duration" required value="${s.prebrief?.duration || 10}">
          </div>
        </div>
        <div class="form-group">
          <label for="form-prebrief-notes">Prebrief Local Variations / Specific Notes</label>
          <textarea id="form-prebrief-notes" rows="2" placeholder="e.g. Focus on checking safety protocols for high fidelity manikin.">${s.prebrief?.notes || ''}</textarea>
        </div>
        <div class="form-group">
          <label for="form-prebrief-checklist">Safety & Contract Checklist (One item per line)</label>
          <textarea id="form-prebrief-checklist" rows="5" required placeholder="Introductions and housekeeping&#10;Fiction contract&#10;Basic assumption&#10;Confidentiality&#10;Orientation to simulator">${(s.prebrief?.checklist || []).join('\n')}</textarea>
        </div>

        <h3 style="margin-top:30px; margin-bottom:16px; color:var(--accent-purple);"><i class="fa-solid fa-comments"></i> PEARLS Debrief Guidance</h3>
        <div class="form-row-2">
          <div class="form-group">
            <label for="form-debrief-reactions">Phase 1 - Reactions Question</label>
            <input type="text" id="form-debrief-reactions" required value="${s.debrief?.reactions?.question || ''}" placeholder="e.g. How are you feeling?">
          </div>
          <div class="form-group">
            <label for="form-debrief-reactions-dur">Reactions Duration (min)</label>
            <input type="number" id="form-debrief-reactions-dur" required value="${s.debrief?.reactions?.duration || 3}">
          </div>
        </div>

        <div class="form-row-2">
          <div class="form-group">
            <label for="form-debrief-desc">Phase 2 - Description Question</label>
            <input type="text" id="form-debrief-desc" required value="${s.debrief?.description?.question || ''}" placeholder="e.g. Can someone summarise the case?">
          </div>
          <div class="form-group">
            <label for="form-debrief-desc-dur">Description Duration (min)</label>
            <input type="number" id="form-debrief-desc-dur" required value="${s.debrief?.description?.duration || 3}">
          </div>
        </div>

        <div class="flex-between m-b-20" style="margin-top:20px; margin-bottom:12px;">
          <h5 style="color:var(--accent-purple);"><i class="fa-solid fa-chart-line"></i> Phase 3 - Analysis Core Questions</h5>
          <button type="button" class="btn btn-secondary" onclick="components.addDebriefAnalysisRow()" style="padding:6px 12px; font-size:0.8rem;">
            <i class="fa-solid fa-plus"></i> Add Analysis Objective
          </button>
        </div>
        <div id="debrief-analysis-repeater">
          <!-- Populated dynamically -->
        </div>

        <div class="form-row-2" style="margin-top:20px;">
          <div class="form-group">
            <label for="form-debrief-sum">Phase 4 - Summary Closing Prompt</label>
            <input type="text" id="form-debrief-sum" required value="${s.debrief?.summary?.question || ''}" placeholder="e.g. What are the takeaway points?">
          </div>
          <div class="form-group">
            <label for="form-debrief-sum-dur">Summary Duration (min)</label>
            <input type="number" id="form-debrief-sum-dur" required value="${s.debrief?.summary?.duration || 4}">
          </div>
        </div>
        <div class="form-group">
          <label for="form-debrief-sum-points">Core Faculty Take-Home Points (One item per line)</label>
          <textarea id="form-debrief-sum-points" rows="3" required placeholder="Complete A-E check before escalation&#10;LMWH treatment dosing guidelines">${(s.debrief?.summary?.points || []).join('\n')}</textarea>
        </div>
      </div>

      <!-- TAB 7: ASPIH & REFERENCES -->
      <div id="tab-aspih" class="form-tab-group" style="display:none;">
        <h3 style="margin-bottom:16px; color:var(--text-secondary);"><i class="fa-solid fa-certificate"></i> ASPiH 2023 Standards Compliance Mapping</h3>
        
        <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:30px;">
          ${[
            'Core values (safety, EDI, sustainability, excellence)',
            'Faculty — trained, competent, continuously developing',
            'Simulated participants trained for role',
            'Activity — needs-based, aligned learning outcomes',
            'Activity — evidence-informed design',
            'Activity — structured prebrief and debrief',
            'Resources — equipment and environment fit for purpose',
            'Governance — review, sign-off, version control'
          ].map((domain, index) => {
            const match = s.aspihMapping ? s.aspihMapping.find(m => m.domain.startsWith(domain.substring(0, 15))) : null;
            return `
              <div class="glass-card" style="padding:14px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <strong style="font-size:0.9rem;">${domain}</strong>
                  <label style="display:flex; align-items:center; gap:6px; cursor:pointer;">
                    <input type="checkbox" class="aspih-cb" data-domain="${domain}" ${!match || match.status ? 'checked' : ''}>
                    <span style="font-size:0.8rem; font-weight:600;">Met / Covered</span>
                  </label>
                </div>
                <input type="text" class="aspih-desc" data-domain="${domain}" required value="${match ? match.coveredBy : `Addresses requirements in relevant scenario protocols.`}" style="font-size:0.85rem; padding:6px 12px;">
              </div>
            `;
          }).join('')}
        </div>

        <h3 style="margin-bottom:16px; color:var(--accent-blue);"><i class="fa-solid fa-book-bookmark"></i> References & Supporting Materials</h3>
        <div class="form-group">
          <label for="form-ref-guidelines">Clinical Guidelines Referenced</label>
          <input type="text" id="form-ref-guidelines" value="${s.references?.guidelines || ''}" placeholder="e.g. NICE NG158 PE Guidelines">
        </div>
        <div class="form-group">
          <label for="form-ref-evidence">Evidence Base / Key Papers</label>
          <input type="text" id="form-ref-evidence" value="${s.references?.evidenceBase || ''}" placeholder="Author, title, year or DOI">
        </div>
        <div class="form-group">
          <label for="form-ref-prelearn">Pre-learning Links</label>
          <input type="text" id="form-ref-prelearn" value="${s.references?.preLearning || ''}" placeholder="Moodle, intranet or article links">
        </div>
        <div class="form-group">
          <label for="form-ref-related">Related Scenarios</label>
          <input type="text" id="form-ref-related" value="${s.references?.relatedScenarios || ''}" placeholder="IDs or titles of related exercises">
        </div>

        <div class="flex-between m-b-20" style="margin-top:30px; margin-bottom:12px;">
          <h3 style="color:var(--text-secondary);"><i class="fa-solid fa-clock-rotate-left"></i> Version History</h3>
          <button type="button" class="btn btn-secondary" onclick="components.addVersionRow()" style="padding:6px 12px; font-size:0.8rem;">
            <i class="fa-solid fa-plus"></i> Add History Log
          </button>
        </div>
        <div id="history-repeater">
          <!-- Populated dynamically -->
        </div>
      </div>
    `;

    // Populate arrays
    if (existingData) {
      document.getElementById('form-scenario-id').value = s.id;
      techOutcomes.forEach(o => this.addTechOutcomeRow(o.outcome, o.mapping));
      nonTechOutcomes.forEach(o => this.addNonTechOutcomeRow(o.outcome, o.mapping));
      handovers.forEach(h => this.addSbarRow(h.role, h.situation, h.background, h.assessment, h.recommendation));
      facilitators.forEach(f => this.addFacilitatorRow(f.role, f.responsibilities, f.required));
      SPs.forEach(sp => this.addActorRow(sp.role, sp.purpose, sp.script));
      equipment.forEach(e => this.addEquipmentRow(e.category, e.item, e.qty));
      medications.forEach(m => this.addMedicationRow(m.drug, m.route, m.strength, m.notes));
      progression.forEach(p => this.addPhaseRow(p));
      versionHistory.forEach(v => this.addVersionRow(v.version, v.date, v.author, v.change));
    } else {
      document.getElementById('form-scenario-id').value = '';
      // Seed initial blank repeaters for a better starting view
      this.addTechOutcomeRow();
      this.addNonTechOutcomeRow();
      this.addSbarRow('Lead Clinician / FY1');
      this.addFacilitatorRow('Session Director');
      this.addEquipmentRow();
      this.addPhaseRow();
      this.addVersionRow('1.0', new Date().toLocaleDateString('en-GB'), api.user?.name || 'Author', 'Initial version');
    }

    this.switchEditorTab('tab-general');
  },

  editScenarioForm(id) {
    api.getScenario(id).then(scenario => {
      document.getElementById('editor-title').innerText = `Edit Scenario: ${scenario.title}`;
      this.buildScenarioWizardForm(scenario);
      app.navigate('scenario-form');
    }).catch(err => app.showToast(err.message, 'error'));
  },

  newScenarioForm() {
    document.getElementById('editor-title').innerText = 'Create New Simulation Scenario';
    this.buildScenarioWizardForm(null);
    app.navigate('scenario-form');
  },

  // Save / Submit form data
  async saveScenario() {
    const code = document.getElementById('form-code').value;
    const title = document.getElementById('form-title').value;
    
    if (!code || !title) {
      app.showToast('Scenario code and title are required!', 'error');
      this.switchEditorTab('tab-general');
      return;
    }

    const id = document.getElementById('form-scenario-id').value;

    // Pull Outcomes
    const technical = Array.from(document.querySelectorAll('#tech-outcomes-repeater .repeater-card')).map((row, idx) => ({
      id: idx + 1,
      outcome: row.querySelector('.tech-outcome-desc').value,
      mapping: row.querySelector('.tech-outcome-map').value
    }));

    const nonTechnical = Array.from(document.querySelectorAll('#nontech-outcomes-repeater .repeater-card')).map((row, idx) => ({
      id: idx + 1,
      outcome: row.querySelector('.nontech-outcome-desc').value,
      mapping: row.querySelector('.nontech-outcome-map').value
    }));

    // Pull SBAR Handover
    const handover = Array.from(document.querySelectorAll('#sbar-repeater .repeater-card')).map(row => ({
      role: row.querySelector('.sbar-role').value,
      situation: row.querySelector('.sbar-s').value,
      background: row.querySelector('.sbar-b').value,
      assessment: row.querySelector('.sbar-a').value,
      recommendation: row.querySelector('.sbar-r').value
    }));

    // Pull Faculty & setup
    const facilitators = Array.from(document.querySelectorAll('#facilitators-repeater .repeater-card')).map(row => ({
      role: row.querySelector('.fac-role').value,
      responsibilities: row.querySelector('.fac-resp').value,
      required: row.querySelector('.fac-req').value
    }));

    const inScenarioRoles = Array.from(document.querySelectorAll('#actors-repeater .repeater-card')).map(row => ({
      role: row.querySelector('.actor-role').value,
      purpose: row.querySelector('.actor-purpose').value,
      script: row.querySelector('.actor-script').value
    }));

    const equipment = Array.from(document.querySelectorAll('#equipment-repeater .repeater-card')).map(row => ({
      category: row.querySelector('.equip-cat').value,
      item: row.querySelector('.equip-item').value,
      qty: row.querySelector('.equip-qty').value
    }));

    const medications = Array.from(document.querySelectorAll('#medications-repeater .repeater-card')).map(row => ({
      drug: row.querySelector('.med-drug').value,
      route: row.querySelector('.med-route').value,
      strength: row.querySelector('.med-strength').value,
      notes: row.querySelector('.med-notes').value
    }));

    // Pull ASPiH
    const aspihMapping = Array.from(document.querySelectorAll('.aspih-cb')).map(cb => {
      const dom = cb.getAttribute('data-domain');
      // Fix: Querying standard class name and matching domain property in JS array iteration
      // This completely avoids DOMException syntax errors caused by parentheses in CSS attribute selectors
      const descInput = Array.from(document.querySelectorAll('.aspih-desc')).find(input => input.getAttribute('data-domain') === dom);
      return {
        domain: dom,
        coveredBy: descInput ? descInput.value : '',
        status: cb.checked
      };
    });

    // Pull Version History
    const versionHistory = Array.from(document.querySelectorAll('#history-repeater .repeater-card')).map(row => ({
      version: row.querySelector('.hist-ver').value,
      date: row.querySelector('.hist-date').value,
      author: row.querySelector('.hist-auth').value,
      change: row.querySelector('.hist-change').value
    }));

    // Pull Progression Phases
    const phases = Array.from(document.querySelectorAll('#phases-repeater > .repeater-card'));
    const progression = phases.map(card => {
      const phaseName = card.querySelector('.phase-name-input').value;
      const duration = card.querySelector('.phase-duration-input').value;
      const trigger = card.querySelector('.phase-trigger-input').value;

      const vitals = {
        hr: card.querySelector('.phase-vital-hr').value,
        rr: card.querySelector('.phase-vital-rr').value,
        spo2: card.querySelector('.phase-vital-spo2').value,
        bp: card.querySelector('.phase-vital-bp').value,
        temp: card.querySelector('.phase-vital-temp').value,
        gcs: card.querySelector('.phase-vital-gcs').value
      };

      const patientPresentation = {
        appearance: card.querySelector('.phase-pres-appearance').value,
        mood: card.querySelector('.phase-pres-mood').value,
        communication: card.querySelector('.phase-pres-comm').value,
        keyLines: card.querySelector('.phase-pres-lines').value
      };

      const investigations = Array.from(card.querySelectorAll('.phase-investigations-repeater > div')).map(row => ({
        name: row.querySelector('.inv-name').value,
        result: row.querySelector('.inv-result').value
      }));

      const expectedActions = Array.from(card.querySelectorAll('.phase-actions-repeater > div')).map(row => ({
        role: row.querySelector('.act-role').value,
        action: row.querySelector('.act-desc').value
      }));

      const cues = Array.from(card.querySelectorAll('.phase-cues-repeater > div')).map(row => ({
        condition: row.querySelector('.cue-cond').value,
        cue: row.querySelector('.cue-prompt').value
      }));

      return { phaseName, trigger, duration, vitals, patientPresentation, investigations, expectedActions, cues };
    });

    // Debrief data
    const p1Notes = document.getElementById('form-prebrief-checklist').value;
    const prebrief = {
      lead: document.getElementById('form-prebrief-lead').value,
      duration: parseInt(document.getElementById('form-prebrief-duration').value) || 10,
      notes: document.getElementById('form-prebrief-notes').value,
      checklist: p1Notes ? p1Notes.split('\n').filter(l => l.trim().length > 0) : []
    };

    const sumPointsNotes = document.getElementById('form-debrief-sum-points').value;
    const debrief = {
      reactions: {
        question: document.getElementById('form-debrief-reactions').value,
        duration: parseInt(document.getElementById('form-debrief-reactions-dur').value) || 3
      },
      description: {
        question: document.getElementById('form-debrief-desc').value,
        duration: parseInt(document.getElementById('form-debrief-desc-dur').value) || 3
      },
      analysis: Array.from(document.querySelectorAll('#debrief-analysis-repeater .repeater-card')).map(row => ({
        point: row.querySelector('.debrief-analysis-point').value,
        strategy: row.querySelector('.debrief-analysis-strategy').value,
        question: row.querySelector('.debrief-analysis-question').value
      })),
      summary: {
        question: document.getElementById('form-debrief-sum').value,
        points: sumPointsNotes ? sumPointsNotes.split('\n').filter(l => l.trim().length > 0) : [],
        duration: parseInt(document.getElementById('form-debrief-sum-dur').value) || 4
      }
    };

    // References
    const references = {
      guidelines: document.getElementById('form-ref-guidelines').value,
      evidenceBase: document.getElementById('form-ref-evidence').value,
      preLearning: document.getElementById('form-ref-prelearn').value,
      relatedScenarios: document.getElementById('form-ref-related').value
    };

    // Assemble final JSON scenario payload
    const payload = {
      id: id || `scenario_${Date.now()}`,
      code,
      title,
      version: document.getElementById('form-version').value,
      lastReviewed: document.getElementById('form-lastReviewed').value,
      nextReviewDue: document.getElementById('form-nextReviewDue').value,
      authors: document.getElementById('form-authors').value,
      clinicalReviewer: document.getElementById('form-clinicalReviewer').value,
      educationalReviewer: document.getElementById('form-educationalReviewer').value,
      basedOnRealCase: document.getElementById('form-basedOnRealCase').checked,
      realCaseNotes: document.getElementById('form-basedOnRealCase').checked ? document.getElementById('form-realCaseNotes').value : '',
      overview: {
        summary: document.getElementById('form-summary').value,
        targetLearners: document.getElementById('form-targetLearners').value,
        prerequisites: document.getElementById('form-prerequisites').value,
        modality: document.getElementById('form-modality').value,
        location: document.getElementById('form-location').value,
        duration: parseInt(document.getElementById('form-duration').value) || 15,
        debriefDuration: parseInt(document.getElementById('form-debriefDuration').value) || 30,
        totalSessionTime: parseInt(document.getElementById('form-totalSessionTime').value) || 60
      },
      learningOutcomes: { technical, nonTechnical },
      patientInfo: {
        demographics: {
          name: document.getElementById('form-patName').value,
          age: document.getElementById('form-patAge').value,
          sex: document.getElementById('form-patSex').value,
          weight: document.getElementById('form-patWeight').value,
          identifier: document.getElementById('form-patIdentifier').value
        },
        background: {
          presentingComplaint: document.getElementById('form-patPC').value,
          history: document.getElementById('form-patHistory').value,
          pastMedicalHistory: document.getElementById('form-patPMH').value,
          currentMedications: document.getElementById('form-patMeds').value,
          allergies: document.getElementById('form-patAllergies').value,
          socialHistory: document.getElementById('form-patSocial').value,
          ice: document.getElementById('form-patICE').value
        }
      },
      handover, faculty: { facilitators, inScenarioRoles },
      environment: {
        setup: {
          location: document.getElementById('form-setup-location').value,
          simulator: document.getElementById('form-setup-simulator').value,
          position: document.getElementById('form-setup-position').value,
          monitorSetup: document.getElementById('form-setup-monitor').value,
          vascularAccess: document.getElementById('form-setup-access').value,
          oxygenAtStart: document.getElementById('form-setup-oxygen').value,
          fluidsRunning: document.getElementById('form-setup-fluids').value,
          moulage: document.getElementById('form-setup-moulage').value
        },
        equipment, medications
      },
      progression, prebrief, debrief, aspihMapping, references, versionHistory
    };

    try {
      if (id) {
        await api.updateScenario(id, payload);
        app.showToast('Scenario updated successfully!', 'success');
      } else {
        await api.createScenario(payload);
        app.showToast('Scenario created successfully!', 'success');
      }
      
      await this.init(); // reload local lists
      this.viewScenarioDetail(payload.id); // go to details view
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },


  // --- 5. INTERACTIVE RUN SIMULATOR HUD ---
  
  async startRunHUD(id) {
    try {
      const scenario = await api.getScenario(id);
      this.runState.scenario = scenario;
      this.runState.activePhaseIndex = 0;
      this.runState.elapsedSeconds = 0;
      this.runState.timerRunning = false;
      this.runState.completedActions.clear();
      
      if (this.runState.timerInterval) clearInterval(this.runState.timerInterval);
      
      const hud = document.getElementById('run-hud-content');
      if (!hud) return;

      this.renderRunHUDStructure();
      app.navigate('run-hud');
      
      this.triggerPhase(0); // baseline
      this.startTimer();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  renderRunHUDStructure() {
    const hud = document.getElementById('run-hud-content');
    const s = this.runState.scenario;

    const handovers = s.handover || [];
    const SPs = s.faculty?.inScenarioRoles || [];
    const equipment = s.environment?.equipment || [];
    const medications = s.environment?.medications || [];

    hud.innerHTML = `
      <div class="hud-layout">
        <!-- 1. LEFT SIDEBAR PANEL (Timer, Phases timeline, rescue cues) -->
        <div class="glass-panel hud-panel">
          <div class="hud-header">
            <h3 style="color:var(--text-primary); font-size:1.1rem;"><i class="fa-solid fa-stopwatch"></i> Run Control</h3>
            <button class="btn btn-secondary" onclick="components.stopRun()" style="padding:4px 8px; font-size:0.75rem;">
              <i class="fa-solid fa-power-off"></i> Exit Run
            </button>
          </div>

          <div class="hud-scroll-content">
            <!-- Timer widget -->
            <div class="timer-container">
              <div class="timer-display" id="hud-stopwatch">00:00</div>
              <div class="timer-controls">
                <button class="timer-btn" id="hud-timer-toggle" onclick="components.toggleTimer()">
                  <i class="fa-solid fa-play" id="hud-timer-icon"></i>
                </button>
                <button class="timer-btn" onclick="components.resetTimer()">
                  <i class="fa-solid fa-rotate-left"></i>
                </button>
              </div>
            </div>

            <!-- Phases timeline navigation -->
            <h4 style="font-size:0.8rem; text-transform:uppercase; color:var(--text-secondary); margin-bottom:10px;">Simulation Progression</h4>
            <div class="phase-timeline" id="hud-phase-timeline">
              ${s.progression.map((p, index) => `
                <div class="phase-pill" id="hud-phase-${index}" onclick="components.triggerPhase(${index})">
                  <div>
                    <h4 style="font-weight:600; font-size:0.9rem;">${p.phaseName}</h4>
                    <span style="font-size:0.75rem; color:var(--text-muted);">Trigger: ${p.trigger}</span>
                  </div>
                  <i class="fa-solid fa-circle-check" style="color:var(--text-muted);" id="hud-phase-check-${index}"></i>
                </div>
              `).join('')}
            </div>

            <!-- SBAR Handover block -->
            <div style="margin-top:20px;">
              <h4 style="font-size:0.8rem; text-transform:uppercase; color:var(--text-secondary); margin-bottom:8px;">Learner Handover (SBAR)</h4>
              <div class="sbar-container">
                ${handovers.map((h, idx) => `
                  <div class="sbar-block">
                    <div style="display:flex; justify-content:space-between; margin-bottom:6px; cursor:pointer;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'">
                      <strong style="font-size:0.8rem; color:var(--accent-blue);"><i class="fa-solid fa-bullhorn"></i> Brief: ${h.role}</strong>
                      <i class="fa-solid fa-chevron-down" style="font-size:0.7rem; color:var(--text-muted);"></i>
                    </div>
                    <div style="display:none; font-size:0.8rem;">
                      <p><strong>S:</strong> ${h.situation}</p>
                      <p><strong>B:</strong> ${h.background}</p>
                      <p><strong>A:</strong> ${h.assessment}</p>
                      <p><strong>R:</strong> ${h.recommendation}</p>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>

        <!-- 2. CENTRAL PANEL (Virtual Patient Monitor HUD, Patient Presentation / dialogs) -->
        <div class="glass-panel hud-panel" style="padding: 20px;">
          <!-- Bedside Monitor -->
          <div class="monitor-panel">
            <div class="monitor-header">
              <span>BEDSIDE PATIENT MONITOR</span>
              <span>PATIENT: ${s.patientInfo?.demographics?.name || 'SAM PHILLIPS'}</span>
            </div>
            
            <div class="monitor-grid">
              <!-- HR -->
              <div class="vital-box vital-hr">
                <span class="vital-label">ECG</span>
                <span class="vital-value" id="monitor-hr">--</span>
                <span class="vital-unit">bpm</span>
                <canvas id="heart-pulse-wave" width="80" height="30" style="position:absolute; right:10px; opacity:0.3; pointer-events:none;"></canvas>
              </div>
              
              <!-- SpO2 -->
              <div class="vital-box vital-spo2">
                <span class="vital-label">SpO₂</span>
                <span class="vital-value" id="monitor-spo2">--</span>
                <span class="vital-unit">%</span>
              </div>
              
              <!-- RR -->
              <div class="vital-box vital-rr">
                <span class="vital-label">RESP</span>
                <span class="vital-value" id="monitor-rr">--</span>
                <span class="vital-unit">/min</span>
              </div>
              
              <!-- BP -->
              <div class="vital-box vital-bp">
                <span class="vital-label">NIBP</span>
                <span class="vital-value" id="monitor-bp">--/--</span>
                <span class="vital-unit">mmHg</span>
              </div>
              
              <!-- Temp -->
              <div class="vital-box vital-temp">
                <span class="vital-label">TEMP</span>
                <span class="vital-value" id="monitor-temp">--.-</span>
                <span class="vital-unit">°C</span>
              </div>
              
              <!-- GCS -->
              <div class="vital-box vital-gcs">
                <span class="vital-label">GCS</span>
                <span class="vital-value" id="monitor-gcs">--</span>
                <span class="vital-unit">AVPU</span>
              </div>
            </div>
          </div>

          <!-- Active Presentation dialogue HUD -->
          <div class="hud-scroll-content">
            <div class="glass-card" style="border-left:4px solid var(--accent-blue); background:rgba(59, 130, 246, 0.03); margin-bottom:16px;">
              <h4 style="font-size:0.85rem; color:var(--accent-blue); margin-bottom:6px;"><i class="fa-solid fa-hospital-user"></i> Patient Status & Body Language</h4>
              <p style="font-size:0.9rem;" id="hud-patient-appearance">Appearance loader...</p>
              <p style="font-size:0.85rem; color:var(--text-secondary); margin-top:4px;" id="hud-patient-mood">Mood loader...</p>
            </div>

            <!-- Dialogue script box -->
            <div class="dialogue-card">
              <h4 style="font-size:0.85rem; color:var(--accent-amber); margin-bottom:6px;"><i class="fa-solid fa-message"></i> Scripted Dialogue / Patient Voice</h4>
              <p style="font-size:1.1rem; font-style:italic; font-weight:500;" id="hud-patient-dialogue">" Voice loader... "</p>
            </div>

            <!-- Cues and rescue prompts -->
            <div class="glass-card" style="border-left:4px solid var(--accent-amber); background:rgba(245, 158, 11, 0.02);">
              <h4 style="font-size:0.85rem; color:var(--accent-amber); margin-bottom:6px;"><i class="fa-solid fa-life-ring"></i> active Rescue Prompts (If learners stuck)</h4>
              <div id="hud-active-cues" style="font-size:0.85rem;">
                <!-- dynamic cues -->
              </div>
            </div>
          </div>
        </div>

        <!-- 3. RIGHT PANEL (Learner expected actions checklist & Environment setups) -->
        <div class="glass-panel hud-panel">
          <div class="hud-header">
            <h3 style="color:var(--accent-emerald); font-size:1.1rem;"><i class="fa-solid fa-list-check"></i> Expected Learner Actions</h3>
            <span class="badge badge-admin" id="hud-actions-percent">0%</span>
          </div>

          <!-- Actions Checklist -->
          <div class="hud-scroll-content">
            <div style="background:rgba(255,255,255,0.02); border-radius:var(--border-radius-sm); padding:12px; margin-bottom:20px; border:1px solid var(--glass-border);">
              <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-secondary); margin-bottom:4px;">
                <span>Completion Status</span>
                <span id="hud-actions-count">0 / 0</span>
              </div>
              <div style="height:6px; background:var(--bg-tertiary); border-radius:9999px; overflow:hidden;">
                <div style="width:0%; height:100%; background:var(--accent-emerald); transition:width var(--transition-fast);" id="hud-actions-bar"></div>
              </div>
            </div>

            <div id="hud-actions-list" style="margin-bottom:24px;">
              <!-- Dynamic check items -->
            </div>

            <div style="border-top:1px solid var(--glass-border); padding-top:16px; margin-top:16px;">
              <!-- Tabbed lists of Equipment / Medications -->
              <div style="display:flex; gap:6px; margin-bottom:12px;">
                <button class="btn btn-secondary" onclick="components.toggleHudRightList('hud-list-equip', this)" style="flex:1; padding:4px 8px; font-size:0.75rem;" class="active">Equipment</button>
                <button class="btn btn-secondary" onclick="components.toggleHudRightList('hud-list-meds', this)" style="flex:1; padding:4px 8px; font-size:0.75rem;">Meds</button>
                <button class="btn btn-secondary" onclick="components.toggleHudRightList('hud-list-confed', this)" style="flex:1; padding:4px 8px; font-size:0.75rem;">SP Scripts</button>
              </div>

              <div id="hud-list-equip" class="hud-right-tab-content" style="font-size:0.8rem; max-height:220px; overflow-y:auto;">
                ${equipment.map(e => `
                  <div style="display:flex; justify-content:space-between; padding:4px 8px; border-bottom:1px solid rgba(255,255,255,0.02);">
                    <span><i class="fa-solid fa-wrench"></i> ${e.item}</span>
                    <span style="color:var(--text-muted);">Qty: ${e.qty}</span>
                  </div>
                `).join('') || '<p style="color:var(--text-muted); padding:10px;">No equipment mapped.</p>'}
              </div>

              <div id="hud-list-meds" class="hud-right-tab-content" style="display:none; font-size:0.8rem; max-height:220px; overflow-y:auto;">
                ${medications.map(m => `
                  <div style="padding:6px; border-bottom:1px solid rgba(255,255,255,0.02);">
                    <strong style="color:var(--accent-blue);">${m.drug}</strong> - ${m.route} (${m.strength})
                    ${m.notes ? `<p style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">${m.notes}</p>` : ''}
                  </div>
                `).join('') || '<p style="color:var(--text-muted); padding:10px;">No meds mapped.</p>'}
              </div>

              <div id="hud-list-confed" class="hud-right-tab-content" style="display:none; font-size:0.8rem; max-height:220px; overflow-y:auto;">
                ${SPs.map(sp => `
                  <div style="padding:6px; border-bottom:1px solid rgba(255,255,255,0.02);">
                    <strong style="color:var(--accent-amber);"><i class="fa-solid fa-theater-masks"></i> ${sp.role}</strong>
                    <p style="font-style:italic; font-size:0.75rem; margin-top:2px; color:var(--text-secondary);">${sp.script}</p>
                  </div>
                `).join('') || '<p style="color:var(--text-muted); padding:10px;">No simulated actors.</p>'}
              </div>

            </div>
          </div>
          
          <button class="btn btn-emerald" onclick="components.transitionToDebrief()" style="width:100%; padding:14px 20px; margin-top:10px; font-size:1rem; box-shadow: 0 0 15px var(--accent-emerald-glow);">
            <i class="fa-solid fa-graduation-cap"></i> End Run & Go to Debrief
          </button>
        </div>
      </div>
    `;

    // Start a subtle monitor pulse wave drawing
    this.drawMonitorPulse();
  },

  toggleHudRightList(id, btn) {
    document.querySelectorAll('.hud-right-tab-content').forEach(el => el.style.display = 'none');
    document.getElementById(id).style.display = 'block';
  },

  drawMonitorPulse() {
    const canvas = document.getElementById('heart-pulse-wave');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let x = 0;
    
    const animate = () => {
      if (!document.getElementById('heart-pulse-wave')) return; // exited HUD
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      
      const hr = parseInt(document.getElementById('monitor-hr')?.innerText) || 75;
      const freq = (hr / 60) * 0.05;
      
      const y = (canvas.height / 2) + Math.sin(x * freq) * (Math.random() > 0.85 ? 12 : 1) * Math.sin(x * 0.2);
      ctx.lineTo(x % canvas.width, y);
      ctx.stroke();
      
      x += 2;
      requestAnimationFrame(animate);
    };
    animate();
  },

  triggerPhase(idx) {
    this.runState.activePhaseIndex = idx;
    const s = this.runState.scenario;
    const p = s.progression[idx];
    if (!p) return;

    // Toggle active phase classes
    s.progression.forEach((_, index) => {
      const pill = document.getElementById(`hud-phase-${index}`);
      const check = document.getElementById(`hud-phase-check-${index}`);
      if (pill) {
        if (index === idx) {
          pill.className = 'phase-pill active';
          check.style.color = 'var(--accent-blue)';
        } else if (index < idx) {
          pill.className = 'phase-pill completed';
          check.style.color = 'var(--accent-emerald)';
        } else {
          pill.className = 'phase-pill';
          check.style.color = 'var(--text-muted)';
        }
      }
    });

    // Update Vitals Monitor values
    document.getElementById('monitor-hr').innerText = p.vitals?.hr || '--';
    document.getElementById('monitor-rr').innerText = p.vitals?.rr || '--';
    const spo2 = p.vitals?.spo2 ? p.vitals.spo2 : '--';
    document.getElementById('monitor-spo2').innerText = spo2;
    document.getElementById('monitor-bp').innerText = p.vitals?.bp || '--/--';
    document.getElementById('monitor-temp').innerText = p.vitals?.temp || '--.-';
    document.getElementById('monitor-gcs').innerText = p.vitals?.gcs || '--';

    // Update Patient Status Details
    document.getElementById('hud-patient-appearance').innerText = p.patientPresentation?.appearance || 'Normal appearance.';
    document.getElementById('hud-patient-mood').innerText = `Mood: ${p.patientPresentation?.mood || 'Calm'}. Comm style: ${p.patientPresentation?.communication || 'Responsive'}.`;
    
    // Update Dialogue text
    document.getElementById('hud-patient-dialogue').innerText = p.patientPresentation?.keyLines ? `"${p.patientPresentation.keyLines}"` : '"No dialogues recorded."';

    // Load dynamic Cues
    const cuesList = document.getElementById('hud-active-cues');
    if (cuesList) {
      if (p.cues && p.cues.length > 0) {
        cuesList.innerHTML = p.cues.map(c => `
          <div style="margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.01); padding-bottom:6px;">
            <span style="color:var(--text-muted);">IF: </span><strong style="color:var(--text-primary); font-weight:500;">${c.condition}</strong>
            <p style="color:var(--accent-amber); font-style:italic; margin-top:2px; font-size:0.8rem;">👉 Prompt: ${c.cue}</p>
          </div>
        `).join('');
      } else {
        cuesList.innerHTML = '<p style="color:var(--text-muted); font-style:italic;">No active rescue prompts recorded for this phase.</p>';
      }
    }

    // Refresh Expected Actions checklist
    this.renderExpectedActions();
  },

  renderExpectedActions() {
    const list = document.getElementById('hud-actions-list');
    const s = this.runState.scenario;
    if (!list) return;

    // Get all actions across ALL phases
    let allActions = [];
    s.progression.forEach((phase, pIdx) => {
      (phase.expectedActions || []).forEach((act, aIdx) => {
        allActions.push({
          id: `act_${pIdx}_${aIdx}`,
          phaseName: phase.phaseName,
          role: act.role,
          action: act.action
        });
      });
    });

    const total = allActions.length;
    const completed = Array.from(this.runState.completedActions).filter(id => allActions.find(a => a.id === id)).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Update progress numbers
    document.getElementById('hud-actions-percent').innerText = `${percent}%`;
    document.getElementById('hud-actions-count').innerText = `${completed} / ${total}`;
    document.getElementById('hud-actions-bar').style.width = `${percent}%`;

    // Render list
    list.innerHTML = allActions.map(a => {
      const isChecked = this.runState.completedActions.has(a.id);
      return `
        <div class="action-item ${isChecked ? 'checked' : ''}" onclick="components.toggleExpectedAction('${a.id}')">
          <div class="action-checkbox"><i class="fa-solid fa-check"></i></div>
          <div style="flex:1;">
            <span style="font-size:0.85rem; font-weight:500;"><strong>${a.role}:</strong> ${a.action}</span>
            <div style="font-size:0.7rem; color:var(--text-muted); margin-top:1px;">Phase: ${a.phaseName}</div>
          </div>
        </div>
      `;
    }).join('');
  },

  toggleExpectedAction(id) {
    if (this.runState.completedActions.has(id)) {
      this.runState.completedActions.delete(id);
    } else {
      this.runState.completedActions.add(id);
      app.showToast('Action marked as completed.', 'success');
    }
    this.renderExpectedActions();
  },

  // Stopwatch Logic
  startTimer() {
    if (this.runState.timerRunning) return;
    this.runState.timerRunning = true;
    
    document.getElementById('hud-timer-icon').className = 'fa-solid fa-pause';
    document.getElementById('hud-timer-toggle').classList.add('active');

    this.runState.timerInterval = setInterval(() => {
      this.runState.elapsedSeconds++;
      this.updateTimerDisplay();
    }, 1000);
  },

  pauseTimer() {
    this.runState.timerRunning = false;
    document.getElementById('hud-timer-icon').className = 'fa-solid fa-play';
    document.getElementById('hud-timer-toggle').classList.remove('active');
    clearInterval(this.runState.timerInterval);
  },

  toggleTimer() {
    if (this.runState.timerRunning) {
      this.pauseTimer();
    } else {
      this.startTimer();
    }
  },

  resetTimer() {
    this.pauseTimer();
    this.runState.elapsedSeconds = 0;
    this.updateTimerDisplay();
  },

  updateTimerDisplay() {
    const mins = Math.floor(this.runState.elapsedSeconds / 60);
    const secs = this.runState.elapsedSeconds % 60;
    const display = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    const el = document.getElementById('hud-stopwatch');
    if (el) el.innerText = display;
  },

  stopRun() {
    if (confirm('Exit simulation run and return to Library? Current run timers and checklists will be cleared.')) {
      this.pauseTimer();
      app.navigate('dashboard');
    }
  },


  // --- 6. INTERACTIVE PEARLS DEBRIEF PLAN VIEWER ---
  
  transitionToDebrief() {
    this.pauseTimer(); // Stop scenario run timer
    
    const s = this.runState.scenario || this.allScenarios[0];
    this.debriefState.scenario = s;
    this.debriefState.currentStep = 'reactions';
    this.debriefState.elapsedSeconds = 0;
    this.debriefState.timerRunning = false;
    
    if (this.debriefState.timerInterval) clearInterval(this.debriefState.timerInterval);

    const container = document.getElementById('debrief-content');
    if (!container) return;

    this.renderDebriefStructure();
    app.navigate('debrief');
    this.switchDebriefStep('reactions');
    this.startDebriefTimer();
  },

  renderDebriefStructure() {
    const container = document.getElementById('debrief-content');
    const s = this.debriefState.scenario;

    const analysisPoints = s.debrief?.analysis || [];
    const summaryPoints = s.debrief?.summary?.points || [];

    container.innerHTML = `
      <div class="flex-between m-b-20" style="border-bottom: 1px solid var(--glass-border); padding-bottom:16px;">
        <div>
          <h2 style="font-size:1.6rem; font-weight:600;"><i class="fa-solid fa-comments"></i> Live Debrief Coordinator (PEARLS)</h2>
          <p style="color:var(--text-secondary); font-size:0.85rem;">Active Scenario: <strong>${s.code} - ${s.title}</strong></p>
        </div>
        <div style="display:flex; align-items:center; gap:16px;">
          <!-- Timer -->
          <div style="display:flex; align-items:center; gap:10px; background:rgba(0,0,0,0.1); border-radius:var(--border-radius-sm); padding:6px 14px; border:1px solid var(--glass-border);">
            <span style="font-size:0.75rem; color:var(--text-secondary); text-transform:uppercase; font-weight:bold;">Debrief Time:</span>
            <span id="debrief-stopwatch" style="font-family:var(--font-mono); font-size:1.3rem; font-weight:700; color:var(--accent-purple);">00:00</span>
          </div>
          <button class="btn btn-secondary" onclick="components.stopDebrief()" style="padding:10px 16px;">
            <i class="fa-solid fa-circle-check"></i> Complete Debrief
          </button>
        </div>
      </div>

      <div class="debrief-layout">
        <!-- Sidebar steps -->
        <div>
          <ul class="debrief-menu">
            <li class="debrief-menu-item active" id="db-menu-reactions" onclick="components.switchDebriefStep('reactions')">
              <span class="debrief-num">1</span>
              <span>Reactions <span style="font-size:0.7rem; color:var(--text-muted); display:block;">Vent & emotions (${s.debrief?.reactions?.duration || 3}m)</span></span>
            </li>
            <li class="debrief-menu-item" id="db-menu-description" onclick="components.switchDebriefStep('description')">
              <span class="debrief-num">2</span>
              <span>Description <span style="font-size:0.7rem; color:var(--text-muted); display:block;">Clinical baseline (${s.debrief?.description?.duration || 3}m)</span></span>
            </li>
            <li class="debrief-menu-item" id="db-menu-analysis" onclick="components.switchDebriefStep('analysis')">
              <span class="debrief-num">3</span>
              <span>Analysis <span style="font-size:0.7rem; color:var(--text-muted); display:block;">Deep dive outcomes (20m)</span></span>
            </li>
            <li class="debrief-menu-item" id="db-menu-summary" onclick="components.switchDebriefStep('summary')">
              <span class="debrief-num">4</span>
              <span>Summary <span style="font-size:0.7rem; color:var(--text-muted); display:block;"> takeaway points (${s.debrief?.summary?.duration || 4}m)</span></span>
            </li>
          </ul>
        </div>

        <!-- Central step content -->
        <div class="glass-panel" style="overflow-y:auto; height: 100%;">
          <!-- REACTIONS -->
          <div class="debrief-step active" id="db-step-reactions">
            <div class="debrief-guidance">
              <h4>Reactions Phase Guidelines (ASPiH 2023 / PEARLS)</h4>
              <p>Allow the learners to vent their immediate emotions. Do not lecture or correct clinical errors yet. Just listen, clarify, and establish psychological safety.</p>
            </div>
            
            <h3 style="margin-bottom:12px; color:var(--text-primary); font-size:1.3rem;">Opening Question:</h3>
            <div class="dialogue-card" style="border-left-color: var(--accent-purple); background:rgba(139, 92, 246, 0.03); padding:20px;">
              <p style="font-size:1.25rem; font-style:italic; font-weight:500;">
                "${s.debrief?.reactions?.question || 'How are you feeling? Tell us what that was like.'}"
              </p>
            </div>

            <div style="margin-top:24px;">
              <h5 style="color:var(--text-secondary); margin-bottom:8px;">Facilitator Observation Prompts:</h5>
              <ul style="padding-left:20px; font-size:0.9rem; color:var(--text-secondary);">
                <li>Is there any immediate panic or high anxiety?</li>
                <li>Ensure all participants (including confederates playing bedside staff) have transitioned out of their roles.</li>
                <li>Let everyone speak, validate their feelings before moving to the cognitive analysis.</li>
              </ul>
            </div>
          </div>

          <!-- DESCRIPTION -->
          <div class="debrief-step" id="db-step-description">
            <div class="debrief-guidance">
              <h4>Description Phase Guidelines</h4>
              <p>Build a shared clinical understanding of the patient's presentation, progression, and final status. Keep it brief—avoid a full blow-by-blow description.</p>
            </div>

            <h3 style="margin-bottom:12px; color:var(--text-primary); font-size:1.3rem;">Suggested Framing Question:</h3>
            <div class="dialogue-card" style="border-left-color: var(--accent-purple); background:rgba(139, 92, 246, 0.03); padding:20px;">
              <p style="font-size:1.25rem; font-style:italic; font-weight:500;">
                "${s.debrief?.description?.question || 'Can someone summarise the clinical case and the main challenges you faced?'}"
              </p>
            </div>

            <div style="margin-top:24px;">
              <h5 style="color:var(--text-secondary); margin-bottom:8px;">Goal of this Phase:</h5>
              <p style="font-size:0.9rem; color:var(--text-secondary);">Ensure the students actually understand the diagnoses (e.g. Sam had a suspected Pulmonary Embolism). Resolving factual differences now prevents confusion during the analysis.</p>
            </div>
          </div>

          <!-- ANALYSIS -->
          <div class="debrief-step" id="db-step-analysis">
            <div class="debrief-guidance">
              <h4>Analysis Phase Guidelines (Blended PEARLS)</h4>
              <p>Match the debriefing strategy to the topic. Use <strong>Advocacy-Inquiry</strong> to discover the learners' cognitive frames. Use <strong>Directive Feedback</strong> to fill knowledge gaps. Use <strong>Plus-Delta</strong> for team performance.</p>
            </div>

            <h3 style="margin-bottom:16px; color:var(--text-primary); font-size:1.3rem;">Learning Point Deep Dives</h3>
            
            <div style="display:flex; flex-direction:column; gap:20px;">
              ${analysisPoints.map((ap, idx) => `
                <div class="glass-card" style="border-top:3px solid var(--accent-purple);">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <h4 style="color:var(--text-primary); font-size:1rem;">Point ${idx+1}: ${ap.point}</h4>
                    <span class="badge badge-readonly" style="font-size:0.65rem;">Strategy: ${ap.strategy}</span>
                  </div>
                  
                  <div style="font-style:italic; border-left:3px solid var(--accent-purple); padding-left:12px; font-size:1rem; margin-bottom:10px; color:var(--text-primary);">
                    "${ap.question}"
                  </div>

                  <p style="font-size:0.8rem; color:var(--text-muted);">
                    ${ap.strategy === 'Advocacy-Inquiry' ? '💡 Frame-seeking strategy: Share your concrete observation (I noticed X), state your concern/advocacy, and query their rationale.' : ''}
                    ${ap.strategy === 'Plus-Delta' ? '💡 Action-focused strategy: What went well? What could we improve or do differently next time?' : ''}
                    ${ap.strategy === 'Directive Feedback' ? '💡 Review guidelines: Address clinical details directly (e.g. correct doses, guidelines).' : ''}
                  </p>
                </div>
              `).join('') || '<p style="color:var(--text-muted); font-style:italic;">No analysis guidelines recorded for this scenario.</p>'}
            </div>
          </div>

          <!-- SUMMARY -->
          <div class="debrief-step" id="db-step-summary">
            <div class="debrief-guidance">
              <h4>Summary Phase Guidelines</h4>
              <p>Lock in the learning points. Ensure takeaways are generated by the learners themselves rather than lecturing them. Highlight key administrative take-home messages.</p>
            </div>

            <h3 style="margin-bottom:12px; color:var(--text-primary); font-size:1.3rem;">Closing Question:</h3>
            <div class="dialogue-card" style="border-left-color: var(--accent-purple); background:rgba(139, 92, 246, 0.03); padding:20px;">
              <p style="font-size:1.25rem; font-style:italic; font-weight:500;">
                "${s.debrief?.summary?.question || 'What are the take-home points you are taking away from this session?'}"
              </p>
            </div>

            <h4 style="margin-bottom:10px; color:var(--text-secondary); margin-top:24px;">Core Take-Home Messages:</h4>
            <ul class="outcome-list">
              ${summaryPoints.map(p => `
                <li class="outcome-item" style="border-bottom:none; display:flex; gap:10px; align-items:center;">
                  <i class="fa-solid fa-graduation-cap" style="color:var(--accent-purple);"></i>
                  <span>${p}</span>
                </li>
              `).join('') || '<p>None listed.</p>'}
            </ul>
          </div>
        </div>
      </div>
    `;
  },

  switchDebriefStep(stepId) {
    this.debriefState.currentStep = stepId;

    // Toggle menu active classes
    ['reactions', 'description', 'analysis', 'summary'].forEach(id => {
      const el = document.getElementById(`db-menu-${id}`);
      const stepPanel = document.getElementById(`db-step-${id}`);
      if (el) {
        if (id === stepId) {
          el.className = 'debrief-menu-item active';
        } else {
          el.className = 'debrief-menu-item';
        }
      }
      if (stepPanel) {
        if (id === stepId) {
          stepPanel.style.display = 'block';
        } else {
          stepPanel.style.display = 'none';
        }
      }
    });
  },

  startDebriefTimer() {
    this.debriefState.timerRunning = true;
    this.debriefState.timerInterval = setInterval(() => {
      this.debriefState.elapsedSeconds++;
      this.updateDebriefTimerDisplay();
    }, 1000);
  },

  updateDebriefTimerDisplay() {
    const mins = Math.floor(this.debriefState.elapsedSeconds / 60);
    const secs = this.debriefState.elapsedSeconds % 60;
    const display = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    const el = document.getElementById('debrief-stopwatch');
    if (el) el.innerText = display;
  },

  stopDebrief() {
    if (confirm('Debrief completed successfully. Return to Dashboard?')) {
      clearInterval(this.debriefState.timerInterval);
      app.showToast('Clinical debrief log compiled and saved.', 'success');
      app.navigate('dashboard');
    }
  },

  // --- 10. USER ADMINISTRATION LIFECYCLE ---

  async renderAdminUsersView() {
    const grid = document.getElementById('admin-users-grid');
    if (!grid) return;

    try {
      const users = await api.getUsers();
      
      grid.innerHTML = users.map(u => {
        const isSelf = u.email.toLowerCase() === api.user.email.toLowerCase();
        const roleBadgeClass = u.role === 'Admin' ? 'badge badge-admin' : 'badge badge-readonly';
        
        return `
          <div class="glass-panel scenario-card" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div class="scenario-card-header">
                <span class="scenario-code" style="font-size: 0.75rem;">${u.email}</span>
                <span class="${roleBadgeClass}" style="font-size: 0.65rem;">
                  ${u.role}
                </span>
              </div>
              <div style="display: flex; align-items: center; gap: 16px; margin: 15px 0;">
                <div style="background: linear-gradient(135deg, var(--accent-blue), var(--accent-purple)); width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.25rem; font-weight: 700; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.2);">
                  ${u.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 style="margin: 0; font-size: 1.2rem; font-weight: 600;">${u.name} ${isSelf ? '<span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">(You)</span>' : ''}</h3>
                  <p style="color: var(--text-secondary); font-size: 0.85rem; margin-top: 2px;">Faculty Account</p>
                </div>
              </div>
            </div>
            
            <div>
              <div class="scenario-meta-row" style="border-top: 1px solid var(--glass-border); padding-top: 12px; margin-bottom: 16px; font-size: 0.8rem; color: var(--text-muted);">
                <div class="scenario-meta-item">
                  <i class="fa-solid fa-key"></i> Pass: <code>••••••••</code>
                </div>
                <div class="scenario-meta-item">
                  <i class="fa-solid fa-shield-halved"></i> Permissions: <strong>${u.role === 'Admin' ? 'Read/Write' : 'Read-Only'}</strong>
                </div>
              </div>
              
              <div class="scenario-actions">
                <button class="btn btn-secondary" onclick="components.openUserModal('${u.email}')" style="flex: 1; padding: 8px;">
                  <i class="fa-solid fa-pen-to-square"></i> Edit
                </button>
                <button class="btn btn-danger" onclick="components.deleteUser('${u.email}')" ${isSelf ? 'disabled' : ''} style="padding: 8px 12px;" title="${isSelf ? 'You cannot delete yourself.' : ''}">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      app.showToast('Failed to load users: ' + err.message, 'error');
    }
  },

  async openUserModal(userEmail = null) {
    const modal = document.getElementById('modal-container');
    const modalContent = document.getElementById('modal-card');
    if (!modal || !modalContent) return;

    let existing = null;
    if (userEmail) {
      try {
        const users = await api.getUsers();
        existing = users.find(u => u.email.toLowerCase() === userEmail.toLowerCase());
      } catch (err) {
        app.showToast(err.message, 'error');
        return;
      }
    }

    const isSelf = existing && existing.email.toLowerCase() === api.user.email.toLowerCase();

    modalContent.innerHTML = `
      <div class="flex-between m-b-20" style="margin-bottom: 20px;">
        <h3 style="font-size:1.3rem; color: var(--accent-blue);">
          <i class="fa-solid fa-user-gear"></i> ${existing ? 'Edit Faculty User' : 'Add New Faculty User'}
        </h3>
        <button onclick="components.closeModal()" style="background:transparent; border:none; color:var(--text-secondary); cursor:pointer; font-size:1.2rem;">
          <i class="fa-solid fa-xmark"></i>
        </button>
      </div>

      <form id="user-modal-form" onsubmit="components.saveUser(event, ${existing ? `'${existing.email}'` : 'null'})">
        <div class="form-group">
          <label for="user-email">Faculty Email Address</label>
          <input type="text" id="user-email" required value="${existing ? existing.email : ''}" ${existing ? 'disabled' : ''} placeholder="e.g. nurse.smith@simhub.local">
        </div>
        <div class="form-group">
          <label for="user-name">Full Name</label>
          <input type="text" id="user-name" required value="${existing ? existing.name : ''}" placeholder="e.g. Dr. Jane Smith">
        </div>
        <div class="form-group">
          <label for="user-password">Access Password</label>
          <input type="text" id="user-password" required value="${existing ? existing.password : ''}" placeholder="Enter robust access password">
        </div>
        <div class="form-group">
          <label for="user-role">System Permission Level</label>
          <select id="user-role" required ${isSelf ? 'disabled' : ''}>
            <option value="Admin" ${existing && existing.role === 'Admin' ? 'selected' : ''}>Admin (Full Read/Write Access)</option>
            <option value="Read-Only" ${existing && existing.role === 'Read-Only' ? 'selected' : ''}>Read-Only (Faculty Access)</option>
          </select>
          ${isSelf ? '<p style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;"><i class="fa-solid fa-triangle-exclamation"></i> You cannot change your own role to avoid self-lockout.</p>' : ''}
        </div>
        
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:24px;">
          <button type="button" class="btn btn-secondary" onclick="components.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-emerald">
            <i class="fa-solid fa-floppy-disk"></i> Save Faculty
          </button>
        </div>
      </form>
    `;

    modal.style.display = 'flex';
  },

  async saveUser(e, existingEmail) {
    e.preventDefault();
    const name = document.getElementById('user-name').value;
    const password = document.getElementById('user-password').value;
    const roleSelect = document.getElementById('user-role');
    const role = roleSelect.value;
    
    try {
      if (existingEmail) {
        await api.updateUser(existingEmail, { name, password, role });
        app.showToast('Faculty user updated successfully.', 'success');
        
        if (existingEmail.toLowerCase() === api.user.email.toLowerCase()) {
          api.user.name = name;
          localStorage.setItem('simhub_user', JSON.stringify(api.user));
          document.getElementById('user-display-name').innerText = name;
        }
      } else {
        const email = document.getElementById('user-email').value;
        await api.createUser({ email, name, password, role });
        app.showToast('New faculty user created successfully.', 'success');
      }
      
      this.closeModal();
      this.renderAdminUsersView();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async deleteUser(email) {
    if (email.toLowerCase() === api.user.email.toLowerCase()) {
      app.showToast('Self-deletion is blocked to prevent system lockout.', 'error');
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete faculty account: ${email}?`)) return;

    try {
      await api.deleteUser(email);
      app.showToast('Faculty user deleted successfully.', 'success');
      this.renderAdminUsersView();
    } catch (err) {
      app.showToast(err.message, 'error');
    }
  },

  async exportScenarioToPDF(scenarioId) {
    const element = document.getElementById('scenario-detail-content');
    if (!element) return;
    
    app.showToast('Generating clinical PDF report...', 'success');
    
    // Create a deep clone of the content to render off-screen with high-contrast print overrides
    const clone = element.cloneNode(true);
    
    // Create print container
    const printWrapper = document.createElement('div');
    printWrapper.className = 'pdf-print-wrapper';
    printWrapper.appendChild(clone);
    
    // Position off-screen so the browser renders it but it is invisible to the user
    printWrapper.style.position = 'absolute';
    printWrapper.style.left = '-9999px';
    printWrapper.style.top = '0';
    printWrapper.style.width = '800px'; // fixed page boundary for pristine rendering proportions
    document.body.appendChild(printWrapper);
    
    // Configure pdf options
    const opt = {
      margin:       [12, 15, 12, 15],
      filename:     `SimHub_Scenario_${scenarioId}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, logging: false, useCORS: true, letterRendering: true },
      jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    try {
      // Execute capture & save
      await html2pdf().set(opt).from(printWrapper).save();
      app.showToast('Clinical PDF scenario exported successfully!', 'success');
    } catch (err) {
      console.error('PDF export error:', err);
      app.showToast('Failed to export PDF: ' + err.message, 'error');
    } finally {
      // Tear down the off-screen renderer
      document.body.removeChild(printWrapper);
    }
  }
};
