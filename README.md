# Whiteboard

A lightweight, browser-based digital whiteboard for drawing, writing notes, and organizing ideas. Built using vanilla JavaScript and the HTML5 Canvas API, it runs entirely in your browser without requiring a backend or user account.

## Features

- **Freehand Drawing** – Draw using a mouse, touchscreen, or stylus.
- **Eraser** – Remove parts of your drawings with adjustable eraser sizes.
- **Text Tool** – Add text anywhere on the canvas with configurable font sizes.
- **Color Picker** – Choose from predefined colors or select a custom color.
- **Adjustable Sizes** – Change pen thickness, eraser size, and text size.
- **Multiple Boards** – Create, rename, delete, and switch between whiteboards.
- **Undo / Redo** – Reverse or restore recent drawing operations.
- **Auto Save** – Automatically saves your work in browser storage.
- **Import / Export** – Download and restore whiteboards using `.wb` files.
- **Drag and Drop** – Import whiteboard files by dropping them onto the canvas.
- **Touch Support** – Supports pointer events for touchscreen and stylus interaction.

## Getting Started

### Requirements

- A modern web browser (Chrome, Firefox, Edge, Safari).
- No server, database, or additional software dependencies are required.

### Installation

1. Download or clone the project.
2. Ensure the HTML, CSS, and JavaScript files are in their expected project locations.
3. Open the application's main HTML file (`index.html`) in a web browser.
4. Open the hosted version here: [Whiteboard](https://whiteboard.scribbler.live)

The application runs locally in the browser.

No build process, package installation, or backend configuration is required.

## How to Use

### 1. Drawing

Select the **Pen** tool from the toolbar.

- Click and drag to draw.
- Select a color using the color picker.
- Adjust the pen thickness using the size selector.
- Use a mouse, touchscreen, or stylus.

### 2. Erasing

Select the **Eraser** tool.

- Click and drag over the portions you want to erase.
- Adjust the eraser size using the size selector.

### 3. Adding Text

Select the **Text** tool and click anywhere on the canvas.

Alternatively, double-click or long-press on the canvas to open the text editor.

- Enter your text.
- Choose the font size.
- Confirm to place the text on the canvas.

The text will appear at the selected location.

### 4. Managing Boards

Use the board selector and management buttons to organize your work.

- **New:** Create a new whiteboard.
- **Rename:** Change the current board's name.
- **Delete:** Delete the current board.
- **Board Selector:** Switch between existing boards.

At least one board is always maintained.

### 5. Undo and Redo

Use the toolbar buttons or keyboard shortcuts:

- Undo the last operation.
- Redo a previously undone operation.

### 6. Clearing a Board

Click the **Clear** button to remove all objects from the current board. A confirmation dialog appears before clearing.

### 7. Saving Your Work

Whiteboards are automatically saved in your browser's local storage.

You do not need to manually save your work.

The application displays a save indicator showing whether changes are being saved or have been saved successfully.

**Important:** Data is stored locally in the browser. It is not automatically synchronised across browsers or devices. Clearing browser data may permanently remove saved whiteboards.

### 8. Importing and Exporting

**Export**

Click the Download button to export the current whiteboard.

The application downloads a `.wb` file containing the board's name and drawing objects.

**Import**

Click the Upload button and select a previously exported `.wb` file.

You can also drag and drop a `.wb` file onto the whiteboard.

Imported boards are added to your existing collection.

## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `P` | Select Pen |
| `E` | Select Eraser |
| `T` | Select Text |
| `Ctrl + Z` | Undo |
| `Ctrl + Y` | Redo |
| `Ctrl + Shift + Z` | Redo |
| `Escape` | Close active popups or dialogs |

On macOS, use `Command` instead of `Ctrl` for undo and redo.

## Data Storage

The application uses browser `localStorage` for persistent storage.

The storage key is:

```javascript
whiteboards
```

Each whiteboard contains:

- Unique board ID
- Board name
- Creation timestamp
- Modification timestamp
- Array of drawing objects

Drawing objects are stored as structured JSON data rather than as a flattened image.

Supported object types:

- `stroke` – Freehand drawing.
- `erase` – Eraser operations.
- `text` – Text elements.

### Export File Format

Exported `.wb` files are JSON documents with the following structure:

```json
{
  "version": 1,
  "name": "My Board",
  "objects": []
}
```

This makes the format relatively simple to inspect and process programmatically.

## Technical Implementation

The application is built using standard browser technologies:

- **HTML** – User interface.
- **CSS** – Styling and layout.
- **JavaScript** – Application logic and state management.
- **HTML5 Canvas API** – Drawing and rendering.
- **Browser Local Storage** – Persistent data storage.
- **File API** – Import and export functionality.

There is no backend or external database dependency.

## Current Limitations

The current implementation is designed as a lightweight whiteboard and does not include:

- Real-time collaboration or multi-user editing.
- Cloud storage or cross-device synchronisation.
- Infinite canvas or zoom/pan functionality.
- Shape drawing tools.
- Individual object selection and movement.
- Image insertion.
- Persistent undo/redo history across browser sessions.

## Privacy

All whiteboard data is stored locally in the browser. The supplied JavaScript does not implement external API communication or upload whiteboard contents to a remote server.

Users are responsible for backing up their work by exporting `.wb` files.

