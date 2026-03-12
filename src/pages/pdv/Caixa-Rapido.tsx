import { useEffect, useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Minus, Search, ShoppingCart, DollarSign, Package, Lock, Trash2, Loader2 } from "lucide-react";
import { Database } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

// --- TIPOS ---
type ProductRow = Database["public"]["Tables"]["products"]["Row"];
type Category = Database["public"]["Tables"]["categories"]["Row"];
type Product = ProductRow & { categories: { nome: string } | null; };
type CartItem = Product & { quantidade_venda: number; };
type PaymentMethod = Database["public"]["Enums"]["payment_method"];
type CaixaStatus = "aberto" | "fechado" | "loading";

export default function CaixaRapido() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [caixaStatus, setCaixaStatus] = useState<CaixaStatus>("loading");
  const [caixaId, setCaixaId] = useState<string | null>(null);
  const [isCaixaModalOpen, setIsCaixaModalOpen] = useState(false);
  const [valorAbertura, setValorAbertura] = useState("");
  const [isSubmittingCaixa, setIsSubmittingCaixa] = useState(false);

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [payments, setPayments] = useState<{ method: PaymentMethod; value: number }[]>([]);
  const [currentMethod, setCurrentMethod] = useState<PaymentMethod | "">("");
  const [currentAmount, setCurrentAmount] = useState("");

  // --- CARREGAMENTO DE DADOS ---
  const loadData = async () => {
    setLoading(true);
    try {
      const { data: prodData } = await supabase.from('products').select('*, categories(nome)').order('nome');
      const { data: catData } = await supabase.from('categories').select('*').order('nome');
      if (prodData) setProducts(prodData as Product[]);
      if (catData) setCategories(catData);
    } catch (error) { 
      toast.error("Erro ao carregar catálogo de produtos"); 
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => { loadData(); }, []); 

  const checkCaixaStatus = async () => {
    if (!user) { setCaixaStatus("fechado"); return; }
    setCaixaStatus("loading");
    try {
      const { data, error } = await supabase.from("caixas").select("id").eq("colaborador_id", user.id).eq("status", "aberto").order("data_abertura", { ascending: false }).limit(1);
      if (error) throw error;
      if (data && data.length > 0) { 
          setCaixaId(data[0].id); 
          setCaixaStatus("aberto"); 
      } else { 
          setCaixaStatus("fechado"); 
          setCaixaId(null); 
      }
    } catch { 
      setCaixaStatus("fechado"); 
      setCaixaId(null); 
    }
  };

  useEffect(() => { checkCaixaStatus(); }, [user]);

  // --- LÓGICA DE STOCK EM TEMPO REAL (MÓDULO VISUAL) ---
  const getAvailableStock = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (!product) return 0;
    const cartItem = cart.find(item => item.id === productId);
    const cartQtd = cartItem ? cartItem.quantidade_venda : 0;
    return product.quantidade - cartQtd;
  };

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = p.nome.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'all' || p.categoria_id === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, searchTerm, selectedCategory]);

  const addToCart = (product: Product) => {
    if (caixaStatus !== 'aberto') { 
        toast.error("O caixa está fechado!"); 
        setIsCaixaModalOpen(true); 
        return; 
    }
    
    // Verificação de stock instantânea
    if (getAvailableStock(product.id) <= 0) {
        toast.error(`Estoque insuficiente para ${product.nome}!`);
        return;
    }

    setCart(prevCart => {
      const existingItem = prevCart.find(item => item.id === product.id);
      if (existingItem) return prevCart.map(item => item.id === product.id ? { ...item, quantidade_venda: item.quantidade_venda + 1 } : item);
      return [...prevCart, { ...product, quantidade_venda: 1 }];
    });
  };

  const updateCartQuantity = (productId: string, amount: number) => {
    setCart(prevCart => {
      const newAmount = Math.max(0, amount);
      if (newAmount === 0) return prevCart.filter(item => item.id !== productId);

      const existingItem = prevCart.find(item => item.id === productId);
      if (existingItem && newAmount > existingItem.quantidade_venda) {
          // Se está a aumentar no carrinho, verificar se tem stock
          if (getAvailableStock(productId) <= 0) {
              toast.error("Não há mais stock disponível!");
              return prevCart;
          }
      }
      return prevCart.map(item => item.id === productId ? { ...item, quantidade_venda: newAmount } : item);
    });
  };

  // --- LÓGICA FINANCEIRA ---
  const totalCompra = useMemo(() => cart.reduce((sum, item) => sum + (Number(item.preco_venda) * item.quantidade_venda), 0), [cart]);
  const totalPago = useMemo(() => payments.reduce((sum, p) => sum + p.value, 0), [payments]);
  const faltaPagar = Math.max(0, totalCompra - totalPago);
  const troco = Math.max(0, totalPago - totalCompra);

  const handleAddPayment = () => {
    if (!currentMethod) return toast.error("Selecione a forma de pagamento");
    const val = parseFloat(currentAmount.replace(",", "."));
    if (isNaN(val) || val <= 0) return toast.error("Valor inválido");
    setPayments([...payments, { method: currentMethod, value: val }]);
    setCurrentMethod(""); 
    setCurrentAmount("");
  };

  const handleRemovePayment = (index: number) => { 
      setPayments(payments.filter((_, i) => i !== index)); 
  };

  const openPaymentModal = () => {
    setPayments([]); 
    setCurrentMethod(""); 
    setCurrentAmount(totalCompra.toFixed(2)); 
    setIsPaymentModalOpen(true);
  };

  // --- FINALIZAÇÃO E ATUALIZAÇÃO DO BANCO (STOCK E VENDAS) ---
  const handleFinalizeSale = async () => {
    if (!user || cart.length === 0 || !caixaId) return;
    if (caixaStatus !== 'aberto') return toast.error("Caixa fechado!");
    if (totalPago < totalCompra) return toast.error("O valor pago é insuficiente!");

    setIsSubmitting(true);
    try {
      // 1. Criar a Venda Mestra
      const metodoPrincipal = payments.length > 0 ? payments[0].method : null;
      const { data: saleData, error: saleError } = await supabase.from('sales').insert({ 
          colaborador_id: user.id, 
          caixa_id: caixaId, 
          status: 'finalizada', 
          total: totalCompra, 
          metodo_pagamento: metodoPrincipal 
      }).select().single();
      if (saleError) throw saleError;

      // 2. Inserir os Itens da Venda
      const saleItems = cart.map(item => ({ 
          venda_id: saleData.id, 
          produto_id: item.id, 
          quantidade: item.quantidade_venda, 
          preco_unitario: Number(item.preco_venda), 
          subtotal: Number(item.preco_venda) * item.quantidade_venda 
      }));
      const { error: itemsError } = await supabase.from('sale_items').insert(saleItems);
      if (itemsError) throw itemsError;

      // 3. Ratear os Pagamentos
      let remainingToPay = totalCompra;
      const paymentInserts = [];
      for (const p of payments) {
          if (remainingToPay <= 0) break;
          const valToSave = Math.min(p.value, remainingToPay);
          paymentInserts.push({ venda_id: saleData.id, metodo_pagamento: p.method, valor: valToSave });
          remainingToPay -= valToSave;
      }
      const { error: payError } = await supabase.from('sale_payments').insert(paymentInserts);
      if (payError) throw payError;

      // 4. ABATER STOCK DEFINITIVAMENTE NO BANCO DE DADOS
      for (const item of cart) {
          // Procuramos a quantidade atual exata no DB antes de subtrair, para não haver erros de corrida
          const { data: pData } = await supabase.from('products').select('quantidade').eq('id', item.id).single();
          if (pData) {
              await supabase.from('products').update({ 
                  quantidade: Math.max(0, pData.quantidade - item.quantidade_venda) 
              }).eq('id', item.id);
          }
      }

      toast.success("Venda finalizada com sucesso!");
      setCart([]); 
      setIsPaymentModalOpen(false);
      
      // 5. Recarregar os produtos para atualizar a tela principal
      loadData();
      
    } catch (error: any) { 
        toast.error("Erro na venda", { description: error.message }); 
    } finally { 
        setIsSubmitting(false); 
    }
  };

  const handleOpenCaixa = async () => {
    if (!user) return;
    const valorNum = parseFloat(valorAbertura.replace(",", "."));
    if (isNaN(valorNum)) return toast.error("Valor inválido");
    
    setIsSubmittingCaixa(true);
    try {
      const { data: caixaData, error: caixaError } = await supabase.from("caixas").insert({ 
          colaborador_id: user.id, 
          valor_abertura: valorNum, 
          status: "aberto" 
      }).select().single();
      
      if (caixaError) throw caixaError;
      
      await supabase.from("movements").insert({ 
          responsavel_id: user.id, 
          tipo: "entrada", 
          descricao: 'Abertura de Caixa', 
          valor: valorNum, 
          created_at: caixaData.data_abertura 
      });
      
      toast.success("Caixa aberto com sucesso!");
      setCaixaId(caixaData.id); 
      setCaixaStatus("aberto"); 
      setIsCaixaModalOpen(false); 
      setValorAbertura("");
    } catch (error: any) { 
        toast.error("Erro ao abrir caixa"); 
    } finally { 
        setIsSubmittingCaixa(false); 
    }
  };

  const paymentLabels: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", cartao_credito: "Crédito", cartao_debito: "Débito" };

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-4 overflow-hidden p-2 md:p-0 animate-in fade-in duration-500">
      
      {/* PAINEL ESQUERDO: LISTA DE PRODUTOS */}
      <Card className="flex-1 md:w-2/3 flex flex-col border border-border bg-card text-foreground overflow-hidden shadow-sm">
        <CardHeader className="p-4 border-b border-border space-y-4 flex-shrink-0 bg-muted/10">
            <div className="flex justify-between items-center">
                <h1 className="text-xl font-bold flex items-center gap-2"><Package className="h-5 w-5 text-primary" /> Catálogo</h1>
                <Badge variant="outline" className="px-3 py-1 bg-primary/10 text-primary border-primary/20 shadow-none">
                    {filteredProducts.length} itens
                </Badge>
            </div>
            <div className="flex flex-col md:flex-row gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Pesquisar produto..." className="pl-9 bg-background border-border h-10 text-foreground" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-full md:w-[200px] bg-background border-border h-10 text-foreground">
                        <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                        <SelectItem value="all" className="hover:bg-muted">Todas as Categorias</SelectItem>
                        {categories.map(cat => <SelectItem key={cat.id} value={cat.id} className="hover:bg-muted">{cat.nome}</SelectItem>)}
                    </SelectContent>
                </Select>
            </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-4 bg-muted/10 scrollbar-thin">
           {loading ? (
               <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4">
                   <Loader2 className="h-10 w-10 animate-spin text-primary" />
                   <p>A carregar catálogo...</p>
               </div>
           ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredProducts.map(product => {
                    const availableStock = getAvailableStock(product.id);
                    const isOutOfStock = availableStock <= 0;
                    const isDisabled = isOutOfStock || caixaStatus !== 'aberto';

                    return (
                        <div 
                            key={product.id} 
                            className={`group relative bg-card rounded-xl border border-border p-4 shadow-sm transition-all flex flex-col justify-between h-[130px] 
                                ${isDisabled ? 'opacity-50 grayscale cursor-not-allowed border-dashed' : 'hover:border-primary/50 cursor-pointer hover:shadow-md active:scale-95'}`} 
                            onClick={() => !isDisabled && addToCart(product)}
                        >
                            <div className="flex flex-col gap-1">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground truncate">{product.categories?.nome || 'Diversos'}</span>
                                <span className="font-semibold text-sm leading-tight line-clamp-2 text-foreground">{product.nome}</span>
                            </div>
                            <div className="flex justify-between items-end mt-2">
                                <div className="flex flex-col">
                                    {/* AQUI APARECE O STOCK JÁ ABATIDO VISUALMENTE */}
                                    <span className={`text-[10px] font-bold ${isOutOfStock ? 'text-destructive' : 'text-muted-foreground'}`}>
                                        Stock: {availableStock}
                                    </span>
                                    <span className="text-lg font-bold text-foreground">R$ {Number(product.preco_venda).toFixed(2)}</span>
                                </div>
                                <div className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors 
                                    ${isDisabled ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground'}`}>
                                    {caixaStatus !== 'aberto' ? <Lock className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
           )}
        </CardContent>
      </Card>

      {/* PAINEL DIREITO: CARRINHO E PAGAMENTO */}
      <Card className="w-full md:w-1/3 flex flex-col border border-border shadow-md bg-card text-foreground z-10 overflow-hidden h-full">
        <CardHeader className="p-4 bg-muted/30 border-b border-border flex-shrink-0">
            <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-primary" /> Carrinho</CardTitle>
                {caixaStatus === 'aberto' ? (
                    <div className="px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 text-[10px] font-bold uppercase flex items-center gap-2">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        Caixa Aberto
                    </div>
                ) : (
                    <Button size="sm" variant="destructive" className="h-8 text-xs font-bold gap-2 animate-pulse bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={() => setIsCaixaModalOpen(true)}>
                        <Lock className="h-3 w-3" /> ABRIR CAIXA
                    </Button>
                )}
            </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto p-0 scrollbar-thin bg-card">
            {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4 p-8 text-center opacity-70">
                    <div className="h-16 w-16 bg-muted rounded-full flex items-center justify-center"><ShoppingCart className="h-8 w-8 text-muted-foreground" /></div>
                    <p className="text-sm font-medium">O carrinho está vazio.<br/>Selecione produtos ao lado.</p>
                </div>
            ) : (
              <Table>
                  <TableHeader className="bg-muted/50 sticky top-0 z-10 shadow-sm border-b border-border">
                      <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="pl-4 h-10 text-[10px] font-bold uppercase text-muted-foreground">Item</TableHead>
                          <TableHead className="w-[100px] text-center h-10 text-[10px] font-bold uppercase text-muted-foreground">Qtd</TableHead>
                          <TableHead className="text-right pr-4 h-10 text-[10px] font-bold uppercase text-muted-foreground">Total</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {cart.map(item => (
                          <TableRow key={item.id} className="group border-border hover:bg-muted/30">
                              <TableCell className="pl-4 font-medium py-3">
                                  <div className="flex flex-col">
                                      <span className="text-sm font-bold line-clamp-1 text-foreground">{item.nome}</span>
                                      <span className="text-[10px] text-muted-foreground font-medium">Un: R$ {Number(item.preco_venda).toFixed(2)}</span>
                                  </div>
                              </TableCell>
                              <TableCell className="text-center p-0">
                                  <div className="flex items-center justify-between bg-background border border-border rounded-lg mx-1 p-0.5 shadow-sm">
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => updateCartQuantity(item.id, item.quantidade_venda - 1)}><Minus className="h-3 w-3" /></Button>
                                      <span className="text-sm w-6 font-bold text-foreground">{item.quantidade_venda}</span>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-foreground hover:text-primary hover:bg-primary/10" onClick={() => updateCartQuantity(item.id, item.quantidade_venda + 1)}><Plus className="h-3 w-3" /></Button>
                                  </div>
                              </TableCell>
                              <TableCell className="text-right pr-4 font-bold text-sm text-foreground">
                                  R$ {(Number(item.preco_venda) * item.quantidade_venda).toFixed(2)}
                              </TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
              </Table>
            )}
        </CardContent>
        <CardFooter className="flex flex-col p-0 border-t border-border bg-card flex-shrink-0 z-20">
            <div className="w-full p-4 flex justify-between items-center border-b border-dashed border-border bg-muted/10">
                <span className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Total a Pagar</span>
                <span className="text-4xl font-extrabold text-foreground tracking-tight">R$ {totalCompra.toFixed(2)}</span>
            </div>
            <div className="p-4 w-full bg-card">
                <Button 
                    className={`w-full h-16 text-xl font-bold shadow-lg transition-all ${cart.length === 0 || caixaStatus !== 'aberto' ? 'bg-muted text-muted-foreground border border-border cursor-not-allowed hover:bg-muted' : 'bg-primary hover:bg-primary/90 text-primary-foreground hover:shadow-primary/20'}`} 
                    onClick={openPaymentModal} 
                    disabled={cart.length === 0 || isSubmitting || caixaStatus !== 'aberto'}
                >
                    {caixaStatus !== 'aberto' ? <span className="flex items-center gap-2"><Lock className="h-5 w-5" /> CAIXA FECHADO</span> : <span className="flex items-center gap-2 uppercase"><DollarSign className="h-6 w-6" /> Finalizar Venda</span>}
                </Button>
            </div>
        </CardFooter>
      </Card>

      {/* MODAL DE PAGAMENTO (DIVISÃO / TROCO) */}
      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="sm:max-w-xl bg-card border-border p-6 shadow-2xl">
          <DialogHeader><DialogTitle className="text-2xl font-bold text-foreground">Pagamento e Finalização</DialogTitle></DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 my-4">
              <div className="bg-muted/30 border border-border p-4 rounded-xl flex flex-col justify-center items-center">
                  <span className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Total da Venda</span>
                  <span className="text-3xl font-extrabold text-foreground">R$ {totalCompra.toFixed(2)}</span>
              </div>
              <div className={`p-4 rounded-xl flex flex-col justify-center items-center border-2 transition-colors ${faltaPagar === 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : 'bg-orange-500/10 border-orange-500/30 text-orange-500'}`}>
                  <span className="text-xs uppercase font-bold tracking-wider">{faltaPagar === 0 ? 'Troco a Devolver' : 'Falta Pagar'}</span>
                  <span className="text-3xl font-extrabold">R$ {faltaPagar === 0 ? troco.toFixed(2) : faltaPagar.toFixed(2)}</span>
              </div>
          </div>
          
          <div className="grid grid-cols-12 gap-3 mt-4">
              <Select value={currentMethod} onValueChange={(val: any) => setCurrentMethod(val)}>
                  <SelectTrigger className="col-span-6 h-12 bg-background border-border text-foreground font-medium">
                      <SelectValue placeholder="Forma de Pgto" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                      <SelectItem value="dinheiro" className="hover:bg-muted font-medium">Dinheiro</SelectItem>
                      <SelectItem value="pix" className="hover:bg-muted font-medium">Pix</SelectItem>
                      <SelectItem value="cartao_debito" className="hover:bg-muted font-medium">Débito</SelectItem>
                      <SelectItem value="cartao_credito" className="hover:bg-muted font-medium">Crédito</SelectItem>
                  </SelectContent>
              </Select>
              <div className="col-span-4 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-muted-foreground">R$</span>
                  <Input type="number" placeholder="0.00" className="pl-9 h-12 font-bold bg-background border-border text-foreground text-lg" value={currentAmount} onChange={(e) => setCurrentAmount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddPayment()} />
              </div>
              <Button className="col-span-2 h-12 bg-secondary hover:bg-secondary/80 text-secondary-foreground font-bold shadow-sm" onClick={handleAddPayment}>
                  Add
              </Button>
          </div>
          
          <div className="mt-4 border border-border rounded-xl max-h-40 overflow-y-auto bg-muted/10 shadow-inner">
              <Table>
                  <TableHeader>
                      <TableRow className="border-border hover:bg-transparent">
                          <TableHead className="text-muted-foreground font-bold text-xs uppercase">Método</TableHead>
                          <TableHead className="text-right text-muted-foreground font-bold text-xs uppercase">Valor</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {payments.length === 0 && <TableRow className="border-border hover:bg-transparent"><TableCell colSpan={3} className="text-center text-muted-foreground py-6 text-sm">Nenhum valor inserido.</TableCell></TableRow>}
                      {payments.map((p, i) => (
                          <TableRow key={i} className="border-border hover:bg-muted/30">
                              <TableCell className="font-bold text-foreground">{paymentLabels[p.method]}</TableCell>
                              <TableCell className="text-right font-extrabold text-foreground text-lg">R$ {p.value.toFixed(2)}</TableCell>
                              <TableCell><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleRemovePayment(i)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
              </Table>
          </div>
          
          <DialogFooter className="mt-6 pt-4 border-t border-border">
              <Button className="w-full h-16 text-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20" onClick={handleFinalizeSale} disabled={totalPago < totalCompra || isSubmitting}>
                  {isSubmitting ? <><Loader2 className="mr-2 h-6 w-6 animate-spin" /> PROCESSANDO...</> : "CONFIRMAR E FINALIZAR"}
              </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE ABERTURA DE CAIXA */}
      <Dialog open={isCaixaModalOpen} onOpenChange={setIsCaixaModalOpen}>
        <DialogContent className="sm:max-w-[400px] bg-card border-border shadow-xl">
            <DialogHeader>
                <DialogTitle className="text-foreground text-xl">Abertura de Caixa</DialogTitle>
                <DialogDescription className="text-muted-foreground">Informe o valor de fundo de troco para iniciar as vendas.</DialogDescription>
            </DialogHeader>
            <div className="py-4">
                <Label className="text-foreground font-semibold">Valor Inicial em Gaveta (R$)</Label>
                <div className="relative mt-2">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-muted-foreground text-xl">R$</span>
                    <Input type="number" placeholder="0.00" className="pl-12 text-2xl font-extrabold h-16 bg-background border-border text-foreground tracking-wider" value={valorAbertura} onChange={(e) => setValorAbertura(e.target.value)} disabled={isSubmittingCaixa} autoFocus />
                </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0 mt-2">
                <Button variant="outline" className="border-border text-foreground hover:bg-muted h-12" onClick={() => setIsCaixaModalOpen(false)}>Cancelar</Button>
                <Button onClick={handleOpenCaixa} disabled={isSubmittingCaixa} className="bg-primary hover:bg-primary/90 text-primary-foreground h-12 font-bold px-8">
                    {isSubmittingCaixa ? <Loader2 className="h-5 w-5 animate-spin" /> : "Abrir Caixa"}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}