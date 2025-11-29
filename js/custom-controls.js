document.addEventListener('DOMContentLoaded', function() {
  setTimeout(initializeCustomControls, 500);
});

function initializeCustomControls() {
  setupCustomDrag();
  setupCustomResize();
}

function setupCustomDrag() {
  const container = document.getElementById('videoReactContainer');
  const dragHandle = document.getElementById('reactDragHandle');

  if (!container || !dragHandle) {
    return;
  }

  if ($(container).hasClass('ui-draggable')) {
    try { $(container).draggable('destroy'); } catch (e) {}
  }

  let isDragging = false;
  let startX, startY, startLeft, startTop;

  dragHandle.addEventListener('mousedown', initDrag);
  dragHandle.addEventListener('touchstart', initTouchDrag, { passive: false });

  function initDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    startLeft = parseInt(container.style.left) || parseInt($(container).css('left')) || 0;
    startTop = parseInt(container.style.top) || parseInt($(container).css('top')) || 0;
    document.addEventListener('mousemove', dragContainer);
    document.addEventListener('mouseup', stopDrag);
  }

  function initTouchDrag(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.touches || !e.touches[0]) return;
    isDragging = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startLeft = parseInt(container.style.left) || parseInt($(container).css('left')) || 0;
    startTop = parseInt(container.style.top) || parseInt($(container).css('top')) || 0;
    document.addEventListener('touchmove', dragContainerTouch, { passive: false });
    document.addEventListener('touchend', stopTouchDrag);
    document.addEventListener('touchcancel', stopTouchDrag);
  }

  function dragContainer(e) {
    if (!isDragging) return;
    const newLeft = startLeft + (e.clientX - startX);
    const newTop = startTop + (e.clientY - startY);
    const maxLeft = window.innerWidth - container.offsetWidth;
    const maxTop = window.innerHeight - container.offsetHeight;
    container.style.left = `${Math.max(0, Math.min(newLeft, maxLeft))}px`;
    container.style.top = `${Math.max(0, Math.min(newTop, maxTop))}px`;
  }

  function dragContainerTouch(e) {
    if (!isDragging || !e.touches || !e.touches[0]) return;
    e.preventDefault();
    const newLeft = startLeft + (e.touches[0].clientX - startX);
    const newTop = startTop + (e.touches[0].clientY - startY);
    const maxLeft = window.innerWidth - container.offsetWidth;
    const maxTop = window.innerHeight - container.offsetHeight;
    container.style.left = `${Math.max(0, Math.min(newLeft, maxLeft))}px`;
    container.style.top = `${Math.max(0, Math.min(newTop, maxTop))}px`;
  }

  function stopDrag() {
    isDragging = false;
    document.removeEventListener('mousemove', dragContainer);
    document.removeEventListener('mouseup', stopDrag);
  }

  function stopTouchDrag() {
    isDragging = false;
    document.removeEventListener('touchmove', dragContainerTouch);
    document.removeEventListener('touchend', stopTouchDrag);
    document.removeEventListener('touchcancel', stopTouchDrag);
  }
}

