// Phase 3.1 — UI primitives barrel.
//
// Dark-enterprise primitives following web/CLAUDE.md tokens. New code should
// prefer these over hand-rolled markup. See web/app/_dev/ui-catalog for a
// rendered reference.

export { Button, type ButtonProps } from "./Button";
export { Input, type InputProps } from "./Input";
export { Textarea, type TextareaProps } from "./Textarea";
export { Select, type SelectProps } from "./Select";
export { Combobox, type ComboboxProps, type ComboOption } from "./Combobox";
export { default as Modal, type ModalProps } from "./Modal";
export { default as Drawer, type DrawerProps } from "./Drawer";
export { Dropdown, DropdownItem, type DropdownProps } from "./Dropdown";
export { Tabs, TabList, Tab, TabPanels, TabPanel } from "./Tabs";
export { Table, THead, TBody, TR, TH, TD } from "./Table";
export { ToastProvider, useToast, type ToastVariant } from "./Toast";
export { Tooltip, type TooltipProps } from "./Tooltip";
export { Skeleton, type SkeletonProps } from "./Skeleton";
export { EmptyState, type EmptyStateProps } from "./EmptyState";
export { ErrorState, type ErrorStateProps } from "./ErrorState";
export {
  StatusBadge,
  StatusDot,
  StatusText,
  type StatusVariant,
} from "./StatusBadge";
