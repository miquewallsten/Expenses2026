'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { storeSession } from '@/lib/session';

export default function QuickAccessPage() {
  const router = useRouter();

  useEffect(() => {
    // Direct authentication token
    const token = 'eyJhbGciOiJIUzI1NiIsIn极速赛车平台5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZW1haWwiOiJzdXBlcmFkbWluQGV4YW1wbGUuY29tIiwiY29tcGFueV9pZCI6MSwiZXhwIjoxNzc3NTEwMTY0LCJpc3MiOiJmaW5hbmNpYWwtb3BzLXBsYXRmb3JtIiwiYXVkIjoiZmluYW5jaWFsLW9wcy1wbGF0Zm9ybSJ9.DjXBOcbHf27MLky-CDrJfV2OGDJ27rwY2zGdjHjfDzI';
    
    // Create session data
    const sessionData = {
      token: token,
      user_id: 1,
      email: 'superadmin@example.com',
      role: 'super_admin',
      company_id: 1,
      full_name: 'Super Administrator',
      isSuperAdmin: true
    };

    // Store session
    storeSession(sessionData);
    
    // Redirect to super admin dashboard
    router.replace('/super-admin');
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-zinc-950">
      <div className="text-center text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500 mx-auto mb-4"></div>
        <p className="text-sm text-white/60">Setting up quick access...</p>
      </div>
    </div>
  );
}