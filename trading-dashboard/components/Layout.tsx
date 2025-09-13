import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { BarChart3, TrendingUp, Settings, History, Target, Activity } from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

const Layout: React.FC<LayoutProps> = ({ children, title = 'Trading Dashboard' }) => {
  const router = useRouter();

  const navigation = [
    { name: 'Overview', href: '/', icon: BarChart3 },
    { name: 'Performance', href: '/performance', icon: TrendingUp },
    { name: 'Subcategories', href: '/subcategories', icon: Target },
    { name: 'Trades', href: '/trades', icon: History },
    { name: 'Analytics', href: '/analytics', icon: Activity },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content="OKX Trading Bot Dashboard" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="min-h-screen bg-gray-50">
        {/* Sidebar */}
        <div className="fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg">
          <div className="flex h-16 items-center justify-center border-b border-gray-200">
            <h1 className="text-xl font-bold text-gray-900">OKX Trading Bot</h1>
          </div>
          
          <nav className="mt-8">
            <div className="space-y-1 px-4">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = router.pathname === item.href;
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-primary-50 text-primary-700'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <Icon
                      className={`mr-3 h-5 w-5 ${
                        isActive ? 'text-primary-600' : 'text-gray-400 group-hover:text-gray-500'
                      }`}
                    />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </nav>
        </div>

        {/* Main content */}
        <div className="pl-64">
          <header className="border-b border-gray-200 bg-white">
            <div className="px-8 py-4">
              <h2 className="text-2xl font-semibold text-gray-900">{title}</h2>
            </div>
          </header>
          
          <main className="p-8">
            <div className="animate-fade-in">
              {children}
            </div>
          </main>
        </div>
      </div>
    </>
  );
};

export default Layout;