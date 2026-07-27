(() => {
  const pageContent = document.getElementById('page-content');
  const routerScript = document.currentScript || document.querySelector('script[src$="assets/js/router.js"], script[src$="../assets/js/router.js"]');
  const courseRootUrl = routerScript ? new URL('../../', routerScript.src) : new URL('./', location.href);
  const fixedIndexUrl = new URL('index.html', courseRootUrl);

  function keepAddressOnIndex(){
    const currentUrl = new URL(location.href);
    if(currentUrl.pathname !== fixedIndexUrl.pathname || currentUrl.search || currentUrl.hash){
      history.replaceState(null, '', fixedIndexUrl.pathname);
    }
  }
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

  if(!pageContent){
    return;
  }

  const LANDING_PAGE_MAP = {
    'modulos/apresentacao.html': 'pages/apresentacao_tela1.html',
    'modulos/modulo1.html': 'pages/modulo1_tela1.html',
    'modulos/modulo2.html': 'pages/modulo2_tela1.html',
    'modulos/modulo3.html': 'pages/modulo3_tela1.html',
    'modulos/modulo4.html': 'pages/modulo4_tela1.html',
    'modulos/modulo5.html': 'pages/modulo5_tela1.html',
    'modulos/modulo6.html': 'pages/modulo6_tela1.html',
    'modulos/modulo7.html': 'pages/modulo7_tela1.html',
    'modulos/modulo8.html': 'pages/modulo8_tela1.html',
    'modulos/encerramento.html': 'pages/encerramento_tela1.html',
    'modulos/materiais_complementares.html': 'pages/materiais_complementares.html'
  };

  let currentRoute = null;
  const MAX_CACHE_ENTRIES = 24;
  const pageCache = new Map();
  const pendingPageRequests = new Map();
  let navigationSequence = 0;

  function resolvePageSource(routePath){
    const normalizedRoute = normalizePath(routePath);

    if(LANDING_PAGE_MAP[normalizedRoute]){
      return LANDING_PAGE_MAP[normalizedRoute];
    }

    const fileName = normalizedRoute.split('/').pop() || '';
    if(/^(apresentacao|encerramento)_tela\d+\.html$/i.test(fileName)){
      return `pages/${fileName}`;
    }

    if(/^modulo\d+_tela\d+\.html$/i.test(fileName)){
      return `pages/${fileName}`;
    }

    if(/^materiais_complementares\.html$/i.test(fileName)){
      return 'pages/materiais_complementares.html';
    }

    return null;
  }

  function getHistoryUrl(routePath){
    return new URL(normalizePath(routePath), courseRootUrl);
  }

  function buildRouteContext(targetPath){
    const normalizedRoute = normalizePath(targetPath);
    const pageSource = resolvePageSource(normalizedRoute);
    const historyUrl = getHistoryUrl(normalizedRoute);

    return {
      normalizedRoute,
      pageSource,
      historyUrl
    };
  }

  function createFragmentFromHtml(fragmentHtml){
    const template = document.createElement('template');
    template.innerHTML = fragmentHtml.trim();
    return template.content.firstElementChild;
  }

  function cachePageFragment(pageSource, fragmentSection){
    if(!pageSource || !fragmentSection){
      return;
    }

    if(pageCache.has(pageSource)){
      pageCache.delete(pageSource);
    }

    pageCache.set(pageSource, fragmentSection.outerHTML);

    while(pageCache.size > MAX_CACHE_ENTRIES){
      const oldestKey = pageCache.keys().next().value;
      pageCache.delete(oldestKey);
    }
  }

  function getCachedPageFragment(pageSource){
    const fragmentHtml = pageCache.get(pageSource);
    if(!fragmentHtml){
      return null;
    }

    pageCache.delete(pageSource);
    pageCache.set(pageSource, fragmentHtml);

    return createFragmentFromHtml(fragmentHtml);
  }

  function shouldHandleLink(anchor){
    if(!anchor) return false;
    if(anchor.hasAttribute('download')) return false;
    if(anchor.target && anchor.target !== '_self') return false;

    const href = anchor.getAttribute('href') || '';
    if(!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')){
      return false;
    }

    const absoluteUrl = new URL(href, location.href);
    const sameOrigin = absoluteUrl.origin === location.origin || location.origin === 'null';
    if(!sameOrigin){
      return false;
    }

    const routePath = normalizePath(absoluteUrl.pathname || absoluteUrl.href);
    return Boolean(resolvePageSource(routePath));
  }

    function rewriteRelativeUrls(fragment, baseUrl){
    const selector = 'img[src], a[href], source[src], video[src], audio[src], track[src], link[href][rel="stylesheet"], script[src], embed[src], object[data], use[href]';
    fragment.querySelectorAll(selector).forEach(element => {
      const attrMap = {
        IMG: 'src', A: 'href', SOURCE: 'src', VIDEO: 'src', AUDIO: 'src',
        TRACK: 'src', LINK: 'href', SCRIPT: 'src', EMBED: 'src',
        OBJECT: 'data', USE: 'href'
      };
      const attrName = attrMap[element.tagName];
      if(!attrName){
        return;
      }
      const attrValue = element.getAttribute(attrName);
      if(!attrValue) return;
      if(attrValue.startsWith('#') || attrValue.startsWith('data:') || attrValue.startsWith('mailto:') || attrValue.startsWith('tel:') || attrValue.startsWith('javascript:') || attrValue.startsWith('blob:')) {
        return;
      }
      if(/^(https?:)?\/\//.test(attrValue) || attrValue.startsWith('/')) {
        return;
      }
      try {
        const resolved = new URL(attrValue, baseUrl).href;
        const absolutePath = new URL(resolved).pathname.replace(/^\//, '');
        element.setAttribute(attrName, absolutePath);
      } catch(error) {}
    });
  }

  function rewriteAssets(fragmentSection, pageSource){
    const baseUrl = new URL(decodeURIComponent(pageSource), courseRootUrl);
    rewriteRelativeUrls(fragmentSection, baseUrl);
  }

function copyFragmentToContainer(fragmentSection){
    const nextClasses = fragmentSection.className;
    const nextAttributes = Array.from(fragmentSection.attributes);
    const nextInnerHtml = fragmentSection.innerHTML;

    const removableAttrs = Array.from(pageContent.attributes)
      .map(attribute => attribute.name)
      .filter(name => name !== 'id');

    removableAttrs.forEach(name => pageContent.removeAttribute(name));
    pageContent.className = nextClasses;

    nextAttributes.forEach(attribute => {
      if(attribute.name === 'class' || attribute.name === 'id'){
        return;
      }
      pageContent.setAttribute(attribute.name, attribute.value);
    });

    pageContent.innerHTML = nextInnerHtml;
  }

  function syncDocumentMetadata(){
    const pageTitle = pageContent.dataset.title || document.title;
    const pageStep = pageContent.dataset.step || '';
    const pageTotal = pageContent.dataset.total || '';

    document.title = pageTitle;

    if(pageStep){
      document.body.dataset.step = pageStep;
    } else {
      delete document.body.dataset.step;
    }

    if(pageTotal){
      document.body.dataset.total = pageTotal;
    } else {
      delete document.body.dataset.total;
    }

    document.body.dataset.title = pageTitle;
  }

  async function requestPageFragment(pageSource){
    const cachedFragment = getCachedPageFragment(pageSource);
    if(cachedFragment){
      return cachedFragment;
    }

    if(pendingPageRequests.has(pageSource)){
      const pendingFragment = await pendingPageRequests.get(pageSource);
      return pendingFragment.cloneNode(true);
    }

    const requestPromise = (async () => {
      const response = await fetch(new URL(pageSource, courseRootUrl), { cache: 'no-cache' });

      if(!response.ok){
        throw new Error(`Falha ao carregar ${pageSource}`);
      }

      const htmlText = await response.text();
      const parser = new DOMParser();
      const parsedDocument = parser.parseFromString(htmlText, 'text/html');
      const fragmentSection = parsedDocument.querySelector('section.page-card');

      if(!fragmentSection){
        throw new Error(`Arquivo ${pageSource} sem section.page-card`);
      }

      cachePageFragment(pageSource, fragmentSection);
      return fragmentSection;
    })();

    pendingPageRequests.set(pageSource, requestPromise);

    try {
      const fragmentSection = await requestPromise;
      return fragmentSection.cloneNode(true);
    } finally {
      pendingPageRequests.delete(pageSource);
    }
  }

  function collectAdjacentRoutes(routePath){
    const routeBaseUrl = getHistoryUrl(routePath);
    const adjacentRoutes = [];

    pageContent.querySelectorAll('.nav-buttons a[href]').forEach(anchor => {
      const href = anchor.getAttribute('href') || '';
      if(!href){
        return;
      }

      const absoluteUrl = new URL(href, routeBaseUrl);
      const normalizedRoute = normalizePath(absoluteUrl.pathname || absoluteUrl.href);
      if(resolvePageSource(normalizedRoute)){
        adjacentRoutes.push(normalizedRoute);
      }
    });

    return Array.from(new Set(adjacentRoutes));
  }

  function prefetchRoute(routePath){
    const pageSource = resolvePageSource(routePath);
    if(!pageSource || pageCache.has(pageSource) || pendingPageRequests.has(pageSource)){
      return;
    }

    requestPageFragment(pageSource).catch(() => {});
  }

  function prefetchAdjacentRoutes(routePath){
    collectAdjacentRoutes(routePath).forEach(prefetchRoute);
  }

  async function loadRoute(targetPath, options = {}){
    const { normalizedRoute, pageSource, historyUrl } = buildRouteContext(targetPath);

    if(!pageSource){
      return false;
    }

    if(currentRoute === normalizedRoute && !options.force){
      return true;
    }

    const requestId = ++navigationSequence;
    const fragmentSection = await requestPageFragment(pageSource);

    if(requestId !== navigationSequence){
      return false;
    }

    if(typeof window.destroyPage === 'function'){
      await Promise.resolve(window.destroyPage({
        route: currentRoute,
        nextRoute: normalizedRoute
      }));
    }

    rewriteAssets(fragmentSection, pageSource);
    copyFragmentToContainer(fragmentSection);
    syncDocumentMetadata();

    currentRoute = normalizedRoute;

    if(typeof window.initPage === 'function'){
      await Promise.resolve(window.initPage({
        route: normalizedRoute,
        pageSource
      }));
    }

    document.dispatchEvent(new CustomEvent('spa:route-changed', {
      detail: {
        route: normalizedRoute,
        pageSource
      }
    }));

    prefetchAdjacentRoutes(normalizedRoute);

    return true;
  }

  async function navigate(targetPath, options = {}){
    return loadRoute(targetPath, {
      push: options.push !== false,
      replace: Boolean(options.replace)
    });
  }

  document.addEventListener('click', async event => {
    const anchor = event.target.closest('a[href]');

    if(!anchor || event.defaultPrevented){
      return;
    }

    if(event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey){
      return;
    }

    if(!shouldHandleLink(anchor)){
      return;
    }

    event.preventDefault();

    const targetUrl = new URL(anchor.getAttribute('href'), location.href);
    const targetRoute = normalizePath(targetUrl.pathname || targetUrl.href);
    await navigate(targetRoute, { push: true });
  });

  window.addEventListener('popstate', () => {
    keepAddressOnIndex();
  });

  const ready = (async () => {
    keepAddressOnIndex();
    const initialRoute = 'index.html';
    const pageSource = pageContent.dataset.pageSrc;

    if(pageSource){
      await loadRoute(initialRoute, { replace: true });
      return;
    }

    currentRoute = initialRoute;
  })();

  window.CourseRouter = {
    ready,
    navigate,
    loadRoute,
    resolvePageSource,
    normalizePath,
    prefetchRoute,
    getCurrentRoute(){
      return currentRoute || normalizePath(location.pathname || location.href);
    }
  };
})();