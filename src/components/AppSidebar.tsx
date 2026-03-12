import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  History,
  LogOut,
  Wallet,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar, // Importado para controlar o estado do menu
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

export function AppSidebar() {
  const { signOut, userType } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { setOpenMobile } = useSidebar(); // Hook para fechar o menu no mobile

  // Itens de menu para Administração
  const adminItems = [
    { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
    { title: "Produtos", url: "/admin/produtos", icon: Package },
    { title: "Vendas", url: "/admin/vendas", icon: ShoppingCart },
    { title: "Caixas", url: "/admin/caixas", icon: Wallet },
  ];

  // Itens de menu para Colaboradores
  const collaboratorItems = [
    { title: "Caixa Rápido", url: "/pdv/caixa-rapido", icon: ShoppingCart },
    { title: "Comandas", url: "/pdv", icon: LayoutDashboard },
    { title: "Histórico", url: "/pdv/historico", icon: History },
  ];

  const items = userType === "admin" ? adminItems : collaboratorItems;

  // Função para navegar e fechar o menu
  const handleNavigation = (url: string) => {
    navigate(url);
    setOpenMobile(false); // Fecha o menu lateral após o clique
  };

  return (
    <Sidebar className="border-r border-border bg-sidebar">
      <SidebarHeader className="p-6 border-b border-border/50">
        <div className="flex items-center justify-center">
          <img 
            src="/conectnew.logo.png" 
            alt="Conect New" 
            className="h-24 w-auto object-contain drop-shadow-md transition-transform hover:scale-105 duration-300" 
          />
        </div>
      </SidebarHeader>
      
      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground px-4 mb-2">
            Menu Principal
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const isActive = location.pathname === item.url;
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      className={`h-11 px-4 rounded-lg transition-all duration-200 ${
                        isActive 
                          ? "bg-primary/10 text-primary border border-primary/20 shadow-sm" 
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      }`}
                    >
                      <button onClick={() => handleNavigation(item.url)} className="flex items-center gap-3 w-full">
                        <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
                        <span className="font-semibold text-sm">{item.title}</span>
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-border/50 bg-muted/10">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="h-11 px-4 text-destructive hover:bg-destructive/10 hover:text-destructive transition-colors rounded-lg font-bold"
              onClick={() => signOut()}
            >
              <LogOut className="h-5 w-5" />
              <span>Sair do Sistema</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}