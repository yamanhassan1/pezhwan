import { useState, useEffect, type ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import Footer from './Footer';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

type ToastListener = (t: Toast) => void;

const listeners = new Set<ToastListener>();

export const toast = {
  success(message: string) {
    listeners.forEach((fn) => fn({ id: Date.now() + Math.random(), message, type: 'success' }));
  },
  error(message: string) {
    listeners.forEach((fn) => fn({ id: Date.now() + Math.random(), message, type: 'error' }));
  },
};

function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handler: ToastListener = (t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, 3500);
    };
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  if (toasts.length === 0) return null;
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

export { Toaster };

export default function Layout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sidebar-layout">
      <Sidebar />
      <div className="main-content">
        <Header title={title} />
        <main className="page-body">{children}</main>
        <Footer />
        <Toaster />
      </div>
    </div>
  );
}
