(() => {
  function normalizePath(path){
    if(!path){
      return 'index.html';
    }

    const cleanPath = String(path).replace(/\\/g, '/').split('?')[0].split('#')[0];

    if(/(^|\/)modulos\//i.test(cleanPath)){
      return `modulos/${cleanPath.split(/modulos\//i).pop()}`;
    }

    if(/(^|\/)pages\//i.test(cleanPath)){
      return `pages/${cleanPath.split(/pages\//i).pop()}`;
    }

    const lastPart = cleanPath.split('/').pop();
    return lastPart || 'index.html';
  }

  function getFileName(path){
    return normalizePath(path).split('/').pop() || '';
  }

  function getMenuContext(path){
    const currentFile = getFileName(path);
    const currentModuleMatch = currentFile.match(/^modulo(\d+)(?:_tela\d+)?\.html$/i);
    const currentSectionMatch = currentFile.match(/^(apresentacao|encerramento)(?:_tela\d+)?\.html$/i);

    return {
      currentFile,
      currentModule: currentModuleMatch ? currentModuleMatch[1] : null,
      currentSection: currentSectionMatch ? currentSectionMatch[1].toLowerCase() : null
    };
  }

  window.CourseUtils = {
    normalizePath,
    getFileName,
    getMenuContext
  };
})();
