import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Plus, ShoppingCart, User, List, Minus, Search, CreditCard, Banknote, Smartphone, ChevronRight } from "lucide-react"; 

// --- Tipos de Dados ---
type PaymentMethod = "dinheiro" | "pix" | "cartao_credito" | "cartao_debito";

interface Product {
  id: string;
  nome: string;
  preco_venda: number;
  quantidade: number;
}

interface SaleItem {
  id: string; // Adicionado ID para facilitar updates
  produto_id: string;
  nome: string;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
}

interface OpenSale {
  id: string;
  nome_cliente: string | null;
  numero_comanda: string | null;
  total: number;
}

interface SelectedSale extends OpenSale {
  sale_items: SaleItem[];
}

export default function PDV() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [openComandas, setOpenComandas] = useState<OpenSale[]>([]);
  const [selectedComanda, setSelectedComanda] = useState<SelectedSale | null>(null);

  const [isComandaModalOpen, setIsComandaModalOpen] = useState(false);
  const [newComandaNumber, setNewComandaNumber] = useState("");
  const [newComandaName, setNewComandaName] = useState("");

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("dinheiro");
  const [amountPaid, setAmountPaid] = useState("");

  useEffect(() => {
    loadProducts();
    loadOpenComandas();
  }, [user]);

  const loadProducts = async () => {
    const { data } = await supabase
      .from('products')
      .select('id, nome, preco_venda, quantidade')
      .order('nome');
    if (data) setProducts(data);
  };

  const loadOpenComandas = async () => {
    const { data, error } = await supabase
      .from('sales')
      .select('id, nome_cliente, numero_comanda, total')
      .eq('status', 'aberta')
      .order('created_at', { ascending: true });
    
    if (error) {
      toast.error("Erro ao carregar comandas", { description: error.message });
    } else {
      setOpenComandas(data);
    }
  };

  const handleSelectComanda = async (comandaId: string) => {
    const { data, error } = await supabase
      .from('sales')
      .select('*, sale_items(*, products(nome))')
      .eq('id', comandaId)
      .single();

    if (error) {
      toast.error("Erro ao selecionar comanda");
      return;
    }

    if (data) {
      // Mapeia garantindo o tipo correto
      const items = (data.sale_items || []).map((item: any) => ({
        id: item.id,
        produto_id: item.produto_id,
        nome: item.products?.nome || 'Produto desconhecido',
        quantidade: item.quantidade,
        preco_unitario: Number(item.preco_unitario),
        subtotal: Number(item.subtotal),
      }));
      setSelectedComanda({ ...data, sale_items: items });
    }
  };

  const refreshData = async () => {
    if (selectedComanda) await handleSelectComanda(selectedComanda.id);
    await loadProducts();
    await loadOpenComandas();
  };

  const handleCreateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    const { data, error } = await supabase
      .from('sales')
      .insert([{ 
        colaborador_id: user.id, 
        nome_cliente: newComandaName || null,
        numero_comanda: newComandaNumber || null,
        status: 'aberta'
      }])
      .select()
      .single();

    if (error) {
      toast.error("Erro ao criar comanda");
    } else if (data) {
      toast.success(`Comanda ${data.numero_comanda || ''} aberta!`);
      setIsComandaModalOpen(false);
      setNewComandaName("");
      setNewComandaNumber("");
      loadOpenComandas();
      handleSelectComanda(data.id);
    }
  };

  const handleAttemptFinishSale = () => {
    if (!selectedComanda) return;
    if (selectedComanda.sale_items.length === 0) {
      handleCloseEmptyComanda(selectedComanda.id);
      return;
    }
    setAmountPaid(""); 
    setPaymentMethod("dinheiro"); 
    setIsPaymentModalOpen(true);
  };

  const handleCloseEmptyComanda = async (comandaId: string) => {
    if(confirm("Deseja cancelar esta comanda vazia?")) {
        const { error } = await supabase.from('sales').delete().eq('id', comandaId);
        if (error) toast.error("Erro ao cancelar");
        else {
          toast.info("Comanda cancelada.");
          setSelectedComanda(null);
          loadOpenComandas(); 
        }
    }
  };

  const handleConfirmPayment = async () => {
    if (!selectedComanda) return;

    const { error } = await supabase
      .from('sales')
      .update({ 
        status: 'finalizada',
        metodo_pagamento: paymentMethod 
      })
      .eq('id', selectedComanda.id);

    if (error) {
      toast.error("Erro ao finalizar venda");
    } else {
      toast.success("Venda finalizada!");
      setIsPaymentModalOpen(false);
      setSelectedComanda(null);
      loadOpenComandas();   
      // Não precisa recarregar produtos aqui pois o estoque já foi baixado ao adicionar os itens
    }
  };

  // --- LÓGICA DE ESTOQUE (CORRIGIDA) ---
  
  const handleAddItem = async (product: Product) => {
    if (!selectedComanda) {
      toast.error("Selecione uma comanda primeiro!");
      return;
    }
    
    // 1. Verifica estoque localmente antes de ir pro banco
    if (product.quantidade <= 0) {
        toast.error("Produto sem estoque!");
        return;
    }

    // 2. Decrementa o estoque no banco (Imediatamente)
    const { error: stockError } = await supabase
        .from('products')
        .update({ quantidade: product.quantidade - 1 })
        .eq('id', product.id);

    if (stockError) {
        toast.error("Erro ao atualizar estoque");
        return;
    }

    // 3. Adiciona ou Atualiza o item na comanda
    const existingItem = selectedComanda.sale_items.find(item => item.produto_id === product.id);
    
    if (existingItem) {
      const newQty = existingItem.quantidade + 1;
      await supabase.from('sale_items').update({
          quantidade: newQty,
          subtotal: newQty * existingItem.preco_unitario
      }).eq('id', existingItem.id);
    } else {
      await supabase.from('sale_items').insert([{
          venda_id: selectedComanda.id,
          produto_id: product.id,
          quantidade: 1,
          preco_unitario: product.preco_venda,
          subtotal: product.preco_venda,
      }]);
    }

    refreshData();
  };

  const handleRemoveItem = async (item: SaleItem) => {
    // 1. Devolve o estoque (Quantidade total do item)
    // Precisamos buscar o produto atual para somar corretamente
    const product = products.find(p => p.id === item.produto_id);
    if(product) {
        await supabase.from('products').update({ quantidade: product.quantidade + item.quantidade }).eq('id', item.produto_id);
    }

    // 2. Remove da comanda
    const { error } = await supabase.from('sale_items').delete().eq('id', item.id);
    
    if (error) toast.error("Erro ao remover item");
    else refreshData();
  };

  const handleIncrementItem = async (item: SaleItem) => {
    const product = products.find(p => p.id === item.produto_id);
    if (!product || product.quantidade <= 0) {
        toast.error("Sem estoque suficiente!");
        return;
    }

    // Baixa estoque
    await supabase.from('products').update({ quantidade: product.quantidade - 1 }).eq('id', product.id);
    
    // Sobe quantidade na comanda
    const newQty = item.quantidade + 1;
    await supabase.from('sale_items').update({
        quantidade: newQty,
        subtotal: newQty * item.preco_unitario
    }).eq('id', item.id);

    refreshData();
  };

  const handleDecrementItem = async (item: SaleItem) => {
    const product = products.find(p => p.id === item.produto_id);
    
    // Devolve estoque
    if(product) {
        await supabase.from('products').update({ quantidade: product.quantidade + 1 }).eq('id', product.id);
    }

    if (item.quantidade === 1) {
      // Se era 1, remove o item da tabela sale_items
      await supabase.from('sale_items').delete().eq('id', item.id);
    } else {
      // Se era > 1, apenas decrementa
      const newQty = item.quantidade - 1;
      await supabase.from('sale_items').update({
          quantidade: newQty,
          subtotal: newQty * item.preco_unitario
      }).eq('id', item.id);
    }

    refreshData();
  };

  const filteredProducts = products.filter(p =>
    p.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const troco = useMemo(() => {
    const total = selectedComanda?.total || 0;
    const paid = parseFloat(amountPaid) || 0;
    if (paymentMethod === 'dinheiro' && paid > total) {
      return paid - total;
    }
    return 0;
  }, [amountPaid, selectedComanda?.total, paymentMethod]);


  return (
    // CONTAINER: Altura fixa 100% da tela (sem scroll global)
    <div className="flex flex-col h-[calc(100vh-4rem)] gap-2 overflow-hidden bg-gray-50/50 dark:bg-gray-950">
      
      {/* HEADER */}
      <div className="flex-shrink-0 flex justify-between items-center px-1">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Comandas</h1>
        </div>
      </div>

      <div className="grid gap-2 grid-cols-1 lg:grid-cols-12 flex-1 min-h-0">
        
        {/* COLUNA 1: COMANDAS (3 cols) */}
        <Card className="lg:col-span-3 flex flex-col border-none shadow-sm ring-1 ring-gray-200 dark:ring-gray-800 bg-white dark:bg-gray-900 overflow-hidden h-full">
          <CardHeader className="p-3 border-b flex-shrink-0 bg-gray-50/80">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <List className="h-5 w-5 text-orange-600" />
                Abertas ({openComandas.length})
              </CardTitle>
              <Dialog open={isComandaModalOpen} onOpenChange={setIsComandaModalOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-8 shadow-sm bg-orange-600 hover:bg-orange-700 text-white font-bold">
                    <Plus className="h-4 w-4 mr-1" /> Nova
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[400px]">
                  <form onSubmit={handleCreateSale}>
                    <DialogHeader><DialogTitle>Abrir Comanda</DialogTitle></DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="space-y-2">
                        <Label>Mesa / Nº</Label>
                        <Input value={newComandaNumber} onChange={(e) => setNewComandaNumber(e.target.value)} placeholder="10" className="text-2xl font-bold h-14" autoFocus />
                      </div>
                      <div className="space-y-2">
                        <Label>Cliente</Label>
                        <Input value={newComandaName} onChange={(e) => setNewComandaName(e.target.value)} placeholder="Nome" className="h-12" />
                      </div>
                    </div>
                    <DialogFooter><Button type="submit" className="w-full h-12 text-lg">Abrir</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-2 space-y-2 bg-gray-100/50">
            {openComandas.length > 0 ? openComandas.map((comanda) => (
              <div key={comanda.id} onClick={() => handleSelectComanda(comanda.id)} className={`cursor-pointer p-3 rounded-xl border transition-all duration-150 relative group ${selectedComanda?.id === comanda.id ? "bg-white border-orange-500 shadow-md ring-2 ring-orange-500 z-10" : "bg-white border-gray-200 hover:border-orange-300 shadow-sm"}`}>
                <div className="flex justify-between items-center mb-1">
                  <span className={`font-extrabold text-2xl ${selectedComanda?.id === comanda.id ? "text-orange-600" : "text-gray-800"}`}>#{comanda.numero_comanda || "?"}</span>
                  <span className="font-bold text-base bg-gray-100 px-2 py-1 rounded-md text-gray-900">R$ {Number(comanda.total).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-1 font-medium"><User className="h-3 w-3" /><span className="truncate max-w-[100px]">{comanda.nome_cliente || "Balcão"}</span></div>
                  {selectedComanda?.id === comanda.id && <ChevronRight className="h-4 w-4 text-orange-500" />}
                </div>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-40"><List className="h-10 w-10 mb-2" /><p className="font-medium">Vazio</p></div>
            )}
          </CardContent>
        </Card>

        {/* COLUNA 2: PRODUTOS (5 cols) */}
        <Card className="lg:col-span-5 flex flex-col border-none shadow-sm ring-1 ring-gray-200 dark:ring-gray-800 bg-white dark:bg-gray-900 overflow-hidden h-full">
          <CardHeader className="p-3 border-b flex-shrink-0">
             <div className="relative">
                <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input placeholder="Buscar produto..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} disabled={!selectedComanda} className="pl-10 bg-gray-50 border-gray-200 focus:bg-white transition-all h-12 text-lg" />
             </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-0 bg-gray-50/30">
            <div className="divide-y divide-gray-100">
              {filteredProducts.map((product) => (
                <div key={product.id} onClick={() => selectedComanda && handleAddItem(product)} className={`flex items-center justify-between p-3 transition-colors ${!selectedComanda ? 'opacity-50 cursor-not-allowed bg-gray-50' : 'cursor-pointer hover:bg-blue-50 active:bg-blue-100'}`}>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-bold text-base text-gray-900">{product.nome}</span>
                    <span className={`text-xs font-medium ${product.quantidade <= 0 ? 'text-red-500' : 'text-muted-foreground'}`}>Estoque: {product.quantidade}</span>
                  </div>
                  <div className="flex items-center gap-3">
                     <span className="font-extrabold text-gray-900 text-lg bg-gray-100 px-2 py-1 rounded">R$ {Number(product.preco_venda).toFixed(2)}</span>
                     {selectedComanda && <Button size="icon" variant="ghost" className="h-10 w-10 text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-full"><Plus className="h-6 w-6" /></Button>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* COLUNA 3: CARRINHO (4 cols) */}
        <Card className="lg:col-span-4 flex flex-col border-none shadow-lg ring-1 ring-gray-200 dark:ring-gray-800 bg-white dark:bg-gray-900 z-10 overflow-hidden h-full">
          <CardHeader className="p-3 bg-gray-50 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-blue-100 text-blue-600"><ShoppingCart className="h-5 w-5" /></div>
                    {selectedComanda ? (
                        <div className="flex flex-col leading-none"><span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Mesa</span><span className="font-extrabold text-xl">#{selectedComanda.numero_comanda || "S/N"}</span></div>
                    ) : "Carrinho"}
                </CardTitle>
                {selectedComanda && (
                    <div className="text-right leading-none bg-white px-2 py-1 rounded border shadow-sm">
                         <span className="text-[10px] font-bold text-muted-foreground uppercase block">Cliente</span>
                         <span className="text-sm font-bold truncate max-w-[100px] block">{selectedComanda.nome_cliente || "Consumidor"}</span>
                    </div>
                )}
            </div>
          </CardHeader>
          
          <CardContent className="flex-1 overflow-y-auto p-0 scrollbar-thin">
            {selectedComanda ? (
              <Table>
                <TableHeader className="bg-white sticky top-0 z-10 shadow-sm">
                  <TableRow className="h-8 hover:bg-transparent">
                    <TableHead className="w-[50%] pl-3 h-8 text-xs font-bold uppercase text-gray-500">Produto</TableHead>
                    <TableHead className="text-center h-8 text-xs font-bold uppercase text-gray-500">Qtd</TableHead>
                    <TableHead className="text-right pr-3 h-8 text-xs font-bold uppercase text-gray-500">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedComanda.sale_items.length === 0 && (
                      <TableRow><TableCell colSpan={3} className="text-center py-10 text-muted-foreground"><div className="flex flex-col items-center gap-2"><ShoppingCart className="h-10 w-10 opacity-20" /><span className="font-medium">Comanda vazia</span></div></TableCell></TableRow>
                  )}
                  {selectedComanda.sale_items.map((item) => (
                    <TableRow key={item.id} className="hover:bg-gray-50">
                      <TableCell className="font-medium pl-3 py-1.5 align-middle">
                        <div className="flex flex-col leading-tight"><span className="text-sm text-gray-900 font-semibold line-clamp-1">{item.nome}</span><span className="text-[10px] text-muted-foreground">Un: R$ {item.preco_unitario.toFixed(2)}</span></div>
                      </TableCell>
                      <TableCell className="text-center p-0 align-middle">
                        <div className="flex items-center justify-center gap-0.5 bg-gray-100 rounded-lg mx-1 py-0.5">
                          <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white hover:shadow-sm rounded-md" onClick={() => handleDecrementItem(item)}><Minus className="h-3 w-3" /></Button>
                          <span className="text-sm font-bold w-5">{item.quantidade}</span>
                          <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white hover:shadow-sm rounded-md" onClick={() => handleIncrementItem(item)}><Plus className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right pr-3 font-bold text-sm text-gray-900 align-middle">R$ {item.subtotal.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
               <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-3 opacity-50 p-8 text-center"><div className="bg-gray-100 p-4 rounded-full"><ShoppingCart className="h-8 w-8" /></div><p className="font-medium">Selecione uma comanda</p></div>
            )}
          </CardContent>
          
          {/* RODAPÉ AJUSTADO: Botão Receber com margem inferior extra (pb-6) */}
          <CardFooter className="p-0 border-t bg-gray-50 flex-shrink-0 z-20 flex flex-col">
            <div className="flex justify-between items-center w-full px-4 py-3 border-b border-dashed border-gray-200">
                <span className="text-muted-foreground font-bold uppercase text-xs tracking-wider">Total a Pagar</span>
                <span className="text-4xl font-extrabold text-gray-900 tracking-tight">R$ {selectedComanda ? Number(selectedComanda.total).toFixed(2) : "0.00"}</span>
            </div>
            <div className="p-3 pb-6 w-full bg-white dark:bg-gray-900"> {/* ADICIONADO PB-6 AQUI */}
                <Button
                    size="lg"
                    className="w-full h-14 font-extrabold text-xl shadow-lg transition-all hover:scale-[1.01] hover:shadow-xl bg-green-600 hover:bg-green-700"
                    disabled={!selectedComanda}
                    onClick={handleAttemptFinishSale}
                >
                    {selectedComanda?.sale_items.length === 0 ? "Cancelar Comanda" : "RECEBER"}
                </Button>
            </div>
          </CardFooter>
        </Card>
      </div>

      {/* MODAL DE PAGAMENTO */}
      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="text-center text-xl">Pagamento</DialogTitle></DialogHeader>
          <div className="bg-gray-50 p-4 rounded-xl flex flex-col items-center justify-center mb-2 border">
             <span className="text-xs text-muted-foreground uppercase tracking-widest font-bold">Total da Venda</span>
             <span className="text-5xl font-extrabold text-primary mt-1">R$ {Number(selectedComanda?.total).toFixed(2)}</span>
          </div>
          <div className="space-y-4">
            <RadioGroup value={paymentMethod} onValueChange={(value: any) => { setPaymentMethod(value); if(value !== 'dinheiro') setAmountPaid(""); }} className="grid grid-cols-2 gap-3">
              {[{ id: "dinheiro", label: "Dinheiro", icon: Banknote }, { id: "pix", label: "Pix", icon: Smartphone }, { id: "cartao_debito", label: "Débito", icon: CreditCard }, { id: "cartao_credito", label: "Crédito", icon: CreditCard }].map((m) => (
                  <div key={m.id}>
                    <RadioGroupItem value={m.id} id={m.id} className="peer sr-only" />
                    <Label htmlFor={m.id} className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-muted bg-white p-2 hover:bg-gray-50 peer-data-[state=checked]:border-primary peer-data-[state=checked]:text-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all h-20">
                        <m.icon className="h-6 w-6" /><span className="text-xs font-bold uppercase">{m.label}</span>
                    </Label>
                  </div>
              ))}
            </RadioGroup>
            {paymentMethod === 'dinheiro' && (
              <div className="bg-gray-50 p-4 rounded-lg border space-y-2 animate-in fade-in slide-in-from-top-2">
                <Label className="text-xs uppercase font-bold text-muted-foreground">Valor Recebido</Label>
                <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-bold text-xl">R$</span><Input type="number" placeholder="0.00" className="pl-12 text-2xl font-bold h-14 bg-white" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} autoFocus /></div>
                {troco >= 0 && amountPaid && (<div className="flex justify-between items-center text-sm pt-2 border-t border-dashed"><span className="font-bold text-muted-foreground uppercase">Troco</span><span className="font-extrabold text-2xl text-green-600">R$ {troco.toFixed(2)}</span></div>)}
              </div>
            )}
          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" className="flex-1 h-12 text-lg" onClick={() => setIsPaymentModalOpen(false)}>Voltar</Button>
            <Button className="flex-1 font-bold h-12 text-lg bg-green-600 hover:bg-green-700" onClick={handleConfirmPayment} disabled={paymentMethod === 'dinheiro' && (parseFloat(amountPaid) || 0) < (selectedComanda?.total || 0)}>FINALIZAR</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}