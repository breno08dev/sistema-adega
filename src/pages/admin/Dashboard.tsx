import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { DollarSign, Package, ShoppingCart, TrendingUp, List, Wallet, Clock, Eye, EyeOff, Calculator, Award, Lightbulb } from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { toast } from "sonner";

// --- TIPOS ---
type PaymentMethod = "dinheiro" | "pix" | "cartao_credito" | "cartao_debito" | "fiado";
type SaleStatus = Database["public"]["Enums"]["sale_status"];

export type RecentSale = Pick<Database["public"]["Tables"]["sales"]["Row"], "id" | "created_at" | "total" | "nome_cliente" | "metodo_pagamento" | "status" | "updated_at"> & {
  profiles: { nome: string } | null;
  sale_payments?: { metodo_pagamento: string }[]; // <--- CORREÇÃO AQUI: Adicionado para o TypeScript parar de reclamar
};

const paymentMethodLabels: Record<string, string> = { 
    dinheiro: "Dinheiro", 
    pix: "Pix", 
    cartao_credito: "Crédito", 
    cartao_debito: "Débito",
    fiado: "Crediário"
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [turnoInfo, setTurnoInfo] = useState<{ status: 'Aberto' | 'Fechado', caixasAtivos: number }>({ status: 'Fechado', caixasAtivos: 0 });
  const [kpiStats, setKpiStats] = useState({ totalVendas: 0, vendasTurno: 0, produtosCatalogo: 0, estoqueTotal: 0, comandasAbertas: 0 });
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [insights, setInsights] = useState({ mediaVendas: 0, topProduto: "Nenhum", topQtd: 0 });

  useEffect(() => {
    loadDashboardData();
    // Inscrição em Tempo Real para manter os dados sempre frescos
    const channel = supabase.channel('dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caixas' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_items' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sale_payments' }, () => loadDashboardData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Identificar o Turno Atual (Caixas Abertos)
      const { data: openCaixas } = await supabase.from('caixas').select('id, data_abertura', { count: 'exact' }).eq('status', 'aberto');
      let targetCaixaIds: string[] = [];
      let currentTurnoStatus: 'Aberto' | 'Fechado' = 'Fechado';
      
      if (openCaixas && openCaixas.length > 0) {
        targetCaixaIds = openCaixas.map(c => c.id);
        currentTurnoStatus = 'Aberto';
      } else {
        const { data: lastCaixa } = await supabase.from('caixas').select('id').order('data_abertura', { ascending: false }).limit(1);
        if (lastCaixa && lastCaixa.length > 0) targetCaixaIds = [lastCaixa[0].id];
        currentTurnoStatus = 'Fechado';
      }

      setTurnoInfo({ status: currentTurnoStatus, caixasAtivos: openCaixas?.length || 0 });

      // 2. Cálculo do Total Vendas Geral (Loop Inteligente para Bypass do limite de 1000 linhas)
      let hasMore = true;
      let offset = 0;
      let totalVendasGeral = 0;

      while (hasMore) {
        const { data, error } = await supabase
          .from("sales")
          .select("total, metodo_pagamento")
          .eq("status", "finalizada")
          .range(offset, offset + 999);

        if (error || !data || data.length === 0) {
          hasMore = false;
        } else {
          // Só soma no faturamento geral se não for fiado
          totalVendasGeral += data.filter(s => s.metodo_pagamento !== 'fiado').reduce((acc, v) => acc + Number(v.total || 0), 0);
          if (data.length < 1000) hasMore = false;
          else offset += 1000;
        }
      }

      // Adiciona os pagamentos de crediário recebidos ao faturamento geral
      const { data: credPgtos } = await supabase.from('crediario_pagamentos').select('valor');
      if (credPgtos) {
          totalVendasGeral += credPgtos.reduce((acc, p) => acc + Number(p.valor || 0), 0);
      }

      // 3. Buscar KPIs (Produtos e Comandas Abertas)
      const [produtosData, comandasAbertasData] = await Promise.all([
        supabase.from("products").select("quantidade", { count: "exact" }),
        supabase.from("sales").select("id", { count: "exact" }).eq("status", "aberta"),
      ]);

      // 4. Buscar Vendas do Turno e Produto Mais Vendido
      let vendasTurnoTotal = 0;
      let numVendasFinalizadas = 0;
      let turnoSalesData: RecentSale[] = [];
      let topProdutoNome = "Nenhum";
      let topProdutoQtd = 0;

      if (targetCaixaIds.length > 0) {
          // Vendas Recentes do Turno
          const { data: turnoSales } = await supabase
            .from("sales")
            .select("id, created_at, updated_at, total, nome_cliente, metodo_pagamento, status, profiles(nome), sale_payments(metodo_pagamento)")
            .in("caixa_id", targetCaixaIds)
            .order("updated_at", { ascending: false });

          if (turnoSales) {
              turnoSalesData = turnoSales as unknown as RecentSale[];
              turnoSalesData.filter(s => s.status === 'finalizada').forEach(sale => {
                  if (sale.metodo_pagamento !== 'fiado') {
                      vendasTurnoTotal += Number(sale.total) || 0;
                  }
                  numVendasFinalizadas++;
              });
          }

          // Adiciona os recebimentos de crediário do turno atual ao faturamento do turno
          const { data: turnoCredPgtos } = await supabase.from('crediario_pagamentos').select('valor').in('caixa_id', targetCaixaIds);
          if (turnoCredPgtos) {
              vendasTurnoTotal += turnoCredPgtos.reduce((acc, p) => acc + Number(p.valor || 0), 0);
          }

          // Lógica do Produto Mais Vendido do Turno
          const { data: saleItemsData } = await supabase
              .from("sale_items")
              .select("quantidade, products(nome), sales!inner(caixa_id, status)")
              .in("sales.caixa_id", targetCaixaIds)
              .eq("sales.status", "finalizada");

          if (saleItemsData && saleItemsData.length > 0) {
              const productCounts: Record<string, number> = {};
              saleItemsData.forEach((item: any) => {
                  const pName = item.products?.nome || "Desconhecido";
                  productCounts[pName] = (productCounts[pName] || 0) + Number(item.quantidade);
              });
              
              for (const [name, qty] of Object.entries(productCounts)) {
                  if (qty > topProdutoQtd) {
                      topProdutoQtd = qty;
                      topProdutoNome = name;
                  }
              }
          }
      }

      setKpiStats({
        totalVendas: totalVendasGeral,
        vendasTurno: vendasTurnoTotal, 
        produtosCatalogo: produtosData.count || 0,
        estoqueTotal: produtosData.data?.reduce((acc, p) => acc + p.quantidade, 0) || 0,
        comandasAbertas: comandasAbertasData.count || 0,
      });

      setInsights({
          mediaVendas: numVendasFinalizadas > 0 ? vendasTurnoTotal / numVendasFinalizadas : 0,
          topProduto: topProdutoNome,
          topQtd: topProdutoQtd
      });

      setRecentSales(turnoSalesData.slice(0, 10)); 

    } catch (error: any) { 
        toast.error("Erro ao carregar dashboard"); 
    } finally { 
        setLoading(false); 
    }
  };

  return (
    <div className="space-y-4 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8 px-1 md:px-0">
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão geral da Adega do Sheik.</p>
        </div>
        <Badge variant={turnoInfo.status === 'Aberto' ? 'default' : 'secondary'} className={`w-fit px-3 py-1.5 text-xs md:text-sm ${turnoInfo.status === 'Aberto' ? 'bg-green-600 text-white border-none' : 'bg-muted text-muted-foreground border-border'}`}>
           {turnoInfo.status === 'Aberto' ? `Turno Aberto (${turnoInfo.caixasAtivos} ativo)` : 'Turno Fechado'}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard title="Vendas Turno" value={`R$ ${kpiStats.vendasTurno.toFixed(2)}`} subtext="No caixa atual" icon={TrendingUp} />
        <KpiCard title="Comandas" value={kpiStats.comandasAbertas} subtext="Consumo local" icon={List} />
        
       <Card className="hover:shadow-md transition-all bg-card border border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground truncate">Status Caixa</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {turnoInfo.status === 'Aberto' ? (
              <div className="flex flex-col"><div className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2"><span className="relative flex h-2 w-2 md:h-3 md:w-3"><span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative rounded-full h-2 w-2 md:h-3 md:w-3 bg-green-500"></span></span> Aberto</div><p className="text-[10px] md:text-xs text-muted-foreground mt-4">Pronto para vender</p></div>
            ) : (
             <div className="flex flex-col"><div className="text-xl md:text-2xl font-bold text-muted-foreground flex items-center gap-2"><span className="h-2 w-2 md:h-3 md:w-3 rounded-full bg-red-500"></span> Fechado</div><p className="text-[10px] md:text-xs text-muted-foreground mt-4">Nenhum caixa ativo</p></div>
            )}
          </CardContent>
        </Card>

        <KpiCard title="Produtos" value={kpiStats.produtosCatalogo} subtext="Itens cadastrados" icon={Package} />
        <KpiCard title="Estoque" value={kpiStats.estoqueTotal} subtext="Total em mãos" icon={ShoppingCart} />
        <KpiCard title="Faturamento" value={`R$ ${kpiStats.totalVendas.toFixed(2)}`} subtext="Geral histórico" icon={DollarSign} privacyMode={true} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Tabela de Vendas Recentes */}
        <Card className="md:col-span-2 shadow-sm bg-card border border-border overflow-hidden">
          <CardHeader className="bg-muted/30 border-b border-border p-4"><CardTitle className="text-base md:text-lg font-semibold text-foreground flex gap-2 items-center"><Clock className="w-4 h-4 text-primary"/> Vendas do Turno</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-muted/50 border-border"><TableHead className="pl-4 md:pl-6 text-xs text-muted-foreground">Hora</TableHead><TableHead className="text-xs text-muted-foreground">Cliente</TableHead><TableHead className="text-xs text-muted-foreground hidden md:table-cell">Vendedor</TableHead><TableHead className="text-xs text-muted-foreground">Método</TableHead><TableHead className="text-right pr-4 md:pr-6 text-xs text-muted-foreground">Valor</TableHead></TableRow></TableHeader>
                <TableBody>
                  {!loading && recentSales.map((sale) => (
                    <TableRow key={sale.id} className="align-middle border-border hover:bg-muted/30">
                      <TableCell className="pl-4 md:pl-6 pt-3 md:pt-4 text-xs text-muted-foreground">{format(new Date(sale.updated_at), "HH:mm")}</TableCell>
                      <TableCell className="pt-3 md:pt-4 text-xs font-medium text-foreground">{sale.nome_cliente || "Balcão"}</TableCell>
                      <TableCell className="pt-3 md:pt-4 text-xs text-muted-foreground hidden md:table-cell">{sale.profiles?.nome || "Sistema"}</TableCell>
                      <TableCell className="pt-2 pb-2 md:pt-3 md:pb-3">
                         {sale.status === 'aberta' ? (
                             <Badge variant="outline" className="text-orange-500 border-orange-500/30 bg-orange-500/10">Consumindo</Badge>
                         ) : sale.sale_payments && sale.sale_payments.length > 1 ? (
                             <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Misto</Badge>
                         ) : sale.metodo_pagamento === 'fiado' || (sale.sale_payments && sale.sale_payments[0]?.metodo_pagamento === 'fiado') ? (
                             <Badge variant="outline" className="text-orange-500 border-orange-500/30 bg-orange-500/10">Crediário</Badge>
                         ) : (
                             <Badge variant="outline" className="border-border text-foreground">
                                 {paymentMethodLabels[sale.sale_payments?.[0]?.metodo_pagamento || sale.metodo_pagamento || "dinheiro"] || 'N/A'}
                             </Badge>
                         )}
                      </TableCell>
                      <TableCell className="text-right pr-4 md:pr-6 pt-3 md:pt-4 text-xs font-bold text-foreground">R$ {Number(sale.total).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Insights Financeiros */}
        <Card className="md:col-span-1 shadow-sm bg-card border border-border">
          <CardHeader className="bg-muted/30 border-b border-border p-4">
              <CardTitle className="text-base md:text-lg font-semibold text-foreground flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-primary" /> Insights
              </CardTitle>
          </CardHeader>
          <CardContent className="p-4 flex flex-col gap-4">
             <div className="bg-muted/20 p-4 rounded-xl border border-border flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                   <Calculator className="h-6 w-6 text-primary" />
                </div>
                <div>
                   <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Ticket Médio</p>
                   <p className="text-2xl font-extrabold text-foreground">R$ {insights.mediaVendas.toFixed(2)}</p>
                </div>
             </div>
             <div className="bg-muted/20 p-4 rounded-xl border border-border flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-yellow-500/10 flex items-center justify-center flex-shrink-0">
                   <Award className="h-6 w-6 text-yellow-500" />
                </div>
                <div className="overflow-hidden w-full">
                   <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1">Mais Vendido</p>
                   <p className="text-base md:text-lg font-bold text-foreground truncate">{insights.topProduto}</p>
                   <div className="flex items-center mt-1">
                      <Badge variant="outline" className="bg-primary/10 text-primary border-none px-2 py-0">{insights.topQtd} un.</Badge>
                   </div>
                </div>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ title, value, subtext, icon: Icon, privacyMode = false }: any) {
  const [isVisible, setIsVisible] = useState(!privacyMode);
  return (
    <Card className="hover:shadow-md transition-all bg-card border border-border">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-4">
        <CardTitle className="text-[10px] md:text-sm font-medium text-muted-foreground truncate">{title}</CardTitle>
        <div className="h-6 w-6 md:h-8 md:w-8 rounded-full bg-primary/10 flex items-center justify-center"><Icon className="h-3 w-3 md:h-4 md:w-4 text-primary" /></div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="flex items-center gap-2">
            <div className="text-lg md:text-2xl font-bold tracking-tight text-foreground truncate">{isVisible ? value : 'R$ •••••'}</div>
            {privacyMode && (<button onClick={() => setIsVisible(!isVisible)} className="text-muted-foreground hover:text-primary">{isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}</button>)}
        </div>
        <p className="text-[9px] md:text-xs text-muted-foreground mt-1 truncate">{subtext}</p>
      </CardContent>
    </Card>
  );
}