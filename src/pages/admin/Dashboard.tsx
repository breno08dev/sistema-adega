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

export type RecentSale = Pick<
  Database["public"]["Tables"]["sales"]["Row"],
  "id" | "created_at" | "total" | "nome_cliente" | "metodo_pagamento" | "status"
> & {
  profiles: { nome: string } | null;
};

// -------------------- Labels --------------------
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

// -------------------- Componente Principal --------------------
export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [kpiStats, setKpiStats] = useState({
    totalVendas: 0,
    vendasHoje: 0,
    produtosCatalogo: 0,
    estoqueTotal: 0,
    comandasAbertas: 0,
    caixasAbertos: 0,
  });
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);
  const [paymentData, setPaymentData] = useState<any[]>([]);

  // --- ATUALIZAÇÃO NESTA FUNÇÃO (useEffect) ---
  useEffect(() => {
    // 1. Carrega os dados iniciais
    loadDashboardData();

    // 2. Define o que fazer quando um evento (INSERT, UPDATE, DELETE) acontecer
    const handleCaixaChange = (payload: any) => {
      // Quando algo mudar na tabela 'caixas', apenas recarrega os dados do dashboard
      console.log('Mudança nos caixas detectada!', payload);
      loadDashboardData(); 
    };

    // 3. Assina o canal de "realtime" do Supabase
    const channel = supabase
      .channel('dashboard-caixas-changes') // um nome único para o canal
      .on(
        'postgres_changes', // tipo de evento
        { event: '*', schema: 'public', table: 'caixas' }, // escuta TUDO na tabela 'caixas'
        handleCaixaChange // chama nossa função quando algo mudar
      )
      .subscribe(); // Inicia a assinatura

    // 4. Limpeza: Quando o componente for "desmontado" (usuário sair da página),
    //    remove a assinatura para economizar recursos.
    return () => {
      supabase.removeChannel(channel);
    };

  }, []); // O array vazio aqui está correto, pois a assinatura só precisa ser feita uma vez

  const loadDashboardData = async () => {
    setLoading(true);
    const hoje = new Date().toISOString().split("T")[0];
    const inicioHoje = `${hoje}T00:00:00Z`;
    const fimHoje = `${hoje}T23:59:59Z`;

    try {
      const [
        vendasHojeData,
        vendasTotaisData,
        produtosData,
        comandasAbertasData,
        caixasAbertosData,
      ] = await Promise.all([
        supabase
          .from("sales")
          .select("total, metodo_pagamento")
          .eq("status", "finalizada")
          .gte("updated_at", inicioHoje)
          .lte("updated_at", fimHoje),
        supabase
          .from("sales")
          .select("total", { count: "exact" })
          .eq("status", "finalizada"),
        supabase.from("products").select("quantidade", { count: "exact" }),
        supabase
          .from("sales")
          .select("id", { count: "exact" })
          .eq("status", "aberta"),
        supabase // Esta consulta agora será atualizada em tempo real
          .from("caixas")
          .select("id", { count: "exact" })
          .eq("status", "aberto"),
      ]);

      const { data: recentSalesData, error: recentSalesError } = (await supabase
        .from("sales")
        .select(
          "id, created_at, total, nome_cliente, metodo_pagamento, status, profiles(nome)"
        )
        .gte("created_at", inicioHoje)
        .lte("created_at", fimHoje)
        .order("created_at", { ascending: false })) as {
        data: RecentSale[] | null;
        error: any;
      };

      if (recentSalesError) throw recentSalesError;

      const totalVendas =
        vendasTotaisData.data?.reduce((acc, v) => acc + Number(v.total), 0) || 0;
      const vendasHoje =
        vendasHojeData.data?.reduce((acc, v) => acc + Number(v.total), 0) || 0;
      const estoqueTotal =
        produtosData.data?.reduce((acc, p) => acc + p.quantidade, 0) || 0;

      setKpiStats({
        totalVendas,
        vendasHoje,
        produtosCatalogo: produtosData.count || 0,
        estoqueTotal,
        comandasAbertas: comandasAbertasData.count || 0,
        caixasAbertos: caixasAbertosData.count || 0,
      });

      const breakdown = (vendasHojeData.data || []).reduce((acc, sale) => {
        const method = sale.metodo_pagamento || "pix";
        acc[method] = (acc[method] || 0) + sale.total;
        return acc;
      }, {} as Record<PaymentMethod, number>);

      const chartData = Object.keys(breakdown)
        .map((key) => ({
          name: paymentMethodLabels[key as PaymentMethod],
          value: breakdown[key as PaymentMethod],
          color: COLORS[key as PaymentMethod],
        }))
        .sort((a, b) => a.value - b.value);

      setPaymentData(chartData);
      setRecentSales(recentSalesData ?? []);
    } catch (error: any) {
      toast.error("Erro ao carregar o dashboard", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Visão geral do desempenho da Adega em tempo real.
        </p>
      </div>

      {/* KPIs com visual renovado */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {/* Helper function para renderizar Cards de KPI de forma limpa */}
        <KpiCard
          title="Vendas Hoje"
          value={`R$ ${kpiStats.vendasHoje.toFixed(2)}`}
          subtext="Vendas finalizadas hoje"
          icon={TrendingUp}
          iconColor="text-blue-600"
          bgColor="bg-blue-100 dark:bg-blue-900/30"
        />
        <KpiCard
          title="Comandas Abertas"
          value={kpiStats.comandasAbertas}
          subtext="Em atendimento agora"
          icon={List}
          iconColor="text-orange-600"
          bgColor="bg-orange-100 dark:bg-orange-900/30"
        />
        
       <Card className="hover:shadow-md transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Status dos Caixas</CardTitle>
            <div className="h-8 w-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
               <Wallet className="h-4 w-4 text-purple-600" />
            </div>
          </CardHeader>
          <CardContent>
             {loading && kpiStats.caixasAbertos === 0 ? (
              <div className="text-2xl font-bold">-</div>
            ) : kpiStats.caixasAbertos > 0 ? (
              <div className="flex flex-col gap-1">
                <div className="text-2xl font-bold flex items-center gap-2">
                   <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                  Aberto
                </div>
                <p className="text-xs text-muted-foreground">{kpiStats.caixasAbertos} Caixa(s) ativo(s)</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                 <div className="text-2xl font-bold flex items-center gap-2 text-muted-foreground">
                  <span className="h-3 w-3 rounded-full bg-red-500"></span>
                  Fechado
                </div>
                <p className="text-xs text-muted-foreground">Nenhum caixa aberto</p>
              </div>
            )}
          </CardContent>
        </Card>

        <KpiCard
          title="Produtos"
          value={kpiStats.produtosCatalogo}
          subtext="Itens no catálogo"
          icon={Package}
          iconColor="text-indigo-600"
          bgColor="bg-indigo-100 dark:bg-indigo-900/30"
        />
        <KpiCard
          title="Estoque Total"
          value={kpiStats.estoqueTotal}
          subtext="Total de unidades"
          icon={ShoppingCart}
          iconColor="text-emerald-600"
          bgColor="bg-emerald-100 dark:bg-emerald-900/30"
        />
        <KpiCard
          title="Vendas (Total)"
          value={`R$ ${kpiStats.totalVendas.toFixed(2)}`}
          subtext="Histórico completo"
          icon={DollarSign}
          iconColor="text-green-600"
          bgColor="bg-green-100 dark:bg-green-900/30"
        />
      </div>

      {/* Tabelas e gráficos */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="md:col-span-2 hover:shadow-lg transition-shadow duration-300 overflow-hidden border-none shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
          <CardHeader className="bg-gray-50/50 dark:bg-gray-900/50 border-b pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">Comandas Recentes</CardTitle>
              <Badge variant="outline" className="bg-white">Hoje</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent bg-gray-50/30">
                  <TableHead className="pl-6">Horário</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Colaborador</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right pr-6">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell>
                  </TableRow>
                )}
                {!loading && recentSales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      Nenhuma venda registrada hoje.
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  recentSales.map((sale) => (
                    <TableRow key={sale.id} className="hover:bg-muted/50 transition-colors cursor-default">
                      <TableCell className="pl-6 font-medium text-muted-foreground">
                        {format(new Date(sale.created_at), "HH:mm")}
                      </TableCell>
                      <TableCell className="font-medium">{sale.nome_cliente || "Cliente não ident."}</TableCell>
                      <TableCell>{sale.profiles?.nome || "-"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={sale.status === "finalizada" ? "default" : "secondary"}
                          className={`
                            ${sale.status === 'finalizada' ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}
                            shadow-none font-normal
                          `}
                        >
                          {statusLabels[sale.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right pr-6 font-bold text-gray-900 dark:text-gray-100">
                        R$ {Number(sale.total).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card className="md:col-span-1 hover:shadow-lg transition-shadow duration-300 border-none shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
          <CardHeader className="bg-gray-50/50 dark:bg-gray-900/50 border-b pb-4">
            <CardTitle className="text-lg font-semibold">Pagamentos</CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {/* Lógica do gráfico mantida, apenas ajustando container */}
            {loading ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">Carregando...</div>
            ) : paymentData.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm text-center px-4">
                Nenhum dado financeiro para exibir hoje.
              </div>
            ) : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={paymentData} layout="vertical" margin={{ left: 0, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E5E7EB" />
                    <XAxis type="number" hide />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={100} tick={{ fontSize: 12, fill: "#6B7280" }} />
                    <Tooltip 
                      cursor={{ fill: "transparent" }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: number) => [`R$ ${value.toFixed(2)}`, 'Total']}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={32}>
                      {paymentData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Mini componente interno para manter o código limpo (coloque no final do arquivo ou antes do componente principal)
function KpiCard({ title, value, subtext, icon: Icon, iconColor, bgColor }: any) {
  return (
    <Card className="hover:shadow-md transition-all duration-300 group">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
          {title}
        </CardTitle>
        <div className={`h-8 w-8 rounded-full ${bgColor} flex items-center justify-center transition-transform group-hover:scale-110`}>
          <Icon className={`h-4 w-4 ${iconColor}`} />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
      </CardContent>
    </Card>
  );
}