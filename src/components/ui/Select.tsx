'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
}

interface PopoverPosition {
  left: number;
  width: number;
  placement: 'top' | 'bottom';
  maxHeight: number;
  top: number;
  bottom: number;
}

export default function Select(props: SelectProps) {
  const {
    label,
    options,
    className = '',
    id,
    name,
    title,
    style,
    value,
    defaultValue,
    onChange,
    disabled = false,
    required = false,
    autoFocus,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    ...nativeProps
  } = props;
  const generatedId = useId();
  const selectId = id || `select-${generatedId}`;
  const listboxId = `${selectId}-options`;
  const labelId = `${selectId}-label`;
  const selectRef = useRef<HTMLSelectElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const initialValue = String(defaultValue ?? options[0]?.value ?? '');
  const [uncontrolledValue, setUncontrolledValue] = useState(initialValue);
  const [isOpen, setIsOpen] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition | null>(null);

  const updatePopoverPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 10;
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const maxHeight = Math.min(300, Math.floor(viewportHeight * 0.42));
    const desiredHeight = Math.min(maxHeight, options.length * 40 + 12);
    const spaceBelow = Math.max(0, viewportHeight - rect.bottom - viewportPadding - 7);
    const spaceAbove = Math.max(0, rect.top - viewportPadding - 7);
    const placement = spaceBelow >= desiredHeight || spaceBelow >= spaceAbove ? 'bottom' : 'top';
    const availableHeight = placement === 'bottom' ? spaceBelow : spaceAbove;
    const width = Math.min(rect.width, Math.max(0, viewportWidth - viewportPadding * 2));
    const left = Math.max(viewportPadding, Math.min(rect.left, viewportWidth - width - viewportPadding));

    setPopoverPosition({
      left,
      width,
      placement,
      maxHeight: Math.max(48, Math.min(desiredHeight, availableHeight)),
      top: rect.bottom + 7,
      bottom: viewportHeight - rect.top + 7,
    });
  }, [options.length]);

  const selectedValue = value === undefined ? uncontrolledValue : String(value ?? '');
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selectedValue));
  const selectedOption = options.find((option) => option.value === selectedValue);
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const visibleLabel = selectedOption?.label || (selectedValue ? selectedValue : 'Seleccionar...');

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        !listboxRef.current?.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const reposition = (event?: Event) => {
      if (event && listboxRef.current?.contains(event.target as Node)) return;
      updatePopoverPosition();
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    reposition();

    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [isOpen, options.length, updatePopoverPosition]);

  useEffect(() => {
    if (isOpen) setActiveIndex(selectedIndex);
  }, [isOpen, selectedIndex]);

  useEffect(() => {
    if (!isOpen) return;
    const activeOption = listboxRef.current?.children.item(activeIndex);
    if (activeOption instanceof HTMLElement) {
      activeOption.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex, isOpen, listboxId]);

  function openAt(index = selectedIndex) {
    setActiveIndex(Math.min(Math.max(index, 0), Math.max(options.length - 1, 0)));
    updatePopoverPosition();
    setIsOpen(true);
  }

  function chooseOption(option: SelectOption) {
    if (disabled) return;
    if (value === undefined) setUncontrolledValue(option.value);

    const nativeSelect = selectRef.current;
    if (nativeSelect && nativeSelect.value !== option.value) {
      const valueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLSelectElement.prototype,
        'value'
      )?.set;
      if (valueSetter) valueSetter.call(nativeSelect, option.value);
      else nativeSelect.value = option.value;
      nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    setIsOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    nativeProps.onKeyDown?.(event as unknown as React.KeyboardEvent<HTMLSelectElement>);
    if (event.defaultPrevented || disabled || options.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) openAt(selectedIndex);
      else setActiveIndex((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) openAt(selectedIndex);
      else setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Home' && isOpen) {
      event.preventDefault();
      setActiveIndex(0);
    } else if (event.key === 'End' && isOpen) {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    } else if ((event.key === 'Enter' || event.key === ' ') && isOpen) {
      event.preventDefault();
      const option = options[activeIndex];
      if (option) chooseOption(option);
    } else if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setIsOpen(false);
    }
  }

  return (
    <div className="theme-select-field" ref={rootRef}>
      {label && (
        <label id={labelId} htmlFor={selectId} className="theme-select-label">
          {label}
        </label>
      )}
      <button
        id={selectId}
        ref={triggerRef}
        type="button"
        className={`theme-select-trigger ${isOpen ? 'is-open' : ''} ${className}`.trim()}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-activedescendant={isOpen && options[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
        aria-label={ariaLabel}
        aria-labelledby={label ? labelId : undefined}
        aria-describedby={ariaDescribedBy}
        aria-required={required || undefined}
        disabled={disabled}
        title={title}
        style={style}
        autoFocus={autoFocus}
        onClick={() => (isOpen ? setIsOpen(false) : openAt())}
        onKeyDown={handleKeyDown}
        onBlur={(event) => {
          nativeProps.onBlur?.(event as unknown as React.FocusEvent<HTMLSelectElement>);
          const nextTarget = event.relatedTarget as Node | null;
          if (
            !rootRef.current?.contains(nextTarget) &&
            !listboxRef.current?.contains(nextTarget)
          ) {
            setIsOpen(false);
          }
        }}
      >
        <span className="theme-select-value">{visibleLabel}</span>
        <ChevronDown size={16} className="theme-select-chevron" aria-hidden="true" />
      </button>

      {isOpen && options.length > 0 && popoverPosition && createPortal(
        <div
          id={listboxId}
          ref={listboxRef}
          className="theme-select-popover"
          style={{
            position: 'fixed',
            left: popoverPosition.left,
            right: 'auto',
            width: popoverPosition.width,
            top: popoverPosition.placement === 'bottom' ? popoverPosition.top : 'auto',
            bottom: popoverPosition.placement === 'top' ? popoverPosition.bottom : 'auto',
            maxHeight: popoverPosition.maxHeight,
            zIndex: 20000,
          }}
          role="listbox"
          aria-label={ariaLabel || label || 'Opciones'}
          aria-labelledby={label ? labelId : undefined}
        >
          {options.map((option, index) => {
            const isSelected = option.value === selectedValue;
            const isActive = index === activeIndex;
            return (
              <div
                key={option.value}
                id={`${listboxId}-${index}`}
                className={`theme-select-option${isSelected ? ' is-selected' : ''}${isActive ? ' is-active' : ''}`}
                role="option"
                aria-selected={isSelected}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => chooseOption(option)}
              >
                <span>{option.label}</span>
                {isSelected && <Check size={15} aria-hidden="true" />}
              </div>
            );
          })}
        </div>,
        document.body
      )}

      <select
        {...nativeProps}
        ref={selectRef}
        id={`${selectId}-native`}
        name={name}
        value={selectedValue}
        onChange={onChange}
        onInvalid={(event) => {
          event.preventDefault();
          setIsOpen(true);
          triggerRef.current?.focus();
        }}
        disabled={disabled}
        required={required}
        tabIndex={-1}
        aria-hidden="true"
        className="theme-select-native"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
