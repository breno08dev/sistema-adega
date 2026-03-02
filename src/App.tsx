import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/DashboardLayout";
import AdminCaixas from "./pages/admin/Caixas";

// 1. ADICIONAR IMPORTS DE LAZY E SUSPENSE
import { lazy, Suspense } from "react";

const queryClient = new QueryClient();

// 2. CRIAR UM COMPONENTE DE CARREGAMENTO (FALLBACK)
const PageLoader = () => (
  <div className="flex min-h-screen items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
  </div>
);

// 3. TRANSFORMAR IMPORTS DE PÁGINAS EM 'LAZY'
const Auth = lazy(() => import("./pages/Auth"));
const AdminDashboard = lazy(() => import("./pages/admin/Dashboard"));
const Products = lazy(() => import("./pages/admin/Products"));
const AdminSales = lazy(() => import("./pages/admin/Sales"));
const PDV = lazy(() => import("./pages/pdv/PDV"));
const CollaboratorHistory = lazy(() => import("./pages/pdv/History"));
const NotFound = lazy(() => import("./pages/NotFound"));

// --- IMPORTAÇÃO DA NOVA PÁGINA ---
const CaixaRapido = lazy(() => import("./pages/pdv/Caixa-Rapido"));

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          {/* 4. ENVOLVER AS ROTAS COM O SUSPENSE */}
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              
              {/* Rotas Admin */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute requiredType="admin">
                    <DashboardLayout>
                      <AdminDashboard />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/produtos"
                element={
                  <ProtectedRoute requiredType="admin">
                    <DashboardLayout>
                      <Products />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/vendas"
                element={
                  <ProtectedRoute requiredType="admin">
                    <DashboardLayout>
                      <AdminSales />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />

              <Route 
              path="/admin/caixas" 
              element={
              <ProtectedRoute requiredType="admin">
                <DashboardLayout>
                  <AdminCaixas />
                  </DashboardLayout>
                  </ProtectedRoute>
                  }  
                  />


              {/* Rotas Colaborador */}
              <Route
                path="/pdv"
                element={
                  <ProtectedRoute requiredType="colaborador">
                    <DashboardLayout>
                      <PDV />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/pdv/historico"
                element={
                  <ProtectedRoute requiredType="colaborador">
                    <DashboardLayout>
                      <CollaboratorHistory />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />

              {/* --- ROTA ADICIONADA --- */}
              <Route
                path="/pdv/caixa-rapido"
                element={
                  <ProtectedRoute requiredType="colaborador">
                    <DashboardLayout>
                      <CaixaRapido />
                    </DashboardLayout>
                  </ProtectedRoute>
                }
              />

              {/* Redirecionar root */}
              <Route path="/" element={<Navigate to="/auth" replace />} />
              
              {/* 404 */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;