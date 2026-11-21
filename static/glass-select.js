// Reusable glass dropdown.
//
// The list of a native <select> is drawn by Windows and cannot get the glass
// look, so we build our own: a button that opens a list of options.
// Used for the blocks, the feeling and the tasks.
//
// Usage:
//   const select = createGlassSelect(rootElement, { placeholder, label, onChange });
//   select.setOptions(["A", "B"]);                    // simple texts, or
//   select.setOptions([{ value: "id-1", label: "Name" }]); // an id + a visible name
//   select.value;  select.selectedLabel;  select.setDisabled(true);
//
// Options:
//   container  where the list lives. By default <body>; inside a modal it must
//              be the modal itself, or the list would stay hidden behind it.
//   searchable adds a search box at the top of the list.
//
// Keyboard: arrows move, Enter chooses, Esc closes.

const SEARCH_MIN_SPACE = 360; // px needed below the box; otherwise the list opens upwards
const LIST_MAX_HEIGHT = 300;  // px, tallest list of options
const LIST_MIN_HEIGHT = 120;  // px, never smaller than this
const WINDOW_MARGIN = 16;     // px kept free between the panel and the window edge
const PANEL_PADDING = 24;     // px, panel padding (8 + 8) plus the gap to the box (8)

function createGlassSelect(root, { placeholder, label, onChange, container = document.body, searchable = false }) {
  let options = []; // [{ value, label }]
  let visible = []; // options left after the search filter
  let selectedValue = "";
  let activeIndex = -1;
  let currentPlaceholder = placeholder;

  // The button that shows the current choice.
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "glass-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  root.append(trigger);

  // The floating panel: optional search box + the list of options.
  // It is not inside the box: a blur inside another blurred box would only
  // see that box, not the video behind it.
  const panel = document.createElement("div");
  panel.className = "glass-select-list glass";
  panel.hidden = true;
  container.append(panel);

  let search = null;
  if (searchable) {
    search = document.createElement("input");
    search.type = "search";
    search.className = "glass-select-search";
    search.placeholder = "Cerca…";
    search.setAttribute("aria-label", `Cerca: ${label}`);
    search.addEventListener("input", () => {
      renderOptions();
      setActive(visible.length > 0 ? 0 : -1);
    });
    search.addEventListener("keydown", handleKey);
    panel.append(search);
  }

  const list = document.createElement("ul");
  list.className = "glass-select-options";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", label);
  panel.append(list);

  // ---------- Helpers ----------

  // Lower case and without accents, so "practica" finds "Pràctica".
  function normalize(text) {
    return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  }

  function toOption(option) {
    return typeof option === "string" ? { value: option, label: option } : option;
  }

  function findSelected() {
    return options.find((option) => option.value === selectedValue && option.value !== "");
  }

  function updateTrigger() {
    const selected = findSelected();
    const text = selected ? selected.label : currentPlaceholder;
    trigger.textContent = text;
    trigger.classList.toggle("is-placeholder", !selected);
    trigger.setAttribute("aria-label", `${label}: ${text}`);
  }

  function renderOptions() {
    const query = search ? normalize(search.value.trim()) : "";
    visible = options.filter((option) => normalize(option.label).includes(query));
    list.replaceChildren();

    if (visible.length === 0) {
      const empty = document.createElement("li");
      empty.className = "is-empty";
      empty.textContent = "Cap resultat";
      list.append(empty);
      return;
    }
    visible.forEach((option, index) => {
      const item = document.createElement("li");
      item.id = `${root.id}-option-${index}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.value === selectedValue));
      item.textContent = option.label;
      item.addEventListener("click", () => choose(index));
      item.addEventListener("mousemove", () => setActive(index));
      list.append(item);
    });
  }

  function setActive(index) {
    activeIndex = index;
    [...list.children].forEach((item, i) => item.classList.toggle("is-active", i === index));
    const focused = search || trigger;
    const activeItem = index >= 0 ? list.children[index] : null;
    if (activeItem) {
      focused.setAttribute("aria-activedescendant", activeItem.id);
      activeItem.scrollIntoView({ block: "nearest" });
    } else {
      focused.removeAttribute("aria-activedescendant");
    }
  }

  // ---------- Opening and closing ----------

  function isOpen() {
    return !panel.hidden;
  }

  function open() {
    if (trigger.disabled || options.length === 0) {
      return;
    }
    if (search) {
      search.value = "";
    }
    renderOptions();
    panel.hidden = false;
    placePanel();
    trigger.setAttribute("aria-expanded", "true");
    setActive(Math.max(0, visible.findIndex((option) => option.value === selectedValue)));
    if (search) {
      search.focus();
    }
  }

  // Below the box; above it if there is not enough room at the bottom of the window.
  // The list shrinks so the whole panel (search box included) fits in the window.
  // Inside a modal, positions are measured from the modal's corner.
  function placePanel() {
    const box = root.getBoundingClientRect();
    const origin = container === document.body ? { left: 0, top: 0 } : container.getBoundingClientRect();
    const spaceBelow = window.innerHeight - box.bottom;
    const openUpwards = spaceBelow < SEARCH_MIN_SPACE && box.top > spaceBelow;

    const room = (openUpwards ? box.top : spaceBelow) - WINDOW_MARGIN;
    const searchHeight = search ? search.offsetHeight + 8 : 0;
    const listHeight = Math.min(LIST_MAX_HEIGHT, room - searchHeight - PANEL_PADDING);
    list.style.maxHeight = `${Math.max(LIST_MIN_HEIGHT, listHeight)}px`;

    panel.style.left = `${box.left - origin.left}px`;
    panel.style.minWidth = `${box.width}px`;
    panel.style.maxWidth = `${Math.max(box.width, 480)}px`;
    const top = openUpwards
      ? box.top - origin.top - 8 - panel.offsetHeight
      : box.bottom - origin.top + 8;
    panel.style.top = `${top}px`;
  }

  function close() {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    (search || trigger).removeAttribute("aria-activedescendant");
  }

  function choose(index) {
    const option = visible[index];
    if (!option) {
      return;
    }
    selectedValue = option.value;
    updateTrigger();
    close();
    trigger.focus();
    onChange(selectedValue);
  }

  function handleKey(event) {
    if (!isOpen()) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        open();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(Math.min(visible.length - 1, activeIndex + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(0, activeIndex - 1));
    } else if (event.key === "Enter" || (event.key === " " && !searchable)) {
      // In the search box, Space must type a space.
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === "Escape") {
      event.preventDefault(); // inside a modal, Esc closes only the list
      close();
      trigger.focus();
    } else if (event.key === "Tab") {
      close();
    }
  }

  trigger.addEventListener("click", () => (isOpen() ? close() : open()));
  trigger.addEventListener("keydown", handleKey);

  // Close when clicking elsewhere, resizing the window or scrolling the page.
  document.addEventListener("click", (event) => {
    if (isOpen() && !root.contains(event.target) && !panel.contains(event.target)) {
      close();
    }
  });
  window.addEventListener("resize", close);
  window.addEventListener("scroll", (event) => {
    if (!panel.contains(event.target)) {
      close();
    }
  }, true);

  updateTrigger();

  return {
    get value() {
      return selectedValue;
    },
    get selectedLabel() {
      const selected = findSelected();
      return selected ? selected.label : "";
    },
    setOptions(newOptions) {
      options = newOptions.map(toOption);
      updateTrigger();
    },
    setValue(value) {
      selectedValue = options.some((option) => option.value === value) ? value : "";
      updateTrigger();
    },
    setPlaceholder(text) {
      currentPlaceholder = text;
      updateTrigger();
    },
    setDisabled(disabled) {
      if (trigger.disabled !== disabled) {
        trigger.disabled = disabled;
        if (disabled) {
          close();
        }
      }
    },
  };
}
