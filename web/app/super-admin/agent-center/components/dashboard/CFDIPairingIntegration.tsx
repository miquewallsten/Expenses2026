"use client";

import { useState, useEffect } from "react";
import { 
  FileText, 
  CheckCircle, 
  AlertTriangle, 
  XCircle, 
  RefreshCw,
  Zap
} from "lucide-react";

interface PairingStats {
  total_documents: number;
  paired_documents: number;
  unpaired_documents: number;
  pairing_success_rate: number;
  total_pairing_attempts: number;
  failed_pairing_attempts: number;
  average_processing_time: number;
}

export function CFDIPairingIntegration() {
  const [stats, setStats] = useState<PairingStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Mock data for demonstration
  useEffect(() => {
    const mockStats: PairingStats = {
      total_documents: 1247,
      paired_documents: 1189,
      unpaired_documents: 58,
      pairing_success_rate: 95.3,
      total_pairing_attempts: 1305,
      failed_pairing_attempts: 116,
      average_processing_time: 142,
    };

    setTimeout(() => {
      setStats(mockStats);
      setLoading(false);
    }, 600);
  }, []);

  if (loading) {
    return (
      <div className="bg-surface-1 border border-subtle rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-primary">CFDI Pairing Integration</h3>
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-rose-500"></div>
        </div>
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 bg-surface-2 rounded animate-pulse w-1/3"></div>
              <div className="h-4 bg-surface-2 rounded animate-pulse w-1/4"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-surface-1 border border-subtle rounded-lg p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-primary">CFDI Pairing Integration</h3>
        </div>
        <div className="text-center py-4">
          <XCircle className="h-8 w-8 text-muted mx-auto mb-2" />
          <p className="text-sm text-muted">Unable to load pairing statistics</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-1 border border-subtle rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
          <FileText className="h-4 w-4 text-rose-500" />
          CFDI Pairing Integration
        </h3>
        <button className="text-muted hover:text-primary">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-surface-2 p-3 rounded-lg">
          <div className="text-xs text-muted mb-1">Total Documents</div>
          <div className="text-lg font-bold text-primary">{stats.total_documents.toLocaleString()}</div>
        </div>
        
        <div className="bg-surface-2 p-3 rounded-lg">
          <div className="text-xs text-muted mb-1">Successfully Paired</div>
          <div className="text-lg font-bold text-green-500">{stats.paired_documents.toLocaleString()}</div>
        </div>
        
        <div className="bg-surface-2 p-3 rounded-lg">
          <div className="text-xs text-muted mb-1">Pairing Success</div>
          <div className="text-lg font-bold text-primary">{stats.pairing_success_rate.toFixed(1)}%</div>
        </div>
        
        <div className="bg-surface-2 p-3 rounded-lg">
          <div className="text-xs text-muted mb-1">Avg Processing</div>
          <div className="text-lg font-bold text-primary">{stats.average_processing_time}ms</div>
        </div>
      </div>
      
      <div className="border-t border-subtle pt-4">
        <h4 className="text-xs font-medium text-muted uppercase mb-2">Validation Agent Integration</h4>
        <div className="flex items-center gap-2 text-sm">
          <Zap className="h-4 w-4 text-rose-500" />
          <span className="text-primary">CFDI Validation Worker</span>
          <span className="text-muted">•</span>
          <span className="text-success">Active</span>
        </div>
        <p className="text-xs text-muted mt-2">
          The Validation Agent automatically pairs CFDI XML with PDF documents using SAT QR codes. 
          Failed pairings are tracked and can be retried manually.
        </p>
      </div>
    </div>
  );
}