function setupCustomResize() {
  const container = document.getElementById('videoReactContainer');
  if (!container) {
    console.error('Container not found for custom resize');
    return;
  }

  if ($(container).hasClass('ui-resizable')) {
    try {
      $(container).resizable('destroy');
    } catch (e) {
      console.error('Error destroying jQuery UI resizable:', e);
    }
  }
  $('.ui-resizable-handle').remove();

  let resizeHandle = document.getElementById('customResizeHandle');
  if (!resizeHandle) {
    resizeHandle = document.createElement('div');
    resizeHandle.id = 'customResizeHandle';
    resizeHandle.className = 'custom-resize-handle';
    container.appendChild(resizeHandle);
  }

  let isResizing = false;
  let startX, startY, startWidth, startHeight;

  resizeHandle.addEventListener('mousedown', initResize);
  resizeHandle.addEventListener('touchstart', initTouchResize, { passive: false });

  function initResize(e) {
    e.preventDefault();
    e.stopPropagation();
    container.classList.add('resizing');
    isResizing = true;
    startX = e.clientX;
    startY = e.clientY;
    startWidth = container.offsetWidth;
    startHeight = container.offsetHeight;
    document.addEventListener('mousemove', resizeContainer);
    document.addEventListener('mouseup', stopResize);
  }

  function initTouchResize(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.touches || !e.touches[0]) return;
    container.classList.add('resizing');
    isResizing = true;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startWidth = container.offsetWidth;
    startHeight = container.offsetHeight;
    document.addEventListener('touchmove', resizeContainerTouch, { passive: false });
    document.addEventListener('touchend', stopTouchResize);
    document.addEventListener('touchcancel', stopTouchResize);
  }

  function resizeContainer(e) {
    if (!isResizing) return;
    const width = Math.max(200, startWidth + (e.clientX - startX));
    const aspectRatio = 16 / 9;
    const height = Math.round(width / aspectRatio);
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    if (window.isReactYoutubeVideo && window.reactYoutubePlayer) {
      try { window.reactYoutubePlayer.setSize(width, height - 40); } catch (err) {}
    } else {
      $("#videoReact").css({ width: "100%", height: "100%" });
    }
  }

  function resizeContainerTouch(e) {
    if (!isResizing || !e.touches || !e.touches[0]) return;
    e.preventDefault();
    const width = Math.max(200, startWidth + (e.touches[0].clientX - startX));
    const aspectRatio = 16 / 9;
    const height = Math.round(width / aspectRatio);
    container.style.width = `${width}px`;
    container.style.height = `${height}px`;
    if (window.isReactYoutubeVideo && window.reactYoutubePlayer) {
      try { window.reactYoutubePlayer.setSize(width, height - 40); } catch (err) {}
    } else {
      $("#videoReact").css({ width: "100%", height: "100%" });
    }
  }

  function stopResize() {
    if (!isResizing) return;
    isResizing = false;
    container.classList.remove('resizing');
    document.removeEventListener('mousemove', resizeContainer);
    document.removeEventListener('mouseup', stopResize);
    if (window.isReactYoutubeVideo && window.reactYoutubePlayer) {
      setTimeout(function() {
        try { window.reactYoutubePlayer.setSize(container.offsetWidth, container.offsetHeight - 40); } catch (err) {}
      }, 100);
    }
  }

  function stopTouchResize() {
    if (!isResizing) return;
    isResizing = false;
    container.classList.remove('resizing');
    document.removeEventListener('touchmove', resizeContainerTouch);
    document.removeEventListener('touchend', stopTouchResize);
    document.removeEventListener('touchcancel', stopTouchResize);
    if (window.isReactYoutubeVideo && window.reactYoutubePlayer) {
      setTimeout(function() {
        try { window.reactYoutubePlayer.setSize(container.offsetWidth, container.offsetHeight - 40); } catch (err) {}
      }, 100);
    }
  }
}

function addCustomStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #customResizeHandle {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 20px;
      height: 20px;
      background-color: rgba(0,0,0,0.7);
      cursor: se-resize;
      z-index: 1002;
      border-radius: 3px 0 0 0;
      box-shadow: 0 0 5px rgba(0,0,0,0.5);
      background: linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.7) 40%, rgba(0,180,180,0.6) 41%, rgba(0,180,180,0.6) 60%, rgba(0,0,0,0.7) 61%, rgba(0,0,0,0.7) 100%);
      pointer-events: auto !important;
      opacity: 0.8;
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    #customResizeHandle:hover {
      background-color: rgba(0,0,0,0.8);
      box-shadow: 0 0 8px rgba(0,180,180,0.7);
      opacity: 1;
      transform: scale(1.1);
    }
    #videoReactContainer.resizing {
      border-color: rgba(0, 180, 180, 0.6);
      box-shadow: 0 0 15px rgba(0, 180, 180, 0.4);
    }
    #videoReactContainer:hover #customResizeHandle {
      opacity: 1;
    }
  `;
  document.head.appendChild(style);
}
addCustomStyles();
