import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  Calendar as CalendarIcon, DollarSign, Landmark, Wallet, CreditCard, Receipt, ChevronLeft, ChevronRight, Filter, Search
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Database } from "@/integrations/supabase/types";
import { toast } from "sonner";

// TIPOS
type SalesRow = Database["public"]["Tables"]["sales"]["Row"];
type PaymentMethod = Database["public"]["Enums"]["payment_method"];
type SalePayment = { metodo_pagamento: PaymentMethod; valor: number };

type Sale = Omit<SalesRow, 'profiles'> & {
  profiles: { nome: string } | null;
  sale_payments: SalePayment[];
};

const paymentMethodLabels: Record<PaymentMethod, string> = { dinheiro: "Dinheiro", pix: "Pix", cartao_credito: "Crédito", cartao_debito: "Débito" };

const ITEMS_PER_PAGE = 50;

export default function AdminSales() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  
  // Totais Globais do Turno
  const [periodTotals, setPeriodTotals] = useState({ totalGeral: 0, pix: 0, dinheiro: 0, cartao: 0 });

  const [date, setDate] = useState<DateRange | undefined>({
    from: new Date(),
    to: new Date(),
  });

  useEffect(() => { setCurrentPage(0); }, [date]);
  useEffect(() => { loadSales(); }, [date, currentPage]);

  const loadSales = async () => {
    if (!date?.from) { setSales([]); setTotalCount(0); return; }
    setLoading(true);

    const start = new Date(date.from);
    start.setHours(12, 0, 0, 0); 
    
    const end = date.to ? new Date(date.to) : new Date(date.from);
    end.setDate(end.getDate() + 1); 
    end.setHours(11, 59, 59, 999);

    try {
      const { data: allSalesData } = await supabase
        .from('sales')
        .select('total, metodo_pagamento, sale_payments(metodo_pagamento, valor)')
        .eq('status', 'finalizada')
        .gte('updated_at', start.toISOString())
        .lte('updated_at', end.toISOString());

      let tGeral = 0; let tPix = 0; let tDinheiro = 0; let tCartao = 0;
      
      if (allSalesData) {
          allSalesData.forEach(sale => {
              tGeral += Number(sale.total) || 0;
              if (sale.sale_payments && sale.sale_payments.length > 0) {
                  sale.sale_payments.forEach(p => {
                      const v = Number(p.valor);
                      if (p.metodo_pagamento === 'pix') tPix += v;
                      else if (p.metodo_pagamento === 'dinheiro') tDinheiro += v;
                      else tCartao += v;
                  });
              } else if (sale.metodo_pagamento) {
                  const v = Number(sale.total) || 0;
                  if (sale.metodo_pagamento === 'pix') tPix += v;
                  else if (sale.metodo_pagamento === 'dinheiro') tDinheiro += v;
                  else tCartao += v;
              }
          });
      }
      setPeriodTotals({ totalGeral: tGeral, pix: tPix, dinheiro: tDinheiro, cartao: tCartao });
      setTotalCount(allSalesData?.length || 0);

      const fromIndex = currentPage * ITEMS_PER_PAGE;
      const toIndex = fromIndex + ITEMS_PER_PAGE - 1;

      const { data: paginatedData, error } = await supabase
        .from('sales')
        .select('*, profiles(nome), sale_payments(metodo_pagamento, valor)')
        .eq('status', 'finalizada')
        .gte('updated_at', start.toISOString())
        .lte('updated_at', end.toISOString())
        .order('updated_at', { ascending: false })
        .range(fromIndex, toIndex);
      
      if (error) throw error;
      setSales((paginatedData as Sale[]) || []);

    } catch (error: any) {
      toast.error("Erro ao carregar vendas");
    } finally {
      setLoading(false);
    }
  };

  const renderPaymentBadge = (sale: Sale) => {
    if (sale.sale_payments && sale.sale_payments.length > 0) {
      return (
        <div className="flex flex-col gap-1 items-start">
          {sale.sale_payments.map((p, idx) => (
            <Badge key={idx} variant="outline" className="bg-gray-50 dark:bg-gray-800 shadow-sm border-gray-200 text-[10px] md:text-xs whitespace-nowrap">
              {paymentMethodLabels[p.metodo_pagamento]}: R$ {Number(p.valor).toFixed(2)}
            </Badge>
          ))}
        </div>
      );
    } else if (sale.metodo_pagamento) { 
      return <Badge variant="outline" className="text-[10px] md:text-xs whitespace-nowrap">{paymentMethodLabels[sale.metodo_pagamento]}</Badge>;
    }
    return <Badge variant="destructive" className="text-[10px] md:text-xs">N/A</Badge>;
  };

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const setQuickDate = (daysBackStart: number, daysBackEnd: number = 0) => {
      setDate({ from: subDays(new Date(), daysBackStart), to: subDays(new Date(), daysBackEnd) });
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-8 px-1 md:px-0">
      
      {/* HEADER & FILTROS (MOBILE FIRST) */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-end gap-4 bg-white dark:bg-gray-900 p-4 md:p-6 rounded-xl border shadow-sm">
        <div className="w-full">
          <h1 className="text-xl md:text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Search className="h-5 w-5 md:h-7 md:w-7 text-primary flex-shrink-0" /> Relatório de Vendas
          </h1>
          <p className="text-muted-foreground mt-1 text-[11px] md:text-sm leading-tight">
             Filtro por turno: 12:00h do dia inicial até 11:59h do dia seguinte.
          </p>
        </div>
        
        <div className="flex flex-col gap-3 w-full xl:w-auto">
            {/* Botões Rápidos */}
            <div className="flex flex-wrap gap-1.5 md:gap-2 self-start xl:self-end">
                <Button variant="secondary" size="sm" className="h-7 md:h-8 text-[10px] md:text-xs px-2 md:px-3" onClick={() => setQuickDate(0, 0)}>Hoje</Button>
                <Button variant="secondary" size="sm" className="h-7 md:h-8 text-[10px] md:text-xs px-2 md:px-3" onClick={() => setQuickDate(1, 1)}>Ontem</Button>
                <Button variant="secondary" size="sm" className="h-7 md:h-8 text-[10px] md:text-xs px-2 md:px-3" onClick={() => setQuickDate(6, 0)}>7 Dias</Button>
                <Button variant="secondary" size="sm" className="h-7 md:h-8 text-[10px] md:text-xs px-2 md:px-3" onClick={() => setDate({from: startOfMonth(new Date()), to: new Date()})}>Mês Atual</Button>
            </div>
            
            {/* Calendário */}
            <div className="flex items-center w-full">
                <Popover>
                    <PopoverTrigger asChild>
                    <Button id="date" variant={"outline"} className={cn("w-full xl:w-[280px] justify-start text-left font-medium border-primary/20 hover:bg-primary/5 h-10 md:h-10 text-xs md:text-sm", !date && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4 text-primary flex-shrink-0" />
                        {date?.from ? (date.to ? <span className="truncate">{format(date.from, "dd/MM/yy")} até {format(date.to, "dd/MM/yy")}</span> : format(date.from, "dd/MM/yy")) : <span>Escolha a data</span>}
                    </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                    <Calendar initialFocus mode="range" defaultMonth={date?.from} selected={date} onSelect={setDate} numberOfMonths={window.innerWidth < 768 ? 1 : 2} locale={ptBR} />
                    </PopoverContent>
                </Popover>
            </div>
        </div>
      </div>

      {/* KPI CARDS (Adaptáveis para Celular) */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <StatsCard title="Faturamento" value={periodTotals.totalGeral} icon={DollarSign} color="text-emerald-600" bg="bg-emerald-100" footer={`${totalCount} vendas`} />
        <StatsCard title="Total Pix" value={periodTotals.pix} icon={Landmark} color="text-blue-600" bg="bg-blue-100" />
        <StatsCard title="Total Dinheiro" value={periodTotals.dinheiro} icon={Wallet} color="text-green-600" bg="bg-green-100" />
        <StatsCard title="Total Cartões" value={periodTotals.cartao} icon={CreditCard} color="text-purple-600" bg="bg-purple-100" />
      </div>

      {/* CONTEÚDO PRINCIPAL */}
      <Card className="border-none shadow-md ring-1 ring-gray-200 dark:ring-gray-800 overflow-hidden">
        <CardHeader className="border-b bg-gray-50/50 dark:bg-gray-900/50 p-4 md:pb-4">
           <CardTitle className="text-base md:text-lg flex items-center gap-2"><Filter className="h-4 w-4 md:h-5 md:w-5 text-muted-foreground"/> Detalhamento das Vendas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
             <div className="text-center py-10 md:py-16 text-sm text-muted-foreground animate-pulse">Buscando vendas do turno...</div>
          ) : sales.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-10 md:py-16 text-center text-muted-foreground px-4"><Receipt className="h-10 w-10 md:h-16 md:w-16 text-muted-foreground/30 mb-3 md:mb-4" /><p className="text-base md:text-lg font-medium">Nenhuma venda encontrada.</p><p className="text-xs md:text-sm mt-1">Tente selecionar uma data diferente no filtro acima.</p></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-gray-50/80 dark:bg-gray-900/80">
                  <TableRow>
                    <TableHead className="font-semibold text-gray-700 pl-4 md:pl-6 w-[120px] md:w-[180px] text-xs md:text-sm">Data/Hora</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-xs md:text-sm">Cliente</TableHead>
                    {/* Oculta colaborador em telas muito pequenas */}
                    <TableHead className="font-semibold text-gray-700 text-xs md:text-sm hidden sm:table-cell">Colab.</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-xs md:text-sm">Pagamento</TableHead>
                    <TableHead className="text-right font-semibold text-gray-700 pr-4 md:pr-6 text-xs md:text-sm">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((sale) => (
                    <TableRow key={sale.id} className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors align-top">
                      <TableCell className="text-muted-foreground pl-4 md:pl-6 pt-3 md:pt-4 text-[11px] md:text-sm whitespace-nowrap">
                        {format(new Date(sale.updated_at), "dd/MM/yy HH:mm")}
                      </TableCell>
                      <TableCell className="font-medium text-gray-900 dark:text-gray-100 pt-3 md:pt-4 text-xs md:text-sm truncate max-w-[100px] md:max-w-none">
                        {sale.nome_cliente || "Balcão"}
                      </TableCell>
                      <TableCell className="pt-3 md:pt-4 text-xs md:text-sm hidden sm:table-cell truncate max-w-[80px] md:max-w-none">
                        {sale.profiles?.nome || "Sistema"}
                      </TableCell>
                      <TableCell className="pt-2 pb-2 md:pt-3 md:pb-3">{renderPaymentBadge(sale)}</TableCell>
                      <TableCell className="text-right font-extrabold text-gray-900 dark:text-gray-100 pr-4 md:pr-6 pt-3 md:pt-4 text-xs md:text-sm whitespace-nowrap">
                        R$ {Number(sale.total).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
        {totalPages > 0 && (
            <CardFooter className="border-t p-3 md:p-4 flex flex-col sm:flex-row items-center justify-between bg-gray-50/50 gap-3">
                <p className="text-[11px] md:text-sm font-medium text-muted-foreground">
                    Itens <strong className="text-foreground">{(currentPage * ITEMS_PER_PAGE) + 1}</strong> até <strong className="text-foreground">{Math.min((currentPage + 1) * ITEMS_PER_PAGE, totalCount)}</strong> de <strong className="text-foreground">{totalCount}</strong>
                </p>
                <div className="flex gap-2">
                    <Button variant="outline" className="shadow-sm h-8 px-3 text-xs md:text-sm" onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}>
                        <ChevronLeft className="h-4 w-4 mr-1 md:mr-1 -ml-1" /> Ant.
                    </Button>
                    <Button variant="outline" className="shadow-sm h-8 px-3 text-xs md:text-sm" onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1}>
                        Próx. <ChevronRight className="h-4 w-4 ml-1 md:ml-1 -mr-1" />
                    </Button>
                </div>
            </CardFooter>
        )}
      </Card>
    </div>
  );
}

function StatsCard({ title, value, icon: Icon, color, bg, footer }: any) {
    return (
        <Card className="hover:shadow-lg transition-all duration-300 border-l-4 border-l-transparent hover:border-l-primary group bg-white dark:bg-gray-900 p-0">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 md:p-5 pb-1 md:pb-2">
            <CardTitle className="text-[10px] md:text-sm font-semibold text-muted-foreground group-hover:text-primary transition-colors truncate pr-1">{title}</CardTitle>
            <div className={`h-6 w-6 md:h-10 md:w-10 rounded-full ${bg} flex items-center justify-center transition-transform group-hover:scale-110 flex-shrink-0`}><Icon className={`h-3 w-3 md:h-5 md:w-5 ${color}`} /></div>
          </CardHeader>
          <CardContent className="p-3 md:p-5 pt-0 md:pt-0">
            <div className="text-lg md:text-3xl font-extrabold tracking-tight truncate">R$ {value.toFixed(2)}</div>
            {footer && <p className="text-[9px] md:text-xs font-medium text-muted-foreground mt-1 md:mt-2 bg-gray-100 dark:bg-gray-800 inline-block px-1.5 py-0.5 md:px-2 md:py-1 rounded-md">{footer}</p>}
          </CardContent>
        </Card>
    )
}