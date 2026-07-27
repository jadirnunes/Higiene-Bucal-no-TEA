(() => {
  const COURSE_CONFIG = {
    storageKey: 'curso_scorm12_state',
    defaultLaunchPage: 'modulos/apresentacao.html',
    completionPage: 'modulos/encerramento_tela3.html',
    moduleKeys: ['modulo1','modulo2','modulo3','modulo4','modulo5','modulo6','modulo7','modulo8'],
    screenTotals: {
      apresentacao: 5,
      modulo1: 7,
      modulo2: 9,
      modulo3: 5,
      modulo4: 6,
      modulo5: 18,
      modulo6: 6,
      modulo7: 6,
      modulo8: 4,
      encerramento: 3
    }
  };

  const sidebar = document.getElementById('sidebar');
  const toggle = document.getElementById('sidebarToggle');
  const progressBar = document.getElementById('progressBar');
  const progressLabel = document.getElementById('progressLabel');
  const router = window.CourseRouter || null;
  const normalizePath = window.CourseUtils?.normalizePath || (path => {
    if(!path) return 'index.html';
    const cleanPath = String(path).replace(/\\/g, '/').split('?')[0].split('#')[0];
    if(/(^|\/)modulos\//i.test(cleanPath)){
      return `modulos/${cleanPath.split(/modulos\//i).pop()}`;
    }
    if(/(^|\/)pages\//i.test(cleanPath)){
      return `pages/${cleanPath.split(/pages\//i).pop()}`;
    }
    const lastPart = cleanPath.split('/').pop();
    return lastPart || 'index.html';
  });

  function getCurrentRelativePath(){
    if(router && typeof router.getCurrentRoute === 'function'){
      return router.getCurrentRoute();
    }
    return normalizePath(location.pathname || 'index.html');
  }

  function getCurrentFileName(){
    return (window.CourseUtils?.getFileName || (path => normalizePath(path).split('/').pop() || ''))(getCurrentRelativePath());
  }

  function findScormApi(win){
    let currentWindow = win;
    let attempts = 0;

    while(currentWindow && attempts < 20){
      try {
        if(currentWindow.API){
          return currentWindow.API;
        }
      } catch(error) {}

      if(!currentWindow.parent || currentWindow.parent === currentWindow){
        break;
      }

      currentWindow = currentWindow.parent;
      attempts += 1;
    }

    try {
      if(window.opener && window.opener !== window){
        return findScormApi(window.opener);
      }
    } catch(error) {}

    return null;
  }

  function createLocalFallback(){
    let finished = false;

    function loadStore(){
      try {
        return JSON.parse(localStorage.getItem(COURSE_CONFIG.storageKey) || '{}');
      } catch(error){
        return {};
      }
    }

    function saveStore(store){
      try {
        localStorage.setItem(COURSE_CONFIG.storageKey, JSON.stringify(store));
      } catch(error) {}
    }

    return {
      initialize(){
        return true;
      },
      getValue(key){
        if(finished){
          return '';
        }
        const store = loadStore();
        return store[key] || '';
      },
      setValue(key, value){
        if(finished){
          return false;
        }
        const store = loadStore();
        store[key] = String(value);
        saveStore(store);
        return true;
      },
      commit(){
        if(finished){
          return false;
        }
        return true;
      },
      finish(){
        finished = true;
        return true;
      },
      isFinished(){
        return finished;
      },
      isFallback: true
    };
  }

  function createScormDriver(){
    const api = findScormApi(window);
    if(!api){
      return createLocalFallback();
    }

    let initialized = false;
    let finished = false;

    function isSuccess(result){
      return result === true || result === 'true' || result === '1';
    }

    return {
      initialize(){
        if(initialized){
          return true;
        }

        try {
          initialized = isSuccess(api.LMSInitialize(''));
        } catch(error){
          initialized = false;
        }

        return initialized;
      },
      getValue(key){
        if(!initialized || finished){
          return '';
        }

        try {
          return api.LMSGetValue(key) || '';
        } catch(error){
          return '';
        }
      },
      setValue(key, value){
        if(!initialized || finished){
          return false;
        }

        try {
          return isSuccess(api.LMSSetValue(key, String(value)));
        } catch(error){
          return false;
        }
      },
      commit(){
        if(!initialized || finished){
          return false;
        }

        try {
          return isSuccess(api.LMSCommit(''));
        } catch(error){
          return false;
        }
      },
      finish(){
        if(!initialized || finished){
          return false;
        }

        try {
          api.LMSFinish('');
          finished = true;
          return true;
        } catch(error){
          return false;
        }
      },
      isFinished(){
        return finished;
      },
      isFallback: false
    };
  }

  function getDefaultState(){
    return {
      version: 1,
      lastLocation: '',
      overallPercent: 0,
      moduleProgress: {},
      completedModules: {},
      objectiveIndexMap: {}
    };
  }

  function getSessionContext(scorm){
    if(scorm.isFallback){
      return {
        lessonMode: 'normal',
        entry: 'resume',
        canPersist: true,
        shouldResume: true
      };
    }

    const lessonMode = (scorm.getValue('cmi.core.lesson_mode') || 'normal').toLowerCase();
    const entry = (scorm.getValue('cmi.core.entry') || '').toLowerCase();

    return {
      lessonMode,
      entry,
      canPersist: lessonMode === 'normal',
      shouldResume: lessonMode === 'normal' && entry === 'resume'
    };
  }

  function loadTrackingState(scorm, sessionContext){
    const state = getDefaultState();
    const shouldRestoreProgress = Boolean(scorm.isFallback || sessionContext.shouldResume);
    const suspendData = shouldRestoreProgress ? scorm.getValue('cmi.suspend_data') : '';

    if(suspendData){
      try {
        Object.assign(state, JSON.parse(suspendData));
      } catch(error) {}
    }

    const lessonLocation = shouldRestoreProgress ? normalizePath(scorm.getValue('cmi.core.lesson_location')) : '';
    if(lessonLocation){
      state.lastLocation = lessonLocation;
    }

    if(!state.moduleProgress || typeof state.moduleProgress !== 'object'){
      state.moduleProgress = {};
    }

    if(!state.completedModules || typeof state.completedModules !== 'object'){
      state.completedModules = {};
    }

    if(!state.objectiveIndexMap || typeof state.objectiveIndexMap !== 'object'){
      state.objectiveIndexMap = {};
    }

    return state;
  }

  function getResumeLocation(state, sessionContext){
    const savedLocation = normalizePath(state.lastLocation);
    if((scorm.isFallback || sessionContext.shouldResume) && savedLocation && savedLocation !== 'index.html'){
      return savedLocation;
    }
    return COURSE_CONFIG.defaultLaunchPage;
  }

  function parsePageInfo(path){
    const fileName = normalizePath(path).split('/').pop() || '';
    let match = fileName.match(/^(apresentacao|encerramento)_tela(\d+)\.html$/i);

    if(match){
      const key = match[1].toLowerCase();
      return {
        key,
        screen: Number(match[2]),
        total: COURSE_CONFIG.screenTotals[key] || 0
      };
    }

    match = fileName.match(/^(modulo\d+)_tela(\d+)\.html$/i);
    if(match){
      const key = match[1].toLowerCase();
      return {
        key,
        screen: Number(match[2]),
        total: COURSE_CONFIG.screenTotals[key] || 0
      };
    }

    return null;
  }

  function getOverallPercent(){
    const step = Number(document.body?.dataset?.step || 0);
    const total = Number(document.body?.dataset?.total || 0);

    if(step > 0 && total > 0){
      return Math.max(0, Math.min(100, Math.round((step / total) * 100)));
    }

    return 0;
  }

  // Garante um indice de objective (cmi.objectives.N) para o modulo informado.
  // Reaproveita o indice ja usado (persistido em state.objectiveIndexMap) ou
  // solicita o proximo indice livre ao LMS (cmi.objectives._count).
  function ensureObjectiveIndex(scorm, state, key){
    if(state.objectiveIndexMap[key] !== undefined){
      return state.objectiveIndexMap[key];
    }

    const count = Number(scorm.getValue('cmi.objectives._count') || 0);
    const index = count;

    scorm.setValue(`cmi.objectives.${index}.id`, key);
    state.objectiveIndexMap[key] = index;

    return index;
  }

  // Envia ao LMS (Moodle) a conclusao de um modulo especifico assim que ele
  // atinge 100% de navegacao, atualizando cmi.objectives.N.status para
  // 'completed'. Isso acontece de forma independente da conclusao geral do
  // curso, permitindo acompanhar o progresso modulo a modulo no Moodle.
  function reportModuleCompletion(scorm, state, moduleKey){
    if(!COURSE_CONFIG.moduleKeys.includes(moduleKey)){
      return;
    }

    if(state.completedModules[moduleKey]){
      return;
    }

    const index = ensureObjectiveIndex(scorm, state, moduleKey);
    scorm.setValue(`cmi.objectives.${index}.status`, 'completed');
    state.completedModules[moduleKey] = true;
  }

  function areAllModulesComplete(state){
    return COURSE_CONFIG.moduleKeys.every(key => Number(state.moduleProgress[key] || 0) >= 100);
  }

  function saveTrackingState(scorm, state, currentPath, sessionContext){
    if(!sessionContext.canPersist){
      return;
    }

    const pageInfo = parsePageInfo(currentPath);
    const overallPercent = getOverallPercent();

    state.lastLocation = currentPath;
    state.overallPercent = Math.max(Number(state.overallPercent || 0), overallPercent);

    if(pageInfo && pageInfo.screen > 0 && pageInfo.total > 0){
      const modulePercent = Math.max(0, Math.min(100, Math.round((pageInfo.screen / pageInfo.total) * 100)));
      const savedPercent = Number(state.moduleProgress[pageInfo.key] || 0);
      state.moduleProgress[pageInfo.key] = Math.max(savedPercent, modulePercent);

      // Assim que o modulo atinge 100%, reporta a conclusao ao LMS na hora,
      // sem esperar o restante do curso.
      if(state.moduleProgress[pageInfo.key] >= 100){
        reportModuleCompletion(scorm, state, pageInfo.key);
      }
    }

    // Status geral do curso: concluido quando todos os modulos (1 a 8) estao
    // 100% completos, OU quando o aluno chega na tela de encerramento, OU
    // quando o progresso geral calculado atinge 100% (mantidos como
    // seguranca / compatibilidade com o comportamento anterior).
    const completed = areAllModulesComplete(state) || currentPath === COURSE_CONFIG.completionPage || state.overallPercent >= 100;
    const exitValue = completed ? '' : 'suspend';

    scorm.setValue('cmi.core.lesson_location', currentPath);
    scorm.setValue('cmi.core.lesson_status', completed ? 'completed' : 'incomplete');
    scorm.setValue('cmi.core.score.min', '0');
    scorm.setValue('cmi.core.score.max', '100');
    scorm.setValue('cmi.core.score.raw', String(state.overallPercent));
    scorm.setValue('cmi.core.exit', exitValue);
    scorm.setValue('cmi.suspend_data', JSON.stringify(state));
    scorm.commit();
  }

  function setCollapsed(collapsed){
    if(!sidebar) return;
    sidebar.classList.toggle('collapsed', collapsed);
    try {
      localStorage.setItem('courseSidebarCollapsed', collapsed ? '1' : '0');
    } catch(error) {}
  }

  function applySidebarState(){
    if(!sidebar){
      return;
    }

    let collapsed = false;
    try {
      collapsed = localStorage.getItem('courseSidebarCollapsed') === '1';
    } catch(error) {}

    setCollapsed(collapsed);
  }

  function bindSidebarToggle(){
    if(toggle && sidebar && !toggle.dataset.bound){
      toggle.dataset.bound = '1';
      toggle.addEventListener('click', () => {
        setCollapsed(!sidebar.classList.contains('collapsed'));
      });
    }
  }

  function highlightCurrentMenuItem(){
    const menuContext = (window.CourseUtils?.getMenuContext || (() => ({
      currentFile: getCurrentFileName(),
      currentModule: null,
      currentSection: null
    })))(getCurrentRelativePath());

    document.querySelectorAll('.nav-course a').forEach(a => {
      a.classList.remove('active');

      const href = (a.getAttribute('href') || '').split('/').pop();
      const hrefModuleMatch = href.match(/^modulo(\d+)\.html$/i);
      const hrefModule = hrefModuleMatch ? hrefModuleMatch[1] : null;
      const hrefSectionMatch = href.match(/^(apresentacao|encerramento)\.html$/i);
      const hrefSection = hrefSectionMatch ? hrefSectionMatch[1].toLowerCase() : null;

      if(href && href === menuContext.currentFile){
        a.classList.add('active');
        return;
      }

      if(menuContext.currentModule && hrefModule && menuContext.currentModule === hrefModule){
        a.classList.add('active');
        return;
      }

      if(menuContext.currentSection && hrefSection && menuContext.currentSection === hrefSection){
        a.classList.add('active');
      }
    });
  }

  function updateProgress(){
    const step = Number(document.body?.dataset?.step || 0);
    const total = Number(document.body?.dataset?.total || 0);

    if(progressBar && total > 0 && step > 0){
      const percent = Math.max(0, Math.min(100, (step / total) * 100));
      progressBar.style.width = `${percent.toFixed(2)}%`;
      progressBar.setAttribute('aria-valuenow', String(percent));

      if(progressLabel){
        progressLabel.textContent = `Progresso: ${step}/${total}`;
      }

      return;
    }

    if(progressLabel){
      progressLabel.textContent = '';
    }
  }

  function initBootstrapComponents(root = document){
    if(!window.bootstrap || !root){
      return;
    }

    root.querySelectorAll('.modal').forEach(element => {
      window.bootstrap.Modal.getOrCreateInstance(element);
    });

    root.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(element => {
      window.bootstrap.Tooltip.getOrCreateInstance(element);
    });

    root.querySelectorAll('.collapse, .accordion-collapse').forEach(element => {
      window.bootstrap.Collapse.getOrCreateInstance(element, { toggle: false });
    });

    root.querySelectorAll('[data-bs-toggle="popover"]').forEach(element => {
      window.bootstrap.Popover.getOrCreateInstance(element);
    });
  }

  function cleanupModalArtifacts(){
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
  }

  function relocatePageModals(root, route){
    if(!root){
      return;
    }

    root.querySelectorAll('.modal').forEach(modal => {
      modal.dataset.spaDetached = '1';
      modal.dataset.spaModalRoute = route || getCurrentRelativePath();
      document.body.appendChild(modal);
    });
  }

  function removeDetachedPageModals(route){
    document.querySelectorAll('body > .modal[data-spa-detached="1"]').forEach(modal => {
      if(route && modal.dataset.spaModalRoute !== route){
        return;
      }

      window.bootstrap?.Modal.getInstance(modal)?.dispose();
      modal.remove();
    });

    cleanupModalArtifacts();
  }

  function disposeBootstrapComponents(root = document){
    if(!window.bootstrap || !root){
      return;
    }

    root.querySelectorAll('[data-bs-toggle="tooltip"]').forEach(element => {
      window.bootstrap.Tooltip.getInstance(element)?.dispose();
    });

    root.querySelectorAll('[data-bs-toggle="popover"]').forEach(element => {
      window.bootstrap.Popover.getInstance(element)?.dispose();
    });

    root.querySelectorAll('.modal').forEach(element => {
      window.bootstrap.Modal.getInstance(element)?.dispose();
    });

    root.querySelectorAll('.collapse, .accordion-collapse').forEach(element => {
      window.bootstrap.Collapse.getInstance(element)?.dispose();
    });
  }

  function refreshUi(){
    applySidebarState();
    bindSidebarToggle();
    highlightCurrentMenuItem();
    updateProgress();
  }

  function initPage(){
    const context = arguments[0] || {};
    const pageRoot = document.getElementById('page-content') || document;
    cleanupModalArtifacts();
    relocatePageModals(pageRoot, context.route);
    initBootstrapComponents(pageRoot);
    initBootstrapComponents(document);
    refreshUi();
    return true;
  }

  function destroyPage(){
    const context = arguments[0] || {};
    const pageRoot = document.getElementById('page-content');
    if(!pageRoot){
      removeDetachedPageModals(context.route);
      return true;
    }

    disposeBootstrapComponents(pageRoot);
    removeDetachedPageModals(context.route || getCurrentRelativePath());
    return true;
  }

  window.updateProgress = updateProgress;
  window.initPage = initPage;
  window.destroyPage = destroyPage;

  const scorm = createScormDriver();
  scorm.initialize();

  const sessionContext = getSessionContext(scorm);
  const trackingState = loadTrackingState(scorm, sessionContext);

  function persistCurrentRoute(){
    if(scorm.isFinished && scorm.isFinished()){
      return;
    }

    const currentPath = getCurrentRelativePath();
    if(currentPath === 'index.html'){
      return;
    }

    saveTrackingState(scorm, trackingState, currentPath, sessionContext);
  }

  document.addEventListener('spa:route-changed', () => {
    persistCurrentRoute();
  });

  window.addEventListener('beforeunload', () => {
    persistCurrentRoute();
    scorm.finish();
  });

  window.addEventListener('pagehide', () => {
    persistCurrentRoute();
  });

  async function initializeCourse(){
    if(router && router.ready){
      await router.ready;
    }

    if(getCurrentRelativePath() === 'index.html' && router){
      await router.navigate(getResumeLocation(trackingState, sessionContext), { replace: true, push: false });
      return;
    }

    initPage();
    persistCurrentRoute();
  }

  initializeCourse();
})();