"use client";

import { useState, useRef, useCallback, type KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";

interface Suggestion {
  id: string;
  label: string;
  description?: string;
}

interface AgentInputProps {
  /** Callback when message is sent */
  onSend: (message: string) => void;
  /** Whether the agent is processing */
  disabled?: boolean;
  /** Placeholder text for input */
  placeholder?: string;
  /** Optional suggestions to show */
  suggestions?: Suggestion[];
  /** Callback when a suggestion is selected */
  onSuggestionSelect?: (suggestion: Suggestion) => void;
}

/**
 * AgentInput — text input component with suggestions support.
 *
 * Features:
 * - Auto-expanding textarea
 * - Suggestion dropdown
 * - Keyboard navigation (Enter to send, Escape to clear)
 * - Loading state
 */
export function AgentInput({
  onSend,
  disabled = false,
  placeholder = "Type a message...",
  suggestions = [],
  onSuggestionSelect,
}: AgentInputProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Filter suggestions based on input
  const filteredSuggestions = suggestions.filter((s) =>
    s.label.toLowerCase().includes(input.toLowerCase())
  );

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setInput("");
    setShowSuggestions(false);
  }, [input, disabled, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Handle suggestion navigation
      if (showSuggestions && filteredSuggestions.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % filteredSuggestions.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex(
            (i) => (i - 1 + filteredSuggestions.length) % filteredSuggestions.length
          );
          return;
        }
        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          const selected = filteredSuggestions[selectedIndex];
          if (onSuggestionSelect) {
            onSuggestionSelect(selected);
          } else {
            setInput(selected.label);
          }
          setShowSuggestions(false);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setShowSuggestions(false);
          return;
        }
      }

      // Send on Enter (without shift)
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [showSuggestions, filteredSuggestions, selectedIndex, onSuggestionSelect, handleSend]
  );

  const handleChange = useCallback((value: string) => {
    setInput(value);
    setShowSuggestions(value.length > 0 && suggestions.length > 0);
    setSelectedIndex(0);
  }, [suggestions.length]);

  return (
    <div className="relative w-full">
      {/* Suggestions dropdown */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 mb-1 max-h-48 overflow-y-auto rounded-lg border border-white/[0.07] bg-zinc-900 shadow-xl">
          {filteredSuggestions.map((suggestion, idx) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={() => {
                if (onSuggestionSelect) {
                  onSuggestionSelect(suggestion);
                } else {
                  setInput(suggestion.label);
                }
                setShowSuggestions(false);
              }}
              className={`w-full px-3 py-2 text-left transition-colors ${
                idx === selectedIndex
                  ? "bg-indigo-600/20 text-white/80"
                  : "text-white/60 hover:bg-white/[0.04]"
              }`}
            >
              <div className="text-sm font-medium">{suggestion.label}</div>
              {suggestion.description && (
                <div className="text-xs text-white/45">{suggestion.description}</div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2 rounded-lg border border-white/[0.1] bg-zinc-900 p-2 transition-colors focus-within:border-indigo-500/35">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(input.length > 0 && suggestions.length > 0)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="min-h-[36px] max-h-32 flex-1 resize-none bg-transparent text-sm text-white/60 placeholder:text-white/28 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            height: "auto",
            overflow: input.split("\n").length > 2 ? "auto" : "hidden",
          }}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!input.trim() || disabled}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-indigo-600/30 text-indigo-300/80 transition-colors hover:bg-indigo-600/50 hover:text-indigo-200 disabled:cursor-not-allowed disabled:opacity-35"
          aria-label="Send message"
        >
          {disabled ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}