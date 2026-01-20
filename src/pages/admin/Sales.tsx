import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Calendar as CalendarIcon, 
  DollarSign,
  Landmark,
  Wallet,
  CreditCard,
  Receipt
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

// TIPOS
type SalesRow = Database["public"]["Tables"]["sales"]["Row"];
type Sale = Omit<SalesRow, 'profiles'> & {
  profiles: { nome: string } | null;
};
type PaymentMethod = Database["public"]["Enums"]["payment_method"];

const paymentMethodLabels: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  cartao_credito: "Crédito",
  cartao_debito: "Débito",
};

export default function AdminSales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  const [date, setDate] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });

  useEffect(() => {
    loadSales();
  }, [date]);

  const loadSales = async () => {
    if (!date?.from || !date?.to) {
      setSales([]);
      return;
    }

    setLoading(true);
    const dateTo = new Date(date.to);
    dateTo.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
      .from('sales')
      .select('*, profiles(nome)')
      .eq('status', 'finalizada')
      .gte('updated_at', date.from.toISOString())
      .lte('updated_at', dateTo.toISOString())
      .order('updated_at', { ascending: false });
    
    if (data) setSales(data as Sale[]); 
    if (error) toast.error("Erro ao carregar vendas", { description: error.message });
    setLoading(false);
  };

  const salesTotals = useMemo(() => {
    const totals = {
      totalGeral: 0,
      porMetodo: {
        dinheiro: 0,
        pix: 0,
        cartao_credito: 0,
        cartao_debito: 0,
        naoInformado: 0,
      } as Record<PaymentMethod | "naoInformado", number>,
    };

    for (const sale of sales) {
      const totalVenda = Number(sale.total) || 0; 
      totals.totalGeral += totalVenda;
      if (sale.metodo_pagamento && paymentMethodLabels[sale.metodo_pagamento]) {
        totals.porMetodo[sale.metodo_pagamento] += totalVenda;
      } else {
        totals.porMetodo.naoInformado += totalVenda;
      }
    }
    return totals;
  }, [sales]);

  const renderContent = () => {
    if (loading) return <div className="text-center py-10 text-muted-foreground animate-pulse">Calculando vendas...</div>;
    if (sales.length === 0) return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <Receipt className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p>Nenhuma venda finalizada neste período.</p>
      </div>
    );

    return (
      <>
        {/* MOBILE CARDS */}
        <div className="md:hidden space-y-3">
          {sales.map((sale) => (
            <div key={sale.id} className="bg-white dark:bg-gray-900 border rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-start mb-2">
                 <div className="flex flex-col">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">{sale.nome_cliente || "Consumidor Final"}</span>
                    <span className="text-xs text-muted-foreground">{format(new Date(sale.updated_at), "dd/MM - HH:mm", { locale: ptBR })}</span>
                 </div>
                 <Badge variant="outline" className="bg-gray-50 dark:bg-gray-800">
                    {sale.metodo_pagamento ? paymentMethodLabels[sale.metodo_pagamento] : "N/A"}
                  </Badge>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-dashed mt-2">
                 <span className="text-xs text-muted-foreground">Vendedor: {sale.profiles?.nome || "Sistema"}</span>
                 <span className="font-bold text-lg text-primary">R$ {Number(sale.total).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>

        {/* DESKTOP TABLE */}
        <div className="hidden md:block rounded-md border overflow-hidden">
          <Table>
            <TableHeader className="bg-gray-50/50 dark:bg-gray-900/50">
              <TableRow>
                <TableHead className="font-semibold text-gray-700">Data / Hora</TableHead>
                <TableHead className="font-semibold text-gray-700">Cliente</TableHead>
                <TableHead className="font-semibold text-gray-700">Colaborador</TableHead>
                <TableHead className="font-semibold text-gray-700">Pagamento</TableHead>
                <TableHead className="text-right font-semibold text-gray-700">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.map((sale) => (
                <TableRow key={sale.id} className="hover:bg-muted/30">
                  <TableCell className="text-muted-foreground">
                    {format(new Date(sale.updated_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </TableCell>
                  <TableCell className="font-medium">{sale.nome_cliente || "Consumidor Final"}</TableCell>
                  <TableCell>{sale.profiles?.nome || "Sistema"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {sale.metodo_pagamento ? paymentMethodLabels[sale.metodo_pagamento] : "N/A"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-bold text-gray-900 dark:text-gray-100">
                    R$ {Number(sale.total).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* HEADER & FILTRO */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Relatório de Vendas</h1>
          <p className="text-muted-foreground">Acompanhe o desempenho financeiro do período.</p>
        </div>
        <div className="flex items-center bg-white dark:bg-gray-900 rounded-lg border shadow-sm p-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="date"
                variant={"ghost"}
                className={cn(
                  "w-[260px] justify-start text-left font-medium",
                  !date && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-primary" />
                {date?.from ? (
                  date.to ? (
                    <>
                      {format(date.from, "dd/MM/yy", { locale: ptBR })} -{" "}
                      {format(date.to, "dd/MM/yy", { locale: ptBR })}
                    </>
                  ) : (
                    format(date.from, "dd/MM/yy", { locale: ptBR })
                  )
                ) : (
                  <span>Selecione um período</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={date?.from}
                selected={date}
                onSelect={setDate}
                numberOfMonths={2}
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* KPI CARDS (ESTILO DASHBOARD) */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatsCard 
            title="Total Geral" 
            value={salesTotals.totalGeral} 
            icon={DollarSign} 
            color="text-emerald-600" 
            bg="bg-emerald-100 dark:bg-emerald-900/20"
            footer={`${sales.length} vendas`}
        />
        <StatsCard 
            title="Pix" 
            value={salesTotals.porMetodo.pix} 
            icon={Landmark} 
            color="text-blue-600" 
            bg="bg-blue-100 dark:bg-blue-900/20"
        />
        <StatsCard 
            title="Dinheiro" 
            value={salesTotals.porMetodo.dinheiro} 
            icon={Wallet} 
            color="text-green-600" 
            bg="bg-green-100 dark:bg-green-900/20"
        />
        <StatsCard 
            title="Cartões (C/D)" 
            value={salesTotals.porMetodo.cartao_credito + salesTotals.porMetodo.cartao_debito} 
            icon={CreditCard} 
            color="text-purple-600" 
            bg="bg-purple-100 dark:bg-purple-900/20"
        />
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <Card className="border-none shadow-sm ring-1 ring-gray-200 dark:ring-gray-800">
        <CardHeader className="border-b bg-gray-50/30 dark:bg-gray-900/30 pb-4">
           <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Detalhamento</CardTitle>
              <Button variant="outline" size="sm" className="h-8">Exportar</Button>
           </div>
        </CardHeader>
        <CardContent className="p-0">
          {renderContent()}
        </CardContent>
      </Card>
    </div>
  );
}

// Sub-componente para os Cards de Estatística
function StatsCard({ title, value, icon: Icon, color, bg, footer }: any) {
    return (
        <Card className="hover:shadow-md transition-all duration-300 border-l-4 border-l-transparent hover:border-l-primary/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
                {title}
            </CardTitle>
            <div className={`h-8 w-8 rounded-full ${bg} flex items-center justify-center`}>
                <Icon className={`h-4 w-4 ${color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              R$ {value.toFixed(2)}
            </div>
            {footer && <p className="text-xs text-muted-foreground mt-1">{footer}</p>}
          </CardContent>
        </Card>
    )
}