"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Eye, EyeOff, SlidersHorizontal, Check, GripVertical,
  Plus, Trash2, ChevronDown, ChevronRight, Pencil, RotateCcw,
  FolderOpen, Folder, ArrowUp, ArrowDown,
} from "lucide-react";
import { useNavCustomization, type NavGroup } from "@/context/NavCustomizationContext";
import type { MyWorkModule } from "@/types/modules";

function resolveIcon(name?: string): React.ComponentType<{ className?: string }> | null {
  if (!name) return null;
  try {
    const icons = require("lucide-react");
    const Comp = icons[name];
    return Comp ?? null;
  } catch {
    return null;
  }
}

function initials(label: string): string {
  return label.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function translateModuleLabel(mod: MyWorkModule, tn: (key: string) => string): string {
  try {
    return tn(`modules.${mod.id}`);
  } catch {
    return mod.label;
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

type DragSource =
  | { type: "module"; moduleId: string; origin: "ungrouped" | string }
  | { type: "group"; groupId: string };

// ── Group header in the sidebar ──────────────────────────────────────────────

function NavGroupHeader({ group, collapsed, onToggle, onRename, onDelete, onMoveUp, onMoveDown, canEdit, isFirst, isLast }: {
  group: NavGroup;
  collapsed: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canEdit: boolean;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed) onRename(trimmed);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 select-none group/grp">
      {canEdit && (
        <div className="flex flex-col gap-0 opacity-0 group-hover/grp:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst}
            className={`h-3 w-3 flex items-center justify-center rounded transition-colors ${
              isFirst ? "text-muted/20 cursor-not-allowed" : "text-muted hover:text-secondary hover:bg-surface-2"
            }`}
            title="Move group up"
          >
            <ArrowUp className="h-2.5 w-2.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast}
            className={`h-3 w-3 flex items-center justify-center rounded transition-colors ${
              isLast ? "text-muted/20 cursor-not-allowed" : "text-muted hover:text-secondary hover:bg-surface-2"
            }`}
            title="Move group down"
          >
            <ArrowDown className="h-2.5 w-2.5" />
          </button>
        </div>
      )}
      <button type="button" onClick={onToggle} className="flex h-4 w-4 items-center justify-center text-muted hover:text-secondary transition-colors">
        {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
          className="flex-1 bg-transparent border-b border-accent text-[9px] font-bold uppercase tracking-widest text-secondary outline-none px-0.5"
        />
      ) : (
        <span className="flex-1 text-[9px] font-bold uppercase tracking-widest text-muted group-hover/grp:text-secondary transition-colors cursor-pointer" onClick={onToggle}>
          {group.name}
        </span>
      )}
      {canEdit && !editing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover/grp:opacity-100 transition-opacity">
          <button type="button" onClick={() => setEditing(true)} className="h-4 w-4 flex items-center justify-center text-muted hover:text-secondary rounded transition-colors" title="Rename group">
            <Pencil className="h-2.5 w-2.5" />
          </button>
          <button type="button" onClick={onDelete} className="h-4 w-4 flex items-center justify-center text-muted hover:text-error rounded transition-colors" title="Delete group">
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface NavModuleListProps {
  visibleModules: readonly MyWorkModule[];
  activeModule: MyWorkModule | null;
  collapsed: boolean;
  onModuleClick: (mod: MyWorkModule) => void;
}

export default function NavModuleList({ visibleModules, activeModule, collapsed, onModuleClick }: NavModuleListProps) {
  const tn = useTranslations("nav");
  const {
    layout, moveModule, moveModuleToGroup, moveModuleToUngrouped, moveModuleWithinGroup,
    createGroup, renameGroup, deleteGroup, moveGroup,
    toggleGroupCollapsed, toggleVisibility, isVisible, resetLayout, panelOpen, setPanelOpen,
  } = useNavCustomization();

  const [editMode, setEditMode] = useState(false);
  const [dragSource, setDragSource] = useState<DragSource | null>(null);
  const [dropTarget, setDropTarget] = useState<{ type: "ungrouped"; index: number } | { type: "group"; groupId: string; index: number } | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const newGroupInputRef = useRef<HTMLInputElement>(null);

  // Close panel on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [panelOpen]);

  // ── Compute ordered modules ────────────────────────────────────────────────
  const moduleMap = new Map(visibleModules.map((m) => [m.id, m]));

  // Build a set of all grouped module IDs
  const groupedModuleIds = new Set(layout.groups.flatMap((g) => g.moduleIds));

  // Compute ungrouped: in custom order, then any visible modules not yet in order or groups
  const ungroupedOrdered = layout.order.length > 0
    ? layout.order
        .filter((id) => moduleMap.has(id) && !groupedModuleIds.has(id))
        .concat(
          visibleModules
            .filter((m) => !layout.order.includes(m.id) && !groupedModuleIds.has(m.id))
            .map((m) => m.id)
        )
    : visibleModules
        .filter((m) => !groupedModuleIds.has(m.id))
        .map((m) => m.id);

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const handleDragStart = useCallback((source: DragSource) => {
    setDragSource(source);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragSource(null);
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback(() => {
    if (!dragSource || !dropTarget) {
      setDragSource(null);
      setDropTarget(null);
      return;
    }

    if (dragSource.type === "module") {
      const moduleId = dragSource.moduleId;

      if (dropTarget.type === "group") {
        // Moving module into a group (or reordering within group)
        if (dragSource.origin === dropTarget.groupId) {
          // Reordering within the same group
          moveModuleWithinGroup(dropTarget.groupId, moduleId, dropTarget.index);
        } else {
          // Moving from ungrouped or different group into this group
          moveModuleToGroup(moduleId, dropTarget.groupId, dropTarget.index);
        }
      } else {
        // Moving to ungrouped position
        moveModuleToUngrouped(moduleId, dropTarget.index);
      }
    }

    setDragSource(null);
    setDropTarget(null);
  }, [dragSource, dropTarget, moveModuleToGroup, moveModuleToUngrouped, moveModuleWithinGroup]);

  // ── Group creation ─────────────────────────────────────────────────────────

  const handleCreateGroup = () => {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    createGroup(trimmed);
    setNewGroupName("");
    setShowNewGroupInput(false);
  };

  // ── Render module item ──────────────────────────────────────────────────────

  const renderModule = (mod: MyWorkModule, isDraggable: boolean = false, inGroup: string | null = null) => {
    const Icon = resolveIcon(mod.icon);
    const isActive = activeModule?.id === mod.id;
    const visible = isVisible(mod.id) || !!mod.adminSection;
    if (!visible) return null;

    const moduleId = mod.id;
    const isDragged = dragSource?.type === "module" && dragSource.moduleId === moduleId;
    const isDropTargetForThis = dropTarget?.type === "group" && dropTarget.groupId === inGroup
      ? false : false; // We handle drop indicators separately

    return (
      <div
        key={moduleId}
        draggable={isDraggable || editMode}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", moduleId);
          handleDragStart({ type: "module", moduleId, origin: inGroup ?? "ungrouped" });
        }}
        onDragEnd={handleDragEnd}
        onClick={() => onModuleClick(mod)}
        className={`group/mod relative flex w-full items-center gap-2.5 rounded-xl py-2 text-xs font-medium leading-none transition-all cursor-pointer ${
          inGroup ? "pl-8" : collapsed ? "justify-center px-2" : "px-3"
        } ${
          isActive
            ? "bg-accent/10 text-accent"
            : "text-secondary hover:bg-surface-2 hover:text-primary"
        } ${isDragged ? "opacity-40" : ""}`}
      >
        {(isDraggable || editMode) && !collapsed && (
          <GripVertical className="h-3 w-3 shrink-0 text-muted/40 group-hover/mod:text-muted cursor-grab" />
        )}
        {Icon ? (
          <Icon
            className={`h-4 w-4 shrink-0 transition-transform group-hover/mod:scale-110 ${
              isActive ? "text-accent" : "text-muted group-hover/mod:text-secondary"
            }`}
            aria-hidden="true"
          />
        ) : (
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[9px] font-bold uppercase tracking-wider transition-transform group-hover/mod:scale-110 ${
            isActive ? "bg-accent text-white" : "bg-surface-2 text-muted group-hover/mod:bg-surface-3"
          }`}>
            {initials(translateModuleLabel(mod, tn))}
          </span>
        )}
        {!collapsed && <span className="truncate">{translateModuleLabel(mod, tn)}</span>}
      </div>
    );
  };

  // ── Render drop indicator ──────────────────────────────────────────────────

  const renderDropIndicator = (target: { type: "ungrouped"; index: number } | { type: "group"; groupId: string; index: number }) => {
    const isTarget = dropTarget && dropTarget.type === target.type && dropTarget.index === target.index
      && (target.type === "ungrouped" || (dropTarget as any).groupId === (target as any).groupId);
    return (
      <div
        className={`h-0.5 rounded-full transition-all ${
          isTarget ? "bg-accent" : "bg-transparent"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDropTarget(target);
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleDrop();
        }}
        onDragLeave={() => {
          if (dropTarget && dropTarget.type === target.type && dropTarget.index === target.index) {
            setDropTarget(null);
          }
        }}
      />
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const canEdit = !collapsed;

  return (
    <div className="py-2 px-2 relative">
      {/* Section header with customize button */}
      {!collapsed && (
        <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-muted">
            {tn("modules")}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setEditMode(!editMode)}
              className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
                editMode ? "bg-accent/10 text-accent" : "text-muted/40 hover:text-muted hover:bg-surface-2"
              }`}
              title={tn("customize")}
            >
              <SlidersHorizontal className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => setPanelOpen(!panelOpen)}
              className={`flex h-5 w-5 items-center justify-center rounded transition-colors ${
                panelOpen ? "bg-accent/10 text-accent" : "text-muted/40 hover:text-muted hover:bg-surface-2"
              }`}
              title={tn("customizeNav")}
            >
              <Eye className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* Ungrouped modules */}
      <div className="space-y-0.5"
        onDragOver={(e) => {
          if (!editMode || !dragSource) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          if (!editMode || !dragSource) return;
          e.preventDefault();
          // Drop at end of ungrouped
          setDropTarget({ type: "ungrouped", index: ungroupedOrdered.length });
          // Process immediately
          if (dragSource.type === "module") {
            moveModuleToUngrouped(dragSource.moduleId, ungroupedOrdered.length);
          }
          setDragSource(null);
          setDropTarget(null);
        }}
      >
        {ungroupedOrdered.map((id, idx) => {
          const mod = moduleMap.get(id);
          if (!mod) return null;
          const visible = isVisible(mod.id) || !!mod.adminSection;
          if (!visible) return null;

          return (
            <div key={mod.id}>
              {editMode && renderDropIndicator({ type: "ungrouped", index: idx })}
              {renderModule(mod, editMode, null)}
            </div>
          );
        })}

        {/* Drop zone at end of ungrouped */}
        {editMode && ungroupedOrdered.length > 0 && renderDropIndicator({ type: "ungrouped", index: ungroupedOrdered.length })}
      </div>

      {/* Custom groups */}
      {layout.groups.map((group, groupIdx) => {
        const groupModules = group.moduleIds
          .map((id) => moduleMap.get(id))
          .filter((m): m is MyWorkModule => !!m)
          .filter((m) => isVisible(m.id) || !!m.adminSection);

        return (
          <div key={group.id} className="mt-2">
            <NavGroupHeader
              group={group}
              collapsed={group.collapsed}
              onToggle={() => toggleGroupCollapsed(group.id)}
              onRename={(name) => renameGroup(group.id, name)}
              onDelete={() => deleteGroup(group.id)}
              onMoveUp={() => moveGroup(group.id, groupIdx - 1)}
              onMoveDown={() => moveGroup(group.id, groupIdx + 1)}
              canEdit={editMode}
              isFirst={groupIdx === 0}
              isLast={groupIdx === layout.groups.length - 1}
            />
            {!group.collapsed && (
              <div
                className="space-y-0.5"
                onDragOver={(e) => {
                  if (!editMode) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  if (!editMode || !dragSource) return;
                  e.preventDefault();
                  if (dragSource.type === "module") {
                    moveModuleToGroup(dragSource.moduleId, group.id, groupModules.length);
                  }
                  setDragSource(null);
                  setDropTarget(null);
                }}
              >
                {groupModules.length > 0 ? (
                  groupModules.map((mod, idx) => (
                    <div key={mod.id}>
                      {editMode && renderDropIndicator({ type: "group", groupId: group.id, index: idx })}
                      {renderModule(mod, editMode, group.id)}
                    </div>
                  ))
                ) : (
                  <p className="px-8 py-1.5 text-[9px] text-muted italic">
                    {editMode ? tn("groupHint") : ""}
                  </p>
                )}
                {/* Drop zone at end of group */}
                {editMode && renderDropIndicator({ type: "group", groupId: group.id, index: groupModules.length })}
              </div>
            )}
          </div>
        );
      })}

      {/* New group button (edit mode) */}
      {editMode && !collapsed && (
        <div className="mt-2 px-2">
          {showNewGroupInput ? (
            <div className="flex items-center gap-1.5">
              <FolderOpen className="h-3 w-3 text-muted" />
              <input
                ref={newGroupInputRef}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateGroup(); if (e.key === "Escape") setShowNewGroupInput(false); }}
                onBlur={() => { if (!newGroupName.trim()) setShowNewGroupInput(false); }}
                placeholder={tn("newGroupPlaceholder")}
                className="flex-1 bg-transparent border-b border-accent text-[10px] text-secondary outline-none px-1 py-0.5"
              />
              <button type="button" onClick={handleCreateGroup} className="text-accent text-[9px] font-medium hover:text-accent-hover">
                {tn("createGroup")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setShowNewGroupInput(true); setTimeout(() => newGroupInputRef.current?.focus(), 50); }}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[9px] text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
            >
              <Plus className="h-3 w-3" />
              {tn("newGroup")}
            </button>
          )}
        </div>
      )}

      {/* Hidden items indicator */}
      {!collapsed && !panelOpen && !editMode && layout.hiddenIds.length > 0 && (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[9px] text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
        >
          <EyeOff className="h-3 w-3" />
          <span>{layout.hiddenIds.length} hidden</span>
        </button>
      )}

      {/* Reset button (edit mode) */}
      {editMode && !collapsed && (
        <div className="mt-2 px-2">
          <button
            type="button"
            onClick={resetLayout}
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[9px] text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
          >
            <RotateCcw className="h-3 w-3" />
            {tn("resetLayout")}
          </button>
        </div>
      )}

      {/* Visibility panel (show/hide toggle) */}
      {panelOpen && !collapsed && (
        <div ref={panelRef} className="mt-2 rounded-lg border border-default bg-surface-1 overflow-hidden">
          <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted">{tn("customizeNav")}</span>
            <button type="button" onClick={() => setPanelOpen(false)} className="text-muted hover:text-secondary text-[9px]">Done</button>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {visibleModules.map((mod) => {
              const shown = isVisible(mod.id) || !!mod.adminSection;
              const isHidden = !isVisible(mod.id) && !mod.adminSection;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => !mod.adminSection && toggleVisibility(mod.id)}
                  disabled={!!mod.adminSection}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-2 ${
                    isHidden ? "opacity-40" : ""
                  } ${mod.adminSection ? "cursor-default" : ""}`}
                >
                  <div className={`flex h-4 w-4 items-center justify-center rounded border transition-colors ${
                    shown ? "bg-accent/15 border-accent/30" : "border-default bg-surface-2"
                  }`}>
                    {shown && <Check className="h-2.5 w-2.5 text-accent" />}
                  </div>
                  <span className="text-[10px] font-medium text-secondary truncate">{translateModuleLabel(mod, tn)}</span>
                  {mod.adminSection && <span className="ml-auto text-[8px] text-muted">admin</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
