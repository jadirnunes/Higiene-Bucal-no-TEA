(() => {
  const COURSE_CONFIG = {
    defaultLaunchPage: 'modulos/apresentacao.html'
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

  async function initializeCourse(){
    if(router && router.ready){
      await router.ready;
    }

    if(getCurrentRelativePath() === 'index.html' && router){
      await router.navigate(COURSE_CONFIG.defaultLaunchPage, { replace: true, push: false });
      return;
    }

    initPage();
  }

  initializeCourse();
})();