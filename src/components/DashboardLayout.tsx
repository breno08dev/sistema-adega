import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gray-50/50 dark:bg-gray-950">
        <AppSidebar />

        <main className="flex-1 flex flex-col">
          {/* MODERNIZAÇÃO: backdrop-blur e bg-white/80 para efeito de vidro */}
          <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-white/80 dark:bg-gray-900/80 backdrop-blur-md px-6 shadow-sm transition-all">
            <SidebarTrigger className="hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full h-10 w-10 transition-colors" />
          </header>

          {/* Ajuste de padding para respirar mais */}
          <div className="flex-1 p-6 md:p-8 overflow-y-auto">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}