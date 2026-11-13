(function () {
  "use strict";

  // ----------------------------- Constants -----------------------------
  const STORAGE_KEY = "whiteboards";
  const SAVE_DEBOUNCE_MS = 300;
  const LONG_PRESS_MS = 500;
  const LONG_PRESS_MOVE_TOLERANCE = 6;
  const FILE_VERSION = 1;

  const PEN_SIZES = [1, 2, 4, 8, 12, 16, 24];
  const ERASER_SIZES = [8, 16, 32, 64];
  const FONT_SIZES = [12, 16, 20, 24, 32, 48, 64];

  const DEFAULT_COLORS = [
    "#000000", "#1976d2", "#d32f2f", "#388e3c",
    "#f57c00", "#7b1fa2", "#fbc02d", "#ffffff",
  ];

  // ----------------------------- State -----------------------------
  const state = {
    boards: [],
    currentBoardId: null,
    tool: "pen",
    color: "#000000",
    strokeSize: 4,
    eraserSize: 16,
    fontSize: 24,
    undoStack: [],
    redoStack: [],
    isDrawing: false,
    currentStroke: null,
    pointerId: null,
    pressStart: null,
    longPressTimer: null,
    pendingTextPoint: null,
  };

  // ----------------------------- DOM -----------------------------
  const $ = (id) => document.getElementById(id);

  const canvas = $("canvas");
  const ctx = canvas.getContext("2d");
  const canvasWrap = $("canvas-wrap");

  const boardSelect = $("board-select");
  const boardNewBtn = $("board-new");
  const boardRenameBtn = $("board-rename");
  const boardDeleteBtn = $("board-delete");

  const toolPenBtn = $("tool-pen");
  const toolEraserBtn = $("tool-eraser");
  const toolTextBtn = $("tool-text");

  const colorBtn = $("color-btn");
  const colorPreview = $("color-preview");
  const colorPopup = $("color-popup");
  const colorGrid = $("color-grid");
  const customColorInput = $("custom-color");

  const sizeBtn = $("size-btn");
  const sizePreview = $("size-preview");
  const sizeLabel = $("size-label");
  const sizePopup = $("size-popup");
  const sizeOptions = $("size-options");

  const undoBtn = $("undo");
  const redoBtn = $("redo");
  const clearBtn = $("clear");
  const downloadBtn = $("download");
  const uploadBtn = $("upload");
  const fileInput = $("file-input");

  const textOverlay = $("text-overlay");
  const textInput = $("text-input");
  const textFontSize = $("text-font-size");
  const textOkBtn = $("text-ok");
  const textCancelBtn = $("text-cancel");

  const promptOverlay = $("prompt-overlay");
  const promptMessage = $("prompt-message");
  const promptInput = $("prompt-input");
  const promptOkBtn = $("prompt-ok");
  const promptCancelBtn = $("prompt-cancel");

  const confirmOverlay = $("confirm-overlay");
  const confirmMessage = $("confirm-message");
  const confirmYesBtn = $("confirm-yes");
  const confirmNoBtn = $("confirm-no");

  const helpBtn = $("help-btn");
  const helpOverlay = $("help-overlay");
  const helpCloseBtn = $("help-close");
  const helpOkBtn = $("help-ok");

  const saveIndicator = $("save-indicator");
  const emptyHint = $("empty-hint");
  const cursorPreview = $("cursor-preview");
  const toastEl = $("toast");

  let dpr = window.devicePixelRatio || 1;
  let canvasW = 0;
  let canvasH = 0;

  // ----------------------------- Modal helpers -----------------------------
  // Overlay modals need `flex` to center their panel. Toggling just `hidden`
  // would be overridden by `flex`, so we manage both classes explicitly.
  function showModal(el) {
    el.classList.remove("hidden");
    el.classList.add("flex");
  }
  function hideModal(el) {
    el.classList.add("hidden");
    el.classList.remove("flex");
  }
  function isModalOpen(el) {
    return !el.classList.contains("hidden");
  }
  function show(el) { el.classList.remove("hidden"); }
  function hide(el) { el.classList.add("hidden"); }

  // ----------------------------- Utilities -----------------------------
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function currentBoard() {
    return state.boards.find((b) => b.id === state.currentBoardId);
  }

  function showToast(message, ms) {
    toastEl.textContent = message;
    show(toastEl);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => hide(toastEl), ms || 2400);
  }

  function hexToRgba(hex, alpha) {
    if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
      return `rgba(0,0,0,${alpha})`;
    }
    const r = parseInt(hex.substr(1, 2), 16);
    const g = parseInt(hex.substr(3, 2), 16);
    const b = parseInt(hex.substr(5, 2), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function sanitizeFileName(name) {
    return String(name).replace(/[\\/:*?"<>|]+/g, "_").trim() || "Whiteboard";
  }

  // ----------------------------- Save indicator -----------------------------
  function setSaveStatus(status) {
    if (!saveIndicator) return;
    saveIndicator.classList.remove("text-gray-400", "text-amber-600", "text-emerald-600");
    if (status === "saving") {
      saveIndicator.textContent = "Saving…";
      saveIndicator.classList.add("text-amber-600");
    } else if (status === "saved") {
      saveIndicator.textContent = "Saved";
      saveIndicator.classList.add("text-emerald-600");
      clearTimeout(setSaveStatus._t);
      setSaveStatus._t = setTimeout(() => {
        saveIndicator.classList.remove("text-emerald-600");
        saveIndicator.classList.add("text-gray-400");
      }, 1200);
    } else if (status === "error") {
      saveIndicator.textContent = "Save failed";
      saveIndicator.classList.add("text-amber-600");
    } else {
      saveIndicator.textContent = "Saved";
      saveIndicator.classList.add("text-gray-400");
    }
  }

  // ----------------------------- Storage -----------------------------
  let saveTimer = null;
  function scheduleSave() {
    setSaveStatus("saving");
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, SAVE_DEBOUNCE_MS);
  }

  function saveNow() {
    saveTimer = null;
    try {
      const payload = {
        boards: state.boards,
        currentBoardId: state.currentBoardId,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      setSaveStatus("saved");
    } catch (e) {
      setSaveStatus("error");
      showToast("Browser storage limit reached.");
      console.error(e);
    }
  }

  function loadData() {
    let raw = null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      raw = null;
    }
    if (!raw) {
      createBoard("My Board", { silent: true });
      return;
    }
    try {
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.boards) && data.boards.length > 0) {
        state.boards = data.boards.map(normalizeBoard);
        const wantedId = data.currentBoardId;
        state.currentBoardId =
          wantedId && state.boards.find((b) => b.id === wantedId)
            ? wantedId
            : state.boards[0].id;
      } else {
        createBoard("My Board", { silent: true });
      }
    } catch (e) {
      console.error("Failed to load whiteboards", e);
      state.boards = [];
      createBoard("My Board", { silent: true });
    }
  }

  function normalizeBoard(b) {
    return {
      id: b.id || uuid(),
      name: typeof b.name === "string" ? b.name : "Untitled",
      createdAt: typeof b.createdAt === "number" ? b.createdAt : Date.now(),
      modifiedAt: typeof b.modifiedAt === "number" ? b.modifiedAt : Date.now(),
      objects: Array.isArray(b.objects) ? b.objects.filter(isValidObject) : [],
    };
  }

  function isValidObject(o) {
    if (!o || typeof o !== "object") return false;
    if (o.type === "stroke") {
      return typeof o.color === "string" && typeof o.width === "number" && Array.isArray(o.points);
    }
    if (o.type === "erase") {
      return typeof o.width === "number" && Array.isArray(o.points);
    }
    if (o.type === "text") {
      return typeof o.text === "string" && typeof o.x === "number" && typeof o.y === "number";
    }
    return false;
  }

  // ----------------------------- Board management -----------------------------
  function createBoard(name, opts) {
    opts = opts || {};
    const board = {
      id: uuid(),
      name: name || "Untitled",
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      objects: [],
    };
    state.boards.push(board);
    state.currentBoardId = board.id;
    state.undoStack = [];
    state.redoStack = [];
    refreshBoardSelect();
    render();
    updateToolUI();
    scheduleSave();
    if (!opts.silent) showToast(`Created "${board.name}"`);
    return board;
  }

  function deleteBoard(id) {
    const idx = state.boards.findIndex((b) => b.id === id);
    if (idx < 0) return;
    const wasCurrent = state.currentBoardId === id;
    const removedName = state.boards[idx].name;
    state.boards.splice(idx, 1);
    if (state.boards.length === 0) {
      createBoard("My Board", { silent: true });
    } else if (wasCurrent) {
      state.currentBoardId = state.boards[Math.max(0, idx - 1)].id;
      state.undoStack = [];
      state.redoStack = [];
    }
    refreshBoardSelect();
    render();
    updateToolUI();
    scheduleSave();
    showToast(`Deleted "${removedName}"`);
  }

  function renameBoard(id, name) {
    const b = state.boards.find((b) => b.id === id);
    if (!b) return;
    b.name = name;
    b.modifiedAt = Date.now();
    refreshBoardSelect();
    scheduleSave();
  }

  function switchBoard(id) {
    if (id === state.currentBoardId) return;
    if (!state.boards.find((b) => b.id === id)) return;
    state.currentBoardId = id;
    state.undoStack = [];
    state.redoStack = [];
    refreshBoardSelect();
    render();
    updateToolUI();
    scheduleSave();
  }

  function refreshBoardSelect() {
    boardSelect.innerHTML = "";
    state.boards.forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.name;
      if (b.id === state.currentBoardId) opt.selected = true;
      boardSelect.appendChild(opt);
    });
  }

  // ----------------------------- Operations / Undo-Redo -----------------------------
  function commitObject(obj) {
    const board = currentBoard();
    if (!board) return;
    board.objects.push(obj);
    board.modifiedAt = Date.now();
    state.undoStack.push({ action: "add", object: obj });
    state.redoStack = [];
    scheduleSave();
    updateToolUI();
    render();
  }

  function clearCurrentBoard() {
    const board = currentBoard();
    if (!board || board.objects.length === 0) return;
    const prev = board.objects;
    state.undoStack.push({ action: "clear", objects: prev });
    state.redoStack = [];
    board.objects = [];
    board.modifiedAt = Date.now();
    scheduleSave();
    updateToolUI();
    render();
  }

  function undo() {
    if (state.undoStack.length === 0) return;
    const op = state.undoStack.pop();
    const board = currentBoard();
    if (!board) return;
    if (op.action === "add") {
      const idx = board.objects.lastIndexOf(op.object);
      if (idx >= 0) board.objects.splice(idx, 1);
      state.redoStack.push(op);
    } else if (op.action === "clear") {
      const before = board.objects;
      board.objects = op.objects.slice();
      state.redoStack.push({ action: "clear", objects: before });
    }
    board.modifiedAt = Date.now();
    scheduleSave();
    updateToolUI();
    render();
  }

  function redo() {
    if (state.redoStack.length === 0) return;
    const op = state.redoStack.pop();
    const board = currentBoard();
    if (!board) return;
    if (op.action === "add") {
      board.objects.push(op.object);
      state.undoStack.push(op);
    } else if (op.action === "clear") {
      const before = board.objects;
      board.objects = op.objects.slice();
      state.undoStack.push({ action: "clear", objects: before });
    }
    board.modifiedAt = Date.now();
    scheduleSave();
    updateToolUI();
    render();
  }

  // ----------------------------- Rendering -----------------------------
  function resizeCanvas() {
    const rect = canvasWrap.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    canvasW = Math.max(1, Math.floor(rect.width));
    canvasH = Math.max(1, Math.floor(rect.height));
    canvas.width = Math.floor(canvasW * dpr);
    canvas.height = Math.floor(canvasH * dpr);
    canvas.style.width = canvasW + "px";
    canvas.style.height = canvasH + "px";
    render();
  }

  function render() {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvasW, canvasH);

    const board = currentBoard();
    if (board) {
      for (let i = 0; i < board.objects.length; i++) {
        renderObject(board.objects[i]);
      }
    }
    if (state.currentStroke) {
      renderObject(state.currentStroke);
    }
    ctx.restore();

    updateEmptyHint();
  }

  function renderObject(obj) {
    if (obj.type === "stroke") {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = obj.color;
      ctx.fillStyle = obj.color;
      ctx.lineWidth = obj.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      drawPath(obj.points, obj.width);
    } else if (obj.type === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.strokeStyle = "rgba(0,0,0,1)";
      ctx.fillStyle = "rgba(0,0,0,1)";
      ctx.lineWidth = obj.width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      drawPath(obj.points, obj.width);
      ctx.globalCompositeOperation = "source-over";
    } else if (obj.type === "text") {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = obj.color || "#000000";
      const fs = obj.fontSize || 24;
      ctx.font = `${fs}px Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textBaseline = "top";
      const lines = String(obj.text).split("\n");
      let y = obj.y;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], obj.x, y);
        y += fs * 1.25;
      }
    }
  }

  function drawPath(points, width) {
    if (!points || points.length === 0) return;
    if (points.length === 1) {
      const p = points[0];
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, width / 2), 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length - 1; i++) {
      const midX = (points[i].x + points[i + 1].x) / 2;
      const midY = (points[i].y + points[i + 1].y) / 2;
      ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
  }

  function updateEmptyHint() {
    const b = currentBoard();
    if (!b || b.objects.length === 0) {
      show(emptyHint);
      emptyHint.classList.add("flex");
    } else {
      hide(emptyHint);
      emptyHint.classList.remove("flex");
    }
  }

  // ----------------------------- Drawing -----------------------------
  function getCanvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e) {
    if (state.isDrawing) return;
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
    state.pointerId = e.pointerId;
    const pt = getCanvasPoint(e);
    state.pressStart = pt;

    if (state.tool === "text") {
      openTextDialog(pt);
      return;
    }

    state.isDrawing = true;
    if (state.tool === "eraser") {
      state.currentStroke = {
        type: "erase",
        width: state.eraserSize,
        points: [pt],
      };
    } else {
      state.currentStroke = {
        type: "stroke",
        color: state.color,
        width: state.strokeSize,
        points: [pt],
      };
    }

    if (state.longPressTimer) clearTimeout(state.longPressTimer);
    state.longPressTimer = setTimeout(() => {
      state.longPressTimer = null;
      if (
        state.isDrawing &&
        state.currentStroke &&
        state.currentStroke.points.length <= 1
      ) {
        const startPt = state.pressStart;
        cancelStroke();
        openTextDialog(startPt);
      }
    }, LONG_PRESS_MS);

    render();
  }

  function onPointerMove(e) {
    updateCursorPreview(e);
    if (!state.isDrawing || !state.currentStroke) return;
    if (state.pointerId !== null && e.pointerId !== state.pointerId) return;
    const pt = getCanvasPoint(e);

    if (state.longPressTimer && state.pressStart) {
      const dx = pt.x - state.pressStart.x;
      const dy = pt.y - state.pressStart.y;
      if (dx * dx + dy * dy > LONG_PRESS_MOVE_TOLERANCE * LONG_PRESS_MOVE_TOLERANCE) {
        clearTimeout(state.longPressTimer);
        state.longPressTimer = null;
      }
    }

    const pts = state.currentStroke.points;
    const last = pts[pts.length - 1];
    if (Math.abs(pt.x - last.x) > 0.5 || Math.abs(pt.y - last.y) > 0.5) {
      pts.push(pt);
      render();
    }
  }

  function onPointerUp(e) {
    if (state.longPressTimer) {
      clearTimeout(state.longPressTimer);
      state.longPressTimer = null;
    }
    if (!state.isDrawing || !state.currentStroke) return;
    if (state.pointerId !== null && e.pointerId !== state.pointerId) return;

    try { canvas.releasePointerCapture(e.pointerId); } catch (_) {}
    const stroke = state.currentStroke;
    state.isDrawing = false;
    state.currentStroke = null;
    state.pointerId = null;
    state.pressStart = null;
    commitObject(stroke);
  }

  function cancelStroke() {
    state.isDrawing = false;
    state.currentStroke = null;
    state.pointerId = null;
    state.pressStart = null;
    if (state.longPressTimer) {
      clearTimeout(state.longPressTimer);
      state.longPressTimer = null;
    }
    render();
  }

  function onDoubleClick(e) {
    if (state.tool === "text") return;
    const pt = getCanvasPoint(e);
    openTextDialog(pt);
  }

  // ----------------------------- Cursor preview -----------------------------
  function updateCursorPreview(e) {
    if (!e || e.pointerType === "touch") {
      hide(cursorPreview);
      return;
    }
    if (state.tool === "text") {
      hide(cursorPreview);
      return;
    }
    const wrapRect = canvasWrap.getBoundingClientRect();
    const size = state.tool === "eraser" ? state.eraserSize : state.strokeSize;
    cursorPreview.style.width = size + "px";
    cursorPreview.style.height = size + "px";
    cursorPreview.style.left = (e.clientX - wrapRect.left - size / 2) + "px";
    cursorPreview.style.top = (e.clientY - wrapRect.top - size / 2) + "px";
    if (state.tool === "eraser") {
      cursorPreview.style.borderColor = "rgba(120,120,120,0.7)";
      cursorPreview.style.background = "rgba(255,255,255,0.25)";
    } else {
      cursorPreview.style.borderColor = hexToRgba(state.color, 0.55);
      cursorPreview.style.background = "transparent";
    }
    show(cursorPreview);
  }

  function hideCursorPreview() {
    hide(cursorPreview);
  }

  // ----------------------------- Text dialog -----------------------------
  function openTextDialog(pt) {
    state.pendingTextPoint = pt;
    textInput.value = "";
    textFontSize.value = String(state.fontSize);
    showModal(textOverlay);
    setTimeout(() => textInput.focus(), 30);
  }

  function closeTextDialog() {
    hideModal(textOverlay);
    state.pendingTextPoint = null;
  }

  function confirmTextDialog() {
    const txt = textInput.value;
    if (!state.pendingTextPoint || !txt || !txt.trim()) {
      closeTextDialog();
      return;
    }
    const fs = parseInt(textFontSize.value, 10) || 24;
    state.fontSize = fs;
    commitObject({
      type: "text",
      text: txt,
      x: state.pendingTextPoint.x,
      y: state.pendingTextPoint.y,
      color: state.color,
      fontSize: fs,
    });
    closeTextDialog();
    updateSizeUI();
  }

  // ----------------------------- Prompt / Confirm -----------------------------
  function showPrompt(message, defaultValue) {
    return new Promise((resolve) => {
      promptMessage.textContent = message;
      promptInput.value = defaultValue || "";
      showModal(promptOverlay);
      setTimeout(() => { promptInput.focus(); promptInput.select(); }, 30);

      function cleanup() {
        hideModal(promptOverlay);
        promptOkBtn.removeEventListener("click", onOk);
        promptCancelBtn.removeEventListener("click", onCancel);
        promptInput.removeEventListener("keydown", onKey);
        promptOverlay.removeEventListener("click", onBackdrop);
      }
      function onOk() { const v = promptInput.value; cleanup(); resolve(v); }
      function onCancel() { cleanup(); resolve(null); }
      function onKey(e) {
        if (e.key === "Enter") { e.preventDefault(); onOk(); }
        else if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }
      function onBackdrop(e) { if (e.target === promptOverlay) onCancel(); }
      promptOkBtn.addEventListener("click", onOk);
      promptCancelBtn.addEventListener("click", onCancel);
      promptInput.addEventListener("keydown", onKey);
      promptOverlay.addEventListener("click", onBackdrop);
    });
  }

  function showConfirm(message) {
    return new Promise((resolve) => {
      confirmMessage.textContent = message;
      showModal(confirmOverlay);
      setTimeout(() => confirmYesBtn.focus(), 30);

      function cleanup() {
        hideModal(confirmOverlay);
        confirmYesBtn.removeEventListener("click", onYes);
        confirmNoBtn.removeEventListener("click", onNo);
        document.removeEventListener("keydown", onKey);
        confirmOverlay.removeEventListener("click", onBackdrop);
      }
      function onYes() { cleanup(); resolve(true); }
      function onNo() { cleanup(); resolve(false); }
      function onKey(e) {
        if (e.key === "Enter") { e.preventDefault(); onYes(); }
        else if (e.key === "Escape") { e.preventDefault(); onNo(); }
      }
      function onBackdrop(e) { if (e.target === confirmOverlay) onNo(); }
      confirmYesBtn.addEventListener("click", onYes);
      confirmNoBtn.addEventListener("click", onNo);
      document.addEventListener("keydown", onKey);
      confirmOverlay.addEventListener("click", onBackdrop);
    });
  }

  // ----------------------------- File I/O -----------------------------
  function downloadCurrentBoard() {
    const b = currentBoard();
    if (!b) return;
    const payload = {
      version: FILE_VERSION,
      name: b.name,
      objects: b.objects,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = sanitizeFileName(b.name) + ".wb";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Downloaded "${a.download}"`);
  }

  function handleFileUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(String(reader.result));
        if (
          !data ||
          data.version !== FILE_VERSION ||
          typeof data.name !== "string" ||
          !Array.isArray(data.objects)
        ) {
          showToast("Invalid whiteboard file.");
          return;
        }
        const objects = data.objects.filter(isValidObject);
        const board = {
          id: uuid(),
          name: data.name || "Imported Board",
          createdAt: Date.now(),
          modifiedAt: Date.now(),
          objects: objects,
        };
        state.boards.push(board);
        state.currentBoardId = board.id;
        state.undoStack = [];
        state.redoStack = [];
        refreshBoardSelect();
        render();
        updateToolUI();
        scheduleSave();
        showToast(`Imported "${board.name}"`);
      } catch (e) {
        showToast("Invalid whiteboard file.");
        console.error(e);
      }
    };
    reader.onerror = () => showToast("Could not read file.");
    reader.readAsText(file);
  }

  // ----------------------------- UI updates -----------------------------
  function setTool(tool) {
    state.tool = tool;
    toolPenBtn.classList.toggle("active", tool === "pen");
    toolEraserBtn.classList.toggle("active", tool === "eraser");
    toolTextBtn.classList.toggle("active", tool === "text");

    if (tool === "text") {
      canvas.style.cursor = "text";
      hideCursorPreview();
    } else {
      canvas.style.cursor = "none";
    }
    updateSizeUI();
  }

  function setColor(color) {
    state.color = color;
    colorPreview.style.background = color;
    customColorInput.value = normalizeHexColor(color);
    updateSwatchSelection();
    updateSizeUI();
  }

  function normalizeHexColor(c) {
    if (typeof c !== "string") return "#000000";
    if (/^#[0-9a-fA-F]{6}$/.test(c)) return c.toLowerCase();
    return "#000000";
  }

  function updateSwatchSelection() {
    colorGrid.querySelectorAll(".color-swatch").forEach((s) => {
      s.classList.toggle(
        "selected",
        (s.dataset.color || "").toLowerCase() === state.color.toLowerCase()
      );
    });
  }

  function updateSizeUI() {
    let size, label, isFont = false;
    if (state.tool === "eraser") {
      size = state.eraserSize;
      label = size + " px";
    } else if (state.tool === "text") {
      size = state.fontSize;
      label = size + " pt";
      isFont = true;
    } else {
      size = state.strokeSize;
      label = size + " px";
    }
    const dotPx = Math.min(28, Math.max(4, isFont ? Math.min(20, size / 2) : size));
    sizePreview.style.width = dotPx + "px";
    sizePreview.style.height = dotPx + "px";
    if (isFont) {
      sizePreview.style.background = "transparent";
      sizePreview.style.border = "1px solid #9ca3af";
    } else {
      sizePreview.style.border = "none";
      sizePreview.style.background = state.tool === "eraser" ? "#9ca3af" : state.color;
    }
    sizeLabel.textContent = label;
  }

  function updateToolUI() {
    undoBtn.disabled = state.undoStack.length === 0;
    redoBtn.disabled = state.redoStack.length === 0;
    const b = currentBoard();
    clearBtn.disabled = !b || b.objects.length === 0;
    boardDeleteBtn.disabled = state.boards.length <= 1;
    updateSizeUI();
  }

  // ----------------------------- Build dynamic UI -----------------------------
  function buildColorGrid() {
    colorGrid.innerHTML = "";
    DEFAULT_COLORS.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "color-swatch";
      btn.dataset.color = c;
      btn.setAttribute("aria-label", c);
      btn.style.background = c;
      if (c === "#ffffff") btn.style.outlineColor = "#9ca3af";
      btn.addEventListener("click", () => {
        setColor(c);
        closePopups();
      });
      colorGrid.appendChild(btn);
    });
  }

  function buildSizeOptions() {
    sizeOptions.innerHTML = "";
    let sizes, current, kind;
    if (state.tool === "eraser") {
      sizes = ERASER_SIZES; current = state.eraserSize; kind = "eraser";
    } else if (state.tool === "text") {
      sizes = FONT_SIZES; current = state.fontSize; kind = "font";
    } else {
      sizes = PEN_SIZES; current = state.strokeSize; kind = "pen";
    }
    sizes.forEach((s) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "size-option" + (s === current ? " selected" : "");

      const preview = document.createElement("span");
      if (kind === "font") {
        preview.textContent = String(s);
        preview.style.fontWeight = "600";
        preview.style.width = "32px";
        preview.style.textAlign = "center";
      } else {
        const d = Math.min(28, Math.max(4, s));
        preview.style.display = "inline-block";
        preview.style.width = d + "px";
        preview.style.height = d + "px";
        preview.style.borderRadius = "50%";
        preview.style.flexShrink = "0";
        preview.style.background = kind === "eraser" ? "#9ca3af" : state.color;
      }
      btn.appendChild(preview);

      const lbl = document.createElement("span");
      lbl.textContent = s + (kind === "font" ? " pt" : " px");
      btn.appendChild(lbl);

      btn.addEventListener("click", () => {
        if (kind === "eraser") state.eraserSize = s;
        else if (kind === "font") state.fontSize = s;
        else state.strokeSize = s;
        closePopups();
        updateSizeUI();
      });
      sizeOptions.appendChild(btn);
    });
  }

  // ----------------------------- Popups -----------------------------
  function positionPopupNear(popup, anchor) {
    show(popup);
    const r = anchor.getBoundingClientRect();
    const pr = popup.getBoundingClientRect();
    let top = r.bottom + 6;
    let left = r.left;
    if (left + pr.width > window.innerWidth - 8) {
      left = window.innerWidth - pr.width - 8;
    }
    if (left < 8) left = 8;
    if (top + pr.height > window.innerHeight - 8) {
      top = r.top - pr.height - 6;
    }
    if (top < 8) top = 8;
    popup.style.top = top + "px";
    popup.style.left = left + "px";
  }

  function closePopups() {
    hide(colorPopup);
    hide(sizePopup);
  }

  function toggleColorPopup() {
    if (!colorPopup.classList.contains("hidden")) { closePopups(); return; }
    closePopups();
    updateSwatchSelection();
    positionPopupNear(colorPopup, colorBtn);
  }

  function toggleSizePopup() {
    if (!sizePopup.classList.contains("hidden")) { closePopups(); return; }
    closePopups();
    buildSizeOptions();
    positionPopupNear(sizePopup, sizeBtn);
  }

  // ----------------------------- Drag and drop -----------------------------
  function wireDragDrop() {
    let dragCounter = 0;
    canvasWrap.addEventListener("dragenter", (e) => {
      e.preventDefault();
      dragCounter++;
      canvasWrap.classList.add("drop-active");
    });
    canvasWrap.addEventListener("dragover", (e) => { e.preventDefault(); });
    canvasWrap.addEventListener("dragleave", () => {
      dragCounter = Math.max(0, dragCounter - 1);
      if (dragCounter === 0) canvasWrap.classList.remove("drop-active");
    });
    canvasWrap.addEventListener("drop", (e) => {
      e.preventDefault();
      dragCounter = 0;
      canvasWrap.classList.remove("drop-active");
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (!file) return;
      if (!/\.wb$/i.test(file.name) && file.type !== "application/json") {
        showToast("Only .wb files are supported.");
        return;
      }
      handleFileUpload(file);
    });
    window.addEventListener("dragover", (e) => { e.preventDefault(); });
    window.addEventListener("drop", (e) => { e.preventDefault(); });
  }

  // ----------------------------- Event wiring -----------------------------
  function wireEvents() {
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => resizeCanvas());
      ro.observe(canvasWrap);
    }
    window.addEventListener("resize", resizeCanvas);
    window.addEventListener("orientationchange", () => setTimeout(resizeCanvas, 200));

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", hideCursorPreview);
    canvas.addEventListener("pointerenter", updateCursorPreview);
    canvas.addEventListener("dblclick", onDoubleClick);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    boardSelect.addEventListener("change", (e) => switchBoard(e.target.value));
    boardNewBtn.addEventListener("click", async () => {
      const name = await showPrompt("Board name", "");
      if (name === null) return;
      const trimmed = (name || "").trim();
      if (!trimmed) { showToast("Board name required."); return; }
      createBoard(trimmed);
    });
    boardRenameBtn.addEventListener("click", async () => {
      const b = currentBoard();
      if (!b) return;
      const name = await showPrompt("Rename board", b.name);
      if (name === null) return;
      const trimmed = (name || "").trim();
      if (!trimmed) { showToast("Board name required."); return; }
      renameBoard(b.id, trimmed);
    });
    boardDeleteBtn.addEventListener("click", async () => {
      const b = currentBoard();
      if (!b) return;
      if (state.boards.length <= 1) { showToast("Can't delete the last board."); return; }
      const ok = await showConfirm(`Delete "${b.name}"?`);
      if (ok) deleteBoard(b.id);
    });

    toolPenBtn.addEventListener("click", () => setTool("pen"));
    toolEraserBtn.addEventListener("click", () => setTool("eraser"));
    toolTextBtn.addEventListener("click", () => setTool("text"));

    colorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleColorPopup();
    });
    colorPopup.addEventListener("click", (e) => e.stopPropagation());
    customColorInput.addEventListener("input", () => setColor(customColorInput.value));

    sizeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSizePopup();
    });
    sizePopup.addEventListener("click", (e) => e.stopPropagation());

    document.addEventListener("click", closePopups);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePopups();
    });

    undoBtn.addEventListener("click", undo);
    redoBtn.addEventListener("click", redo);
    clearBtn.addEventListener("click", async () => {
      const b = currentBoard();
      if (!b || b.objects.length === 0) return;
      const ok = await showConfirm("Clear this board?");
      if (ok) clearCurrentBoard();
    });

    downloadBtn.addEventListener("click", downloadCurrentBoard);
    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) handleFileUpload(file);
      fileInput.value = "";
    });

    textOkBtn.addEventListener("click", confirmTextDialog);
    textCancelBtn.addEventListener("click", closeTextDialog);
    textOverlay.addEventListener("click", (e) => {
      if (e.target === textOverlay) closeTextDialog();
    });
    textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        confirmTextDialog();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeTextDialog();
      }
    });

    helpBtn.addEventListener("click", () => showModal(helpOverlay));
    helpCloseBtn.addEventListener("click", () => hideModal(helpOverlay));
    helpOkBtn.addEventListener("click", () => hideModal(helpOverlay));
    helpOverlay.addEventListener("click", (e) => {
      if (e.target === helpOverlay) hideModal(helpOverlay);
    });

    document.addEventListener("keydown", (e) => {
      // Global Esc closes the help modal
      if (e.key === "Escape" && isModalOpen(helpOverlay)) {
        e.preventDefault();
        hideModal(helpOverlay);
        return;
      }
      const inField =
        document.activeElement &&
        (document.activeElement.tagName === "INPUT" ||
          document.activeElement.tagName === "TEXTAREA" ||
          document.activeElement.tagName === "SELECT");
      if (inField) return;

      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && key === "z") {
        e.preventDefault(); undo();
      } else if (
        ((e.ctrlKey || e.metaKey) && key === "y") ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && key === "z")
      ) {
        e.preventDefault(); redo();
      } else if (key === "p") {
        setTool("pen");
      } else if (key === "e") {
        setTool("eraser");
      } else if (key === "t") {
        setTool("text");
      }
    });

    wireDragDrop();
  }

  // ----------------------------- Init -----------------------------
  function init() {
    buildColorGrid();
    loadData();
    refreshBoardSelect();
    setColor(state.color);
    setTool("pen");
    wireEvents();
    resizeCanvas();
    updateToolUI();
    setSaveStatus("idle");

    // Replace <i data-lucide="..."> placeholders with SVG icons.
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      try { window.lucide.createIcons(); } catch (e) { console.warn(e); }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
