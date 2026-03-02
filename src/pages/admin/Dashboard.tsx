import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  DollarSign,
  Package,
  ShoppingCart,
  TrendingUp,
  List,
  Wallet,
  Clock,
  Eye,
  EyeOff
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from "recharts";
import { Database } from "@/integrations/supabase/types";
import { format } from "date-fns";
import { toast } from "sonner";

// -------------------- Tipos --------------------
type PaymentMethod = Database["public"]["Enums"]["payment_method"];
type SaleStatus = Database["public"]["Enums"]["sale_status"];
type SalePayment = { metodo_pagamento: PaymentMethod; valor: number };

export type RecentSale = Pick<
  Database["public"]["Tables"]["sales"]["Row"],
  "id" | "created_at" | "total" | "nome_cliente" | "metodo_pagamento" | "status" | "updated_at"
> & {
  profiles: { nome: string } | null;
  sale_payments?: SalePayment[];
};

const paymentMethodLabels: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao_credito: "Crédito",
  cartao_debito: "Débito",
};

const statusLabels: Record<SaleStatus, string> = {
  aberta: "Aberta",
  finalizada: "Finalizada",
};

const COLORS = {
  dinheiro: "#10B981",
  pix: "#3B82F6",
  cartao_debito: "#F59E0B",
  cartao_credito: "#EF4444",
};

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [turnoInfo, setTurnoInfo] = useState<{ status: 'Aberto' | 'Fechado', caixasAtivos: number }>({ status: 'Fechado', caixasAtivos: 0 });
  const [kpiStats, setKpiStats] = useState({
    totalVendas: 0,
    vendasTurno: 0, 
    produtosCatalogo: 0,
    estoqueTotal: 0,
    comandasAbertas: 0,
    caixasAbertos: 0,
  });
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [paymentData, setPaymentData] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();

    // Ouvir mudanças em tempo real para atualizar o status do caixa imediatamente
    const channel = supabase
      .channel('dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'caixas' }, () => loadDashboardData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => loadDashboardData())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);

    try {
      // 1. VERIFICAÇÃO REAL DE CAIXAS ABERTOS
      const { data: openCaixas, count } = await supabase
        .from('caixas')
        .select('id, data_abertura', { count: 'exact' })
        .eq('status', 'aberto');

      let targetCaixaIds: string[] = [];
      let currentTurnoStatus: 'Aberto' | 'Fechado' = 'Fechado';
      
      if (openCaixas && openCaixas.length > 0) {
        targetCaixaIds = openCaixas.map(c => c.id);
        currentTurnoStatus = 'Aberto';
      } else {
        // Se fechado, busca apenas o último turno para histórico visual
        const { data: lastCaixa } = await supabase
          .from('caixas')
          .select('id')
          .order('data_abertura', { ascending: false })
          .limit(1);
        
        if (lastCaixa && lastCaixa.length > 0) targetCaixaIds = [lastCaixa[0].id];
        currentTurnoStatus = 'Fechado';
      }

      setTurnoInfo({ status: currentTurnoStatus, caixasAtivos: openCaixas?.length || 0 });

      // 2. BUSCAS GERAIS
      const [vendasTotaisData, produtosData, comandasAbertasData] = await Promise.all([
        supabase.from("sales").select("total").eq("status", "finalizada"),
        supabase.from("products").select("quantidade", { count: "exact" }),
        supabase.from("sales").select("id", { count: "exact" }).eq("status", "aberta"),
      ]);

      let vendasTurnoTotal = 0;
      const breakdown = { dinheiro: 0, pix: 0, cartao_credito: 0, cartao_debito: 0 };
      let turnoSalesData: RecentSale[] = [];

      // 3. DADOS DO TURNO (FILTRADO POR CAIXA_ID)
      if (targetCaixaIds.length > 0) {
          const { data: turnoSales, error: turnoSalesError } = await supabase
            .from("sales")
            .select("id, created_at, updated_at, total, nome_cliente, metodo_pagamento, status, profiles(nome), sale_payments(metodo_pagamento, valor)")
            .in("caixa_id", targetCaixaIds)
            .order("updated_at", { ascending: false });

          if (!turnoSalesError && turnoSales) {
              turnoSalesData = turnoSales as unknown as RecentSale[];
              turnoSalesData.filter(s => s.status === 'finalizada').forEach(sale => {
                  vendasTurnoTotal += Number(sale.total) || 0;
                  if (sale.sale_payments && sale.sale_payments.length > 0) {
                      sale.sale_payments.forEach(p => {
                          const m = p.metodo_pagamento as PaymentMethod;
                          breakdown[m] = (breakdown[m] || 0) + Number(p.valor);
                      });
                  } else if (sale.metodo_pagamento) {
                      const m = sale.metodo_pagamento as PaymentMethod;
                      breakdown[m] = (breakdown[m] || 0) + Number(sale.total);
                  }
              });
          }
      }

      setKpiStats({
        totalVendas: vendasTotaisData.data?.reduce((acc, v) => acc + Number(v.total), 0) || 0,
        vendasTurno: vendasTurnoTotal,
        produtosCatalogo: produtosData.count || 0,
        estoqueTotal: produtosData.data?.reduce((acc, p) => acc + p.quantidade, 0) || 0,
        comandasAbertas: comandasAbertasData.count || 0,
        caixasAbertos: openCaixas?.length || 0,
      });

      const chartData = Object.keys(breakdown)
        .map((key) => ({
          name: paymentMethodLabels[key as PaymentMethod],
          value: breakdown[key as keyof typeof breakdown],
          color: COLORS[key as PaymentMethod],
        }))
        .filter(item => item.value > 0)
        .sort((a, b) => a.value - b.value);

      setPaymentData(chartData);
      setRecentSales(turnoSalesData.slice(0, 20)); 

    } catch (error: any) {
      toast.error("Erro ao carregar dashboard");
    } finally {
      setLoading(false);
    }
  };

  const renderPaymentBadge = (sale: RecentSale) => {
    if (sale.status !== 'finalizada') return <Badge variant="outline" className="text-gray-400 text-[10px] md:text-xs">Pendente</Badge>;
    if (sale.sale_payments && sale.sale_payments.length > 0) {
        return (
           <div className="flex flex-col gap-1 items-start">
             {sale.sale_payments.map((p, idx) => (
               <Badge key={idx} variant="outline" className="bg-gray-50 text-gray-700 border-gray-200 whitespace-nowrap text-[10px] md:text-xs">
                 {paymentMethodLabels[p.metodo_pagamento]}: R$ {Number(p.valor).toFixed(2)}
               </Badge>
             ))}
           </div>
        );
    }
    return <Badge variant="outline" className="text-[10px] md:text-xs">{sale.metodo_pagamento ? paymentMethodLabels[sale.metodo_pagamento] : 'N/A'}</Badge>;
  };

  return (
    <div className="space-y-4 md:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8 px-1 md:px-0">
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Desempenho em tempo real.</p>
        </div>
        <Badge variant={turnoInfo.status === 'Aberto' ? 'default' : 'secondary'} className={`w-fit px-3 py-1.5 text-xs md:text-sm ${turnoInfo.status === 'Aberto' ? 'bg-green-500' : ''}`}>
           {turnoInfo.status === 'Aberto' ? `Turno Aberto (${turnoInfo.caixasAtivos} ativo)` : 'Turno Fechado'}
        </Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard title="Vendas Turno" value={`R$ ${kpiStats.vendasTurno.toFixed(2)}`} subtext="Turno atual" icon={TrendingUp} iconColor="text-blue-600" bgColor="bg-blue-100" />
        <KpiCard title="Comandas" value={kpiStats.comandasAbertas} subtext="Abertas" icon={List} iconColor="text-orange-600" bgColor="bg-orange-100" />
        
       <Card className="hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground truncate">Status Caixa</CardTitle>
            <Wallet className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {turnoInfo.status === 'Aberto' ? (
              <div className="flex flex-col">
                <div className="text-xl md:text-2xl font-bold flex items-center gap-2">
                   <span className="relative flex h-2 w-2 md:h-3 md:w-3"><span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative rounded-full h-2 w-2 md:h-3 md:w-3 bg-green-500"></span></span>
                   Aberto
                </div>
              </div>
            ) : (
              <div className="text-xl md:text-2xl font-bold text-muted-foreground flex items-center gap-2">
                <span className="h-2 w-2 md:h-3 md:w-3 rounded-full bg-red-500"></span> Fechado
              </div>
            )}
          </CardContent>
        </Card>

        <KpiCard title="Produtos" value={kpiStats.produtosCatalogo} subtext="Catálogo" icon={Package} iconColor="text-indigo-600" bgColor="bg-indigo-100" />
        <KpiCard title="Estoque" value={kpiStats.estoqueTotal} subtext="Total itens" icon={ShoppingCart} iconColor="text-emerald-600" bgColor="bg-emerald-100" />
        <KpiCard title="Vendas Geral" value={`R$ ${kpiStats.totalVendas.toFixed(2)}`} subtext="Histórico" icon={DollarSign} iconColor="text-green-600" bgColor="bg-green-100" privacyMode={true} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="md:col-span-2 shadow-sm overflow-hidden">
          <CardHeader className="bg-gray-50/50 border-b p-4"><CardTitle className="text-base md:text-lg font-semibold flex gap-2 items-center"><Clock className="w-4 h-4"/> Vendas do Turno</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader><TableRow className="bg-gray-50/30">
                    <TableHead className="pl-4 md:pl-6 text-xs">Hora</TableHead>
                    <TableHead className="text-xs">Cliente</TableHead>
                    <TableHead className="text-xs">Pagto</TableHead>
                    <TableHead className="text-right pr-4 md:pr-6 text-xs">Total</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {!loading && recentSales.map((sale) => (
                    <TableRow key={sale.id} className="align-top">
                      <TableCell className="pl-4 md:pl-6 pt-4 text-xs">{format(new Date(sale.updated_at), "HH:mm")}</TableCell>
                      <TableCell className="pt-4 text-xs font-medium truncate max-w-[100px]">{sale.nome_cliente || "Balcão"}</TableCell>
                      <TableCell className="pt-2 pb-2">{renderPaymentBadge(sale)}</TableCell>
                      <TableCell className="text-right pr-4 md:pr-6 pt-4 text-xs font-bold">R$ {Number(sale.total).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-1 shadow-sm">
          <CardHeader className="bg-gray-50/50 border-b p-4"><CardTitle className="text-base md:text-lg font-semibold">Meios de Pagto</CardTitle></CardHeader>
          <CardContent className="pt-6">
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={paymentData} layout="vertical" margin={{ left: -20, right: 10 }}>
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={80} tick={{ fontSize: 11 }} />
                    <Tooltip cursor={{ fill: "transparent" }} formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Total']} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                      {paymentData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({ title, value, subtext, icon: Icon, iconColor, bgColor, privacyMode = false }: any) {
  const [isVisible, setIsVisible] = useState(!privacyMode);
  return (
    <Card className="hover:shadow-md transition-all">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 p-4">
        <CardTitle className="text-[10px] md:text-sm font-medium text-muted-foreground truncate">{title}</CardTitle>
        <div className={`h-6 w-6 md:h-8 md:w-8 rounded-full ${bgColor} flex items-center justify-center`}><Icon className={`h-3 w-3 md:h-4 md:w-4 ${iconColor}`} /></div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div className="flex items-center gap-2">
            <div className="text-lg md:text-2xl font-bold tracking-tight truncate">{isVisible ? value : 'R$ •••••'}</div>
            {privacyMode && (
                <button onClick={() => setIsVisible(!isVisible)} className="text-muted-foreground hover:text-foreground">
                    {isVisible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                </button>
            )}
        </div>
        <p className="text-[9px] md:text-xs text-muted-foreground mt-1 truncate">{subtext}</p>
      </CardContent>
    </Card>
  );
}