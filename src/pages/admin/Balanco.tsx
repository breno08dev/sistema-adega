import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ClipboardList, Play, CheckCircle, Search, Loader2, Printer, ArrowRightLeft } from "lucide-react"; 
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Balanco() {
  const [balancoAberto, setBalancoAberto] = useState<any | null>(null);
  const [itens, setItens] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => { loadBalancoAtivo(); }, []);

  const loadBalancoAtivo = async () => {
    setLoading(true);
    
    // 1. Verifica se há uma "Semana de Balanço" em aberto
    const { data: bData } = await supabase.from('balancos').select('*').eq('status', 'aberto').maybeSingle();
    
    if (bData) {
        setBalancoAberto(bData);
        
        // 2. Pega a "foto" do estoque inicial de quando o balanço começou
        const { data: bItens } = await supabase.from('balanco_itens').select('*, products(nome, quantidade)').eq('balanco_id', bData.id);

        // 3. Pega todas as vendas que aconteceram DESDE o início deste balanço
        const { data: salesData } = await supabase.from('sales')
            .select('id, sale_items(produto_id, quantidade)')
            .eq('status', 'finalizada')
            .gte('created_at', bData.data_inicio);

        // Agrupa as quantidades vendidas por produto
        const vendasMap: Record<string, number> = {};
        salesData?.forEach(venda => {
            venda.sale_items?.forEach((item: any) => {
                vendasMap[item.produto_id] = (vendasMap[item.produto_id] || 0) + item.quantidade;
            });
        });

        // 4. Constrói a matemática do período para cada produto
        const processed = bItens?.map((item: any) => {
            const inicial = item.estoque_inicial || 0;
            const teorico = item.products?.quantidade || 0; // O que o sistema diz que tem HOJE
            const vendas = vendasMap[item.produto_id] || 0;
            
            // MÁGICA: Se o Teórico = Inicial + Entradas - Vendas
            // Então, Entradas = Teórico - Inicial + Vendas
            // Isso detecta automaticamente se o Admin adicionou estoque manualmente na aba de Produtos durante a semana!
            const entradasAjustes = teorico - inicial + vendas;

            return {
                produto_id: item.produto_id,
                nome: item.products?.nome || "Produto Excluído",
                estoque_inicial: inicial,
                entradas: entradasAjustes,
                saidas: vendas,
                estoque_teorico: teorico,
                estoque_contado: item.estoque_contado,
                diferenca: item.estoque_contado !== null ? item.estoque_contado - teorico : null
            };
        }).sort((a, b) => a.nome.localeCompare(b.nome)) || [];

        setItens(processed);
    } else {
        setBalancoAberto(null);
        setItens([]);
    }
    setLoading(false);
  };

  const iniciarBalanco = async () => {
      setIsSubmitting(true);
      try {
          // Cria o cabeçalho do balanço
          const { data: bData, error: bErr } = await supabase.from('balancos').insert([{ status: 'aberto' }]).select().single();
          if (bErr) throw bErr;

          // Tira a "foto" do estoque de todos os produtos atuais
          const { data: prods } = await supabase.from('products').select('id, quantidade');
          if (prods && prods.length > 0) {
              const itensInsert = prods.map(p => ({
                  balanco_id: bData.id,
                  produto_id: p.id,
                  estoque_inicial: p.quantidade
              }));
              await supabase.from('balanco_itens').insert(itensInsert);
          }
          
          toast.success("Novo período de Balanço iniciado!");
          loadBalancoAtivo();
      } catch (e: any) {
          toast.error("Erro ao iniciar", { description: e.message });
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleUpdateContagem = async (produtoId: string, valorStr: string) => {
      if (!balancoAberto) return;
      const val = parseInt(valorStr);
      
      if (valorStr === "") {
          setItens(itens.map(i => i.produto_id === produtoId ? { ...i, estoque_contado: null, diferenca: null } : i));
          await supabase.from('balanco_itens').update({ estoque_contado: null }).eq('balanco_id', balancoAberto.id).eq('produto_id', produtoId);
          return;
      }

      if (isNaN(val) || val < 0) return;

      setItens(itens.map(i => i.produto_id === produtoId ? { ...i, estoque_contado: val, diferenca: val - i.estoque_teorico } : i));
      await supabase.from('balanco_itens').update({ estoque_contado: val }).eq('balanco_id', balancoAberto.id).eq('produto_id', produtoId);
  };

  const finalizarBalanco = async () => {
      if (!balancoAberto) return;

      setIsSubmitting(true);
      try {
          // Atualiza o estoque final de todos os produtos com a contagem física do Admin
          // Se não foi contado (null), ignora e mantém o estoque do jeito que está
          for (const item of itens) {
              if (item.estoque_contado !== null) {
                  await supabase.from('products').update({ quantidade: item.estoque_contado }).eq('id', item.produto_id);
              }
          }
          
          // Fecha o ciclo da semana
          await supabase.from('balancos').update({ status: 'finalizado', data_fim: new Date().toISOString() }).eq('id', balancoAberto.id);
          
          toast.success("Balanço finalizado e novo estoque aplicado!");
          setBalancoAberto(null);
          setItens([]);
      } catch (e: any) {
          toast.error("Erro ao finalizar", { description: e.message });
      } finally {
          setIsSubmitting(false);
      }
  };

  // --- RELATÓRIO PDF DETALHADO DO PERÍODO ---
  const gerarRelatorioPDF = () => {
      if (!balancoAberto) return;
      
      const doc = new jsPDF();
      const dataInicio = format(new Date(balancoAberto.data_inicio), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("Relatório Detalhado de Balanço Semanal", 14, 20);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.text(`Período iniciado em: ${dataInicio}`, 14, 28);
      
      const totalItens = itens.length;
      const itensConferidos = itens.filter(i => i.estoque_contado !== null).length;
      doc.text(`Status: Em Contagem (${itensConferidos}/${totalItens} conferidos)`, 14, 34);

      doc.line(14, 40, 196, 40);

      const tableData = itens.map(item => [
          item.nome,
          item.estoque_inicial.toString(),
          item.entradas > 0 ? `+${item.entradas}` : "0",
          item.saidas > 0 ? `-${item.saidas}` : "0",
          item.estoque_teorico.toString(),
          item.estoque_contado !== null ? item.estoque_contado.toString() : "[      ]", // Espaço para caneta
          item.estoque_contado !== null ? (item.estoque_contado - item.estoque_teorico).toString() : "-"
      ]);

      autoTable(doc, {
          startY: 45,
          theme: 'grid',
          headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 9 },
          bodyStyles: { fontSize: 8 },
          head: [['Produto', 'Inicial', 'Entradas', 'Saídas', 'Teórico (Sistema)', 'Físico (Real)', 'Dif.']],
          body: tableData,
          columnStyles: {
              1: { halign: 'center' },
              2: { halign: 'center', textColor: [16, 185, 129] }, // Verde
              3: { halign: 'center', textColor: [239, 68, 68] }, // Vermelho
              4: { halign: 'center', fontStyle: 'bold', textColor: [59, 130, 246] }, // Azul
              5: { halign: 'center', fontStyle: 'bold' },
              6: { halign: 'center', fontStyle: 'bold' }
          },
          didParseCell: function(data) {
              if (data.section === 'body' && data.column.index === 6) {
                  const val = parseInt(data.cell.text[0]);
                  if (!isNaN(val)) {
                      if (val > 0) data.cell.styles.textColor = [16, 185, 129];
                      else if (val < 0) data.cell.styles.textColor = [239, 68, 68];
                  }
              }
          }
      });

      doc.save(`Balanco_Detalhado_${format(new Date(), "dd-MM-yyyy")}.pdf`);
      toast.success("Relatório gerado com sucesso!");
  };

  const filtered = itens.filter(i => i.nome.toLowerCase().includes(searchTerm.toLowerCase()));

  if (loading) return <div className="p-8 text-center"><Loader2 className="animate-spin h-8 w-8 mx-auto text-primary" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <ArrowRightLeft className="h-8 w-8 text-primary"/> Fechamento Semanal (Balanço)
          </h1>
          <p className="text-muted-foreground">Acompanhe entradas, saídas e confira o estoque físico da semana.</p>
        </div>
        
        {!balancoAberto && (
            <Button onClick={iniciarBalanco} disabled={isSubmitting} size="lg" className="bg-primary hover:bg-primary/90 shadow-md">
                {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Play className="mr-2 h-5 w-5" /> Iniciar Semana de Balanço</>}
            </Button>
        )}

        {balancoAberto && (
            <div className="flex gap-2">
                <Button onClick={gerarRelatorioPDF} variant="outline" className="bg-background text-foreground border-border hover:bg-muted shadow-sm">
                    <Printer className="mr-2 h-4 w-4" /> Imprimir Relatório
                </Button>
                <Button onClick={finalizarBalanco} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md">
                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <><CheckCircle className="mr-2 h-5 w-5" /> Encerrar Balanço</>}
                </Button>
            </div>
        )}
      </div>

      {!balancoAberto ? (
          <Card className="border-dashed bg-muted/20">
              <CardContent className="flex flex-col items-center justify-center py-20 text-center opacity-70">
                  <ClipboardList className="h-16 w-16 mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-bold text-foreground">Nenhuma Semana em Aberto</h3>
                  <p className="text-muted-foreground max-w-md mt-2">Clique no botão acima para iniciar. O sistema fará um "retrato" do estoque e começará a contabilizar as vendas e entradas do período automaticamente.</p>
              </CardContent>
          </Card>
      ) : (
          <Card className="border-border shadow-sm">
            <CardHeader className="bg-muted/30 border-b border-border pb-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center w-full gap-4">
                    <div>
                        <CardTitle className="text-lg">Conferência do Período</CardTitle>
                        <p className="text-xs text-muted-foreground mt-1">Iniciado em: {format(new Date(balancoAberto.data_inicio), "dd/MM/yy 'às' HH:mm")}</p>
                    </div>
                    <div className="relative w-full sm:w-[300px]">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Buscar produto..." className="pl-8 w-full bg-background border-border text-foreground" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="max-h-[65vh] overflow-y-auto scrollbar-thin">
                    <Table>
                        <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm border-b border-border">
                            <TableRow className="hover:bg-transparent border-border">
                                <TableHead className="font-bold text-muted-foreground">Produto</TableHead>
                                <TableHead className="text-center font-bold text-muted-foreground" title="Estoque quando a semana começou">Inicial</TableHead>
                                <TableHead className="text-center font-bold text-emerald-500" title="Mercadoria que entrou">Entradas</TableHead>
                                <TableHead className="text-center font-bold text-destructive" title="Mercadoria vendida">Saídas</TableHead>
                                <TableHead className="text-center font-bold text-blue-500" title="O que deve ter na prateleira agora">Teórico</TableHead>
                                <TableHead className="text-center font-bold text-foreground">Contagem Física</TableHead>
                                <TableHead className="text-right font-bold text-muted-foreground pr-6">Quebra/Sobra</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filtered.map(item => (
                                <TableRow key={item.produto_id} className="hover:bg-muted/30 border-border">
                                    <TableCell className="font-medium text-foreground">{item.nome}</TableCell>
                                    <TableCell className="text-center text-muted-foreground">{item.estoque_inicial}</TableCell>
                                    <TableCell className="text-center font-medium text-emerald-500">{item.entradas > 0 ? `+${item.entradas}` : '-'}</TableCell>
                                    <TableCell className="text-center font-medium text-destructive">{item.saidas > 0 ? `-${item.saidas}` : '-'}</TableCell>
                                    <TableCell className="text-center font-bold text-blue-500 text-lg bg-blue-500/5">{item.estoque_teorico}</TableCell>
                                    <TableCell className="text-center">
                                        <Input 
                                            type="number" 
                                            className={`w-24 mx-auto text-center font-bold ${item.estoque_contado === null ? 'border-orange-500 bg-orange-500/10' : 'bg-background border-border'}`} 
                                            value={item.estoque_contado === null ? "" : item.estoque_contado}
                                            onChange={(e) => handleUpdateContagem(item.produto_id, e.target.value)}
                                            placeholder="Qtd real"
                                        />
                                    </TableCell>
                                    <TableCell className="text-right font-bold pr-6">
                                        {item.estoque_contado !== null ? (
                                            <span className={item.diferenca === 0 ? "text-emerald-500" : item.diferenca > 0 ? "text-blue-500" : "text-destructive"}>
                                                {item.diferenca > 0 ? '+' : ''}{item.diferenca}
                                            </span>
                                        ) : (
                                            <span className="text-orange-500 text-xs uppercase">Pendente</span>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>
          </Card>
      )}
    </div>
  );
}