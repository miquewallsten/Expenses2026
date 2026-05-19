"use client";

import { useEffect, useState } from "react";
import { Check, X, RefreshCw } from "lucide-react";
import Modal from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { listCompanies } from "@/lib/api/company";
import { deployAgent } from "@/lib/api/agent_lifecycle";

interface DeployModalProps {
  open: boolean;
  onClose: () => void;
  templateId: number;
}

/**
 * Modal that lets a super‑admin pick a tenant (company) and deploy a selected
 * AgentTemplate to that tenant.
 */
export default function DeployModal({ open, onClose, templateId }: DeployModalProps) {
  const [companies, setCompanies] = useState<any[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load companies when the modal opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listCompanies()
      .then((data) => {
        setCompanies(data);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open]);

  const handleDeploy = async () => {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      await deployAgent(templateId, Number(selectedCompany));
      onClose(); // close modal after success
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Deploy Agent to Tenant" size="md">
      <div className="space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <RefreshCw className="h-3 w-3 animate-spin" /> Loading tenants…
          </div>
        )}
        {error && <div className="text-sm text-rose-500">{error}</div>}
        <Select
          value={selectedCompany}
          onChange={(e) => setSelectedCompany(e.target.value)}
          disabled={loading || companies.length === 0}
        >
          <option value=""> -  Select a tenant  - </option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} (ID: {c.id})
            </option>
          ))}
        </Select>
        <div className="flex justify-end space-x-2">
          <Button variant="secondary" onClick={onClose} disabled={loading} size="sm">
            Cancel
          </Button>
          <Button onClick={handleDeploy} disabled={loading || !selectedCompany} size="sm">
            {loading ? (
              <RefreshCw className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <Check className="h-3 w-3 mr-1" />
            )}
            Deploy
          </Button>
        </div>
      </div>
    </Modal>
  );
}
