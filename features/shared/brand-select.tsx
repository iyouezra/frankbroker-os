"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type BrandSelectOption = { value: string; label: string; disabled?: boolean };

type Coords = { left: number; top: number; bottom: number; width: number; drop: "down" | "up" };

/**
 * A brand-styled replacement for a native <select>. The reason it exists: the
 * option list a native <select> opens is drawn by the operating system and
 * cannot be styled with CSS. This renders its own list so the open menu matches
 * the rest of the product, in a portal with fixed positioning so it is never
 * clipped by a drawer or dialog's overflow.
 *
 * It mirrors the native contract — controlled `value` plus `onChange(value)` —
 * so it drops into the existing controlled forms unchanged. Keyboard support
 * matches a real select: Up/Down/Home/End move, Enter/Space select, Esc closes,
 * and typing jumps to a matching option.
 */
export function BrandSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  ariaLabel,
  className,
  menuClassName,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  options: BrandSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  menuClassName?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeahead = useRef<{ term: string; at: number }>({ term: "", at: 0 });
  const listId = useId();

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    setCoords({ left: rect.left, top: rect.bottom, bottom: window.innerHeight - rect.top, width: rect.width, drop: below < 260 && rect.top > below ? "up" : "down" });
  }, []);

  const openMenu = useCallback(() => {
    if (disabled) return;
    place();
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled));
    setOpen(true);
  }, [disabled, place, selectedIndex, options]);

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  const pick = useCallback((index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    close();
  }, [options, onChange, close]);

  // Keep the menu anchored to the trigger while it scrolls or the window resizes.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    const handler = () => place();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, place]);

  // Close on any click outside the trigger or the menu.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      close(false);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [open, close]);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex]);

  const moveActive = (delta: number) => {
    setActiveIndex((current) => {
      let next = current;
      for (let step = 0; step < options.length; step += 1) {
        next = (next + delta + options.length) % options.length;
        if (!options[next]?.disabled) return next;
      }
      return current;
    });
  };

  const jumpToTyped = (key: string) => {
    const now = Date.now();
    typeahead.current = { term: now - typeahead.current.at > 700 ? key : typeahead.current.term + key, at: now };
    const term = typeahead.current.term.toLowerCase();
    const match = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(term));
    if (match >= 0) setActiveIndex(match);
  };

  const onTriggerKey = (event: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); openMenu(); }
      return;
    }
    if (event.key === "Escape") { event.preventDefault(); close(); }
    else if (event.key === "ArrowDown") { event.preventDefault(); moveActive(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); moveActive(-1); }
    else if (event.key === "Home") { event.preventDefault(); setActiveIndex(options.findIndex((option) => !option.disabled)); }
    else if (event.key === "End") { event.preventDefault(); for (let i = options.length - 1; i >= 0; i -= 1) { if (!options[i].disabled) { setActiveIndex(i); break; } } }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(activeIndex); }
    else if (event.key === "Tab") { close(false); }
    else if (event.key.length === 1) { jumpToTyped(event.key); }
  };

  const menu = open && coords ? createPortal(
    <ul
      ref={listRef}
      id={listId}
      role="listbox"
      className={`bselect-pop drop-${coords.drop}${menuClassName ? ` ${menuClassName}` : ""}`}
      style={{ left: coords.left, width: coords.width, ...(coords.drop === "down" ? { top: coords.top } : { bottom: coords.bottom }) }}
    >
      {options.map((option, index) => (
        <li
          key={option.value}
          role="option"
          aria-selected={option.value === value}
          aria-disabled={option.disabled || undefined}
          data-active={index === activeIndex}
          className={`bselect-option${option.value === value ? " selected" : ""}${option.disabled ? " disabled" : ""}`}
          onPointerEnter={() => !option.disabled && setActiveIndex(index)}
          onClick={() => pick(index)}
        >
          <span className="bselect-check" aria-hidden="true">{option.value === value ? "✓" : ""}</span>
          <span>{option.label}</span>
        </li>
      ))}
    </ul>,
    document.body,
  ) : null;

  return (
    <div className={`bselect${className ? ` ${className}` : ""}${disabled ? " disabled" : ""}`}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="bselect-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-controls={open ? listId : undefined}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKey}
      >
        <span className={`bselect-value${selected ? "" : " placeholder"}`}>{selected?.label ?? placeholder}</span>
        <i className="bselect-caret" aria-hidden="true" />
      </button>
      {menu}
    </div>
  );
}
