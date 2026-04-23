import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/DashboardLayout";
import AdminCaixas from "./pages/admin/Caixas";
import { lazy, Suspense, useEffect } from "react";
import { PaymentGuard } from "@/components/PaymentGuard";

const queryClient = new QueryClient();

const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

const Auth = lazy(() => import("./pages/Auth"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const Products = lazy(() => import("./pages/admin/Products"));
const AdminSales = lazy(() => import("./pages/admin/Sales"));
const PDV = lazy(() => import("./pages/pdv/PDV"));
const CollaboratorHistory = lazy(() => import("./pages/pdv/History"));
const NotFound = lazy(() => import("./pages/NotFound"));
const CaixaRapido = lazy(() => import("./pages/pdv/Caixa-Rapido"));
const Clientes = lazy(() => import("./pages/pdv/Clientes"));
const Crediario = lazy(() => import("./pages/pdv/Crediario"));
const Balanco = lazy(() => import("./pages/admin/Balanco"));

const App = () => {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Rota de Login aberta (sem bloqueio de pagamento) */}
              <Route path="/auth" element={<Auth />} />
              
              {/* Todas as outras rotas protegidas pelo PaymentGuard */}
              <Route
                path="*"
                element={
                  <PaymentGuard>
                    <Routes>
                      {/* Rotas Admin */}
                      <Route path="/admin" element={
                        <ProtectedRoute requiredType="admin">
                          <DashboardLayout><AdminDashboard /></DashboardLayout>
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/produtos" element={
                        <ProtectedRoute requiredType="admin">
                          <DashboardLayout><Products /></DashboardLayout>
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/vendas" element={
                        <ProtectedRoute requiredType="admin">
                          <DashboardLayout><AdminSales /></DashboardLayout>
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/caixas" element={
                        <ProtectedRoute requiredType="admin">
                          <DashboardLayout><AdminCaixas /></DashboardLayout>
                        </ProtectedRoute>
                      } />
                      <Route path="/admin/balanco" element={
                        <ProtectedRoute requiredType="admin">
                          <DashboardLayout><Balanco /></DashboardLayout>
                        </ProtectedRoute>
                      } />

                      {/* Rotas Colaborador */}
                      <Route path="/pdv" element={
                        <ProtectedRoute requiredType="colaborador">
                          <DashboardLayout><PDV /></DashboardLayout>
                        </ProtectedRoute>
                      } />
                      <Route path="/pdv/historico" element={
                        <ProtectedRoute requiredType="colaborador">
                          <DashboardLayout><CollaboratorHistory /></DashboardLayout>
                        </ProtectedRoute>
                      } />
                      <Route path="/pdv/caixa-rapido" element={
                        <ProtectedRoute requiredType="colaborador">
                          <DashboardLayout><CaixaRapido /></DashboardLayout>
                        </ProtectedRoute>
                      } />
                      <Route path="/pdv/clientes" element={
                        <ProtectedRoute requiredType="colaborador">
                          <DashboardLayout><Clientes /></DashboardLayout>
                        </ProtectedRoute>
                      } />
                      <Route path="/pdv/crediario" element={
                        <ProtectedRoute requiredType="colaborador">
                          <DashboardLayout><Crediario /></DashboardLayout>
                        </ProtectedRoute>
                      } />

                      <Route path="/" element={<Navigate to="/auth" replace />} />
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </PaymentGuard>
                }
              />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
  );
}

export default App;