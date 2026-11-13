# Developer Documentation

## 1. Project Overview

This project is a lightweight, browser-based whiteboard application
implemented with vanilla JavaScript and the HTML5 Canvas 2D API.

The application supports multiple boards, freehand drawing, erasing,
text placement, undo/redo, automatic browser-local persistence, and
importing/exporting board files.

The supplied JavaScript is a self-invoking module. It initializes after
the DOM is ready and expects the page to provide the HTML elements
identified by the DOM IDs listed in [UI and DOM
contract](#7-ui-and-dom-contract).

### Design characteristics

-   Client-side only: the supplied JavaScript contains no application
    backend or network API calls.
-   No framework dependency is used by the application logic.
-   Drawing data is stored as structured objects and rendered onto a
    canvas.
-   Browser `localStorage` is used for automatic persistence.
-   A `.wb` export is a JSON document with a version field.

> Scope note: this document is based on the supplied JavaScript source.
> The corresponding HTML, CSS, and any hosting configuration were not
> supplied. Their exact structure, styling, and deployment setup
> therefore cannot be verified here.

## 2. Technology Stack

  -----------------------------------------------------------------------
  Area                                Implementation
  ----------------------------------- -----------------------------------
  Application logic                   Vanilla JavaScript

  Rendering                           HTML5 Canvas 2D context

  Input handling                      Pointer Events

  Persistence                         Browser `localStorage`

  Import                              `FileReader`

  Export                              `Blob`, object URL, and temporary
                                      download link

  Responsive canvas sizing            `ResizeObserver` when available,
                                      plus window resize events

  Icons                               Optional Lucide browser library, if
                                      present on `window.lucide`
  -----------------------------------------------------------------------

The application does not require a server, database, authentication
provider, or build step in the supplied implementation.

## 3. High-Level Architecture

The code is organized into functional sections inside one JavaScript
IIFE (Immediately Invoked Function Expression).

``` text
Browser Page
│
├── HTML interface
│   ├── Toolbar and board controls
│   ├── Canvas wrapper and canvas
│   ├── Color and size popups
│   └── Text, prompt, confirm, and help overlays
│
└── Whiteboard JavaScript
    │
    ├── Application state
    │   ├── Boards and current board
    │   ├── Active tool and drawing settings
    │   └── Undo/redo and pointer state
    │
    ├── Board management
    │   ├── Create / rename / delete / switch
    │   └── Board selector refresh
    │
    ├── Drawing and rendering
    │   ├── Pointer event handling
    │   ├── Stroke and eraser creation
    │   ├── Text placement
    │   └── Canvas redraw
    │
    ├── History
    │   ├── Commit operations
    │   ├── Undo
    │   └── Redo
    │
    ├── Persistence and file I/O
    │   ├── localStorage load/save
    │   ├── .wb export
    │   └── .wb / JSON import
    │
    └── UI utilities
        ├── Toolbars and popups
        ├── Dialogs and confirmations
        ├── Toasts and save indicator
        └── Keyboard shortcuts
```

### Main data flow

1.  A user interacts with the canvas or toolbar.
2.  Event handlers update application state or create a drawing object.
3.  Completed drawing objects are committed to the current board.
4.  The board is rendered from its stored objects.
5.  A debounced save writes the board collection and current board ID to
    `localStorage`.

## 4. Application State

The main state object is declared near the beginning of the script.

  Property             Purpose
  -------------------- --------------------------------------------------
  `boards`             Array of all whiteboards
  `currentBoardId`     ID of the active board
  `tool`               Active tool: `pen`, `eraser`, or `text`
  `color`              Current drawing/text color
  `strokeSize`         Pen width
  `eraserSize`         Eraser width
  `fontSize`           Text font size
  `undoStack`          Operations available to undo
  `redoStack`          Operations available to redo
  `isDrawing`          Whether a pointer drawing operation is active
  `currentStroke`      Stroke or eraser operation currently being drawn
  `pointerId`          Pointer ID captured for the active operation
  `pressStart`         Initial point used for long-press handling
  `longPressTimer`     Timer used to detect a long press
  `pendingTextPoint`   Canvas point at which text will be placed

The current board is resolved by `currentBoard()`, which finds the board
whose ID matches `currentBoardId`.

## 5. Data Model

### 5.1 Board object

A board has the following structure:

``` javascript
{
  id: "unique-board-id",
  name: "My Board",
  createdAt: 1730000000000,
  modifiedAt: 1730000000000,
  objects: []
}
```

-   `id` is generated with `crypto.randomUUID()` when available, with a
    fallback UUID-like generator.
-   `createdAt` and `modifiedAt` are millisecond timestamps.
-   `objects` contains the board's drawing objects in rendering order.

### 5.2 Supported drawing objects

#### Freehand stroke

``` javascript
{
  type: "stroke",
  color: "#1976d2",
  width: 4,
  points: [
    { x: 100, y: 100 },
    { x: 105, y: 105 },
    { x: 110, y: 112 }
  ]
}
```

A stroke stores its color, width, and an array of canvas-relative
points.

#### Eraser operation

``` javascript
{
  type: "erase",
  width: 16,
  points: [
    { x: 120, y: 120 },
    { x: 125, y: 125 }
  ]
}
```

An eraser operation stores its width and points. It is rendered using
the Canvas `destination-out` compositing operation.

#### Text object

``` javascript
{
  type: "text",
  text: "Example note",
  x: 100,
  y: 150,
  color: "#000000",
  fontSize: 24
}
```

Text is rendered at the specified position. Newline characters are split
into separate lines, with a vertical line spacing of `fontSize * 1.25`.

### 5.3 Object validation

`isValidObject()` accepts:

-   `stroke` objects with a string `color`, numeric `width`, and array
    `points`.
-   `erase` objects with numeric `width` and array `points`.
-   `text` objects with string `text` and numeric `x` and `y`.

This is a basic shape/type check. It does not deeply validate every
point, coordinate, color, or numeric value.

## 6. Rendering and Drawing

### 6.1 Canvas sizing

`resizeCanvas()`:

1.  Reads the dimensions of `canvasWrap`.
2.  Reads `window.devicePixelRatio`.
3.  Sets the canvas bitmap dimensions to the CSS dimensions multiplied
    by the device pixel ratio.
4.  Sets the CSS width and height.
5.  Calls `render()`.

This improves drawing sharpness on high-density displays.

### 6.2 Rendering pipeline

`render()` clears the canvas and renders each object in the current
board's `objects` array in order. If a stroke is currently in progress,
it renders that temporary stroke as well.

`renderObject()` dispatches by object type:

-   `stroke`: draws using the object's color and width.
-   `erase`: draws using `destination-out`.
-   `text`: draws text using the configured font family and size.

`drawPath()` draws a point or a smoothed path. For multiple points it
uses quadratic curve segments between successive points.

### 6.3 Pointer lifecycle

The main pointer handlers are:

-   `onPointerDown()`: captures the pointer, records the starting point,
    and starts a pen or eraser operation. In text mode it opens the text
    dialog.
-   `onPointerMove()`: updates the cursor preview and appends points to
    the active operation.
-   `onPointerUp()`: ends the operation and commits it to the current
    board.
-   `cancelStroke()`: discards the in-progress operation and redraws the
    board.

Pointer capture is used so the active pointer can continue to be tracked
when it moves outside the canvas element.

### 6.4 Long press and double click

A long press of approximately 500 ms, with movement constrained to a 6
px tolerance, opens the text dialog if the user has not begun moving the
pointer.

A double click also opens the text dialog unless the text tool is
already active.

## 7. UI and DOM Contract

The JavaScript looks up its interface elements by ID. The HTML page must
provide elements with these IDs.

  -----------------------------------------------------------------------
  Group                               Required IDs
  ----------------------------------- -----------------------------------
  Canvas                              `canvas`, `canvas-wrap`

  Board controls                      `board-select`, `board-new`,
                                      `board-rename`, `board-delete`

  Tools                               `tool-pen`, `tool-eraser`,
                                      `tool-text`

  Color picker                        `color-btn`, `color-preview`,
                                      `color-popup`, `color-grid`,
                                      `custom-color`

  Size picker                         `size-btn`, `size-preview`,
                                      `size-label`, `size-popup`,
                                      `size-options`

  History/actions                     `undo`, `redo`, `clear`,
                                      `download`, `upload`, `file-input`

  Text dialog                         `text-overlay`, `text-input`,
                                      `text-font-size`, `text-ok`,
                                      `text-cancel`

  Prompt dialog                       `prompt-overlay`, `prompt-message`,
                                      `prompt-input`, `prompt-ok`,
                                      `prompt-cancel`

  Confirm dialog                      `confirm-overlay`,
                                      `confirm-message`, `confirm-yes`,
                                      `confirm-no`

  Help                                `help-btn`, `help-overlay`,
                                      `help-close`, `help-ok`

  Status and feedback                 `save-indicator`, `empty-hint`,
                                      `cursor-preview`, `toast`
  -----------------------------------------------------------------------

The script directly accesses these elements and, for the canvas, calls
`getContext("2d")`. Missing required elements can cause initialization
or later interactions to fail.

The code also expects the relevant CSS classes to exist, including
`hidden`, `flex`, `active`, `selected`, and `drop-active`, as well as
the layout and visual styles used by the page.

## 8. Board Management

Board management functions:

  -----------------------------------------------------------------------
  Function                            Responsibility
  ----------------------------------- -----------------------------------
  `createBoard(name, opts)`           Creates a board, selects it, resets
                                      history, refreshes UI, and
                                      schedules saving

  `deleteBoard(id)`                   Deletes a board and selects another
                                      if necessary

  `renameBoard(id, name)`             Changes the board name and
                                      modification timestamp

  `switchBoard(id)`                   Changes the active board and resets
                                      undo/redo history

  `refreshBoardSelect()`              Rebuilds the board selector options

  `currentBoard()`                    Returns the active board
  -----------------------------------------------------------------------

The application prevents deletion of the last remaining board.

## 9. Undo and Redo

History is operation-based.

`commitObject(obj)` appends an object to the current board and pushes an
`add` operation onto the undo stack. It clears the redo stack.

The clear operation stores the previous objects array in a `clear`
history entry so it can be restored.

Supported history actions:

-   `add`: undo removes the added object; redo adds it again.
-   `clear`: undo restores the saved objects; redo restores the cleared
    state.

History is held in JavaScript memory. It is not included in the
`localStorage` payload or exported board file, so undo/redo history is
lost when the page is reloaded or when the active board is switched.

## 10. Persistence

### 10.1 Browser storage key

The application stores data under:

``` text
whiteboards
```

The saved payload is:

``` javascript
{
  boards: state.boards,
  currentBoardId: state.currentBoardId
}
```

### 10.2 Save lifecycle

-   `scheduleSave()` marks the UI as saving.
-   Existing pending save timers are cleared.
-   A new save is scheduled after `SAVE_DEBOUNCE_MS` (300 ms).
-   `saveNow()` serializes the board collection and current board ID and
    writes them to `localStorage`.
-   The save indicator changes to `Saved` or `Save failed`.

If browser storage throws an error, the application displays a
storage-limit warning.

### 10.3 Loading

`loadData()` reads the `whiteboards` key and parses its JSON value.

Boards are passed through `normalizeBoard()`, which supplies missing
IDs, names, timestamps, and valid object arrays. The saved current board
is selected if it still exists; otherwise, the first board is selected.

If no usable saved data exists, the application creates a board named
`My Board`.

### 10.4 Storage considerations

-   Data belongs to the browser profile and origin where the application
    is opened.
-   Data is not synchronised across devices.
-   Clearing site/browser storage can remove saved boards.
-   Large boards can eventually exceed browser storage quotas.
-   Users should export important boards as backups.

## 11. Import and Export

### 11.1 Export format

`downloadCurrentBoard()` exports only the active board.

The `.wb` file is JSON with this structure:

``` json
{
  "version": 1,
  "name": "My Board",
  "objects": []
}
```

The filename is derived from the board name, with filesystem-invalid
characters replaced by underscores.

### 11.2 Import behavior

`handleFileUpload(file)`:

1.  Reads the selected file as text using `FileReader`.
2.  Parses the text as JSON.
3.  Requires `version` to equal `1`.
4.  Requires a string `name` and an array `objects`.
5.  Filters the objects through `isValidObject()`.
6.  Creates a new board and makes it the active board.
7.  Schedules persistence.

Import does not overwrite an existing board. It adds a new board.

The file input and drag-and-drop handlers accept `.wb` files or files
with the `application/json` MIME type. The imported file is expected to
follow the application's version 1 format.

## 12. User Interaction and Keyboard Shortcuts

  Shortcut                 Action
  ------------------------ ----------------------------------------------
  `P`                      Select pen
  `E`                      Select eraser
  `T`                      Select text
  `Ctrl/Cmd + Z`           Undo
  `Ctrl/Cmd + Y`           Redo
  `Ctrl/Cmd + Shift + Z`   Redo
  `Escape`                 Close popups; also closes applicable dialogs

The global drawing shortcuts are ignored when an input, textarea, or
select element has focus.

## 13. Configuration Constants

The following values are defined near the top of the JavaScript file.

  ------------------------------------------------------------------------------------
  Constant                                         Current value Purpose
  ----------------------------- -------------------------------- ---------------------
  `STORAGE_KEY`                                  `"whiteboards"` Browser storage key

  `SAVE_DEBOUNCE_MS`                                       `300` Delay before saving

  `LONG_PRESS_MS`                                          `500` Long-press threshold

  `LONG_PRESS_MOVE_TOLERANCE`                                `6` Maximum movement for
                                                                 long press, in CSS
                                                                 pixels

  `FILE_VERSION`                                             `1` Export/import format
                                                                 version

  `PEN_SIZES`                         `[1, 2, 4, 8, 12, 16, 24]` Available pen widths

  `ERASER_SIZES`                               `[8, 16, 32, 64]` Available eraser
                                                                 widths

  `FONT_SIZES`                    `[12, 16, 20, 24, 32, 48, 64]` Available font sizes
  ------------------------------------------------------------------------------------

Default colors are defined in `DEFAULT_COLORS`.

## 14. Initialization

The application starts through `init()`.

Initialization performs these steps:

1.  Builds the color picker.
2.  Loads saved boards from local storage.
3.  Refreshes the board selector.
4.  Sets the default color.
5.  Selects the pen tool.
6.  Registers event handlers.
7.  Sizes and renders the canvas.
8.  Updates toolbar state.
9.  Sets the save indicator to its initial state.
10. Initializes Lucide icons if the library is present.

If the document is still loading, initialization is registered for
`DOMContentLoaded`; otherwise it runs immediately.

## 15. Error Handling and Validation

The implementation includes basic handling for:

-   Unavailable or malformed local storage data.
-   JSON parsing failures during load or import.
-   Browser storage write failures.
-   Invalid whiteboard file structure or version.
-   File reading errors.
-   Attempts to delete the last board.
-   Empty board names.
-   Confirmation before deleting a board or clearing its contents.

Validation is intentionally lightweight. Imported JSON should be treated
as untrusted input. The current validator checks basic object fields but
does not comprehensively validate nested point data or impose file-size
and object-count limits.

## 16. Security and Privacy Notes

Based on the supplied JavaScript:

-   Board contents are stored in browser `localStorage`.
-   The code does not contain `fetch`, `XMLHttpRequest`, WebSocket, or
    other application-level network transmission logic.
-   No authentication or server-side access control is implemented.
-   Imported files are parsed as JSON and rendered through Canvas APIs.
-   Text entered by the user is drawn on the canvas rather than inserted
    as HTML markup.

This assessment applies to the supplied JavaScript only. Review the
HTML, CSS, hosting environment, and any externally loaded scripts
separately before making broader security or privacy claims.

## 17. Known Limitations

The supplied implementation does not provide:

-   Real-time collaboration or multi-user editing.
-   User accounts or authentication.
-   Cloud persistence or cross-device synchronisation.
-   Infinite canvas, zoom, or pan.
-   Shape tools such as rectangles, circles, lines, and arrows.
-   Selection, movement, or resizing of existing objects.
-   Image insertion.
-   Persistent undo/redo history.
-   Vector or image export formats such as SVG or PNG.
-   Deep validation or resource limits for imported files.

Canvas resizing resets the canvas bitmap and triggers a redraw. Stored
coordinates are canvas-relative; the code does not maintain a separate,
fixed logical coordinate system or scale existing objects when the
canvas dimensions change.

## 18. Potential Development Improvements

The following are possible future enhancements, not features currently
implemented:

1.  Add zoom and pan with a logical canvas coordinate system.
2.  Add selection and editing of existing objects.
3.  Add shape, line, arrow, and image tools.
4.  Add PNG and SVG export.
5.  Add persistent history or checkpoint-based undo/redo.
6.  Add IndexedDB storage for larger boards.
7.  Add optional cloud synchronisation and collaboration.
8.  Strengthen import validation, including point-level checks and
    file-size/object-count limits.
9.  Add automated tests for drawing operations, history, board
    management, and file compatibility.
10. Add accessibility improvements for toolbar controls and dialogs.

When changing the `.wb` structure, update `FILE_VERSION` and implement
an explicit migration or compatibility strategy so older exported files
can be handled predictably.

## 19. Developer Checklist

Before submitting a change, verify the relevant behavior:

-   [ ] The application initializes with an empty browser storage state.
-   [ ] A saved board is restored after reloading the page.
-   [ ] Multiple boards can be created, renamed, switched, and deleted.
-   [ ] The last remaining board cannot be deleted.
-   [ ] Pen drawing works with mouse and touch input.
-   [ ] Eraser operations remove the expected canvas content.
-   [ ] Text can be inserted and rendered on multiple lines.
-   [ ] Undo and redo work for additions and clear operations.
-   [ ] The clear action requires confirmation.
-   [ ] Exported `.wb` files can be imported.
-   [ ] Invalid or unsupported import files are rejected.
-   [ ] Canvas resizing redraws the current board.
-   [ ] Storage errors are communicated to the user.

------------------------------------------------------------------------

**Implementation reference:** This document describes the behavior and
structure of the supplied whiteboard JavaScript implementation. Confirm
the HTML, CSS, and deployment files before changing the page structure
or documenting deployment-specific commands.
