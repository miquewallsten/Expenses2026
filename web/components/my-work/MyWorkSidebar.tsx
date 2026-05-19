"use client";

import { useState, useRef, useEffect } from "react";
import {
  Receipt, CheckSquare, Calculator, Clock, Archive, Download, CreditCard, Settings,
  Building2, FileText, GitBranch, Users, Plug, Puzzle, ScrollText, BarChart2, Bell, ShoppingCart,
  XCircle,
  ChevronDown, ChevronRight,
  Eye, EyeOff, SlidersHorizontal, Check, GripVertical,
  Plus, Trash2, Pencil, RotateCcw,
  FolderOpen, ArrowUp, ArrowDown,
  type LucideIcon,
} from "lucide-react";
import { useMyWorkContext } from "@/context/MyWorkContext";
import { useTranslations } from "next-intl";
import { useNavCustomization, type NavGroup } from "@/context/NavCustomizationContext";
import type { MyWorkModule } from "@/types/modules";

const ICON_MAP: Record<string, LucideIcon> = {
  Receipt, CheckSquare, Calculator, Clock, Archive, Download, CreditCard, Settings,
  Building2, FileText, GitBranch, Users, Plug, Puzzle, ScrollText, BarChart2, Bell, XCircle,
  ShoppingCart,
};


function translateModuleLabel(mod: MyWorkModule, tn: (key: string) => string): string {
  try {
    return tn(`modules.${mod.id}`);
  } catch {
    return mod.label;
  }
}

function ModuleIcon({ name, className }: { name?: string; className?: string }) {
  const Comp = name ? ICON_MAP[name] : null;
  if (!Comp) return null;
  return <Comp className={className} aria-hidden="true" />;
}

interface MyWorkSidebarProps {
  onSelect?: () => void;
}

