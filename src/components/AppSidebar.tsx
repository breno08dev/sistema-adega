import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  History,
  LogOut,
  Zap,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

const adminItems = [
  { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
  { title: "Produtos", url: "/admin/produtos", icon: Package },
  { title: "Vendas", url: "/admin/vendas", icon: History },
];

const colaboradorItems = [
  { title: "Caixa Rápido", url: "/pdv/caixa-rapido", icon: Zap },
  { title: "Comandas", url: "/pdv", icon: ShoppingCart },
  { title: "Histórico", url: "/pdv/historico", icon: History },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { userType, userName, signOut } = useAuth();
  const isCollapsed = state === "collapsed";

  const items = userType === "admin" ? adminItems : colaboradorItems;
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    await signOut();
    queryClient.clear();
  };

  return (
    <Sidebar
      collapsible="icon"
      className="bg-white dark:bg-gray-900 md:bg-transparent dark:md:bg-transparent border-r-0"
    >
      {/* Header */}
      <SidebarHeader className="p-4 pb-2">
        <div className="flex items-center gap-3 px-1">
          <img
            src="/logo.png"
            alt="Logo da Adega"
            className={`${isCollapsed ? "h-8 w-8" : "h-9 w-9"} object-contain transition-all`}
          />
          {!isCollapsed && (
            <div className="flex flex-col">
              <span className="font-bold text-lg leading-none tracking-tight text-gray-900 dark:text-white">Adega do Sheik</span>
              <span className="text-xs text-gray-500 font-medium mt-1">
                {userType === "admin" ? "Painel Admin" : "Área do Colaborador"}
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      {/* Conteúdo do menu */}
      <SidebarContent className="px-2 mt-4">
        <SidebarGroup>
          <SidebarGroupLabel className="px-4 mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">
            {isCollapsed ? "Menu" : "Navegação Principal"}
          </SidebarGroupLabel>

          <SidebarGroupContent>
            <SidebarMenu className="gap-1">
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild tooltip={item.title} className="h-auto p-0 hover:bg-transparent ring-0 outline-none">
                    <NavLink
                      to={item.url}
                      end={item.url === "/pdv"}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 w-full
                        ${
                          isActive
                            ? "bg-primary text-secondary-foreground shadow-md shadow-secondary/20" // Ativo: Cor do tema + Texto contraste (Branco ou Preto)
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-300 dark:hover:text-white" // Inativo: Cinza Escuro (visível)
                        }`
                      }
                    >
                      <item.icon className="h-4 w-4" />
                      {!isCollapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Rodapé da sidebar */}
      <SidebarFooter className="p-4 border-t border-border/50 bg-gray-50/50 dark:bg-gray-900/50 mt-auto">
        {!isCollapsed && (
          <div className="mb-4 px-1">
            <p className="text-sm font-bold truncate text-gray-900 dark:text-gray-100">{userName}</p>
            <p className="text-xs text-gray-500">
              {userType === "admin" ? "Administrador" : "Colaborador"}
            </p>
          </div>
        )}
        <Button
          variant="outline"
          onClick={handleLogout}
          className={`w-full justify-start border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-300 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors ${isCollapsed ? "px-0 justify-center" : ""}`}
          size={isCollapsed ? "icon" : "default"}
        >
          <LogOut className="h-4 w-4" />
          {!isCollapsed && <span className="ml-2">Sair do Sistema</span>}
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}