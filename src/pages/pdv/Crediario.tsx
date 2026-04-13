import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, BookOpen, Loader2, Eye, Trash2 } from "lucide-react"; 
import { useAuth } from "@/contexts/AuthContext";

export default function Crediario() {
  const { user } = useAuth();
  const [crediarios, setCrediarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [caixaId, setCaixaId] = useState<string | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedCrediario, setSelectedCrediario] = useState<any | null>(null);
  const [valorPagamento, setValorPagamento] = useState("");
  const [metodoPagamento, setMetodoPagamento] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ESTADOS PARA O MODAL DE DETALHES (Olhinho)
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [detalhes, setDetalhes] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // ESTADOS PARA A EXCLUSÃO COM SENHA
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");

  useEffect(() => { 
      loadCrediarios(); 
      checkCaixaStatus();
  }, [user]);

  const checkCaixaStatus = async () => {
    if (!user) return;
    try {
      const { data } = await supabase.from("caixas").select("id").eq("colaborador_id", user.id).eq("status", "aberto").order("data_abertura", { ascending: false }).limit(1);
      if (data && data.length > 0) setCaixaId(data[0].id);
    } catch (e) {}
  };

  const loadCrediarios = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('crediarios')
      .select('*, clients(nome, telefone)')
      .eq('status', 'aberto')
      .order('created_at', { ascending: false });
      
    if (error) toast.error("Erro ao carregar fiados");
    else setCrediarios(data || []);
    setLoading(false);
  };

  const openPayment = (cred: any) => {
      setSelectedCrediario(cred);
      setValorPagamento((cred.valor_total - cred.valor_pago).toFixed(2));
      setMetodoPagamento("");
      setIsPaymentModalOpen(true);
  };

  // BUSCA OS ITENS COMPRADOS FIADO (Olhinho)
  const openDetails = async (cred: any) => {
      setSelectedCrediario(cred);
      setLoadingDetails(true);
      setIsDetailsModalOpen(true);

      const { data, error } = await supabase
          .from('sales')
          .select(`
              created_at,
              updated_at,
              sale_payments ( created_at ),
              sale_items (
                  id,
                  quantidade,
                  preco_unitario,
                  subtotal,
                  products ( nome )
              )
          `)
          .eq('cliente_id', cred.cliente_id)
          .eq('metodo_pagamento', 'fiado')
          .order('created_at', { ascending: false });

      if (error) {
          toast.error("Erro ao buscar detalhes");
          setLoadingDetails(false);
          return;
      }

      const crediarioDataCriacao = new Date(cred.created_at).getTime();
      const tolerancia = 2 * 60 * 1000;

      const flatItems: any[] = [];
      data?.forEach((sale: any) => {
          let checkoutTime = new Date(sale.created_at).getTime();
          
          if (sale.sale_payments && sale.sale_payments.length > 0) {
              checkoutTime = new Date(sale.sale_payments[0].created_at).getTime();
          } else if (sale.updated_at) {
              checkoutTime = new Date(sale.updated_at).getTime();
          }

          if (checkoutTime >= (crediarioDataCriacao - tolerancia)) {
              sale.sale_items?.forEach((item: any) => {
                  flatItems.push({
                      id: item.id,
                      produto: item.products?.nome || 'Produto Desconhecido',
                      quantidade: item.quantidade,
                      preco_unitario: item.preco_unitario,
                      subtotal: item.subtotal,
                      data: new Date(checkoutTime).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
                  });
              });
          }
      });

      setDetalhes(flatItems);
      setLoadingDetails(false);
  };

  // FUNÇÕES DE EXCLUSÃO (Lixeira)
  const openDelete = (cred: any) => {
      setSelectedCrediario(cred);
      setDeletePassword(""); 
      setIsDeleteModalOpen(true);
  };

  const handleDelete = async () => {
      if (deletePassword !== "admin1020") {
          return toast.error("Senha de administrador incorreta!");
      }
      
      if (!selectedCrediario) return;

      setIsSubmitting(true);
      try {
          // 1. Encontrar as vendas desta dívida para devolver o estoque
          const { data: salesData } = await supabase
              .from('sales')
              .select('id, created_at, updated_at, sale_payments ( created_at ), sale_items(produto_id, quantidade)')
              .eq('cliente_id', selectedCrediario.cliente_id)
              .eq('metodo_pagamento', 'fiado');

          const crediarioDataCriacao = new Date(selectedCrediario.created_at).getTime();
          const tolerancia = 2 * 60 * 1000;

          // Filtra apenas as vendas correspondentes à dívida atual
          const salesToDelete = salesData?.filter(sale => {
              let checkoutTime = new Date(sale.created_at).getTime();
              if (sale.sale_payments && sale.sale_payments.length > 0) {
                  checkoutTime = new Date(sale.sale_payments[0].created_at).getTime();
              } else if (sale.updated_at) {
                  checkoutTime = new Date(sale.updated_at).getTime();
              }
              return checkoutTime >= (crediarioDataCriacao - tolerancia);
          }) || [];

          // 2. Devolver produtos ao estoque e excluir as vendas do histórico
          for (const sale of salesToDelete) {
              // Devolve o estoque
              for (const item of sale.sale_items || []) {
                  const { data: pData } = await supabase.from('products').select('quantidade').eq('id', item.produto_id).single();
                  if (pData) {
                      await supabase.from('products').update({ 
                          quantidade: pData.quantidade + item.quantidade 
                      }).eq('id', item.produto_id);
                  }
              }
              // Deleta a venda (O que apaga do histórico e as tabelas filhas em cascata)
              await supabase.from('sales').delete().eq('id', sale.id);
          }

          // 3. Excluir o crediário
          const { error: credError } = await supabase.from('crediarios').delete().eq('id', selectedCrediario.id);
          if (credError) throw credError;

          toast.success("Dívida excluída! Produtos devolvidos ao estoque e histórico atualizado.");
          setIsDeleteModalOpen(false);
          loadCrediarios();
      } catch (e: any) {
          toast.error("Erro ao excluir dívida", { description: e.message });
      } finally {
          setIsSubmitting(false);
      }
  };

  // FUNÇÃO DE PAGAMENTO
  const handlePay = async () => {
      if (!selectedCrediario) return;
      if (!caixaId) return toast.error("Precisa ter o caixa aberto para receber pagamentos.");
      if (!metodoPagamento) return toast.error("Selecione o método de pagamento.");
      
      const val = parseFloat(valorPagamento);
      if (isNaN(val) || val <= 0) return toast.error("Valor inválido.");

      setIsSubmitting(true);
      try {
          await supabase.from('crediario_pagamentos').insert([{
              crediario_id: selectedCrediario.id,
              valor: val,
              metodo_pagamento: metodoPagamento,
              caixa_id: caixaId
          }]);

          const novoValorPago = selectedCrediario.valor_pago + val;
          const status = novoValorPago >= selectedCrediario.valor_total ? 'finalizado' : 'aberto';

          await supabase.from('crediarios').update({
              valor_pago: novoValorPago,
              status: status
          }).eq('id', selectedCrediario.id);

          toast.success("Pagamento registado com sucesso!");
          setIsPaymentModalOpen(false);
          loadCrediarios();
      } catch (e: any) {
          toast.error("Erro ao processar", { description: e.message });
      } finally {
          setIsSubmitting(false);
      }
  };

  const filtered = crediarios.filter(c => c.clients?.nome.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Crediário (Fiado)</h1>
          <p className="text-muted-foreground">Controlo de contas pendentes dos clientes.</p>
        </div>
        <div className="relative w-full sm:w-[300px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Procurar por nome do cliente..." className="pl-8 w-full bg-background border-border text-foreground" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </div>
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          {loading ? ( <div className="text-center py-10 text-muted-foreground">A carregar...</div> ) : filtered.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
               <BookOpen className="h-10 w-10 text-muted-foreground opacity-50" />
               <p className="text-muted-foreground">Não há contas pendentes.</p>
             </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50 border-border">
                <TableRow className="border-border">
                  <TableHead>Cliente</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead className="text-right">Dívida Total</TableHead>
                  <TableHead className="text-right">Valor Pago</TableHead>
                  <TableHead className="text-right">A Receber</TableHead>
                  <TableHead className="text-right pr-6">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((cred) => {
                    const pendente = cred.valor_total - cred.valor_pago;
                    return (
                      <TableRow key={cred.id} className="hover:bg-muted/30 border-border">
                        <TableCell className="font-bold text-foreground">{cred.clients?.nome}</TableCell>
                        <TableCell className="text-muted-foreground">{cred.clients?.telefone || "-"}</TableCell>
                        <TableCell className="text-right text-muted-foreground">R$ {cred.valor_total.toFixed(2)}</TableCell>
                        <TableCell className="text-right text-emerald-500 font-medium">R$ {cred.valor_pago.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-bold text-orange-500">R$ {pendente.toFixed(2)}</TableCell>
                        <TableCell className="text-right pr-4">
                            <div className="flex items-center justify-end gap-2">
                                {/* BOTÃO: OLHINHO */}
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-9 w-9 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10" 
                                    onClick={() => openDetails(cred)}
                                    title="Ver itens consumidos"
                                >
                                    <Eye className="h-5 w-5" />
                                </Button>
                                
                                {/* BOTÃO: EXCLUIR (LIXEIRA) */}
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-9 w-9 text-destructive hover:bg-destructive/10" 
                                    onClick={() => openDelete(cred)}
                                    title="Excluir Crediário e Retornar Estoque"
                                >
                                    <Trash2 className="h-5 w-5" />
                                </Button>

                                {/* BOTÃO: RECEBER */}
                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm" onClick={() => openPayment(cred)}>
                                    Receber
                                </Button>
                            </div>
                        </TableCell>
                      </TableRow>
                    );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* MODAL DETALHES DO CONSUMO (Olhinho) */}
      <Dialog open={isDetailsModalOpen} onOpenChange={setIsDetailsModalOpen}>
          <DialogContent className="sm:max-w-[700px] bg-card border-border">
              <DialogHeader>
                  <DialogTitle className="text-foreground text-xl">
                      Histórico de Consumo - {selectedCrediario?.clients?.nome}
                  </DialogTitle>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-y-auto mt-2 border border-border rounded-md bg-muted/10">
                  {loadingDetails ? (
                      <div className="flex justify-center p-10"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>
                  ) : detalhes.length === 0 ? (
                      <div className="text-center p-10 text-muted-foreground">Nenhum item discriminado encontrado para este cliente nesta dívida.</div>
                  ) : (
                      <Table>
                          <TableHeader className="bg-muted/50 sticky top-0 border-b border-border shadow-sm">
                              <TableRow className="border-none">
                                  <TableHead className="font-bold">Data / Hora</TableHead>
                                  <TableHead className="font-bold">Produto</TableHead>
                                  <TableHead className="text-center font-bold">Qtd</TableHead>
                                  <TableHead className="text-right font-bold">Valor Un.</TableHead>
                                  <TableHead className="text-right font-bold pr-4">Total</TableHead>
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                              {detalhes.map((item, idx) => (
                                  <TableRow key={idx} className="hover:bg-muted/30 border-border">
                                      <TableCell className="text-xs text-muted-foreground">{item.data}</TableCell>
                                      <TableCell className="font-medium text-foreground">{item.produto}</TableCell>
                                      <TableCell className="text-center text-foreground font-medium">{item.quantidade}</TableCell>
                                      <TableCell className="text-right text-muted-foreground">R$ {Number(item.preco_unitario).toFixed(2)}</TableCell>
                                      <TableCell className="text-right font-bold text-foreground pr-4">R$ {Number(item.subtotal).toFixed(2)}</TableCell>
                                  </TableRow>
                              ))}
                          </TableBody>
                      </Table>
                  )}
              </div>
          </DialogContent>
      </Dialog>

      {/* MODAL EXCLUSÃO COM SENHA */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent className="sm:max-w-[400px] bg-card border-border">
            <DialogHeader>
                <DialogTitle className="text-destructive text-xl flex items-center gap-2">
                    <Trash2 className="h-5 w-5"/> Cancelar Venda a Fiado
                </DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                    Tem a certeza que deseja excluir a dívida de <strong>{selectedCrediario?.clients?.nome}</strong>? 
                    <br/><br/>
                    Isso fará com que <strong>todos os produtos desta dívida retornem ao estoque</strong> e a venda original seja apagada do histórico do caixa.
                </p>
                <div className="space-y-2">
                    <Label className="text-foreground">Senha de Administrador</Label>
                    <Input 
                        type="password" 
                        placeholder="Digite a senha..." 
                        value={deletePassword} 
                        onChange={(e) => setDeletePassword(e.target.value)} 
                        className="bg-background border-border text-foreground"
                    />
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)} className="bg-background border-border text-foreground hover:bg-muted">Cancelar</Button>
                <Button onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : "Excluir Dívida"}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE PAGAMENTO DO FIADO */}
      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="sm:max-w-[400px] bg-card border-border">
            <DialogHeader><DialogTitle className="text-foreground text-xl">Receber Pagamento de Fiado</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="bg-muted/30 border border-border p-3 rounded-lg flex justify-between items-center">
                    <span className="font-medium text-muted-foreground">Cliente:</span>
                    <span className="font-bold text-foreground">{selectedCrediario?.clients?.nome}</span>
                </div>
                <div className="space-y-2">
                    <Label className="text-foreground">Valor a Pagar (R$)</Label>
                    <Input type="number" step="0.01" value={valorPagamento} onChange={(e) => setValorPagamento(e.target.value)} className="font-bold text-lg h-12 bg-background border-border text-foreground" />
                </div>
                <div className="space-y-2">
                    <Label className="text-foreground">Método de Pagamento</Label>
                    <Select value={metodoPagamento} onValueChange={setMetodoPagamento}>
                        <SelectTrigger className="h-12 bg-background border-border text-foreground"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            <SelectItem value="dinheiro">Dinheiro</SelectItem>
                            <SelectItem value="pix">Pix</SelectItem>
                            <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                            <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsPaymentModalOpen(false)} className="bg-background text-foreground border-border hover:bg-muted">Cancelar</Button>
                <Button onClick={handlePay} disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md">
                    {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : "Confirmar Recebimento"}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}