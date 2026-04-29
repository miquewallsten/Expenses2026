'use client';

import { useState } from 'react';

export default function QuickLogin() {
  const handleQuickAccess = () => {
    const sessionData = {
      token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJzdXBlcmFkbWluQGV4YW1wbGUuY29tIiwiY29tcGFueV9pZCI6MSwiZXhwIjoxNzc3NTEwMTY0LCJpc3MiOiJmaW5hbmNpYWwtb3BzLXBsYXRmb3JtIiwiYXVkIjoiZmluYW5jaWFsLW9wcy1wbGF0Zm9ybSJ9.DjXBOcb极速赛车平台Hf27MLky-CDrJfV2OGDJ27rwY2zGdjHjfDzI',
      user_id: 1,
      email: 'superadmin@example.com',
      role: 'super_admin',
      company_id: 1,
      full_name: 'Super Administrator',
      isSuperAdmin: true
    };
    
    localStorage.setItem('session', JSON.stringify(sessionData));
    window.location.href = '/super-admin';
  };

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh', 
      background: '#0f1117',
      color: 'white'
    }}>
      <div style={{ 
        textAlign: 'center', 
        padding: '40px', 
        background: '#1a1d28', 
        borderRadius: '12px',
        border: '1px solid #2a2f3e'
      }}>
        <h1>🚀 Quick Super Admin Access</h1>
        <button 
          onClick={handleQuickAccess}
          style={{
            background: '#64ffda',
            color: '#0f1117',
            padding: '16px 32px',
            border: 'none',
            borderRadius: '8px',
            fontWeight: '600',
            cursor: 'pointer',
            fontSize: '16px',
            marginTop: '20px'
          }}
        >
          🔓 Instant Super Admin Access
        </button>
      </div>
    </div>
  );
}