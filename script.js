/* Pixel Pro - script.js
  - Canvas pixel editor (pencil, eraser, fill, line, rect, picker)
  - Color wheel (canvas) com bolinha arrastável
  - Export PNG / JPG / WEBP
  - Background color, transparency option
  - Undo/redo, save/load JSON
*/

(() => {
  // DOM
  const canvas = document.getElementById('screen');
  const wrap = document.getElementById('canvas-wrap');
  const sizeSelect = document.getElementById('canvas-size');
  const zoomRange = document.getElementById('zoom');
  const gridBtn = document.getElementById('toggle-grid');
  const undoBtn = document.getElementById('undo');
  const redoBtn = document.getElementById('redo');
  const exportPng = document.getElementById('export-png');
  const exportJpg = document.getElementById('export-jpg');
  const exportWebp = document.getElementById('export-webp');
  const importJson = document.getElementById('import-json');
  const clearBtn = document.getElementById('clear-canvas');
  const brushSize = document.getElementById('brush-size');
  const colorPicker = document.getElementById('color-picker');
  const addColorBtn = document.getElementById('add-color');
  const presetColors = document.getElementById('preset-colors');
  const tools = document.querySelectorAll('.tool');
  const projName = document.getElementById('proj-name');
  const transparentCheckbox = document.getElementById('transparent');
  const bgColorInput = document.getElementById('bg-color');

  const wheelCanvas = document.getElementById('color-wheel');
  const wheelIndicator = document.getElementById('wheel-indicator');
  const wheelCtx = wheelCanvas.getContext('2d');

  // state
  let gridOn = true;
  let tool = 'pencil';
  let canvasSize = parseInt(sizeSelect.value, 10);
  let scale = parseInt(zoomRange.value, 10);
  let brush = parseInt(brushSize.value, 10);
  let currentColor = colorPicker.value;
  let pixels = createEmptyPixels(canvasSize, canvasSize);
  let isMouseDown = false;
  let lastPos = null;
  let history = [];
  let future = [];

  // offscreen logical canvas
  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d');
  const ctx = canvas.getContext('2d');

  // palette defaults
  const defaultColors = [
    "#000000","#ffffff","#7f7f7f","#bcbcbc","#f0a07a","#c77a4a","#d99b6c","#f3d6b6",
    "#9fb889","#5aa286","#4f7e8a","#3f5766","#2e3f55","#8fbcd6","#d6b3d1","#ffb6b6",
    "#ffdab3","#ffd2b0","#f7d1c4","#cfeaea","#e8f7e7","#cfe0ff","#fff0c6","#efe6ff",
    "#d7a5a5","#9ab6d9","#9cf6ff","#caffe0","#ffd77a","#ffb6b6","#ffd6a5"
  ];

  // init
function init(){
    populatePalette(defaultColors);
    attachEvents();

    // Define 190% como o "100%" inicial
    zoomRange.value = 190;
    scale = parseInt(zoomRange.value, 10);

    resizeTo(canvasSize, scale);
    pushHistory();
    render();
    drawColorWheel();
    placeIndicatorByHex(currentColor);
}


  // helpers
  function createEmptyPixels(w,h,fill=null){
    const arr = new Array(h);
    for(let y=0;y<h;y++) arr[y] = new Array(w).fill(fill);
    return arr;
  }

function resizeTo(nSize, zoomPercent){
    canvasSize = nSize;

    // tamanho máximo disponível para o canvas dentro da área do editor
    const editorArea = document.querySelector('.editor-area');
    const maxWidth = editorArea.clientWidth - 40; // margem de segurança
    const maxHeight = window.innerHeight - 200; // deixando espaço para header e controles

    // calcula o tamanho base para caber proporcionalmente
    const basePixelSize = Math.floor(Math.min(maxWidth, maxHeight) / canvasSize);

    // aplica o zoom em %
    scale = Math.round((zoomPercent / 100) * basePixelSize);

    off.width = canvasSize;
    off.height = canvasSize;
    canvas.width = canvasSize * scale;
    canvas.height = canvasSize * scale;
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';

    render();
}



  function drawGrid(){
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    ctx.lineWidth = 1;
    for(let i=0;i<=canvasSize;i++){
      const p = i*scale + 0.5;
      ctx.beginPath();
      ctx.moveTo(p,0);
      ctx.lineTo(p,canvas.height);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0,p);
      ctx.lineTo(canvas.width,p);
      ctx.stroke();
    }
    ctx.restore();
  }

  function render(){
    offCtx.clearRect(0,0,off.width,off.height);
    for(let y=0;y<canvasSize;y++){
      for(let x=0;x<canvasSize;x++){
        const c = pixels[y][x];
        if(c === null) {
          offCtx.clearRect(x,y,1,1);
        } else {
          offCtx.fillStyle = c;
          offCtx.fillRect(x,y,1,1);
        }
      }
    }

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // draw background base (in canvas element area) for preview
    if(!transparentCheckbox.checked){
      ctx.fillStyle = bgColorInput.value;
      ctx.fillRect(0,0,canvas.width,canvas.height);
    } else {
      // draw checkerboard for transparent preview
      drawCheckerboard();
    }

    ctx.drawImage(off,0,0,canvasSize,canvasSize,0,0,canvasSize*scale,canvasSize*scale);

    if(gridOn) drawGrid();
  }

  function drawCheckerboard(){
    const box = 8 * Math.max(1, Math.floor(scale/4));
    ctx.save();
    for(let y=0;y<canvas.height;y+=box){
      for(let x=0;x<canvas.width;x+=box){
        const even = ((x/box + y/box) % 2) === 0;
        ctx.fillStyle = even ? '#e7e2d9' : '#dcd6cc';
        ctx.fillRect(x,y,box,box);
      }
    }
    ctx.restore();
  }

  // coordinate helpers
  function getCellFromEvent(ev){
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((ev.clientX - rect.left) / scale);
    const y = Math.floor((ev.clientY - rect.top) / scale);
    return {x: clamp(x,0,canvasSize-1), y: clamp(y,0,canvasSize-1)};
  }
  function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

  // drawing primitives
  function setPixel(x,y,color){
    if(x<0||y<0||x>=canvasSize||y>=canvasSize) return;
    pixels[y][x] = color;
  }

  function drawBrush(x,y,col,size){
    const half = Math.floor(size/2);
    for(let dy=-half;dy<=half;dy++){
      for(let dx=-half;dx<=half;dx++){
        setPixel(x+dx,y+dy,col);
      }
    }
  }

  function floodFill(sx,sy,newColor){
    const target = pixels[sy][sx];
    if(target === newColor) return;
    const stack = [[sx,sy]];
    while(stack.length){
      const [x,y] = stack.pop();
      if(x<0||y<0||x>=canvasSize||y>=canvasSize) continue;
      if(pixels[y][x] !== target) continue;
      pixels[y][x] = newColor;
      stack.push([x+1,y],[x-1,y],[x,y+1],[x,y-1]);
    }
  }

  // Bresenham
  function drawLineOnArr(arr,x0,y0,x1,y1,col,size){
    const dx = Math.abs(x1-x0), sx = x0<x1?1:-1;
    const dy = -Math.abs(y1-y0), sy = y0<y1?1:-1;
    let err = dx+dy;
    while(true){
      drawBrushOnArr(arr,x0,y0,col,size);
      if(x0===x1 && y0===y1) break;
      const e2 = 2*err;
      if(e2 >= dy){ err += dy; x0 += sx; }
      if(e2 <= dx){ err += dx; y0 += sy; }
    }
  }
  function drawRectOnArr(arr,x0,y0,x1,y1,col,size){
    const xMin = Math.min(x0,x1), xMax = Math.max(x0,x1);
    const yMin = Math.min(y0,y1), yMax = Math.max(y0,y1);
    for(let x=xMin;x<=xMax;x++){
      drawBrushOnArr(arr,x,yMin,col,size);
      drawBrushOnArr(arr,x,yMax,col,size);
    }
    for(let y=yMin;y<=yMax;y++){
      drawBrushOnArr(arr,xMin,y,col,size);
      drawBrushOnArr(arr,xMax,y,col,size);
    }
  }
  function drawBrushOnArr(arr,x,y,col,size){
    const half = Math.floor(size/2);
    for(let dy=-half;dy<=half;dy++){
      for(let dx=-half;dx<=half;dx++){
        const nx = x+dx, ny = y+dy;
        if(nx<0||ny<0||nx>=canvasSize||ny>=canvasSize) continue;
        arr[ny][nx] = col;
      }
    }
  }

  // history
  function pushHistory(){
    history.push(clonePixels(pixels));
    if(history.length>80) history.shift();
    future = [];
    updateUndoRedoButtons();
  }
  function undo(){
    if(history.length<=1) return;
    future.push(history.pop());
    pixels = clonePixels(history[history.length-1]);
    render();
    updateUndoRedoButtons();
  }
  function redo(){
    if(!future.length) return;
    const next = future.pop();
    history.push(clonePixels(next));
    pixels = clonePixels(next);
    render();
    updateUndoRedoButtons();
  }
  function updateUndoRedoButtons(){
    undoBtn.disabled = history.length <= 1;
    redoBtn.disabled = future.length === 0;
  }
  function clonePixels(arr){
    return arr.map(row => row.slice());
  }

  // palette
  function populatePalette(colors){
    presetColors.innerHTML = '';
    colors.forEach(c=>{
      const d = document.createElement('div');
      d.className = 'color-swatch';
      d.style.background = c;
      d.title = c;
      d.addEventListener('click', ()=> {
        currentColor = c;
        colorPicker.value = c;
        highlightActiveSwatch(d);
      });
      presetColors.appendChild(d);
    });
  }
  function highlightActiveSwatch(el){
    Array.from(presetColors.children).forEach(ch => ch.style.outline = 'none');
    el.style.outline = '2px solid rgba(0,0,0,0.08)';
  }

  // events
  function attachEvents(){
    // tool buttons
    document.querySelectorAll('.tool').forEach(btn=>{
      btn.addEventListener('click', ()=> {
        tools.forEach(t=>t.classList.remove('active'));
        btn.classList.add('active');
        tool = btn.dataset.tool;
      });
    });

    // canvas interaction
    canvas.addEventListener('mousedown', ev => {
      isMouseDown = true;
      canvas.focus();
      const cell = getCellFromEvent(ev);
      lastPos = cell;
      handlePaintStart(cell, ev);
    });
    window.addEventListener('mouseup', ()=> {
      if(isMouseDown){
        isMouseDown = false;
        lastPos = null;
        pushHistory();
      }
    });
    canvas.addEventListener('mousemove', ev => {
      if(!isMouseDown) return;
      const cell = getCellFromEvent(ev);
      handlePaintMove(cell);
    });

    canvas.addEventListener('click', ev => {
      if(isMouseDown) return;
      const cell = getCellFromEvent(ev);
      handlePaintStart(cell, ev);
      pushHistory();
    });

    // keyboard
    window.addEventListener('keydown', e=>{
      if(e.ctrlKey && e.key.toLowerCase() === 'z'){ e.preventDefault(); undo(); }
      if(e.ctrlKey && e.key.toLowerCase() === 'y'){ e.preventDefault(); redo(); }
      if(e.key.toLowerCase() === 'g'){ gridOn = !gridOn; gridBtn.textContent = `Grade: ${gridOn? 'ON':'OFF'}`; render(); }
    });

    // controls
    sizeSelect.addEventListener('change', ()=> {
      const val = parseInt(sizeSelect.value,10);
      if(confirm('Redefinir o tamanho do canvas irá limpar o desenho atual. Continuar?')){
        pixels = createEmptyPixels(val,val);
        pushHistory();
        resizeTo(val, parseInt(zoomRange.value,10));
      } else {
        sizeSelect.value = canvasSize;
      }
    });

    zoomRange.addEventListener('change', ()=> {
    let val = parseInt(zoomRange.value, 10);
    if(isNaN(val) || val < 10) val = 10;
    if(val > 800) val = 800;
    resizeTo(canvasSize, val);
});



    gridBtn.addEventListener('click', ()=> {
      gridOn = !gridOn;
      gridBtn.textContent = `Grade: ${gridOn ? 'ON' : 'OFF'}`;
      render();
    });

    undoBtn.addEventListener('click', ()=> undo());
    redoBtn.addEventListener('click', ()=> redo());

    brushSize.addEventListener('change', ()=> brush = parseInt(brushSize.value,10));
    colorPicker.addEventListener('input', ()=> { currentColor = colorPicker.value; placeIndicatorByHex(currentColor); });

    addColorBtn.addEventListener('click', ()=> {
      const c = colorPicker.value;
      const div = document.createElement('div');
      div.className = 'color-swatch';
      div.style.background = c;
      div.title = c;
      div.addEventListener('click', ()=> {
        currentColor = c;
        colorPicker.value = c;
        highlightActiveSwatch(div);
      });
      presetColors.prepend(div);
    });

    clearBtn.addEventListener('click', ()=> {
      if(!confirm('Limpar o canvas?')) return;
      pixels = createEmptyPixels(canvasSize, canvasSize);
      pushHistory();
      render();
    });

    exportPng.addEventListener('click', ()=> exportCanvas('image/png'));
    exportJpg.addEventListener('click', ()=> exportCanvas('image/jpeg'));
    exportWebp.addEventListener('click', ()=> exportCanvas('image/webp'));

    importJson.addEventListener('change', ev=>{
      const file = ev.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = e=>{
        try{
          const obj = JSON.parse(e.target.result);
          if(!obj.size || !obj.pixels) throw new Error('Formato inválido');
          canvasSize = obj.size;
          pixels = obj.pixels;
          sizeSelect.value = canvasSize;
          resizeTo(canvasSize, parseInt(zoomRange.value,10));
          pushHistory();
          render();
        } catch(err){
          alert('Erro ao importar: ' + err.message);
        }
      };
      reader.readAsText(file);
      importJson.value = '';
    });

    // quick set current color when clicking on preset palette
    presetColors.addEventListener('click', e=>{
      if(e.target.classList.contains('color-swatch')){
        const bg = window.getComputedStyle(e.target).backgroundColor;
        const hex = rgbToHexString(bg);
        currentColor = hex;
        colorPicker.value = hex;
        highlightActiveSwatch(e.target);
        placeIndicatorByHex(hex);
      }
    });

    // background color
    bgColorInput.addEventListener('input', ()=> render());

    // color wheel events (drag)
    attachWheelEvents();
  }

  // painting handlers
  function handlePaintStart(cell, ev){
    if(tool === 'pencil'){
      drawBrush(cell.x, cell.y, currentColor, brush);
      render();
    } else if(tool === 'eraser'){
      drawBrush(cell.x, cell.y, null, brush);
      render();
    } else if(tool === 'fill'){
      floodFill(cell.x, cell.y, currentColor);
      render();
    } else if(tool === 'picker'){
      const c = pixels[cell.y][cell.x];
      if(c) { currentColor = c; colorPicker.value = c; placeIndicatorByHex(c); }
    } else if(tool === 'line' || tool === 'rect'){
      lastPos = cell;
    }
  }

  function handlePaintMove(cell){
    if(!lastPos) lastPos = cell;
    if(tool === 'pencil'){
      drawLineOnArr(pixels, lastPos.x,lastPos.y,cell.x,cell.y,currentColor,brush);
      lastPos = cell;
      render();
    } else if(tool === 'eraser'){
      drawLineOnArr(pixels, lastPos.x,lastPos.y,cell.x,cell.y,null,brush);
      lastPos = cell;
      render();
    } else if(tool === 'line'){
      const temp = clonePixels(pixels);
      drawLineOnArr(temp, lastPos.x,lastPos.y,cell.x,cell.y,currentColor,brush);
      renderFromTemp(temp);
    } else if(tool === 'rect'){
      const temp = clonePixels(pixels);
      drawRectOnArr(temp, lastPos.x,lastPos.y,cell.x,cell.y,currentColor,brush);
      renderFromTemp(temp);
    }
  }

  function renderFromTemp(temp){
    offCtx.clearRect(0,0,off.width,off.height);
    for(let y=0;y<canvasSize;y++){
      for(let x=0;x<canvasSize;x++){
        const c = temp[y][x];
        if(c === null) continue;
        offCtx.fillStyle = c;
        offCtx.fillRect(x,y,1,1);
      }
    }
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(!transparentCheckbox.checked){
      ctx.fillStyle = bgColorInput.value;
      ctx.fillRect(0,0,canvas.width,canvas.height);
    } else {
      drawCheckerboard();
    }
    ctx.drawImage(off,0,0,canvasSize,canvasSize,0,0,canvasSize*scale,canvasSize*scale);
    if(gridOn) drawGrid();
  }

  // export
function exportCanvas(mime){
    const scaleFactor = 20; // fator de ampliação para manter qualidade
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvasSize * scaleFactor;
    exportCanvas.height = canvasSize * scaleFactor;
    const ectx = exportCanvas.getContext('2d');
    ectx.imageSmoothingEnabled = false;

    // fundo
    if(!transparentCheckbox.checked){
        ectx.fillStyle = bgColorInput.value;
        ectx.fillRect(0,0,exportCanvas.width,exportCanvas.height);
    } else {
        ectx.clearRect(0,0,exportCanvas.width,exportCanvas.height);
    }

    // desenha pixels ampliados
    for(let y=0;y<canvasSize;y++){
        for(let x=0;x<canvasSize;x++){
            const c = pixels[y][x];
            if(c === null) continue;
            ectx.fillStyle = c;
            ectx.fillRect(x*scaleFactor,y*scaleFactor,scaleFactor,scaleFactor);
        }
    }

    // extensão
    let ext = 'png';
    if(mime === 'image/jpeg') ext = 'jpg';
    if(mime === 'image/webp') ext = 'webp';

    // exporta
    exportCanvas.toBlob((blob) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (projName.value || 'pixel') + '.' + ext;
        a.click();
        URL.revokeObjectURL(a.href);
    }, mime);
}


  // tiny util: convert "rgb(r,g,b)" to "#rrggbb"
  function rgbToHexString(rgb){
    const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if(!m) return '#000000';
    const r = parseInt(m[1]).toString(16).padStart(2,'0');
    const g = parseInt(m[2]).toString(16).padStart(2,'0');
    const b = parseInt(m[3]).toString(16).padStart(2,'0');
    return `#${r}${g}${b}`;
  }

  // Color wheel implementation (polar mapping: angle->hue, radius->saturation)
  function drawColorWheel(){
    const w = wheelCanvas.width;
    const h = wheelCanvas.height;
    const cx = w/2, cy = h/2;
    const radius = Math.min(cx,cy) - 2;

    const img = wheelCtx.createImageData(w, h);
    const data = img.data;

    for(let y=0;y<h;y++){
      for(let x=0;x<w;x++){
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.sqrt(dx*dx + dy*dy);
        const idx = (y*w + x) * 4;

        if(r <= radius){
          let angle = Math.atan2(dy, dx); // -PI..PI
          if(angle < 0) angle += Math.PI*2;
          const hue = angle / (Math.PI*2); // 0..1
          const sat = Math.min(r / radius, 1); // 0..1
          const val = 1; // full brightness for wheel
          const rgb = hsvToRgb(hue, sat, val);
          data[idx] = rgb.r;
          data[idx+1] = rgb.g;
          data[idx+2] = rgb.b;
          data[idx+3] = 255;
        } else {
          // transparent outside wheel
          data[idx] = 0; data[idx+1] = 0; data[idx+2] = 0; data[idx+3] = 0;
        }
      }
    }
    wheelCtx.putImageData(img, 0, 0);

    // draw inner circle to create a ring-like feel (optional)
    wheelCtx.beginPath();
    wheelCtx.arc(cx, cy, radius+1, 0, Math.PI*2);
    wheelCtx.lineWidth = 2;
    wheelCtx.strokeStyle = 'rgba(0,0,0,0.06)';
    wheelCtx.stroke();
  }

  // HSV -> RGB (h:0..1, s:0..1, v:0..1)
  function hsvToRgb(h, s, v){
    let r=0,g=0,b=0;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch(i % 6){
      case 0: r=v; g=t; b=p; break;
      case 1: r=q; g=v; b=p; break;
      case 2: r=p; g=v; b=t; break;
      case 3: r=p; g=q; b=v; break;
      case 4: r=t; g=p; b=v; break;
      case 5: r=v; g=p; b=q; break;
    }
    return { r: Math.round(r*255), g: Math.round(g*255), b: Math.round(b*255) };
  }

  // Convert RGB object to hex
  function rgbObjToHex(o){ return '#' + [o.r,o.g,o.b].map(v=>v.toString(16).padStart(2,'0')).join(''); }

  // Wheel pointer interactions
  function attachWheelEvents(){
    let dragging = false;
    function updateFromEvent(e){
      const rect = wheelCanvas.getBoundingClientRect();
      const x = (e.clientX ?? (e.touches && e.touches[0].clientX)) - rect.left;
      const y = (e.clientY ?? (e.touches && e.touches[0].clientY)) - rect.top;
      const cx = wheelCanvas.width/2, cy = wheelCanvas.height/2;
      const dx = x - cx, dy = y - cy;
      const r = Math.sqrt(dx*dx + dy*dy);
      const radius = Math.min(cx, cy) - 2;
      if(r > radius) {
        // clamp to edge
        const angle = Math.atan2(dy, dx);
        const nx = cx + Math.cos(angle) * radius;
        const ny = cy + Math.sin(angle) * radius;
        placeIndicator(nx, ny);
        const hue = ((angle < 0 ? angle + Math.PI*2 : angle) / (Math.PI*2));
        const sat = 1;
        const hex = rgbObjToHex(hsvToRgb(hue, sat, 1));
        currentColor = hex;
        colorPicker.value = hex;
      } else {
        placeIndicator(x, y);
        // derive color by reading pixel from wheel canvas
        const p = wheelCtx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
        const hex = rgbObjToHex({r:p[0],g:p[1],b:p[2]});
        currentColor = hex;
        colorPicker.value = hex;
      }
    }
    wheelCanvas.addEventListener('mousedown', e=>{
      dragging = true;
      updateFromEvent(e);
    });
    window.addEventListener('mousemove', e=>{
      if(!dragging) return;
      updateFromEvent(e);
    });
    window.addEventListener('mouseup', ()=> dragging = false);

    // touch
    wheelCanvas.addEventListener('touchstart', e=>{
      dragging = true;
      updateFromEvent(e.touches[0]);
      e.preventDefault();
    }, {passive:false});
    window.addEventListener('touchmove', e=>{
      if(!dragging) return;
      updateFromEvent(e.touches[0]);
      e.preventDefault();
    }, {passive:false});
    window.addEventListener('touchend', ()=> dragging = false);
  }

  // move the small indicator to x,y in wheel canvas coordinates
  function placeIndicator(x,y){
    const rect = wheelCanvas.getBoundingClientRect();
    const absX = rect.left + x;
    const absY = rect.top + y;
    wheelIndicator.style.left = (rect.left + x) - rect.left + 'px';
    wheelIndicator.style.top = (rect.top + y) - rect.top + 'px';
    // position relative to parent
    wheelIndicator.style.transform = `translate(${x - wheelCanvas.width/2}px, ${y - wheelCanvas.height/2}px) translate(-50%,-50%)`;
    // set small inline location (works because wheelIndicator is absolutely placed in wheel-wrap)
    wheelIndicator.style.left = (x) + 'px';
    wheelIndicator.style.top = (y) + 'px';
  }

  // place indicator by hex color: approximate by searching wheel pixels (cheap brute force for small canvas)
  function placeIndicatorByHex(hex){
    // naive scan: find a pixel with approx color
    const img = wheelCtx.getImageData(0,0,wheelCanvas.width,wheelCanvas.height);
    const data = img.data;
    const target = hexToRgb(hex);
    let bestIdx = -1;
    let bestDist = Infinity;
    for(let i=0;i<data.length;i+=4){
      const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
      if(a === 0) continue;
      const dr = r - target.r, dg = g - target.g, db = b - target.b;
      const dist = dr*dr + dg*dg + db*db;
      if(dist < bestDist){
        bestDist = dist;
        bestIdx = i/4;
      }
    }
    if(bestIdx >= 0){
      const px = bestIdx % wheelCanvas.width;
      const py = Math.floor(bestIdx / wheelCanvas.width);
      placeIndicator(px, py);
    } else {
      // default center
      placeIndicator(wheelCanvas.width/2, wheelCanvas.height/2);
    }
  }

  // hex -> rgb
  function hexToRgb(hex){
    if(hex[0]==='#') hex = hex.slice(1);
    if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
    const n = parseInt(hex,16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  // init
  init();

})();
