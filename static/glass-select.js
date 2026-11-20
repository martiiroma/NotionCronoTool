// Reusable glass dropdown.
//
// The list of a native <select> is drawn by Windows and cannot get the glass
// look, so we build our own: a button that opens a list of options.
// Used for the blocks now, and later for the feeling and the tasks.
//
// Usage:
//   const select = createGlassSelect(rootElement, { placeholder, label, onChange });
//   select.setOptions(["A", "B"]);  select.value;  select.setDisabled(true);
//
// Keyboard: arrows move, Enter/Space choose, Esc closes.

function createGlassSelect(root, { placeholder, label, onChange }) {
  let options = [];
  let selectedValue = "";
  let activeIndex = -1;

  // The button that shows the current choice.
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "glass-select-trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  root.append(trigger);

  // The list is attached to <body>: a blur inside another blurred box would
  // only see that box, not the video behind it.
  const list = document.createElement("ul");
  list.className = "glass-select-list glass";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", label);
  list.hidden = true;
  document.body.append(list);

  function updateTrigger() {
    trigger.textContent = selectedValue || placeholder;
    trigger.classList.toggle("is-placeholder", !selectedValue);
    trigger.setAttribute("aria-label", `${label}: ${selectedValue || placeholder}`);
  }

  function renderOptions() {
    list.replaceChildren();
    options.forEach((option, index) => {
      const item = document.createElement("li");
      item.id = `${root.id}-option-${index}`;
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option === selectedValue));
      item.textContent = option;
      item.addEventListener("click", () => choose(index));
      item.addEventListener("mousemove", () => setActive(index));
      list.append(item);
    });
  }

  function setActive(index) {
    activeIndex = index;
    [...list.children].forEach((item, i) => item.classList.toggle("is-active", i === index));
    const activeItem = list.children[index];
    if (activeItem) {
      trigger.setAttribute("aria-activedescendant", activeItem.id);
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }

  function isOpen() {
    return !list.hidden;
  }

  function open() {
    if (trigger.disabled || options.length === 0) {
      return;
    }
    // Place the list just below the box that contains the dropdown.
    const box = root.getBoundingClientRect();
    list.style.left = `${box.left}px`;
    list.style.top = `${box.bottom + 8}px`;
    list.style.minWidth = `${box.width}px`;
    list.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    setActive(Math.max(0, options.indexOf(selectedValue)));
  }

  function close() {
    list.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-activedescendant");
  }

  function choose(index) {
    selectedValue = options[index];
    updateTrigger();
    renderOptions();
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
      setActive(Math.min(options.length - 1, activeIndex + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(0, activeIndex - 1));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(activeIndex);
    } else if (event.key === "Escape" || event.key === "Tab") {
      close();
    }
  }

  trigger.addEventListener("click", () => (isOpen() ? close() : open()));
  trigger.addEventListener("keydown", handleKey);

  // Close when clicking elsewhere, resizing the window or scrolling the page.
  document.addEventListener("click", (event) => {
    if (isOpen() && !root.contains(event.target) && !list.contains(event.target)) {
      close();
    }
  });
  window.addEventListener("resize", close);
  window.addEventListener("scroll", (event) => {
    if (!list.contains(event.target)) {
      close();
    }
  }, true);

  updateTrigger();

  return {
    get value() {
      return selectedValue;
    },
    setOptions(newOptions) {
      options = newOptions;
      renderOptions();
    },
    setValue(value) {
      selectedValue = options.includes(value) ? value : "";
      updateTrigger();
      renderOptions();
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