export default function MyWorkSidebar({ onSelect }: MyWorkSidebarProps) {
  const { visibleModules, activeModule, setActiveModule } = useMyWorkContext();
  const t = useTranslations();
  const tn = useTranslations("nav");
  const {
    layout, isVisible, moveModule, moveModuleToGroup, moveModuleToUngrouped,
    moveModuleWithinGroup, createGroup, renameGroup, deleteGroup, moveGroup,
    toggleGroupCollapsed, toggleVisibility, resetLayout,
  } = useNavCustomization();

  const [editMode, setEditMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [showNewGroupInput, setShowNewGroupInput] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const newGroupInputRef = useRef<HTMLInputElement>(null);

  const moduleMap = new Map(visibleModules.map((m) => [m.id, m]));

  // Compute displayed ungrouped modules (respecting custom order + visibility)
  const groupedModuleIds = new Set(layout.groups.flatMap((g) => g.moduleIds));
  const ungroupedOrdered = layout.order.length > 0
    ? layout.order
        .filter((id) => moduleMap.has(id) && !groupedModuleIds.has(id))
        .concat(
          visibleModules
            .filter((m) => !layout.order.includes(m.id) && !groupedModuleIds.has(m.id))
            .map((m) => m.id)
        )
    : visibleModules.map((m) => m.id);

  const displayedUngrouped = ungroupedOrdered
    .map((id) => moduleMap.get(id))
    .filter((m): m is typeof visibleModules[number] => !!m && (isVisible(m.id) || !!m.adminSection));

  const handleCreateGroup = () => {
    const trimmed = newGroupName.trim();
    if (trimmed) {
      createGroup(trimmed);
      setNewGroupName("");
      setShowNewGroupInput(false);
    }
  };

  if (!visibleModules.length) return null;

  return (
    <nav aria-label="Module navigation" className="flex flex-col gap-0.5 px-2 py-1.5">
      {/* Edit mode toggle */}
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-[9px] font-bold uppercase tracking-widest text-muted">
          {editMode ? tn("customizeNav") : t("nav.myWork")}
        </span>
        <button
          type="button"
          onClick={() => { setEditMode(!editMode); setPanelOpen(false); }}
          className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
            editMode
              ? "bg-accent/15 text-accent hover:bg-accent/25"
              : "text-muted hover:text-secondary hover:bg-surface-2"
          }`}
          title={tn("customize")}
        >
          <SlidersHorizontal className="h-3 w-3" />
          {editMode ? tn("done") : tn("customize")}
        </button>
      </div>

      {/* ── Ungrouped modules ── */}
      {displayedUngrouped.map((mod, idx) => {
        const isActive = activeModule?.id === mod.id;
        const visible = isVisible(mod.id) || !!mod.adminSection;

        return (
          <div
            key={mod.id}
            className={`group/mod relative flex items-center gap-1 rounded py-1.5 px-2.5 text-xs font-medium transition-colors ${
              isActive ? "bg-accent-muted text-primary" : "text-secondary hover:bg-surface-2 hover:text-primary"
            } ${!visible ? "opacity-40" : ""}`}
          >
            {/* Reorder + add-to-group controls in edit mode */}
            {editMode && !mod.adminSection && (
              <div className="flex items-center gap-0.5 shrink-0">
                <GripVertical className="h-3 w-3 text-muted/40" />
                <button
                  type="button"
                  onClick={() => idx > 0 && moveModule(mod.id, idx - 1)}
                  disabled={idx === 0}
                  className={`h-4 w-4 flex items-center justify-center rounded transition-colors ${idx === 0 ? "text-muted/20 cursor-not-allowed" : "text-muted hover:text-secondary"}`}
                  title={tn("reorderHint")}
                >
                  <ArrowUp className="h-2.5 w-2.5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveModule(mod.id, idx + 1)}
                  className="h-4 w-4 flex items-center justify-center text-muted hover:text-secondary rounded transition-colors"
                >
                  <ArrowDown className="h-2.5 w-2.5" />
                </button>
                {layout.groups.length > 0 && (
                  <div className="relative group/grpdd">
                    <button
                      type="button"
                      className="h-4 w-4 flex items-center justify-center text-muted hover:text-secondary rounded transition-colors"
                      title={tn("addToGroup")}
                    >
                      <Plus className="h-2.5 w-2.5" />
                    </button>
                    <div className="hidden group-hover/grpdd:flex flex-col absolute left-6 top-0 z-50 rounded-lg border border-default bg-surface-1 py-1 shadow-lg min-w-[120px]">
                      {layout.groups.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => moveModuleToGroup(mod.id, g.id)}
                          className="px-3 py-1 text-left text-[10px] text-secondary hover:bg-surface-2 transition-colors"
                        >
                          {g.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Module button */}
            <button
              type="button"
              onClick={() => { setActiveModule(mod.id); onSelect?.(); }}
              aria-current={isActive ? "page" : undefined}
              className="flex-1 flex items-center gap-2.5 text-left"
            >
              {isActive && <span className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-r bg-accent" />}
              <ModuleIcon name={mod.icon} className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-accent" : "text-muted group-hover/mod:text-secondary"}`} />
              <span className="truncate">{translateModuleLabel(mod, tn)}</span>
            </button>
          </div>
        );
      })}

      {/* ── Custom groups ── */}
      {layout.groups.map((group, groupIdx) => {
        const groupModules = group.moduleIds
          .map((id) => moduleMap.get(id))
          .filter((m): m is typeof visibleModules[number] => !!m && (isVisible(m.id) || !!m.adminSection));

        if (groupModules.length === 0 && group.moduleIds.length === 0 && !editMode) return null;

        return (
          <div key={group.id} className="mt-1">
            <GroupHeaderInline
              group={group}
              groupIdx={groupIdx}
              isLast={groupIdx === layout.groups.length - 1}
              editMode={editMode}
              onToggle={() => toggleGroupCollapsed(group.id)}
              onRename={(name) => renameGroup(group.id, name)}
              onDelete={() => deleteGroup(group.id)}
              onMoveUp={() => moveGroup(group.id, groupIdx - 1)}
              onMoveDown={() => moveGroup(group.id, groupIdx + 1)}
            />
            {!group.collapsed && (
              <div className="mt-0.5 space-y-0.5">
                {groupModules.map((mod, idx) => (
                  <ModuleInGroupRow
                    key={mod.id}
                    mod={mod}
                    isActive={activeModule?.id === mod.id}
                    visible={isVisible(mod.id) || !!mod.adminSection}
                    editMode={editMode}
                    firstInGroup={idx === 0}
                    onSelect={() => { setActiveModule(mod.id); onSelect?.(); }}
                    onMoveUp={() => moveModuleWithinGroup(group.id, mod.id, idx - 1)}
                    onMoveDown={() => moveModuleWithinGroup(group.id, mod.id, idx + 1)}
                    onRemoveFromGroup={() => moveModuleToUngrouped(mod.id)}
                    tn={tn}
                  />
                ))}
                {editMode && groupModules.length === 0 && (
                  <p className="px-8 py-1.5 text-[9px] text-muted italic">{tn("groupHint")}</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* New group button (edit mode) */}
      {editMode && (
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

      {/* Hidden items indicator (non-edit mode) */}
      {!editMode && !panelOpen && layout.hiddenIds.length > 0 && (
        <button
          type="button"
          onClick={() => setPanelOpen(true)}
          className="mt-1 flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[9px] text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
        >
          <EyeOff className="h-3 w-3" />
          <span>{tn("hidden", { count: layout.hiddenIds.length })}</span>
        </button>
      )}

      {/* Visibility panel */}
      {panelOpen && (
        <div className="mt-2 rounded-lg border border-default bg-surface-1 overflow-hidden">
          <div className="flex items-center justify-between border-b border-subtle px-3 py-2">
            <span className="text-[9px] font-bold uppercase tracking-widest text-muted">{tn("customizeNav")}</span>
            <button type="button" onClick={() => setPanelOpen(false)} className="text-muted hover:text-secondary text-[9px]">{tn("done")}</button>
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
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit mode controls: visibility + reset */}
      {editMode && (
        <div className="mt-2 px-2 space-y-1">
          <button
            type="button"
            onClick={() => setPanelOpen(!panelOpen)}
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[9px] text-muted transition-colors hover:bg-surface-2 hover:text-secondary"
          >
            {panelOpen ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            {panelOpen ? tn("done") : tn("customizeNav")}
          </button>
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
    </nav>
  );
}

// ── Module row inside a group ──
function ModuleInGroupRow({ mod, isActive, visible, editMode, firstInGroup, onSelect, onMoveUp, onMoveDown, onRemoveFromGroup, tn }: {
  mod: MyWorkModule;
  isActive: boolean;
  visible: boolean;
  editMode: boolean;
  firstInGroup: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemoveFromGroup: () => void;
  tn: (key: string) => string;
}) {
  return (
    <div className={`group/mod relative flex items-center gap-1 rounded py-1.5 pl-6 pr-2.5 text-xs font-medium transition-colors ${
      isActive ? "bg-accent-muted text-primary" : "text-secondary hover:bg-surface-2 hover:text-primary"
    } ${!visible ? "opacity-40" : ""}`}>
      {editMode && (
        <div className="flex items-center gap-0.5 shrink-0">
          <GripVertical className="h-3 w-3 text-muted/40" />
          <button
            type="button"
            onClick={onMoveUp}
            disabled={firstInGroup}
            className={`h-4 w-4 flex items-center justify-center rounded transition-colors ${firstInGroup ? "text-muted/20 cursor-not-allowed" : "text-muted hover:text-secondary"}`}
          >
            <ArrowUp className="h-2.5 w-2.5" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            className="h-4 w-4 flex items-center justify-center text-muted hover:text-secondary rounded transition-colors"
          >
            <ArrowDown className="h-2.5 w-2.5" />
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={onSelect}
        aria-current={isActive ? "page" : undefined}
        className="flex-1 flex items-center gap-2.5 text-left"
      >
        {isActive && <span className="absolute left-0 top-1/2 h-3.5 w-0.5 -translate-y-1/2 rounded-r bg-accent" />}
        <ModuleIcon name={mod.icon} className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-accent" : "text-muted group-hover/mod:text-secondary"}`} />
        <span className="truncate">{translateModuleLabel(mod, tn)}</span>
      </button>

      {editMode && (
        <button
          type="button"
          onClick={onRemoveFromGroup}
          className="h-4 w-4 flex items-center justify-center text-muted hover:text-secondary rounded transition-colors shrink-0"
          title={tn("removeFromGroup")}
        >
          <XCircle className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

// ── Group header with edit controls ──
function GroupHeaderInline({ group, groupIdx, isLast, editMode, onToggle, onRename, onDelete, onMoveUp, onMoveDown }: {
  group: NavGroup;
  groupIdx: number;
  isLast: boolean;
  editMode: boolean;
  onToggle: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(group.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const tn = useTranslations("nav");

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
      {editMode && (
        <div className="flex flex-col gap-0 opacity-0 group-hover/grp:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={groupIdx === 0}
            className={`h-3 w-3 flex items-center justify-center rounded transition-colors ${
              groupIdx === 0 ? "text-muted/20 cursor-not-allowed" : "text-muted hover:text-secondary hover:bg-surface-2"
            }`}
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
          >
            <ArrowDown className="h-2.5 w-2.5" />
          </button>
        </div>
      )}

      <button type="button" onClick={onToggle} className="flex h-4 w-4 items-center justify-center text-muted hover:text-secondary transition-colors">
        {group.collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
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

      {editMode && !editing && (
        <div className="flex items-center gap-0.5 opacity-0 group-hover/grp:opacity-100 transition-opacity">
          <button type="button" onClick={() => setEditing(true)} className="h-4 w-4 flex items-center justify-center text-muted hover:text-secondary rounded transition-colors" title={tn("renameGroup")}>
            <Pencil className="h-2.5 w-2.5" />
          </button>
          <button type="button" onClick={onDelete} className="h-4 w-4 flex items-center justify-center text-muted hover:text-error rounded transition-colors" title={tn("deleteGroup")}>
            <Trash2 className="h-2.5 w-2.5" />
          </button>
        </div>
      )}
    </div>
  );
}
